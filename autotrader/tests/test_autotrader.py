import os
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from autotrader import backtest, config, data, killswitch  # noqa: E402
from autotrader.rules import RuleError, RuleStrategy  # noqa: E402
from autotrader.strategy import BUILTINS  # noqa: E402
from autotrader.walkforward import evaluate  # noqa: E402


def make_cfg(tmp, **over):
    p = Path(tmp) / "config.toml"
    p.write_text((ROOT / "config.example.toml").read_text()
                 .replace('dir = "strategies"', f'dir = "{tmp}/strategies"'))
    cfg = config.load(p)
    for k, v in over.items():
        cfg[k].update(v)
    return cfg


class Backtester(unittest.TestCase):
    def setUp(self):
        self.cfg = config.load("/nonexistent.toml")
        self.free = dict(self.cfg["costs"], model="percent", percent=0.0, slippage_bps=0)

    def test_buy_and_hold_tracks_price(self):
        df = data.synthetic(n=600, seed=3, regimes=False)
        risk = dict(self.cfg["risk"], max_position_pct=1.0, risk_per_trade=10.0, atr_stop_mult=50)
        r = backtest.run(df, pd.Series(1.0, index=df.index), 100000, self.free, risk, start=20)
        t = r.trades[0]
        expect = t.shares * (df["close"].iloc[-1] - t.entry_price)
        self.assertAlmostEqual(r.equity.iloc[-1] - 100000, expect, delta=1.0)

    def test_costs_reduce_equity(self):
        df = data.synthetic(n=600, seed=4)
        t = BUILTINS[0]().target(df)
        a = backtest.run(df, t, 100000, self.free, self.cfg["risk"]).equity.iloc[-1]
        b = backtest.run(df, t, 100000, self.cfg["costs"], self.cfg["risk"]).equity.iloc[-1]
        self.assertLess(b, a)

    def test_no_lookahead(self):
        df = data.synthetic(n=900, seed=5)
        cut = 700
        altered = df.copy()
        altered.iloc[cut:] = altered.iloc[cut:] * 3.0
        for cls in BUILTINS:
            s = cls()
            a = s.target(df).iloc[:cut]
            b = s.target(altered).iloc[:cut]
            pd.testing.assert_series_equal(a, b, check_names=False, obj=cls.name)

    def test_random_walk_rarely_passes(self):
        """No edge in the data -> the gate should reject (guards against overfitting)."""
        cfg = config.load("/nonexistent.toml")
        cfg["general"]["capital"] = 100000
        passed = 0
        for seed in range(3):
            d = {f"S{i}": data.synthetic(n=2000, seed=seed * 10 + i, regimes=False, drift=0.0)
                 for i in range(3)}
            for cls in BUILTINS:
                passed += evaluate(cls(), d, cfg)["passed"]
        self.assertLessEqual(passed, 1)


class Rules(unittest.TestCase):
    def test_rule_strategy(self):
        df = data.synthetic(n=400, seed=1)
        s = RuleStrategy("t", "rsi(close, n) < 30 and close > sma(close, 50)", "close > sma(close, 5)",
                         {"n": 3})
        out = s.target(df)
        self.assertTrue(set(out.unique()) <= {0.0, 1.0})

    def test_rejects_code(self):
        for bad in ["__import__('os').system('x')", "close.__class__", "open('x')",
                    "[c for c in close]", "lambda: 1"]:
            with self.assertRaises((RuleError, SyntaxError)):
                RuleStrategy("bad", bad, "close > 0")


class Live(unittest.TestCase):
    def test_kill_switch_blocks_orders_and_flattens(self):
        from autotrader.book import Book
        from autotrader.engine import Engine
        with tempfile.TemporaryDirectory() as tmp:
            cfg = make_cfg(tmp)
            cfg["general"]["state_dir"] = tmp
            cfg["general"]["capital"] = 100000
            cfg["news"]["enabled"] = False
            b = Book(tmp)
            for name in ("trend_ma", "abs_momentum", "donchian", "rsi2_meanrev"):
                b.get(name)
                b.set_status(name, "paper", "test")
                b.data[name]["weight"] = 0.25
            b.save()
            eng = Engine(cfg, synthetic=True)
            eng.cycle()
            held = eng.broker.positions()
            self.assertTrue(held, "expected the synthetic cycle to open something")
            killswitch.engage(tmp, "test", flatten=True)
            sym = next(iter(held))
            self.assertFalse(eng.trade(sym, 0, 100.0, "test"))
            eng.cycle()
            self.assertEqual(eng.broker.positions(), {})
            self.assertEqual(eng.journal.db.execute("select count(*) from open_trades").fetchone()[0], 0)
            killswitch.release(tmp)

    def test_paper_broker_accounting(self):
        from autotrader.broker import PaperBroker
        with tempfile.TemporaryDirectory() as tmp:
            cfg = config.load("/nonexistent.toml")
            cfg["general"]["capital"] = 10000
            pb = PaperBroker(cfg, tmp)
            self.assertTrue(pb.set_position({"symbol": "X"}, 10, 100.0, "t")["ok"])
            self.assertTrue(pb.set_position({"symbol": "X"}, 0, 110.0, "t")["ok"])
            fees = sum(f["fee"] for f in pb.acct["fills"])
            slip = 10 * 100 * 0.001 + 10 * 110 * 0.001
            self.assertAlmostEqual(pb.cash(), 10000 + 100 - fees - slip, places=6)
            self.assertFalse(pb.set_position({"symbol": "Y"}, 1000, 100.0, "t")["ok"])


if __name__ == "__main__":
    unittest.main()
