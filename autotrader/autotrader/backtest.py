"""Bar-by-bar backtester for one asset.

Decision at the close of bar t, execution at the OPEN of bar t+1 with slippage
and the full cost model; ATR trailing stops checked against each bar's low
(gaps fill at the open). Integer shares, so small accounts see the real effect
of lot sizes and fixed charges."""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from . import indicators as ind
from .costs import order_cost, slippage_frac
from .risk import position_fraction, shares_for


STOP_COOLDOWN = 5   # bars to wait after a stop before re-entering on the same signal


@dataclass
class Trade:
    entry_date: pd.Timestamp
    entry_price: float
    shares: float
    exit_date: pd.Timestamp | None = None
    exit_price: float | None = None
    costs: float = 0.0
    reason: str = ""
    pnl: float = 0.0
    ret: float = 0.0           # pnl / entry value


@dataclass
class Result:
    equity: pd.Series
    trades: list[Trade] = field(default_factory=list)
    metrics: dict = field(default_factory=dict)


def run(df: pd.DataFrame, target: pd.Series, capital: float, costs: dict, risk: dict,
        start: int = 0, end: int | None = None, lot: float = 1.0,
        fractional: bool = False, stop_mult: float | None = None) -> Result:
    end = len(df) if end is None else end
    o, h, l, c = (df[k].to_numpy(float) for k in ("open", "high", "low", "close"))
    a = ind.atr(df["high"], df["low"], df["close"], 14).to_numpy(float)
    tgt = target.reindex(df.index).fillna(0.0).to_numpy(float)
    slip = slippage_frac(costs)
    if stop_mult:
        risk = dict(risk, atr_stop_mult=stop_mult)
    mult = risk["atr_stop_mult"]

    cash, shares, stop = capital, 0.0, np.nan
    trade: Trade | None = None
    cooldown_until = -1
    trades: list[Trade] = []
    eq = np.full(end - start, np.nan)

    def close_pos(i, price, reason):
        nonlocal cash, shares, trade, stop
        fill = price * (1 - slip)
        value = shares * fill
        fee = order_cost(costs, "sell", value)
        cash += value - fee
        trade.exit_date, trade.exit_price = df.index[i], fill
        trade.costs += fee
        trade.reason = reason
        trade.pnl = shares * (fill - trade.entry_price) - trade.costs
        trade.ret = trade.pnl / (trade.shares * trade.entry_price)
        trades.append(trade)
        shares, trade, stop = 0.0, None, np.nan

    for i in range(max(start, 1), end):
        want = tgt[i - 1]                       # decided at previous close
        # 1) act at the open on yesterday's decision
        if shares > 0 and want <= 0:
            close_pos(i, o[i], "signal")
        elif shares == 0 and want > 0 and i >= cooldown_until:
            equity = cash
            frac = position_fraction(want, c[i - 1], a[i - 1], risk)
            fill = o[i] * (1 + slip)
            n = shares_for(equity, frac, fill, lot, fractional)
            while n > 0 and n * fill + order_cost(costs, "buy", n * fill) > cash:
                n -= lot if not fractional else n * 0.01
            if n > 0 and n * fill >= risk.get("min_order_value", 0):
                fee = order_cost(costs, "buy", n * fill)
                cash -= n * fill + fee
                shares = n
                trade = Trade(df.index[i], fill, n, costs=fee)
                stop = fill - mult * a[i - 1]
        # 2) stop check inside the bar
        if shares > 0 and l[i] <= stop:
            close_pos(i, min(o[i], stop), "stop")
            cooldown_until = i + STOP_COOLDOWN
        # 3) trail the stop at the close
        if shares > 0 and np.isfinite(a[i]):
            stop = max(stop, c[i] - mult * a[i])
        if i >= start:
            eq[i - start] = cash + shares * c[i]
    if shares > 0:
        close_pos(end - 1, c[end - 1], "end")
        eq[-1] = cash
    equity = pd.Series(eq, index=df.index[start:end]).ffill().fillna(capital)
    res = Result(equity, trades)
    res.metrics = metrics(equity, trades, df["close"].iloc[start:end])
    return res


def metrics(equity: pd.Series, trades: list[Trade], close: pd.Series | None = None) -> dict:
    rets = equity.pct_change().dropna()
    years = max(len(equity) / 252, 1e-9)
    total = equity.iloc[-1] / equity.iloc[0] - 1 if len(equity) else 0.0
    sd = rets.std()
    sharpe = float(rets.mean() / sd * np.sqrt(252)) if sd and sd > 0 else 0.0
    dd = float((1 - equity / equity.cummax()).max()) if len(equity) else 0.0
    wins = [t.pnl for t in trades if t.pnl > 0]
    losses = [-t.pnl for t in trades if t.pnl <= 0]
    pf = (sum(wins) / sum(losses)) if losses and sum(losses) > 0 else (np.inf if wins else 0.0)
    held = sum(((t.exit_date - t.entry_date).days for t in trades), 0)
    m = {
        "total_return": float(total),
        "cagr": float((1 + total) ** (1 / years) - 1) if total > -1 else -1.0,
        "sharpe": sharpe,
        "max_drawdown": dd,
        "trades": len(trades),
        "win_rate": len(wins) / len(trades) if trades else 0.0,
        "profit_factor": float(pf),
        "avg_trade_ret": float(np.mean([t.ret for t in trades])) if trades else 0.0,
        "costs_paid": float(sum(t.costs for t in trades)),
        "avg_hold_days": held / len(trades) if trades else 0.0,
        "stop_exits": sum(t.reason == "stop" for t in trades),
    }
    if close is not None and len(close) > 1:
        m["buy_hold_return"] = float(close.iloc[-1] / close.iloc[0] - 1)
    return m


def bootstrap_pvalue(trade_rets: list[float], n: int = 2000, seed: int = 0) -> float:
    """P(mean trade return <= 0) under resampling. Small = edge is less likely luck."""
    if len(trade_rets) < 5:
        return 1.0
    r = np.asarray(trade_rets)
    rng = np.random.default_rng(seed)
    means = rng.choice(r, size=(n, len(r)), replace=True).mean(axis=1)
    return float((means <= 0).mean())
