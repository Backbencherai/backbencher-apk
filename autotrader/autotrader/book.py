"""The strategy book: each strategy's lifecycle status, live weight, chosen
parameters per asset, latest validation and learned regime blocks.

    candidate --(walk-forward PASS)--> paper --(N paper days, not losing)--> live
         ^                                 |                                  |
         +------- (fails re-validation or learning demotes it) <-------------+
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

STATUSES = ("candidate", "paper", "live", "retired")


class Book:
    def __init__(self, state_dir: str):
        self.path = Path(state_dir) / "strategies.json"
        self.data: dict = json.loads(self.path.read_text()) if self.path.exists() else {}

    def save(self):
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.data, indent=2, default=str))
        tmp.replace(self.path)

    def get(self, name: str) -> dict:
        return self.data.setdefault(name, {"status": "candidate", "weight": 0.0, "params": {},
                                           "validation": None, "paper_since": None,
                                           "regime_blocks": [], "history": []})

    def set_status(self, name: str, status: str, why: str):
        assert status in STATUSES
        s = self.get(name)
        if s["status"] != status:
            s["history"].append({"date": str(date.today()), "from": s["status"], "to": status, "why": why})
            s["status"] = status
            if status == "paper":
                s["paper_since"] = str(date.today())
            if status in ("candidate", "retired"):
                s["weight"] = 0.0

    def active(self, mode: str) -> dict[str, dict]:
        """Strategies allowed to trade in this mode. Live money only uses 'live'."""
        allowed = ("live",) if mode == "live" else ("paper", "live")
        return {k: v for k, v in self.data.items() if v["status"] in allowed and v["weight"] > 0}
