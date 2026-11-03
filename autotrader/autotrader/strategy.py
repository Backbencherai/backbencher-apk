"""Strategy interface, built-in strategies and the plugin loader.

A strategy maps daily OHLCV bars to a target exposure in [0, 1] (or [-1, 1] if
shorting is allowed) decided at the CLOSE of each bar. The backtester and the
live engine both act on that decision at the next bar, so nothing peeks ahead.

Add your own at any time:
  * a rules file  strategies/<name>.toml  (no code, see strategies/example_rule.toml)
  * a Python file strategies/<name>.py    with a subclass of Strategy
"""
from __future__ import annotations

import importlib.util
import itertools
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from . import indicators as ind


class Strategy:
    name: str = "base"
    description: str = ""
    params: dict = {}
    grid: dict = {}          # parameter values walk-forward may choose from
    warmup: int = 200        # bars needed before signals are meaningful
    stop_atr: float | None = None   # override [risk] atr_stop_mult (wider = fewer stop-outs)

    def target(self, df: pd.DataFrame, **params) -> pd.Series:
        raise NotImplementedError

    def param_sets(self, limit: int = 50) -> list[dict]:
        if not self.grid:
            return [dict(self.params)]
        keys = list(self.grid)
        combos = [dict(self.params, **dict(zip(keys, vals)))
                  for vals in itertools.product(*(self.grid[k] for k in keys))]
        combos = [c for c in combos if self.valid(c)]
        if len(combos) > limit:
            idx = np.linspace(0, len(combos) - 1, limit).astype(int)
            combos = [combos[i] for i in idx]
        return combos

    def valid(self, params: dict) -> bool:
        return True

    def __repr__(self) -> str:
        return f"<Strategy {self.name}>"


def hold(entry: pd.Series, exit_: pd.Series) -> pd.Series:
    """Turn entry/exit booleans into a 0/1 position that holds between them."""
    s = pd.Series(np.nan, index=entry.index)
    s[exit_.fillna(False).astype(bool)] = 0.0
    s[entry.fillna(False).astype(bool)] = 1.0
    return s.ffill().fillna(0.0)


# ---------------------------------------------------------------- built-ins

class TrendMA(Strategy):
    name = "trend_ma"
    description = ("Time-series trend following: long while price is above a slow moving "
                   "average and the fast MA is above the slow MA. Most robust anomaly in "
                   "the literature (Moskowitz/Ooi/Pedersen 2012; Hurst/Ooi/Pedersen 2017).")
    params = {"fast": 50, "slow": 200}
    grid = {"fast": [20, 50, 100], "slow": [100, 150, 200]}
    stop_atr = 4.0

    def valid(self, p):
        return p["fast"] < p["slow"]

    def target(self, df, fast=50, slow=200):
        c = df["close"]
        return ((c > ind.sma(c, slow)) & (ind.sma(c, fast) > ind.sma(c, slow))).astype(float)


class DonchianBreakout(Strategy):
    name = "donchian"
    description = ("Channel breakout (Turtle-style): buy a close above the prior N-day high, "
                   "sell a close below the prior M-day low. Strong historically in "
                   "commodities, weaker in single stocks.")
    params = {"entry": 55, "exit": 20}
    grid = {"entry": [20, 55, 100], "exit": [10, 20, 50]}
    warmup = 100

    def valid(self, p):
        return p["exit"] < p["entry"]

    def target(self, df, entry=55, exit=20):
        c = df["close"]
        up = c > ind.highest(df["high"], entry).shift(1)
        dn = c < ind.lowest(df["low"], exit).shift(1)
        return hold(up, dn)


class RSI2MeanReversion(Strategy):
    name = "rsi2_meanrev"
    description = ("Short-term mean reversion in an uptrend (Connors RSI-2): buy when "
                   "2-day RSI is deeply oversold while price is above the 200-day MA, "
                   "exit on a close above the 5-day MA. Works best on broad indices/ETFs.")
    params = {"rsi_n": 2, "buy_below": 10, "trend": 200, "exit_ma": 5}
    grid = {"buy_below": [5, 10, 20], "exit_ma": [5, 10], "trend": [100, 200]}

    def target(self, df, rsi_n=2, buy_below=10, trend=200, exit_ma=5):
        c = df["close"]
        entry = (ind.rsi(c, rsi_n) < buy_below) & (c > ind.sma(c, trend))
        exit_ = (c > ind.sma(c, exit_ma)) | (c < ind.sma(c, trend))
        return hold(entry, exit_)


class AbsoluteMomentum(Strategy):
    name = "abs_momentum"
    description = ("Absolute (time-series) momentum: hold when the trailing 6-12 month "
                   "return is positive, otherwise cash. Re-evaluated monthly "
                   "(Antonacci dual momentum, the absolute leg).")
    params = {"lookback": 252, "rebalance": 21}
    grid = {"lookback": [126, 189, 252]}
    warmup = 260
    stop_atr = 6.0           # slow strategy: catastrophe stop only

    def target(self, df, lookback=252, rebalance=21):
        mom = ind.roc(df["close"], lookback)
        sig = (mom > 0).astype(float).where(mom.notna(), 0.0)
        # only change on rebalance days
        mask = np.arange(len(sig)) % int(rebalance) == 0
        return sig.where(mask).ffill().fillna(0.0)


BUILTINS = [TrendMA, DonchianBreakout, RSI2MeanReversion, AbsoluteMomentum]


# ---------------------------------------------------------------- loader

def _load_py(path: Path) -> list[Strategy]:
    mod_name = f"autotrader_user_{path.stem}"
    spec = importlib.util.spec_from_file_location(mod_name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[mod_name] = mod
    spec.loader.exec_module(mod)
    out = []
    for obj in vars(mod).values():
        if isinstance(obj, type) and issubclass(obj, Strategy) and obj is not Strategy \
                and obj.__module__ == mod_name:
            out.append(obj())
    return out


def load_all(cfg: dict) -> dict[str, Strategy]:
    from .rules import RuleStrategy  # local import avoids a cycle

    found: dict[str, Strategy] = {cls.name: cls() for cls in BUILTINS}
    sdir = Path(cfg["strategies"]["dir"])
    if sdir.is_dir():
        for p in sorted(sdir.glob("*.toml")):
            s = RuleStrategy.from_file(p)
            found[s.name] = s
        for p in sorted(sdir.glob("*.py")):
            if p.name.startswith("_"):
                continue
            for s in _load_py(p):
                found[s.name] = s
    if cfg.get("_kronos", False) or "kronos" in cfg["strategies"].get("enabled", []):
        try:
            from .kronos_strategy import KronosStrategy
            found["kronos"] = KronosStrategy(cfg)
        except Exception as e:  # torch missing etc.
            print(f"[strategies] kronos unavailable: {e}", file=sys.stderr)
    enabled = cfg["strategies"].get("enabled") or []
    if enabled:
        found = {k: v for k, v in found.items() if k in enabled}
    return found
