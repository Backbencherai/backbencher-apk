"""No-code strategies written as expressions in a TOML file.

    name = "dip_buyer"
    entry = "rsi(close, n) < 25 and close > sma(close, 200)"
    exit  = "close > sma(close, 10)"
    [params]
    n = 3
    [grid]
    n = [2, 3, 5]

Expressions are parsed with a whitelist (no attribute access, no imports, no
arbitrary calls), so a rules file can't run code.
"""
from __future__ import annotations

import ast
import tomllib
from pathlib import Path

import numpy as np
import pandas as pd

from . import indicators as ind
from .strategy import Strategy, hold


def _cross_above(a, b):
    return (a > b) & (a.shift(1) <= (b.shift(1) if isinstance(b, pd.Series) else b))


def _cross_below(a, b):
    return (a < b) & (a.shift(1) >= (b.shift(1) if isinstance(b, pd.Series) else b))


def _prev(s, n=1):
    return s.shift(int(n))


FUNCS = {
    "sma": ind.sma, "ema": ind.ema, "rsi": ind.rsi, "atr": ind.atr,
    "highest": ind.highest, "lowest": ind.lowest, "roc": ind.roc,
    "zscore": ind.zscore, "volatility": ind.volatility,
    "bb_upper": ind.bollinger_upper, "bb_lower": ind.bollinger_lower,
    "cross_above": _cross_above, "cross_below": _cross_below, "prev": _prev,
    "abs": np.abs,
}
SERIES = ("open", "high", "low", "close", "volume")
_CMP = {ast.Gt: lambda a, b: a > b, ast.GtE: lambda a, b: a >= b,
        ast.Lt: lambda a, b: a < b, ast.LtE: lambda a, b: a <= b,
        ast.Eq: lambda a, b: a == b, ast.NotEq: lambda a, b: a != b}
_BIN = {ast.Add: lambda a, b: a + b, ast.Sub: lambda a, b: a - b,
        ast.Mult: lambda a, b: a * b, ast.Div: lambda a, b: a / b}


class RuleError(ValueError):
    pass


def evaluate(expr: str, df: pd.DataFrame, params: dict):
    tree = ast.parse(expr, mode="eval")
    env = {k: df[k] for k in SERIES if k in df}
    env.update(params)

    def ev(node):
        if isinstance(node, ast.Expression):
            return ev(node.body)
        if isinstance(node, ast.BoolOp):
            vals = [ev(v) for v in node.values]
            out = vals[0]
            for v in vals[1:]:
                out = (out & v) if isinstance(node.op, ast.And) else (out | v)
            return out
        if isinstance(node, ast.UnaryOp):
            v = ev(node.operand)
            if isinstance(node.op, ast.Not):
                return ~v
            if isinstance(node.op, ast.USub):
                return -v
            raise RuleError("unsupported unary operator")
        if isinstance(node, ast.Compare):
            left, out = ev(node.left), None
            for op, comp in zip(node.ops, node.comparators):
                right = ev(comp)
                if type(op) not in _CMP:
                    raise RuleError("unsupported comparison")
                r = _CMP[type(op)](left, right)
                out = r if out is None else (out & r)
                left = right
            return out
        if isinstance(node, ast.BinOp):
            if type(node.op) not in _BIN:
                raise RuleError("only + - * / are allowed")
            return _BIN[type(node.op)](ev(node.left), ev(node.right))
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name) or node.func.id not in FUNCS:
                raise RuleError(f"unknown function; allowed: {sorted(FUNCS)}")
            if node.keywords:
                raise RuleError("use positional arguments only")
            return FUNCS[node.func.id](*[ev(a) for a in node.args])
        if isinstance(node, ast.Name):
            if node.id not in env:
                raise RuleError(f"unknown name '{node.id}'")
            return env[node.id]
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return node.value
        raise RuleError(f"not allowed in a rule: {type(node).__name__}")

    return ev(tree)


class RuleStrategy(Strategy):
    def __init__(self, name, entry, exit, params=None, grid=None, description="", warmup=200):
        self.name, self.entry, self.exit = name, entry, exit
        self.params = dict(params or {})
        self.grid = dict(grid or {})
        self.description = description or f"entry: {entry} | exit: {exit}"
        self.warmup = warmup
        # fail fast on syntax / names
        probe = pd.DataFrame({k: [1.0, 2.0, 3.0] for k in SERIES},
                             index=pd.bdate_range("2020-01-01", periods=3))
        evaluate(entry, probe, self.params)
        evaluate(exit, probe, self.params)

    @classmethod
    def from_file(cls, path: Path) -> "RuleStrategy":
        with open(path, "rb") as f:
            d = tomllib.load(f)
        return cls(d.get("name", path.stem), d["entry"], d["exit"], d.get("params"),
                   d.get("grid"), d.get("description", ""), d.get("warmup", 200))

    def target(self, df, **params):
        p = dict(self.params, **params)
        entry = evaluate(self.entry, df, p)
        exit_ = evaluate(self.exit, df, p)
        return hold(pd.Series(entry, index=df.index), pd.Series(exit_, index=df.index))
