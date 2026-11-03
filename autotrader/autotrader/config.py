"""Load config.toml and fill in defaults."""
from __future__ import annotations

import copy
import os
import tomllib
from pathlib import Path

DEFAULTS: dict = {
    "general": {
        "mode": "paper",            # paper | live
        "capital": 1000.0,
        "currency": "INR",
        "state_dir": "state",
        "benchmark": "^NSEI",
        "timezone_offset_minutes": 330,  # IST
        "market_open": "09:15",
        "market_close": "15:30",
        "rebalance_time": "15:10",
        "poll_seconds": 60,
    },
    "universe": {"assets": []},
    "risk": {
        "risk_per_trade": 0.02,      # fraction of equity lost if the stop is hit
        "max_position_pct": 0.50,    # cap per asset
        "max_positions": 3,
        "max_gross_exposure": 1.0,   # 1.0 = no leverage
        "daily_loss_limit": 0.05,    # halt new entries for the day
        "max_drawdown_halt": 0.25,   # trip the kill switch
        "atr_stop_mult": 2.5,
        "min_order_value": 50.0,
        "allow_short": False,
        "max_orders_per_day": 20,
    },
    "costs": {
        "model": "india_delivery",   # india_delivery | india_intraday | percent
        "brokerage_flat": 0.0,       # per executed order
        "brokerage_pct": 0.0,
        "brokerage_cap": 20.0,
        "dp_charge_per_sell": 15.93, # CDSL DP charge incl GST, per scrip per sell day
        "slippage_bps": 10.0,
        "percent": 0.001,            # used by the "percent" model (crypto, US)
    },
    "backtest": {
        "train_bars": 750,
        "test_bars": 125,
        "min_trades": 20,
        "min_oos_sharpe": 0.5,
        "min_profit_factor": 1.15,
        "max_drawdown": 0.35,
        "max_param_combos": 50,
        "paper_days_before_live": 20,
        "history_years": 10,
    },
    "news": {
        "enabled": True,
        "lookback_hours": 36,
        "weight": 0.25,              # max +/- adjustment to exposure from news
        "block_threshold": -0.5,     # no new longs below this per-asset score
        "sources": [
            "https://news.google.com/rss/search?q={query}&hl=en-IN&gl=IN&ceid=IN:en",
        ],
        "global_queries": [
            "stock market", "RBI policy", "Federal Reserve", "crude oil price",
            "gold price", "India economy", "geopolitical tension", "inflation",
        ],
        "gdelt": True,
        "llm": {
            "provider": "none",      # none | anthropic
            "model": "claude-haiku-5-5",
            "max_calls_per_day": 30,
            "api_key_env": "ANTHROPIC_API_KEY",
        },
    },
    "learning": {
        "eta": 0.5,
        "min_weight": 0.0,
        "max_weight": 0.6,
        "regime_min_trades": 8,
        "live_trust_trades": 30,
    },
    "broker": {
        "name": "paper",             # paper | openalgo
        "openalgo": {
            "host": "http://127.0.0.1:5000",
            "api_key_env": "OPENALGO_API_KEY",
            "strategy": "autotrader",
            "product": "CNC",
        },
    },
    "telegram": {
        "enabled": False,
        "bot_token_env": "TELEGRAM_BOT_TOKEN",
        "chat_id_env": "TELEGRAM_CHAT_ID",
    },
    "strategies": {"dir": "strategies", "enabled": []},
}


def _merge(base: dict, over: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in over.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _merge(out[k], v)
        else:
            out[k] = v
    return out


def load(path: str | os.PathLike | None = None) -> dict:
    path = Path(path or os.environ.get("AUTOTRADER_CONFIG", "config.toml"))
    user = {}
    if path.exists():
        with open(path, "rb") as f:
            user = tomllib.load(f)
    cfg = _merge(DEFAULTS, user)
    base = path.resolve().parent
    cfg["_root"] = str(base)
    for key in ("state_dir",):
        p = Path(cfg["general"][key])
        cfg["general"][key] = str(p if p.is_absolute() else base / p)
    p = Path(cfg["strategies"]["dir"])
    cfg["strategies"]["dir"] = str(p if p.is_absolute() else base / p)
    Path(cfg["general"]["state_dir"]).mkdir(parents=True, exist_ok=True)
    return cfg


def tradable_assets(cfg: dict) -> list[dict]:
    return [a for a in cfg["universe"]["assets"] if a.get("tradable", True)]
