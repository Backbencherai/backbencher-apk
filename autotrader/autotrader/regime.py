"""Market regime labels used to learn WHEN each strategy loses money."""
from __future__ import annotations

import pandas as pd

from . import indicators as ind


def labels(bench: pd.DataFrame) -> pd.Series:
    c = bench["close"]
    trend = (c > ind.sma(c, 200)).map({True: "up", False: "down"})
    vol = ind.volatility(c, 20)
    med = vol.rolling(252, min_periods=60).median()
    calm = (vol <= med).map({True: "calm", False: "volatile"})
    out = trend + "-" + calm
    return out.where(ind.sma(c, 200).notna() & med.notna(), "unknown")


def current(bench: pd.DataFrame) -> str:
    return str(labels(bench).iloc[-1])


def at(lbl: pd.Series, when) -> str:
    when = pd.Timestamp(when).tz_localize(None) if pd.Timestamp(when).tzinfo else pd.Timestamp(when)
    s = lbl.loc[:when.normalize()]
    return str(s.iloc[-1]) if len(s) else "unknown"
