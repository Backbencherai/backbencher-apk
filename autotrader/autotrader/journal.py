"""SQLite journal of every decision, order, closed trade and equity snapshot.
The learning loop reads it; you can open it with any SQLite viewer."""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS orders(time TEXT, mode TEXT, symbol TEXT, side TEXT, qty REAL,
    price REAL, reason TEXT, ok INTEGER, detail TEXT);
CREATE TABLE IF NOT EXISTS open_trades(symbol TEXT PRIMARY KEY, entry_time TEXT, entry_price REAL,
    qty REAL, stop REAL, contributions TEXT, regime TEXT, news REAL, mode TEXT);
CREATE TABLE IF NOT EXISTS trades(symbol TEXT, entry_time TEXT, exit_time TEXT, entry_price REAL,
    exit_price REAL, qty REAL, pnl REAL, ret REAL, exit_reason TEXT, contributions TEXT,
    regime TEXT, news REAL, mode TEXT);
CREATE TABLE IF NOT EXISTS equity(time TEXT, mode TEXT, equity REAL, cash REAL);
CREATE TABLE IF NOT EXISTS events(time TEXT, kind TEXT, message TEXT);
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Journal:
    def __init__(self, state_dir: str):
        self.db = sqlite3.connect(Path(state_dir) / "journal.sqlite")
        self.db.row_factory = sqlite3.Row
        self.db.executescript(SCHEMA)

    def event(self, kind: str, message: str):
        self.db.execute("INSERT INTO events VALUES(?,?,?)", (now(), kind, message))
        self.db.commit()

    def order(self, mode, symbol, side, qty, price, reason, ok, detail):
        self.db.execute("INSERT INTO orders VALUES(?,?,?,?,?,?,?,?,?)",
                        (now(), mode, symbol, side, qty, price, reason, int(ok), json.dumps(detail, default=str)))
        self.db.commit()

    def open_trade(self, symbol, price, qty, stop, contributions, regime, news, mode):
        self.db.execute("INSERT OR REPLACE INTO open_trades VALUES(?,?,?,?,?,?,?,?,?)",
                        (symbol, now(), price, qty, stop, json.dumps(contributions), regime, news, mode))
        self.db.commit()

    def get_open(self, symbol):
        r = self.db.execute("SELECT * FROM open_trades WHERE symbol=?", (symbol,)).fetchone()
        return dict(r) if r else None

    def update_stop(self, symbol, stop):
        self.db.execute("UPDATE open_trades SET stop=? WHERE symbol=?", (stop, symbol))
        self.db.commit()

    def close_trade(self, symbol, price, reason, fees: float = 0.0):
        o = self.get_open(symbol)
        if not o:
            return None
        pnl = (price - o["entry_price"]) * o["qty"] - fees
        ret = pnl / (o["entry_price"] * o["qty"]) if o["qty"] else 0.0
        self.db.execute("INSERT INTO trades VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                        (symbol, o["entry_time"], now(), o["entry_price"], price, o["qty"], pnl, ret,
                         reason, o["contributions"], o["regime"], o["news"], o["mode"]))
        self.db.execute("DELETE FROM open_trades WHERE symbol=?", (symbol,))
        self.db.commit()
        return {"pnl": pnl, "ret": ret}

    def snapshot(self, mode, equity, cash):
        self.db.execute("INSERT INTO equity VALUES(?,?,?,?)", (now(), mode, equity, cash))
        self.db.commit()

    def trades(self, mode: str | None = None) -> list[dict]:
        q = "SELECT * FROM trades" + (" WHERE mode=?" if mode else "") + " ORDER BY exit_time"
        return [dict(r) for r in self.db.execute(q, (mode,) if mode else ())]

    def equity_curve(self, mode: str) -> list[tuple[str, float]]:
        return [(r["time"], r["equity"]) for r in
                self.db.execute("SELECT time, equity FROM equity WHERE mode=? ORDER BY time", (mode,))]
