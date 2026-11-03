---
name: autotrader
description: >-
  Operate the repo's autotrader system (autotrader/): check status, stop or
  resume trading (kill switch), validate/backtest strategies, turn a trading
  idea described in words into a no-code rules strategy and test it, run a
  learning cycle, and review the trade journal. Use when the user says "stop
  the bot", "kill switch", "add a strategy", "backtest my idea", "how is the
  bot doing", "review my trades", "go live", or anything about autotrader.
---

# autotrader operator

Work from `autotrader/` in the repo root. All commands are
`python -m autotrader [--config config.toml] <command>`.

## Stop requests come first
If the user wants to stop, halt, or panic: immediately run
`python -m autotrader stop --flatten` (or `stop` if they only want new orders
halted), then `status`. Don't ask questions first. `resume` only on an
explicit request.

## Adding a strategy from a description
1. Translate the idea into entry/exit expressions. Allowed names: open high
   low close volume and [params]; functions: sma ema rsi atr highest lowest
   roc zscore volatility bb_upper bb_lower cross_above cross_below prev abs;
   operators: and or not, comparisons, + - * /.
2. `python -m autotrader add-rule NAME --entry "..." --exit "..."`; this
   writes strategies/NAME.toml and prints the walk-forward report.
3. Explain the report plainly: out-of-sample trades, Sharpe, profit factor,
   drawdown, costs vs. buy & hold, and every FAIL reason. Never promise it
   will make money. If it fails because of costs, say so.
4. It trades only after `validate` promotes it (candidate -> paper -> live).

## Reviewing performance
- `status`, `list`, and `state/lessons.md` (newest first).
- The journal is `state/journal.sqlite` (tables: trades, orders, equity,
  events, open_trades). Query it with python's sqlite3.
- For a deeper review, apply the trade-performance-coach and signal-postmortem
  skills to the closed trades.

## Hard rules
- Never edit `[risk]` limits upward, set `mode = "live"`, or pass `--yes`
  unless the user explicitly asks in this conversation, and restate what
  changes with real money before doing it.
- Never bypass the validation gate (don't hand-edit state/strategies.json to
  promote a strategy).
- No market manipulation, wash trading or evading broker/SEBI rules.
