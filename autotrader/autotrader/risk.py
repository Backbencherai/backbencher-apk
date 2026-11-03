"""Position sizing and the pre-trade risk gate. Everything here is a hard rule:
no strategy, news score or model output can override it."""
from __future__ import annotations

import math
from dataclasses import dataclass


def position_fraction(exposure: float, price: float, atr: float, risk: dict) -> float:
    """Fraction of equity to hold, from target exposure and an ATR stop.

    Risking `risk_per_trade` of equity if a stop `atr_stop_mult * ATR` away is
    hit, capped at `max_position_pct`. Volatile assets get smaller positions."""
    if exposure <= 0 or price <= 0 or not math.isfinite(atr) or atr <= 0:
        return 0.0
    stop_dist = risk["atr_stop_mult"] * atr / price
    f = risk["risk_per_trade"] / stop_dist
    return max(0.0, min(f, risk["max_position_pct"]) * min(exposure, 1.0))


def shares_for(equity: float, fraction: float, price: float, lot: float = 1.0,
               fractional: bool = False) -> float:
    if price <= 0 or fraction <= 0:
        return 0.0
    raw = equity * fraction / price
    if fractional:
        return round(raw, 6)
    return math.floor(raw / lot) * lot


@dataclass
class Check:
    ok: bool
    reason: str = ""


class RiskGate:
    """Stateful daily checks used by the live engine."""

    def __init__(self, risk: dict, start_equity: float, peak_equity: float):
        self.r = risk
        self.day_start_equity = start_equity
        self.peak = max(peak_equity, start_equity)
        self.orders_today = 0

    def update_equity(self, equity: float) -> Check:
        self.peak = max(self.peak, equity)
        dd = 1 - equity / self.peak if self.peak > 0 else 0
        if dd >= self.r["max_drawdown_halt"]:
            return Check(False, f"max drawdown {dd:.1%} >= {self.r['max_drawdown_halt']:.0%}: kill switch")
        day = 1 - equity / self.day_start_equity if self.day_start_equity > 0 else 0
        if day >= self.r["daily_loss_limit"]:
            return Check(False, f"daily loss {day:.1%} >= {self.r['daily_loss_limit']:.0%}: no new entries today")
        return Check(True)

    def check_order(self, side: str, value: float, equity: float, gross_after: float,
                    positions_after: int, increases_risk: bool) -> Check:
        if self.orders_today >= self.r["max_orders_per_day"]:
            return Check(False, "max orders per day reached")
        if value < self.r["min_order_value"]:
            return Check(False, f"order value {value:.2f} below minimum")
        if increases_risk:
            if positions_after > self.r["max_positions"]:
                return Check(False, "max positions reached")
            if gross_after > self.r["max_gross_exposure"] * equity + 1e-6:
                return Check(False, "gross exposure limit")
            if side == "sell_short" and not self.r["allow_short"]:
                return Check(False, "shorting disabled")
        return Check(True)
