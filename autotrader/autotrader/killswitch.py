"""Instant stop. The engine checks the STOP file before every cycle and every
order. Create it from the CLI (`autotrader stop`), by hand (`touch state/STOP`),
or from your phone via Telegram (/stop)."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path


def path(state_dir: str) -> Path:
    return Path(state_dir) / "STOP"


def engage(state_dir: str, reason: str, flatten: bool = False) -> None:
    path(state_dir).write_text(json.dumps({
        "time": datetime.now(timezone.utc).isoformat(), "reason": reason, "flatten": flatten}))


def release(state_dir: str) -> bool:
    p = path(state_dir)
    if p.exists():
        p.unlink()
        return True
    return False


def status(state_dir: str) -> dict | None:
    p = path(state_dir)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text() or "{}")
    except json.JSONDecodeError:
        return {"reason": "STOP file present", "flatten": False}
