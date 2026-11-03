"""Template for a Python strategy. Rename without the leading underscore to
activate it (files starting with _ are ignored)."""
import pandas as pd

from autotrader import indicators as ind
from autotrader.strategy import Strategy, hold


class VolatilityBreakout(Strategy):
    name = "vol_breakout"
    description = "Enter when today's close jumps more than k ATRs above yesterday's; exit after a close below the 20-day MA."
    params = {"k": 1.5, "exit_ma": 20}
    grid = {"k": [1.0, 1.5, 2.0], "exit_ma": [10, 20]}
    warmup = 60

    def target(self, df: pd.DataFrame, k=1.5, exit_ma=20) -> pd.Series:
        c = df["close"]
        a = ind.atr(df["high"], df["low"], c, 14)
        entry = (c - c.shift(1)) > k * a.shift(1)
        exit_ = c < ind.sma(c, exit_ma)
        return hold(entry, exit_)
