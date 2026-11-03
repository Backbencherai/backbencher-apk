# autotrader

An automated trading system for a small Indian account. It trades by itself,
tests every strategy before real money touches it, reads global news, learns
from its own trades, takes your custom strategies at any time, and stops
instantly on command. Everything it needs is free.

Read [docs/RESEARCH.md](docs/RESEARCH.md) first: what was evaluated on GitHub,
what is real and what is marketing, whether Kronos is worth it, and what
should make the decisions.

> **Expectations.** Turning ₹1,000 into "multiple thousands in a few days"
> means +100% or more in days. No tested strategy does that; the ways to *try*
> (options, leverage, penny stocks) are how 91–93% of Indian F&O traders lost
> money (SEBI). At ₹1,000 the fixed demat charge (₹15.93 per sell) alone costs
> 1.6% of the whole account per exit. This system maximises long-run growth
> *subject to surviving*, and it will refuse to trade a strategy that can't
> beat its costs. Use the ₹1,000 period to paper trade and learn; scale up only
> when the journal shows a real edge.

## How it decides

```
news (Google News RSS + GDELT, free) ──► sentiment per asset/theme ──┐ overlay only:
                                                                       │ shrink, boost ±25%,
prices (Yahoo, free) ─► every ACTIVE strategy votes 0..1 per asset ──► weighted ensemble
                         (weights learned from results)                 │
                                                                        ▼
                         ATR position sizing (risk 2% per trade, ≤50% per asset)
                                                                        ▼
                         HARD RISK GATE: max positions, no leverage, daily-loss
                         halt, -25% drawdown = close all + kill switch
                                                                        ▼
                         broker: paper (default) or OpenAlgo → your Indian broker
                                                                        ▼
                         journal (SQLite) ──► nightly learning cycle
```

Strategy lifecycle, enforced in code:

```
candidate ──walk-forward PASS──► paper ──20 paper days, not losing──► live
    ▲                                                                   │
    └──────────── fails re-validation, or learning demotes it ◄─────────┘
```

Live money only ever uses strategies whose status is `live`.

## Quick start (free, ~15 minutes)

```bash
cd autotrader
pip install -r requirements.txt
python -m autotrader init                  # writes config.toml
python -m autotrader validate              # downloads 10y of data, walk-forward tests every strategy
python -m autotrader list                  # status + weights
python -m autotrader run --once            # one paper-trading cycle now
python -m autotrader run                   # keep running: trades at 15:10 IST, learns after close
```

Try it offline first: add `--synthetic` to any command (generated prices with
no edge in them — useful to see the machinery, useless for judging strategies).

## Stop everything, instantly

```bash
python -m autotrader stop              # no new orders, from the next check (≤ poll_seconds)
python -m autotrader stop --flatten    # also close every position
python -m autotrader resume
```

Or `touch state/STOP`, or send `/stop` / `/stopall` to your Telegram bot. The
engine checks the switch every `poll_seconds` (default 60) and again before
every single order. A −25% drawdown trips it automatically.

## Add your own strategy, any time

No code — a rules file:

```bash
python -m autotrader add-rule my_dip --entry "rsi(close, 2) < 10 and close > sma(close, 200)" \
                                     --exit  "close > sma(close, 5)"
```

or copy `strategies/example_rule.toml`. Python: copy
`strategies/_example_python_strategy.py` without the underscore. New strategies
start as `candidate` and earn their way to `live` like everything else. In
Claude Code you can also just describe the idea; the `autotrader` skill turns it
into a rules file and validates it.

## Going live (only after paper results justify it)

1. **Broker API (free):** Zerodha's personal Kite Connect tier (no market data —
   this system doesn't need it), Angel One SmartAPI, or Dhan's trading API.
2. **OpenAlgo (free, open source):** one self-hosted server that speaks to 25+
   Indian brokers. Install it from https://github.com/marketcalls/openalgo,
   log in to your broker there, copy its API key.
3. **Static IP (SEBI rule since 1 April 2026):** API orders must come from an IP
   registered with your broker. Free option: an Oracle Cloud "Always Free" VM
   with a reserved public IP (free-tier allowance at the time of writing; check
   it before relying on it); run OpenAlgo and autotrader there.
4. Set in `config.toml`: `mode = "live"`, `[broker] name = "openalgo"`, and
   `export OPENALGO_API_KEY=...`. Run `python -m autotrader run` and type `LIVE`.

At under 10 orders per second this counts as ordinary API use under the SEBI
retail-algo framework; check your broker's current API terms before going live.

## Learning loop (nightly, automatic)

`learn` (run after the close by `run`, or by hand):

* re-runs walk-forward on fresh data: promotes passers, demotes failures;
* re-picks each strategy's parameters per asset from the latest training window;
* re-weights the ensemble from out-of-sample Sharpe blended with the
  strategy's real results (after 30 real trades, real results dominate);
* **learns from mistakes**: finds market regimes (Nifty trend × volatility) in
  which a strategy's trades lose on average and blocks it there until the
  evidence changes;
* writes `state/lessons.md`, including the worst trades to study.

For a deeper weekly review, open Claude Code here and ask for a review: the
`trade-performance-coach` and `signal-postmortem` skills read the journal.

## Files

| Path | What |
| --- | --- |
| `autotrader/strategy.py` | interface, built-in strategies, plugin loader |
| `autotrader/rules.py` | no-code rule language (safe, whitelisted) |
| `autotrader/backtest.py`, `walkforward.py` | next-bar-open fills, Indian costs, walk-forward + promotion gate |
| `autotrader/engine.py` | live/paper loop, ensemble, sizing, stops |
| `autotrader/risk.py`, `killswitch.py` | hard limits and the stop switch |
| `autotrader/news.py` | RSS + GDELT collection, lexicon or Claude scoring |
| `autotrader/learn.py`, `book.py`, `journal.py` | self-improvement, strategy lifecycle, SQLite journal |
| `autotrader/broker.py` | paper broker, OpenAlgo adapter |
| `autotrader/kronos_strategy.py` | optional Kronos forecast strategy |
| `tests/` | `python -m unittest discover tests` |

## Known limits

* Yahoo's chart endpoint is free but unofficial; if it breaks, data falls back
  to the local cache and the engine skips stale assets.
* Daily bars only: one decision per day plus intraday stop checks. No
  intraday strategies, options or futures (₹1,000 can't margin a futures lot).
* NSE holidays aren't hard-coded; on a holiday the data is stale and nothing
  trades, and broker rejections are journaled.
* The OpenAlgo adapter and the Kronos strategy were written against their
  published APIs but not run against a live broker or real model weights yet;
  run paper mode first and watch the first live orders.

Not financial advice. You are responsible for every order this places.
