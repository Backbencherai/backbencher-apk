#!/usr/bin/env python3
"""Forecast future OHLCV candles from a CSV using a pre-trained Kronos model.

Example:
  python3 forecast.py --csv prices.csv --pred-len 20 --out forecast.csv
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pandas as pd  # noqa: E402

MODELS = {
    "mini": ("NeoQuasar/Kronos-mini", "NeoQuasar/Kronos-Tokenizer-2k", 2048),
    "small": ("NeoQuasar/Kronos-small", "NeoQuasar/Kronos-Tokenizer-base", 512),
    "base": ("NeoQuasar/Kronos-base", "NeoQuasar/Kronos-Tokenizer-base", 512),
}
TS_CANDIDATES = ["timestamps", "timestamp", "datetime", "date", "time"]


def load(path, ts_col):
    df = pd.read_csv(path)
    df.columns = [c.strip().lower() for c in df.columns]
    if ts_col is None:
        ts_col = next((c for c in TS_CANDIDATES if c in df.columns), None)
        if ts_col is None:
            sys.exit(f"No timestamp column found; pass --timestamp-col. Columns: {list(df.columns)}")
    ts_col = ts_col.lower()
    missing = [c for c in ("open", "high", "low", "close") if c not in df.columns]
    if missing:
        sys.exit(f"CSV is missing required columns: {missing}")
    df[ts_col] = pd.to_datetime(df[ts_col])
    df = df.sort_values(ts_col).dropna(subset=["open", "high", "low", "close"]).reset_index(drop=True)
    return df, ts_col


def future_index(ts, pred_len, freq):
    if freq is None:
        freq = pd.infer_freq(ts.tail(50))
    if freq is None:
        step = ts.diff().dropna().mode().iloc[0]
        if step >= pd.Timedelta(days=1) and step < pd.Timedelta(days=2):
            freq = "B"  # daily bars with weekend gaps
        else:
            freq = step
    rng = pd.date_range(start=ts.iloc[-1], periods=pred_len + 1, freq=freq)[1:]
    return pd.Series(rng), freq


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--csv", required=True, help="CSV with open,high,low,close[,volume,amount] and a timestamp column")
    p.add_argument("--timestamp-col", default=None)
    p.add_argument("--model", choices=sorted(MODELS), default="small")
    p.add_argument("--lookback", type=int, default=None, help="history bars to use (default: model max context)")
    p.add_argument("--pred-len", type=int, default=20)
    p.add_argument("--freq", default=None, help="pandas freq for future bars (e.g. B, D, h, 5min); inferred if omitted")
    p.add_argument("--samples", type=int, default=5, help="sampled paths averaged into the forecast")
    p.add_argument("--temperature", type=float, default=1.0)
    p.add_argument("--top-p", type=float, default=0.9)
    p.add_argument("--device", default=None, help="cpu, cuda:0, mps (auto if omitted)")
    p.add_argument("--out", default="forecast.csv")
    a = p.parse_args()

    from model import Kronos, KronosTokenizer, KronosPredictor

    df, ts_col = load(a.csv, a.timestamp_col)
    model_id, tok_id, max_ctx = MODELS[a.model]
    lookback = min(a.lookback or max_ctx, max_ctx, len(df))
    hist = df.tail(lookback).reset_index(drop=True)
    cols = [c for c in ("open", "high", "low", "close", "volume", "amount") if c in hist.columns]
    y_ts, freq = future_index(hist[ts_col], a.pred_len, a.freq)

    tokenizer = KronosTokenizer.from_pretrained(tok_id)
    model = Kronos.from_pretrained(model_id)
    predictor = KronosPredictor(model, tokenizer, device=a.device, max_context=max_ctx)
    pred = predictor.predict(
        df=hist[cols], x_timestamp=hist[ts_col], y_timestamp=y_ts, pred_len=a.pred_len,
        T=a.temperature, top_p=a.top_p, sample_count=a.samples, verbose=False,
    )
    pred.index.name = ts_col
    pred.to_csv(a.out)

    last = hist["close"].iloc[-1]
    end = pred["close"].iloc[-1]
    print(f"model={model_id} lookback={lookback} pred_len={a.pred_len} freq={freq} samples={a.samples}")
    print(f"last close {last:.4f} at {hist[ts_col].iloc[-1]}")
    print(f"forecast close {end:.4f} at {pred.index[-1]} ({(end / last - 1) * 100:+.2f}%)")
    print(f"forecast high/low over horizon: {pred['high'].max():.4f} / {pred['low'].min():.4f}")
    print(f"wrote {a.out}")


if __name__ == "__main__":
    main()
