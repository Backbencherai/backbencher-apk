"""The live/paper trading loop.

Each daily cycle: kill switch -> data -> news -> regime -> every active
strategy votes a target exposure per asset -> weighted ensemble -> news
overlay -> ATR position sizing -> hard risk gate -> orders -> journal.
Between cycles it polls every `poll_seconds` for the kill switch, Telegram
commands and trailing-stop hits."""
from __future__ import annotations

import hashlib
import json
import time
from datetime import datetime, timedelta, timezone

import pandas as pd

from . import broker as brokers
from . import data as dataio
from . import indicators as ind
from . import killswitch, news as newsmod, regime
from .book import Book
from .config import tradable_assets
from .journal import Journal
from .notify import Telegram
from .risk import RiskGate, position_fraction, shares_for
from .strategy import load_all


def get_data(cfg: dict, symbols: list[str], synthetic: bool = False,
             refresh: bool = True) -> dict[str, pd.DataFrame]:
    out = {}
    for s in symbols:
        if synthetic:
            seed = int(hashlib.md5(s.encode()).hexdigest()[:8], 16)
            out[s] = dataio.synthetic(seed=seed, n=2500)
        else:
            try:
                out[s] = dataio.load(s, cfg["general"]["state_dir"], cfg["backtest"]["history_years"],
                                     refresh=refresh)
            except RuntimeError as e:
                print(f"[data] {e}")
    return out


def local_now(cfg) -> datetime:
    return datetime.now(timezone.utc) + timedelta(minutes=cfg["general"]["timezone_offset_minutes"])


def market_open(cfg) -> bool:
    t = local_now(cfg)
    if t.weekday() >= 5:
        return False
    hm = t.strftime("%H:%M")
    return cfg["general"]["market_open"] <= hm <= cfg["general"]["market_close"]


class Engine:
    def __init__(self, cfg: dict, synthetic: bool = False):
        self.cfg = cfg
        self.sd = cfg["general"]["state_dir"]
        self.mode = cfg["general"]["mode"]
        self.synthetic = synthetic
        self.assets = tradable_assets(cfg)
        self.by_sym = {a["symbol"]: a for a in self.assets}
        self.broker = brokers.make(cfg, self.assets, self.sd)
        self.journal = Journal(self.sd)
        self.book = Book(self.sd)
        self.strategies = load_all(cfg)
        self.tg = Telegram(cfg, self.sd)
        self.gate: RiskGate | None = None
        self.gate_day = None
        self.last_rebalance_day = None
        self.last_learn_day = None
        self.stop_mults: dict[str, float] = {}

    # ------------------------------------------------------------ helpers
    def log(self, kind, msg, notify=False):
        print(f"[{kind}] {msg}")
        self.journal.event(kind, msg)
        if notify:
            self.tg.send(f"autotrader {kind}: {msg}")

    def prices_from(self, data) -> dict[str, float]:
        return {s: float(df["close"].iloc[-1]) for s, df in data.items()}

    def handle_commands(self, prices):
        for cmd in self.tg.commands():
            if cmd.startswith("/stopall"):
                killswitch.engage(self.sd, "telegram /stopall", flatten=True)
            elif cmd.startswith("/stop"):
                killswitch.engage(self.sd, "telegram /stop")
            elif cmd.startswith("/resume"):
                killswitch.release(self.sd)
                self.tg.send("resumed")
            elif cmd.startswith("/status"):
                eq = self.broker.equity(prices)
                self.tg.send(f"mode={self.mode} equity={eq:.2f} positions={self.broker.positions()}")

    def check_kill(self, prices) -> bool:
        ks = killswitch.status(self.sd)
        if not ks:
            return False
        if ks.get("flatten") and not ks.get("flattened"):
            held = list(self.broker.positions())
            res = self.broker.flatten_all(prices)
            for sym in held:
                o = self.journal.get_open(sym)
                if o:
                    self.journal.close_trade(sym, prices.get(sym, o["entry_price"]), "kill_switch")
            ks["flattened"] = True
            killswitch.path(self.sd).write_text(json.dumps(ks))
            self.log("KILL", f"flattened {held}: {res}", notify=True)
        return True

    def ensure_gate(self, equity):
        today = local_now(self.cfg).date()
        if self.gate is None or self.gate_day != today:
            curve = self.journal.equity_curve(self.mode)
            peak = max([e for _, e in curve], default=equity)
            self.gate = RiskGate(self.cfg["risk"], equity, peak)
            self.gate_day = today

    # ------------------------------------------------------------ decisions
    def votes(self, data, reg) -> dict[str, dict]:
        """Weighted ensemble exposure per asset, plus each strategy's contribution."""
        active = self.book.active(self.mode)
        out = {}
        for sym, df in data.items():
            if sym not in self.by_sym:
                continue
            num, den, contrib = 0.0, 0.0, {}
            for name, st in active.items():
                strat = self.strategies.get(name)
                if strat is None or reg in st.get("regime_blocks", []):
                    continue
                params = st.get("params", {}).get(sym) or strat.params
                try:
                    e = float(strat.target(df, **params).iloc[-1])
                except Exception as ex:
                    self.log("ERROR", f"{name} on {sym}: {ex}")
                    continue
                w = st["weight"]
                num += w * e
                den += w
                contrib[name] = round(w * e, 4)
            out[sym] = {"exposure": (num / den) if den else 0.0, "contrib": contrib}
        return out

    def rebalance(self, data, news):
        prices = self.prices_from(data)
        equity = self.broker.equity(prices)
        self.ensure_gate(equity)
        chk = self.gate.update_equity(equity)
        if not chk.ok and "kill switch" in chk.reason:
            killswitch.engage(self.sd, chk.reason, flatten=True)
            self.log("RISK", chk.reason, notify=True)
            self.check_kill(prices)
            return
        entries_allowed = chk.ok
        if not chk.ok:
            self.log("RISK", chk.reason, notify=True)

        bench_sym = self.cfg["general"]["benchmark"]
        bench = data.get(bench_sym)
        reg = regime.current(bench) if bench is not None else "unknown"
        votes = self.votes(data, reg)
        held = self.broker.positions()

        # Rank candidates so the best ones get the limited slots.
        plan = []
        for sym, v in votes.items():
            df = data[sym]
            mult, block = newsmod.adjustment(news, sym, self.cfg)
            exp = min(1.0, v["exposure"] * mult)
            a = float(ind.atr(df["high"], df["low"], df["close"], 14).iloc[-1])
            plan.append((sym, exp, block, a, v["contrib"]))
        plan.sort(key=lambda x: -x[1])

        # exits first (frees cash), then entries
        for sym, exp, block, a, contrib in plan:
            if held.get(sym, 0) > 0 and exp < 0.25:
                self.trade(sym, 0, prices[sym], "signal_exit")
        n_pos = len(self.broker.positions())
        for sym, exp, block, a, contrib in plan:
            cur = self.broker.positions().get(sym, 0)
            if cur > 0 or exp < 0.5 or not entries_allowed:
                continue
            if block:
                self.log("NEWS", f"entry on {sym} blocked by negative news")
                continue
            asset = self.by_sym[sym]
            mults = [getattr(self.strategies.get(n), "stop_atr", None) for n, v in contrib.items() if v > 0]
            stop_mult = max([m for m in mults if m] or [self.cfg["risk"]["atr_stop_mult"]])
            rk = dict(self.cfg["risk"], atr_stop_mult=stop_mult)
            frac = position_fraction(exp, prices[sym], a, rk)
            qty = shares_for(equity, frac, prices[sym], asset.get("lot", 1),
                             asset.get("fractional", False))
            cash = self.broker.cash()
            while qty > 0 and qty * prices[sym] * 1.01 > cash:
                qty -= asset.get("lot", 1)
            value = qty * prices[sym]
            gross = sum(q * prices.get(s, 0) for s, q in self.broker.positions().items()) + value
            c = self.gate.check_order("buy", value, equity, gross, n_pos + 1, True)
            if qty <= 0 or not c.ok:
                self.log("SKIP", f"{sym}: {c.reason or 'position too small for capital'}")
                continue
            stop = prices[sym] - stop_mult * a
            if self.trade(sym, qty, prices[sym], "signal_entry"):
                n_pos += 1
                ns = newsmod.adjustment(news, sym, self.cfg)[0] - 1
                self.journal.open_trade(sym, prices[sym], qty, stop, contrib, reg, ns, self.mode)
                self.stop_mults[sym] = stop_mult
        eq = self.broker.equity(prices)
        self.journal.snapshot(self.mode, eq, self.broker.cash())
        self.log("CYCLE", f"regime={reg} equity={eq:.2f} positions={self.broker.positions()}")

    def trade(self, sym, qty, price, reason) -> bool:
        if killswitch.status(self.sd):
            self.log("KILL", f"order on {sym} refused: kill switch engaged")
            return False
        cur = self.broker.positions().get(sym, 0)
        side = "buy" if qty > cur else "sell"
        res = self.broker.set_position(self.by_sym.get(sym, {"symbol": sym}), qty, price, reason)
        ok = bool(res.get("ok"))
        self.journal.order(self.mode, sym, side, abs(qty - cur), price, reason, ok, res)
        if self.gate:
            self.gate.orders_today += 1
        if ok and qty == 0:
            fill = res.get("fill", {})
            r = self.journal.close_trade(sym, fill.get("price", price), reason, fill.get("fee", 0.0))
            if r:
                self.log("EXIT", f"{sym} {reason} pnl={r['pnl']:.2f} ({r['ret']:+.1%})", notify=True)
        elif ok:
            self.log("ENTRY", f"{sym} qty={qty} @ {price:.2f}", notify=True)
        else:
            self.log("ORDER_FAIL", f"{sym}: {res}", notify=True)
        return ok

    def _stop_mult_for(self, open_trade) -> float:
        c = json.loads(open_trade.get("contributions") or "{}")
        mults = [getattr(self.strategies.get(n), "stop_atr", None) for n, v in c.items() if v > 0]
        return max([m for m in mults if m] or [self.cfg["risk"]["atr_stop_mult"]])

    def check_stops(self, prices):
        for sym, q in self.broker.positions().items():
            o = self.journal.get_open(sym)
            px = prices.get(sym)
            if not o or px is None:
                continue
            if px <= o["stop"]:
                self.trade(sym, 0, px, "stop")

    def trail_stops(self, data):
        for sym in self.broker.positions():
            o = self.journal.get_open(sym)
            if not o or sym not in data:
                continue
            df = data[sym]
            a = float(ind.atr(df["high"], df["low"], df["close"], 14).iloc[-1])
            m = self.stop_mults.get(sym) or self._stop_mult_for(o)
            new = float(df["close"].iloc[-1]) - m * a
            if new > o["stop"]:
                self.journal.update_stop(sym, new)

    # ------------------------------------------------------------ loops
    def cycle(self):
        syms = list(self.by_sym) + [self.cfg["general"]["benchmark"]]
        data = get_data(self.cfg, syms, self.synthetic)
        prices = self.prices_from(data)
        self.handle_commands(prices)
        if self.check_kill(prices):
            self.log("KILL", "kill switch engaged: no trading")
            return
        news = None
        if self.cfg["news"]["enabled"] and not self.synthetic:
            try:
                news = newsmod.score(self.cfg, self.assets, self.sd)
            except Exception as e:
                self.log("NEWS", f"news unavailable: {e}")
        self.check_stops(prices)
        self.rebalance(data, news)
        self.trail_stops(data)

    def run_forever(self):
        self.log("START", f"mode={self.mode} broker={self.broker.name} "
                          f"active={list(self.book.active(self.mode))}", notify=True)
        while True:
            try:
                now = local_now(self.cfg)
                today = now.date()
                if market_open(self.cfg) and now.strftime("%H:%M") >= self.cfg["general"]["rebalance_time"] \
                        and self.last_rebalance_day != today:
                    self.cycle()
                    self.last_rebalance_day = today
                elif now.weekday() < 5 and now.strftime("%H:%M") > self.cfg["general"]["market_close"] \
                        and self.last_learn_day != today:
                    from . import learn  # nightly self-review
                    learn.run(self.cfg, self.synthetic, quiet=True)
                    self.book = Book(self.sd)
                    self.last_learn_day = today
                    self.log("LEARN", "nightly learning cycle done; see state/lessons.md", notify=True)
                else:
                    live = {}
                    for sym in self.broker.positions():
                        p = None if self.synthetic else dataio.last_price(sym)
                        if p:
                            live[sym] = p
                    self.handle_commands(live)
                    if not self.check_kill(live) and market_open(self.cfg):
                        self.check_stops(live)
            except KeyboardInterrupt:
                raise
            except Exception as e:
                self.log("ERROR", repr(e), notify=True)
            time.sleep(self.cfg["general"]["poll_seconds"])
