"""Free daily OHLCV data from Yahoo Finance's public chart endpoint, cached as CSV.

No API key and no yfinance dependency. Yahoo symbols: RELIANCE.NS (NSE),
GOLDBEES.NS (gold ETF), ^NSEI (Nifty 50), GC=F (gold futures), CL=F (crude),
^GSPC (S&P 500), USDINR=X, BTC-USD.
"""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd

UA = "Mozilla/5.0 (X11; Linux x86_64) autotrader/0.1"
COLS = ["open", "high", "low", "close", "volume"]


def _cache_path(state_dir: str, symbol: str) -> Path:
    safe = symbol.replace("^", "IDX_").replace("=", "_").replace("/", "_")
    p = Path(state_dir) / "data"
    p.mkdir(parents=True, exist_ok=True)
    return p / f"{safe}.csv"


def fetch_yahoo(symbol: str, years: int = 10, interval: str = "1d", timeout: int = 20) -> pd.DataFrame:
    rng = f"{years}y" if interval == "1d" else "60d"
    url = (
        "https://query1.finance.yahoo.com/v8/finance/chart/"
        + urllib.parse.quote(symbol)
        + f"?range={rng}&interval={interval}&includeAdjustedClose=true"
    )
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        payload = json.load(r)
    res = payload["chart"]["result"][0]
    ts = pd.to_datetime(res["timestamp"], unit="s", utc=True)
    q = res["indicators"]["quote"][0]
    df = pd.DataFrame({c: q.get(c) for c in COLS}, index=ts)
    adj = res["indicators"].get("adjclose")
    if adj and interval == "1d":
        # Adjust OHLC for splits/dividends so returns are real.
        ratio = pd.Series(adj[0]["adjclose"], index=ts) / df["close"]
        for c in ("open", "high", "low", "close"):
            df[c] = df[c] * ratio
    if interval == "1d":
        df.index = df.index.tz_convert(None).normalize()
    df = df.dropna(subset=["close"])
    df = df[~df.index.duplicated(keep="last")]
    df["volume"] = df["volume"].fillna(0)
    return df.astype(float)


def load(symbol: str, state_dir: str, years: int = 10, refresh: bool = True,
         max_age_hours: float = 6.0) -> pd.DataFrame:
    """Return cached data, refreshing from Yahoo when stale. Falls back to the
    cache when the network fails, and raises if there is nothing at all."""
    path = _cache_path(state_dir, symbol)
    cached = None
    if path.exists():
        cached = pd.read_csv(path, index_col=0, parse_dates=True)
        age_h = (time.time() - path.stat().st_mtime) / 3600
        if not refresh or age_h < max_age_hours:
            return cached
    try:
        df = fetch_yahoo(symbol, years=years)
        if cached is not None:
            df = pd.concat([cached[~cached.index.isin(df.index)], df]).sort_index()
        df.to_csv(path)
        return df
    except Exception as e:  # network, HTTP 4xx/5xx, bad payload
        if cached is not None:
            return cached
        raise RuntimeError(f"no data for {symbol}: {e}") from e


def last_price(symbol: str, timeout: int = 10) -> float | None:
    try:
        df = fetch_yahoo(symbol, interval="1m", timeout=timeout)
        return float(df["close"].iloc[-1])
    except Exception:
        return None


def synthetic(n: int = 2500, seed: int = 0, start: str = "2015-01-01",
              drift: float = 0.08, vol: float = 0.22, regimes: bool = True,
              start_price: float = 100.0) -> pd.DataFrame:
    """Regime-switching random walk for tests and offline demos. It has no
    real edge in it, so a strategy that 'wins' here is probably overfit."""
    rng = np.random.default_rng(seed)
    idx = pd.bdate_range(start, periods=n)
    mu = np.full(n, drift / 252)
    sig = np.full(n, vol / np.sqrt(252))
    if regimes:
        state, i = 0, 0
        while i < n:
            length = int(rng.integers(60, 250))
            if state == 1:
                mu[i:i + length] = -drift * 1.5 / 252
                sig[i:i + length] *= 1.6
            state = 1 - state if rng.random() < 0.5 else state
            i += length
    r = rng.normal(mu, sig)
    close = start_price * np.exp(np.cumsum(r))
    open_ = close * np.exp(rng.normal(0, sig * 0.3))
    hi = np.maximum(open_, close) * np.exp(np.abs(rng.normal(0, sig * 0.5)))
    lo = np.minimum(open_, close) * np.exp(-np.abs(rng.normal(0, sig * 0.5)))
    vol_ = rng.integers(1e5, 1e6, n).astype(float)
    return pd.DataFrame({"open": open_, "high": hi, "low": lo, "close": close, "volume": vol_}, index=idx)
