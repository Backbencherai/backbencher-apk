"""Command line:  python -m autotrader <command>

  init                      write config.toml from the example
  list                      strategies, status, weights
  backtest NAME [--symbol]  walk-forward one strategy, print the report
  validate                  walk-forward every strategy and update the book
  add-rule NAME --entry E --exit X   create a no-code strategy and validate it
  news                      fetch and score global news now
  run [--once]              start trading (paper unless config says live)
  learn                     run the self-improvement cycle now
  stop [--flatten]          kill switch: halt trading (and close positions)
  resume                    release the kill switch
  status                    account, positions, kill switch, last lessons
Add --synthetic to use generated prices (offline demo; no real edge in it).
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

from . import config as cfgmod
from . import killswitch


def _cfg(args):
    cfg = cfgmod.load(args.config)
    return cfg


def cmd_init(args):
    here = Path(args.config)
    if here.exists():
        print(f"{here} exists; not overwriting")
        return
    ex = Path(__file__).resolve().parent.parent / "config.example.toml"
    shutil.copy(ex, here)
    print(f"wrote {here}. Edit [universe] and [risk], then: python -m autotrader validate")


def cmd_list(args):
    from .book import Book
    from .strategy import load_all
    cfg = _cfg(args)
    book = Book(cfg["general"]["state_dir"])
    for name, s in load_all(cfg).items():
        st = book.get(name)
        v = st.get("validation") or {}
        print(f"{name:18} {st['status']:10} weight={st['weight']:.2f} "
              f"validated={v.get('date', '-')} passed={v.get('passed', '-')}  {s.description[:70]}")


def _print_report(rep):
    print(f"\n=== {rep['strategy']}: {'PASS' if rep['passed'] else 'FAIL'}")
    for r in rep["reasons"]:
        print(f"   - {r}")
    p = rep.get("pooled")
    if p:
        print("   pooled OOS: " + ", ".join(
            f"{k}={v:.3f}" if isinstance(v, float) else f"{k}={v}" for k, v in p.items()))
    for sym, r in rep["per_asset"].items():
        if not r.get("ok"):
            print(f"   {sym:14} skipped: {r['reason']}")
            continue
        m = r["metrics"]
        print(f"   {sym:14} ret={m['total_return']:+.1%} (buy&hold {m.get('buy_hold_return', 0):+.1%}) "
              f"sharpe={m['sharpe']:.2f} dd={m['max_drawdown']:.0%} trades={m['trades']} "
              f"win={m['win_rate']:.0%} pf={m['profit_factor']:.2f} costs={m['costs_paid']:.0f} "
              f"params={r['current_params']}")


def cmd_backtest(args):
    from .config import tradable_assets
    from .engine import get_data
    from .strategy import load_all
    from .walkforward import evaluate
    cfg = _cfg(args)
    strats = load_all(cfg)
    if args.name not in strats:
        sys.exit(f"unknown strategy {args.name}; have {sorted(strats)}")
    meta = {a["symbol"]: a for a in tradable_assets(cfg)}
    syms = [args.symbol] if args.symbol else list(meta)
    data = get_data(cfg, syms, args.synthetic)
    _print_report(evaluate(strats[args.name], data, cfg, meta))


def cmd_validate(args):
    from . import learn
    cfg = _cfg(args)
    out = learn.run(cfg, args.synthetic, revalidate=True, quiet=True)
    for rep in out["reports"].values():
        _print_report(rep)
    print("\nchanges:", *out["notes"] or ["none"], sep="\n  ")


def cmd_add_rule(args):
    from .rules import RuleStrategy
    cfg = _cfg(args)
    RuleStrategy(args.name, args.entry, args.exit)       # syntax check
    p = Path(cfg["strategies"]["dir"]) / f"{args.name}.toml"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(f'name = "{args.name}"\nentry = {json.dumps(args.entry)}\nexit = {json.dumps(args.exit)}\n')
    print(f"wrote {p}; validating...")
    args.name, args.symbol = args.name, None
    cmd_backtest(args)
    print("It trades only after `validate` promotes it (PASS -> paper -> live).")


def cmd_news(args):
    from . import news
    from .config import tradable_assets
    cfg = _cfg(args)
    out = news.score(cfg, tradable_assets(cfg), cfg["general"]["state_dir"])
    print(json.dumps({k: out[k] for k in ("by", "global", "assets", "themes", "headlines", "errors")}, indent=2))


def cmd_run(args):
    from .engine import Engine
    cfg = _cfg(args)
    if cfg["general"]["mode"] == "live" and not args.yes:
        print("LIVE MODE: real money. Strategies with status 'live' will trade automatically.")
        if input("type LIVE to continue: ").strip() != "LIVE":
            sys.exit("aborted")
    eng = Engine(cfg, synthetic=args.synthetic)
    if args.once:
        eng.cycle()
    else:
        eng.run_forever()


def cmd_learn(args):
    from . import learn
    learn.run(_cfg(args), args.synthetic, revalidate=not args.no_revalidate)


def cmd_stop(args):
    cfg = _cfg(args)
    killswitch.engage(cfg["general"]["state_dir"], "manual stop", flatten=args.flatten)
    print("KILL SWITCH ENGAGED." + (" Positions will be closed on the engine's next poll "
                                    "(within poll_seconds)." if args.flatten else " No new orders."))
    if args.flatten and args.now:
        from .engine import Engine
        eng = Engine(cfg, synthetic=args.synthetic)
        prices = {}
        eng.check_kill(prices)


def cmd_resume(args):
    cfg = _cfg(args)
    print("released" if killswitch.release(cfg["general"]["state_dir"]) else "kill switch was not engaged")


def cmd_status(args):
    from . import broker as brokers
    from .config import tradable_assets
    from .journal import Journal
    cfg = _cfg(args)
    sd = cfg["general"]["state_dir"]
    print("mode:", cfg["general"]["mode"], "| broker:", cfg["broker"]["name"])
    print("kill switch:", killswitch.status(sd) or "off")
    try:
        b = brokers.make(cfg, tradable_assets(cfg), sd)
        print("cash:", round(b.cash(), 2), "| positions:", b.positions())
    except Exception as e:
        print("broker:", e)
    j = Journal(sd)
    tr = j.trades(cfg["general"]["mode"])
    if tr:
        pnl = sum(t["pnl"] for t in tr)
        print(f"closed trades: {len(tr)}  total pnl: {pnl:.2f}  "
              f"win rate: {sum(t['pnl'] > 0 for t in tr) / len(tr):.0%}")
    lp = Path(sd) / "lessons.md"
    if lp.exists():
        print("\n" + "\n".join(lp.read_text().splitlines()[:25]))


def main(argv=None):
    ap = argparse.ArgumentParser(prog="autotrader", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--config", default="config.toml")
    ap.add_argument("--synthetic", action="store_true")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("init").set_defaults(f=cmd_init)
    sub.add_parser("list").set_defaults(f=cmd_list)
    p = sub.add_parser("backtest"); p.add_argument("name"); p.add_argument("--symbol"); p.set_defaults(f=cmd_backtest)
    sub.add_parser("validate").set_defaults(f=cmd_validate)
    p = sub.add_parser("add-rule"); p.add_argument("name"); p.add_argument("--entry", required=True)
    p.add_argument("--exit", required=True); p.set_defaults(f=cmd_add_rule)
    sub.add_parser("news").set_defaults(f=cmd_news)
    p = sub.add_parser("run"); p.add_argument("--once", action="store_true")
    p.add_argument("--yes", action="store_true", help="skip the live-mode confirmation"); p.set_defaults(f=cmd_run)
    p = sub.add_parser("learn"); p.add_argument("--no-revalidate", action="store_true"); p.set_defaults(f=cmd_learn)
    p = sub.add_parser("stop"); p.add_argument("--flatten", action="store_true")
    p.add_argument("--now", action="store_true", help="flatten immediately from this process"); p.set_defaults(f=cmd_stop)
    sub.add_parser("resume").set_defaults(f=cmd_resume)
    sub.add_parser("status").set_defaults(f=cmd_status)
    args = ap.parse_args(argv)
    args.f(args)
