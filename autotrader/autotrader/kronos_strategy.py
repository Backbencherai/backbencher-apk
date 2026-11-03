"""Kronos (shiyu-coder/Kronos, AAAI 2026) as an ordinary candidate strategy.

It forecasts the next `horizon` daily candles from the last `lookback` ones;
the strategy goes long when the forecast close is more than `threshold`
above today's close. It gets NO special trust: like any other strategy it
must pass walk-forward validation, then paper trading, and its ensemble
weight is earned from results.

Needs:  pip install torch einops huggingface_hub safetensors tqdm
Uses the model code vendored in .claude/skills/kronos-forecast/model.
Forecasts are cached in state/kronos_cache, so re-validation is cheap.
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from .strategy import Strategy

MODELS = {"mini": ("NeoQuasar/Kronos-mini", "NeoQuasar/Kronos-Tokenizer-2k", 2048),
          "small": ("NeoQuasar/Kronos-small", "NeoQuasar/Kronos-Tokenizer-base", 512),
          "base": ("NeoQuasar/Kronos-base", "NeoQuasar/Kronos-Tokenizer-base", 512)}


def _skill_dir() -> Path:
    here = Path(__file__).resolve()
    for p in here.parents:
        cand = p / ".claude" / "skills" / "kronos-forecast"
        if (cand / "model").is_dir():
            return cand
    raise RuntimeError("kronos-forecast skill not found (.claude/skills/kronos-forecast)")


class KronosStrategy(Strategy):
    name = "kronos"
    description = ("Kronos foundation-model forecast: long when the predicted close "
                   "`horizon` days ahead beats today's by `threshold`. Experimental.")
    params = {"horizon": 5, "threshold": 0.01, "lookback": 256, "step": 5, "samples": 3}
    grid = {"threshold": [0.005, 0.01, 0.02]}
    warmup = 260

    def __init__(self, cfg: dict, model: str = "small"):
        import torch  # noqa: F401  (fail early if missing)
        self.cache_dir = Path(cfg["general"]["state_dir"]) / "kronos_cache"
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.model_name = model
        self._predictor = None

    def _pred(self):
        if self._predictor is None:
            sys.path.insert(0, str(_skill_dir()))
            from model import Kronos, KronosPredictor, KronosTokenizer
            mid, tid, ctx = MODELS[self.model_name]
            self._predictor = KronosPredictor(Kronos.from_pretrained(mid),
                                              KronosTokenizer.from_pretrained(tid), max_context=ctx)
        return self._predictor

    def forecasts(self, df: pd.DataFrame, horizon: int, lookback: int, step: int,
                  samples: int) -> pd.Series:
        """Predicted return `horizon` bars ahead, made at every `step`-th bar."""
        key = hashlib.md5(f"{df.index[0]}{len(df)}{df['close'].iloc[0]:.6f}{horizon}{lookback}{step}"
                          f"{samples}{self.model_name}".encode()).hexdigest()
        path = self.cache_dir / f"{key}.json"
        cached = json.loads(path.read_text()) if path.exists() else {}
        cols = ["open", "high", "low", "close", "volume"]
        todo = [i for i in range(lookback, len(df), step)
                if str(df.index[i].date()) not in cached] + \
               ([len(df) - 1] if str(df.index[-1].date()) not in cached else [])
        todo = sorted(set(todo))
        for b in range(0, len(todo), 32):
            batch = todo[b:b + 32]
            xs, xts, yts = [], [], []
            for i in batch:
                w = df.iloc[i - lookback + 1:i + 1]
                xs.append(w[cols].reset_index(drop=True))
                xts.append(pd.Series(w.index))
                yts.append(pd.Series(pd.bdate_range(w.index[-1], periods=horizon + 1)[1:]))
            preds = self._pred().predict_batch(df_list=xs, x_timestamp_list=xts, y_timestamp_list=yts,
                                               pred_len=horizon, T=1.0, top_p=0.9,
                                               sample_count=samples, verbose=False)
            for i, p in zip(batch, preds):
                cached[str(df.index[i].date())] = float(p["close"].iloc[-1] / df["close"].iloc[i] - 1)
            path.write_text(json.dumps(cached))
        s = pd.Series({pd.Timestamp(k): v for k, v in cached.items()})
        return s.reindex(df.index).ffill(limit=step)

    def target(self, df, horizon=5, threshold=0.01, lookback=256, step=5, samples=3):
        f = self.forecasts(df, int(horizon), int(lookback), int(step), int(samples))
        return (f > threshold).astype(float).where(f.notna(), 0.0)
