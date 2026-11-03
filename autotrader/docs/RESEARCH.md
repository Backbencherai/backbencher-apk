# What actually works: GitHub trading projects, Kronos, and who should decide

Research date: November 2026. Star counts from GitHub search on that date.
"Works" means: there is a plausible, documented source of edge that survives
costs, and the project lets you test it honestly. Popularity is not evidence.

## The ground truth first

* SEBI: **93%** of individual F&O traders lost money FY22–FY24 (₹1.8 lakh crore);
  ~91% in FY25. **71%** of intraday cash-equity traders lost money in FY23, 80%
  of the very frequent ones.
* Alpha Arena season 1 (real money, LLMs trading crypto perps): 4 of 6 models
  lost money; GPT-5 and Gemini 2.5 Pro lost roughly 60%, Claude Sonnet about a
  third. The organisers themselves call it too short to rank anyone.
* At ₹1,000 in delivery trades, a ₹15.93 DP charge per sell plus STT, stamp
  duty and slippage cost ~3.5% per round trip. In this repo's backtests on
  synthetic trending prices, the four built-in strategies lost 47–66% at
  ₹1,000; on the identical prices at ₹1,00,000 they ranged from −10% to +36%.
  The only difference is fixed costs.

So: an edge has to be (a) real, (b) bigger than costs, (c) still there after
you stop fitting parameters to the past. Most repos fail (c).

## Verdicts

### Real infrastructure (useful plumbing, no edge included)

| Project | Stars | Verdict |
| --- | --- | --- |
| [freqtrade/freqtrade](https://github.com/freqtrade/freqtrade) | 56k | Mature crypto bot: dry-run, backtests, Telegram control. Solid engine. Its "hyperopt" makes curve-fitting easy, which is why most community strategies don't hold up. **Borrowed:** paper-by-default, Telegram `/stop`, dry-run before live. |
| [ccxt/ccxt](https://github.com/ccxt/ccxt) | 45k | Unified API for 100+ crypto exchanges. Pure plumbing, excellent. |
| [nautechsystems/nautilus_trader](https://github.com/nautechsystems/nautilus_trader) | 31k | Production-grade event-driven engine. Real, but heavy for one small account. |
| [marketcalls/openalgo](https://github.com/marketcalls/openalgo) | 3k | Free self-hosted bridge to 25+ Indian brokers, actively maintained. **Adopted** as the live broker adapter. |
| [polakowo/vectorbt](https://github.com/polakowo/vectorbt), [kernc/backtesting.py](https://github.com/kernc/backtesting.py), [mementum/backtrader](https://github.com/mementum/backtrader) | 9.6k / 9.2k / 23.6k | Honest research tools. backtrader is unmaintained since 2024. |
| [hummingbot/hummingbot](https://github.com/hummingbot/hummingbot) | 21k | Real market-making framework; the edge needs maker rebates and capital you don't have at ₹1,000. |

### Methodology that holds up (no magic, just discipline)

| Project | Verdict |
| --- | --- |
| [tradermonty/claude-trading-skills](https://github.com/tradermonty/claude-trading-skills) | Explicitly not a signal service. Good parts: drawdown circuit breaker, pre-trade discipline gate, post-mortems, backtest-expert's "beat ideas to death" process. US-focused; screeners need paid FMP. **Borrowed:** circuit breaker → `max_drawdown_halt`, post-mortem → `lessons.md`, robustness-first validation. |
| [Jakeschincariol/trader-skill](https://github.com/Jakeschincariol/trader-skill) | Budget, risk gate and explicit-approval broker flow are sound. **Borrowed:** budget/cap/cash-buffer sizing, "nothing places an order without passing the gate". |
| Trend following / time-series momentum (built in: `trend_ma`, `abs_momentum`, `donchian`) | The best-documented anomaly there is: decades, many asset classes (Moskowitz–Ooi–Pedersen 2012; Hurst–Ooi–Pedersen "A Century of Evidence"). Low win rate, long flat periods, works on diversified baskets, not single stocks. |
| Short-term mean reversion on indices (built in: `rsi2_meanrev`) | Documented on US equity indices; weaker since ~2010 and cost-sensitive. Included as a candidate, not trusted. |

### Fancy names over thin evidence

| Project / idea | Why |
| --- | --- |
| [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents) (120k★) and clones (TradingAgents-CN, -astock), [HKUDS/Vibe-Trading](https://github.com/HKUDS/Vibe-Trading), [QuantDinger](https://github.com/OpenByteInc/QuantDinger), [CloddsBot](https://github.com/alsk1992/CloddsBot) | LLM "analyst teams" debating trades. Interesting research, not a demonstrated edge: short evaluation windows, dozens of paid LLM calls per decision, non-deterministic, and **impossible to backtest honestly** — the model's training data already contains the "future" prices and news it is being tested on. Alpha Arena is what LLM trading looks like with real money. |
| [iterativv/NostalgiaForInfinity](https://github.com/iterativv/NostalgiaForInfinity) | A freqtrade strategy with thousands of hand-tuned conditions, re-tuned constantly. Textbook curve-fit: great backtests, reality varies. |
| Grid / DCA bots (OctoBot, Superalgos, most "AI crypto bots") | Grid and DCA quietly sell volatility: many small wins until a trend runs away and one loss erases months. Not fake, but the risk is hidden by the name. |
| "Pelosi tracker" / Congress copy-trading (`trader-pelosi`) | Filings arrive up to 45 days late; studies after the 2012 STOCK Act find little or no outperformance. Fine as a news feed, not a strategy. |
| 13F copycat (`trader-copycat`) | 13Fs are 45+ days stale and long-only snapshots. Mild evidence for a few concentrated managers; mostly you buy last quarter's ideas. |
| Day-trading skill packs (e.g. Jakeschincariol/day-trader-skill, 4.6k★) | Not code-reviewed here. The base rate (71–80% of Indian intraday traders lose) and ₹1,000 cost math are enough to say: don't start there. |

## Is Kronos worth it?

[Kronos](https://github.com/shiyu-coder/Kronos) is a real, peer-reviewed model
(AAAI 2026, 4M–102M parameters, trained on candles from 45+ exchanges). The
authors report large RankIC gains over other forecasting models. What's missing:

* **No independent replication** turned up of its zero-shot results against
  naive baselines (random walk, last value) or in a profit-after-costs test.
  Related work on general time-series foundation models (Chronos, TimesFM) finds
  decent forecast scores but weak or negative trading results.
* It sees **price and volume only**: no news, no fundamentals, no macro.
* Better RankIC is a statement about ranking many stocks against each other,
  which needs a large portfolio. With ₹1,000 and 2–3 positions you can't
  harvest a small cross-sectional edge after costs.

**Verdict: use it as one more candidate strategy, never as the decision
maker.** That's how it's wired in (`strategies.enabled = ["kronos", ...]`): it
must pass the same walk-forward gate as a moving average and earn its weight.
It is free (CPU is fine for `small`), so trying it costs nothing but time. If
it can't beat `trend_ma` out of sample on your assets, the learning loop gives
it zero weight automatically. The skills are not an alternative to it: they
are analysis/discipline tools for you and Claude, not an execution engine.

## What should power the decisions?

| Option | Verdict |
| --- | --- |
| **Rules + ensemble + hard risk gate** (chosen) | Deterministic, backtestable without look-ahead, free, auditable after every trade. The learning loop moves weights between strategies based on out-of-sample and real results. |
| Kronos | One voter among many, gated like the rest. |
| Claude per trade (Opus or a cheaper model) | No. It can't be backtested honestly (it already knows the past), it isn't deterministic, every decision costs money, and the live evidence (Alpha Arena) is poor. |
| Claude for news and review (optional) | Yes, where language is the job: scoring headlines (a small model, `[news.llm]`, hard daily call cap; off by default, the free lexicon is the fallback) and a weekly review of the journal in Claude Code with your existing subscription. It suggests; the gate decides. |

## Why "profit maximisation no matter what" is built as "maximise growth, survive"

Maximising expected profit per bet with no limit on risk maximises the chance
of losing everything (Kelly: betting more than the optimal fraction lowers
long-run growth, and doubling it gives zero growth). So the engine sizes for
long-run growth (risk 2% per trade, volatility-scaled) and the hard limits
can't be overridden by any strategy. It also doesn't include anything
illegal or against broker terms — spoofing, wash trades, pump-and-dump or
dodging SEBI's algo rules — which is the other way "no matter what" ends.

## Sources

* SEBI F&O study (Sept 2024): https://www.sebi.gov.in/media-and-notifications/press-releases/sep-2024/updated-sebi-study-reveals-93-of-individual-traders-incurred-losses-in-equity-fando-between-fy22-and-fy24-aggregate-losses-exceed-1-8-lakh-crores-over-three-years_86906.html
* SEBI intraday study (FY23): https://www.business-standard.com/markets/news/7-in-10-intraday-traders-in-equity-cash-suffered-losses-in-fy23-sebi-study-124072400975_1.html
* FY25 F&O losses: https://www.business-standard.com/markets/news/net-losses-of-traders-in-fo-widens-in-fy25-sebi-study-125070701221_1.html
* Alpha Arena season 1: https://forklog.com/en/four-out-of-six-ai-models-suffer-losses-in-trading-tournament/ , https://decrypt.co/345006/ai-crypto-trading-showdown-deepseek-grok-winning-gemini-implodes
* Kronos paper: https://arxiv.org/abs/2508.02739 , AAAI: https://ojs.aaai.org/index.php/AAAI/article/view/39730
* Foundation models on equities, skeptical view: https://shuaiyao.pages.dev/blog/tsfm-on-equities-hostile-case
* SEBI retail algo framework (from 1 April 2026): https://fyers.in/notice-board/new-sebi-framework-for-retail-algo-trading-from-april-01-2026/ , https://www.angelone.in/news/sebi-new-rules-for-retail-algo-trading-key-changes-retail-traders-can-expect
* Zerodha free personal API: https://www.marketcalls.in/algo-trading/zerodha-makes-trading-api-free-for-personal-use-bundles-historical-data-with-connect-api.html
* Broker API cost comparison: https://stratzy.in/blog/cost-comparison-algo-trading-apis-india
