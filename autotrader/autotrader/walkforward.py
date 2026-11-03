"""Walk-forward validation: choose parameters on a training window, trade them
on the next unseen window, roll forward, and judge the strategy ONLY on the
stitched out-of-sample results. This is what separates a real edge from a
curve-fit."""
from __future__ import annotations

import numpy as np
import pandas as pd

from .backtest import bootstrap_pvalue, run
from .strategy import Strategy


def walk_forward(strategy: Strategy, df: pd.DataFrame, cfg: dict, lot: float = 1.0,
                 fractional: bool = False, capital: float | None = None) -> dict:
    bt, costs, risk = cfg["backtest"], cfg["costs"], cfg["risk"]
    capital = capital or cfg["general"]["capital"]
    tb, sb = int(bt["train_bars"]), int(bt["test_bars"])
    first = int(strategy.warmup)
    n = len(df)
    combos = strategy.param_sets(int(bt["max_param_combos"]))
    if n < first + tb + sb:
        return {"ok": False, "reason": f"need {first + tb + sb} bars, have {n}"}

    targets = [strategy.target(df, **p).reindex(df.index).fillna(0.0) for p in combos]

    def best_on(s, e):
        best_i, best_score = 0, -np.inf
        for i, t in enumerate(targets):
            r = run(df, t, capital, costs, risk, start=s, end=e, lot=lot, fractional=fractional,
                    stop_mult=strategy.stop_atr)
            m = r.metrics
            score = m["sharpe"] if m["trades"] >= 3 else -np.inf
            if score > best_score:
                best_i, best_score = i, score
        return best_i

    oos = pd.Series(0.0, index=df.index)
    chosen = []
    t0 = first
    while t0 + tb < n:
        te = min(t0 + tb + sb, n)
        bi = best_on(t0, t0 + tb)
        oos.iloc[t0 + tb:te] = targets[bi].iloc[t0 + tb:te]
        chosen.append({"test_start": str(df.index[t0 + tb].date()), "params": combos[bi]})
        t0 += sb
    oos_start = first + tb
    res = run(df, oos, capital, costs, risk, start=oos_start, lot=lot, fractional=fractional,
                    stop_mult=strategy.stop_atr)
    current = combos[best_on(max(first, n - tb), n)]
    return {
        "ok": True,
        "metrics": res.metrics,
        "trades": res.trades,
        "equity": res.equity,
        "trade_rets": [t.ret for t in res.trades],
        "windows": chosen,
        "current_params": current,
        "combos_tried": len(combos),
        "oos_start": str(df.index[oos_start].date()),
    }


def evaluate(strategy: Strategy, data: dict[str, pd.DataFrame], cfg: dict,
             assets: dict[str, dict] | None = None) -> dict:
    """Walk-forward on every asset, then pool the out-of-sample trades and apply
    the promotion gate from [backtest]."""
    bt = cfg["backtest"]
    per, pooled_rets, sharpes, dds, pnl_w, pnl_l = {}, [], [], [], 0.0, 0.0
    for sym, df in data.items():
        meta = (assets or {}).get(sym, {})
        wf = walk_forward(strategy, df, cfg, lot=meta.get("lot", 1.0),
                          fractional=meta.get("fractional", False))
        if not wf["ok"]:
            per[sym] = {"ok": False, "reason": wf["reason"]}
            continue
        m = wf["metrics"]
        per[sym] = {"ok": True, "metrics": m, "current_params": wf["current_params"],
                    "oos_start": wf["oos_start"],
                    "_trades": [(t.entry_date, t.ret) for t in wf["trades"]]}
        pooled_rets += wf["trade_rets"]
        sharpes.append(m["sharpe"])
        dds.append(m["max_drawdown"])
        pnl_w += sum(t.pnl for t in wf["trades"] if t.pnl > 0)
        pnl_l += -sum(t.pnl for t in wf["trades"] if t.pnl <= 0)
    if not sharpes:
        return {"strategy": strategy.name, "passed": False, "reasons": ["no asset had enough data"],
                "per_asset": per}
    pooled = {
        "assets": len(sharpes),
        "trades": len(pooled_rets),
        "mean_sharpe": float(np.mean(sharpes)),
        "median_sharpe": float(np.median(sharpes)),
        "worst_drawdown": float(max(dds)),
        "profit_factor": float(pnl_w / pnl_l) if pnl_l > 0 else (float("inf") if pnl_w > 0 else 0.0),
        "avg_trade_ret": float(np.mean(pooled_rets)) if pooled_rets else 0.0,
        "pvalue": bootstrap_pvalue(pooled_rets),
        "share_assets_positive": float(np.mean([s > 0 for s in sharpes])),
    }
    reasons = []
    if pooled["trades"] < bt["min_trades"]:
        reasons.append(f"only {pooled['trades']} out-of-sample trades (< {bt['min_trades']})")
    if pooled["mean_sharpe"] < bt["min_oos_sharpe"]:
        reasons.append(f"OOS Sharpe {pooled['mean_sharpe']:.2f} < {bt['min_oos_sharpe']}")
    if pooled["profit_factor"] < bt["min_profit_factor"]:
        reasons.append(f"profit factor {pooled['profit_factor']:.2f} < {bt['min_profit_factor']}")
    if pooled["worst_drawdown"] > bt["max_drawdown"]:
        reasons.append(f"drawdown {pooled['worst_drawdown']:.0%} > {bt['max_drawdown']:.0%}")
    if pooled["pvalue"] > bt.get("max_pvalue", 0.2):
        reasons.append(f"edge not distinguishable from luck (p={pooled['pvalue']:.2f})")
    return {"strategy": strategy.name, "passed": not reasons, "reasons": reasons,
            "pooled": pooled, "per_asset": per}
