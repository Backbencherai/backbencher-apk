"""Plain pandas indicators. Every function takes Series and returns a Series
aligned to the input, using only data available at each bar (no look-ahead)."""
from __future__ import annotations

import numpy as np
import pandas as pd


def sma(s: pd.Series, n: int) -> pd.Series:
    return s.rolling(int(n), min_periods=int(n)).mean()


def ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=int(n), adjust=False, min_periods=int(n)).mean()


def rsi(s: pd.Series, n: int = 14) -> pd.Series:
    d = s.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False, min_periods=n).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False, min_periods=n).mean()
    rs = up / dn.replace(0, np.nan)
    out = 100 - 100 / (1 + rs)
    return out.where(dn != 0, 100.0)


def atr(high: pd.Series, low: pd.Series, close: pd.Series, n: int = 14) -> pd.Series:
    pc = close.shift(1)
    tr = pd.concat([high - low, (high - pc).abs(), (low - pc).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / n, adjust=False, min_periods=n).mean()


def highest(s: pd.Series, n: int) -> pd.Series:
    return s.rolling(int(n), min_periods=int(n)).max()


def lowest(s: pd.Series, n: int) -> pd.Series:
    return s.rolling(int(n), min_periods=int(n)).min()


def roc(s: pd.Series, n: int) -> pd.Series:
    return s / s.shift(int(n)) - 1


def zscore(s: pd.Series, n: int) -> pd.Series:
    m = s.rolling(int(n), min_periods=int(n)).mean()
    sd = s.rolling(int(n), min_periods=int(n)).std()
    return (s - m) / sd.replace(0, np.nan)


def volatility(s: pd.Series, n: int = 20) -> pd.Series:
    """Annualised close-to-close volatility (252 bars/year)."""
    return s.pct_change().rolling(int(n), min_periods=int(n)).std() * np.sqrt(252)


def bollinger_upper(s: pd.Series, n: int = 20, k: float = 2.0) -> pd.Series:
    return sma(s, n) + k * s.rolling(int(n)).std()


def bollinger_lower(s: pd.Series, n: int = 20, k: float = 2.0) -> pd.Series:
    return sma(s, n) - k * s.rolling(int(n)).std()
