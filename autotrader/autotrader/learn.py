"""The learning loop. Run nightly (the `run` command does it after the close).

1. Re-validate every strategy with walk-forward on the newest data; promote
   candidates that pass to paper, demote paper/live ones that now fail.
2. Re-pick each strategy's parameters per asset (the most recent training
   window's winner).
3. Promote paper -> live after `paper_days_before_live` without losing.
4. Re-weight the ensemble: weight ~ exp(eta * score), where score blends the
   out-of-sample Sharpe with the strategy's own realised results as they
   accumulate (live evidence gradually outweighs the backtest).
5. Learn from mistakes: find market regimes in which a strategy's trades lose
   money on average (backtest OOS + real trades) and block it there until
   the evidence turns.
6. Write state/lessons.md: what changed and why, plus the worst recent trades.
"""
from __future__ import annotations

import json
import math
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

import numpy as np

from . import regime
from .book import Book
from .config import tradable_assets
from .engine import get_data
from .journal import Journal
from .strategy import load_all
from .walkforward import evaluate


def _sharpe_like(rets: list[float]) -> float:
    if len(rets) < 3:
        return 0.0
    r = np.asarray(rets)
    sd = r.std(ddof=1)
    if sd == 0:
        return 0.0
    # per-trade Sharpe scaled to roughly annual (~25 trades/yr); a rough guide
    return float(r.mean() / sd * math.sqrt(min(len(r), 25)))


def attributed(trades: list[dict]) -> dict[str, list[tuple[str, float, str]]]:
    """Split each closed trade's return between the strategies that voted for it."""
    out = defaultdict(list)
    for t in trades:
        c = json.loads(t["contributions"] or "{}")
        tot = sum(v for v in c.values() if v > 0)
        for name, v in c.items():
            if v > 0 and tot > 0:
                out[name].append((t["exit_time"], t["ret"] * v / tot, t["regime"]))
    return out


def run(cfg: dict, synthetic: bool = False, revalidate: bool = True, quiet: bool = False) -> dict:
    sd = cfg["general"]["state_dir"]
    book, journal = Book(sd), Journal(sd)
    strategies = load_all(cfg)
    assets = tradable_assets(cfg)
    meta = {a["symbol"]: a for a in assets}
    bench_sym = cfg["general"]["benchmark"]
    data = get_data(cfg, list(meta) + [bench_sym], synthetic)
    bench = data.pop(bench_sym, None)
    lbl = regime.labels(bench) if bench is not None else None
    lcfg, bt = cfg["learning"], cfg["backtest"]
    mode = cfg["general"]["mode"]
    real = attributed(journal.trades())
    notes = []

    reports = {}
    for name, strat in strategies.items():
        st = book.get(name)
        if st["status"] == "retired":
            continue
        if revalidate:
            rep = evaluate(strat, {s: d for s, d in data.items() if s in meta}, cfg, meta)
            reports[name] = rep
            st["validation"] = {"date": str(date.today()), "passed": rep["passed"],
                                "reasons": rep["reasons"], "pooled": rep.get("pooled")}
            st["params"] = {s: r["current_params"] for s, r in rep["per_asset"].items() if r.get("ok")}
            if rep["passed"] and st["status"] == "candidate":
                book.set_status(name, "paper", "passed walk-forward validation")
                notes.append(f"PROMOTED {name} -> paper (passed walk-forward)")
            elif not rep["passed"] and st["status"] in ("paper", "live"):
                book.set_status(name, "candidate", "; ".join(rep["reasons"]))
                notes.append(f"DEMOTED {name} -> candidate: {'; '.join(rep['reasons'])}")
            # 5) regime blocks from OOS + real trades
            if lbl is not None:
                buckets = defaultdict(list)
                for r in rep["per_asset"].values():
                    for when, ret in r.get("_trades", []):
                        buckets[regime.at(lbl, when)].append(ret)
                for _, ret, rg in real.get(name, []):
                    buckets[rg or "unknown"].extend([ret] * 2)   # real trades count double
                blocks = sorted(rg for rg, rs in buckets.items()
                                if rg != "unknown" and len(rs) >= lcfg["regime_min_trades"]
                                and np.mean(rs) < 0)
                if blocks != sorted(st.get("regime_blocks", [])):
                    notes.append(f"{name}: regime blocks {st.get('regime_blocks', [])} -> {blocks}")
                st["regime_blocks"] = blocks
                st["regime_stats"] = {rg: {"n": len(rs), "mean_ret": float(np.mean(rs))}
                                      for rg, rs in buckets.items()}

        # 3) paper -> live
        if st["status"] == "paper" and st.get("paper_since"):
            days = (date.today() - date.fromisoformat(st["paper_since"])).days
            paper_rets = [r for _, r, _ in real.get(name, [])]
            if days >= bt["paper_days_before_live"] and (not paper_rets or sum(paper_rets) >= -0.01):
                book.set_status(name, "live", f"{days} paper days, paper return {sum(paper_rets):+.2%}")
                notes.append(f"PROMOTED {name} -> live-eligible after {days} paper days")

    # 4) weights
    elig = {k: v for k, v in book.data.items() if v["status"] in ("paper", "live") and k in strategies}
    scores = {}
    for name, st in elig.items():
        oos = (st.get("validation") or {}).get("pooled") or {}
        s_bt = oos.get("mean_sharpe", 0.0)
        rr = [r for _, r, _ in real.get(name, [])]
        k = min(1.0, len(rr) / lcfg["live_trust_trades"])
        scores[name] = (1 - k) * s_bt + k * _sharpe_like(rr)
    if scores:
        raw = {n: math.exp(lcfg["eta"] * s) if s > 0 else 0.0 for n, s in scores.items()}
        tot = sum(raw.values())
        for n in book.data:
            book.data[n]["weight"] = 0.0
        if tot > 0:
            w = {n: min(lcfg["max_weight"], v / tot) for n, v in raw.items()}
            t2 = sum(w.values())
            for n, v in w.items():
                book.data[n]["weight"] = round(v / t2, 4)
                book.data[n]["score"] = round(scores[n], 3)
    book.save()

    # 6) lessons
    worst = sorted(journal.trades(), key=lambda t: t["ret"])[:5]
    lines = [f"## {datetime.now():%Y-%m-%d %H:%M} learning cycle", ""]
    lines += [f"- {n}" for n in notes] or ["- no status changes"]
    lines += ["", "| strategy | status | weight | OOS sharpe | trades | blocked regimes |",
              "| --- | --- | --- | --- | --- | --- |"]
    for n, st in sorted(book.data.items()):
        p = (st.get("validation") or {}).get("pooled") or {}
        lines.append(f"| {n} | {st['status']} | {st['weight']:.2f} | {p.get('mean_sharpe', 0):.2f} "
                     f"| {p.get('trades', 0)} | {', '.join(st.get('regime_blocks', [])) or '-'} |")
    if worst:
        lines += ["", "Worst closed trades (study these):"]
        lines += [f"- {t['symbol']} {t['entry_time'][:10]}->{t['exit_time'][:10]} {t['ret']:+.1%} "
                  f"exit={t['exit_reason']} regime={t['regime']} news={t['news']:+.2f}" for t in worst]
    text = "\n".join(lines) + "\n\n"
    lp = Path(sd) / "lessons.md"
    lp.write_text(text + (lp.read_text() if lp.exists() else ""))
    if not quiet:
        print(text)
    return {"notes": notes, "reports": reports, "book": book.data}
