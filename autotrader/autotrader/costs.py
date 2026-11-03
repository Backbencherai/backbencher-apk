"""Transaction cost models. Costs matter enormously at small capital: a fixed
₹15.93 DP charge on a ₹1,000 sell is 1.6% of the trade."""
from __future__ import annotations


def order_cost(cfg_costs: dict, side: str, value: float) -> float:
    """Total charges in currency for one executed order of `value` (positive)."""
    value = abs(value)
    if value <= 0:
        return 0.0
    model = cfg_costs.get("model", "india_delivery")
    if model == "percent":
        return value * float(cfg_costs.get("percent", 0.001))

    brokerage = cfg_costs.get("brokerage_flat", 0.0) + value * cfg_costs.get("brokerage_pct", 0.0)
    brokerage = min(brokerage, cfg_costs.get("brokerage_cap", 20.0))
    exch = value * 0.0000297          # NSE transaction charge (cash)
    sebi = value * 10 / 1e7           # ₹10 per crore
    if model == "india_intraday":
        stt = value * 0.00025 if side == "sell" else 0.0
        stamp = value * 0.00003 if side == "buy" else 0.0
        dp = 0.0
    else:                              # delivery (CNC)
        stt = value * 0.001
        stamp = value * 0.00015 if side == "buy" else 0.0
        dp = cfg_costs.get("dp_charge_per_sell", 15.93) if side == "sell" else 0.0
    gst = 0.18 * (brokerage + exch + sebi)
    return brokerage + exch + sebi + stt + stamp + gst + dp


def slippage_frac(cfg_costs: dict) -> float:
    return float(cfg_costs.get("slippage_bps", 10.0)) / 1e4
