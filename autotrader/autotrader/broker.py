"""Brokers. `paper` simulates fills locally (the default). `openalgo` sends
orders to a self-hosted OpenAlgo server (free, open source), which talks to
25+ Indian brokers: Zerodha, Angel One, Dhan, Upstox, Fyers, Shoonya, ...

Positions are always set as a TARGET quantity (placesmartorder), so a retry
or a restart cannot double an order."""
from __future__ import annotations

import json
import os
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from .costs import order_cost, slippage_frac


class Broker:
    name = "base"

    def cash(self) -> float: ...
    def positions(self) -> dict[str, float]: ...
    def set_position(self, asset: dict, qty: float, price: float, reason: str) -> dict: ...
    def flatten_all(self, prices: dict[str, float]) -> list[dict]: ...

    def equity(self, prices: dict[str, float]) -> float:
        return self.cash() + sum(q * prices.get(s, 0.0) for s, q in self.positions().items())


class PaperBroker(Broker):
    name = "paper"

    def __init__(self, cfg: dict, state_dir: str):
        self.costs = cfg["costs"]
        self.path = Path(state_dir) / "paper_account.json"
        if self.path.exists():
            self.acct = json.loads(self.path.read_text())
        else:
            self.acct = {"cash": float(cfg["general"]["capital"]), "positions": {}, "fills": []}
            self._save()

    def _save(self):
        self.path.write_text(json.dumps(self.acct, indent=2))

    def cash(self):
        return float(self.acct["cash"])

    def positions(self):
        return {s: p["qty"] for s, p in self.acct["positions"].items() if p["qty"]}

    def avg_price(self, sym):
        return self.acct["positions"].get(sym, {}).get("avg", 0.0)

    def set_position(self, asset, qty, price, reason):
        sym = asset["symbol"]
        cur = self.acct["positions"].get(sym, {"qty": 0.0, "avg": 0.0})
        delta = qty - cur["qty"]
        if delta == 0:
            return {"ok": True, "noop": True}
        side = "buy" if delta > 0 else "sell"
        slip = slippage_frac(self.costs)
        fill = price * (1 + slip) if side == "buy" else price * (1 - slip)
        value = abs(delta) * fill
        fee = order_cost(self.costs, side, value)
        if side == "buy" and value + fee > self.acct["cash"] + 1e-9:
            return {"ok": False, "error": "insufficient cash"}
        self.acct["cash"] += (-value if side == "buy" else value) - fee
        if side == "buy":
            cur["avg"] = (cur["qty"] * cur["avg"] + delta * fill) / (cur["qty"] + delta)
        cur["qty"] = qty
        self.acct["positions"][sym] = cur
        f = {"time": datetime.now(timezone.utc).isoformat(), "symbol": sym, "side": side,
             "qty": abs(delta), "price": fill, "fee": fee, "reason": reason}
        self.acct["fills"].append(f)
        self._save()
        return {"ok": True, "fill": f}

    def flatten_all(self, prices):
        out = []
        for sym, q in list(self.positions().items()):
            out.append(self.set_position({"symbol": sym}, 0, prices.get(sym, self.avg_price(sym)), "flatten"))
        return out


class OpenAlgoBroker(Broker):
    name = "openalgo"

    def __init__(self, cfg: dict, assets: list[dict]):
        oa = cfg["broker"]["openalgo"]
        self.host = oa["host"].rstrip("/")
        self.key = os.environ.get(oa["api_key_env"], "")
        if not self.key:
            raise RuntimeError(f"set {oa['api_key_env']} to your OpenAlgo API key")
        self.strategy = oa["strategy"]
        self.product = oa["product"]
        self.by_broker_sym = {a.get("broker_symbol", a["symbol"]): a for a in assets}

    def _post(self, endpoint: str, payload: dict) -> dict:
        payload = {"apikey": self.key, **payload}
        req = urllib.request.Request(f"{self.host}/api/v1/{endpoint}",
                                     data=json.dumps(payload).encode(),
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)

    def cash(self):
        d = self._post("funds", {}).get("data", {})
        return float(d.get("availablecash", 0.0))

    def positions(self):
        out = {}
        for p in self._post("positionbook", {}).get("data", []) or []:
            a = self.by_broker_sym.get(p.get("symbol"))
            q = float(p.get("quantity", 0) or 0)
            if a and q:
                out[a["symbol"]] = q
        return out

    def set_position(self, asset, qty, price, reason):
        cur = self.positions().get(asset["symbol"], 0.0)
        delta = qty - cur
        if delta == 0:
            return {"ok": True, "noop": True}
        res = self._post("placesmartorder", {
            "strategy": self.strategy,
            "symbol": asset.get("broker_symbol", asset["symbol"]),
            "exchange": asset.get("exchange", "NSE"),
            "action": "BUY" if delta > 0 else "SELL",
            "pricetype": "MARKET",
            "product": asset.get("product", self.product),
            "quantity": str(int(abs(delta))),
            "position_size": str(int(qty)),
        })
        return {"ok": res.get("status") == "success", "response": res, "reason": reason}

    def flatten_all(self, prices):
        out = [self._post("cancelallorder", {"strategy": self.strategy}),
               self._post("closeposition", {"strategy": self.strategy})]
        return out


def make(cfg: dict, assets: list[dict], state_dir: str) -> Broker:
    name = cfg["broker"]["name"]
    if cfg["general"]["mode"] == "live":
        if name == "paper":
            raise RuntimeError("mode = live needs a real broker, e.g. [broker] name = 'openalgo'")
        return OpenAlgoBroker(cfg, assets)
    return PaperBroker(cfg, state_dir)
