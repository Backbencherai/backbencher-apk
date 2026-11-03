---
name: kronos-forecast
description: >-
  Forecast future OHLCV candlesticks (K-lines) for a stock, ETF, crypto pair or
  any instrument with the Kronos foundation model (shiyu-coder/Kronos, AAAI 2026).
  Use when the user asks for a price/candle forecast, a probabilistic projection
  of the next N bars, or a model-based price path from historical OHLCV data in a
  CSV. Not a trading signal; outputs are model samples.
---

# Kronos forecast

Kronos is a decoder-only transformer pre-trained on K-line data from 45+
exchanges. It tokenizes OHLCV bars and autoregressively samples future bars.
Weights download from Hugging Face on first run.

| `--model` | Weights | Params | Max context |
| --- | --- | --- | --- |
| `mini` | NeoQuasar/Kronos-mini | 4.1M | 2048 |
| `small` (default) | NeoQuasar/Kronos-small | 24.7M | 512 |
| `base` | NeoQuasar/Kronos-base | 102.3M | 512 |

## Setup (once)

```bash
pip install -r "${CLAUDE_SKILL_DIR}/requirements.txt"
```

Needs Python 3.10+, PyTorch, and network access to huggingface.co.

## Workflow

1. **Get history.** A CSV with `open,high,low,close` (optional `volume`,
   `amount`) and a timestamp column (`timestamps`, `date`, `datetime`, ...).
   Use at least a few hundred bars; reuse data the user already has or that
   another skill produced. Don't invent prices.
2. **Run the forecast.**

   ```bash
   python3 "${CLAUDE_SKILL_DIR}/forecast.py" --csv prices.csv --pred-len 20 \
     --model small --samples 5 --out forecast.csv
   ```

   Options: `--lookback N` (bars of history, capped at the model context),
   `--freq` (`B` for trading days, `h`, `5min`, ...; inferred if omitted),
   `--temperature`, `--top-p`, `--device cpu|cuda:0|mps`,
   `--timestamp-col`.
3. **Gauge uncertainty.** `--samples` averages several sampled paths into one.
   For a spread, run 3-5 times with `--samples 1` (or a higher
   `--temperature`) and report the range of end closes, not one number.
4. **Report.** Last close, forecast end close and % change, the horizon
   high/low, the model and lookback used, and the spread from step 3.
   Say plainly that this is a statistical model forecast, not advice, and
   that it ignores news, earnings and macro events.

## Python API

For batch or custom use, import the vendored package from this skill folder:

```python
import sys; sys.path.insert(0, "<skill dir>")
from model import Kronos, KronosTokenizer, KronosPredictor
tok = KronosTokenizer.from_pretrained("NeoQuasar/Kronos-Tokenizer-base")
mdl = Kronos.from_pretrained("NeoQuasar/Kronos-small")
pred = KronosPredictor(mdl, tok, max_context=512)
pred_df = pred.predict(df=x_df, x_timestamp=x_ts, y_timestamp=y_ts, pred_len=20,
                       T=1.0, top_p=0.9, sample_count=5)
# predict_batch(df_list=..., x_timestamp_list=..., y_timestamp_list=...) for many series
# (all series need the same lookback and pred_len)
```

## Combining with other skills

- Feed price CSVs from `technical-analyst`, `vcp-screener` or other data
  skills, then use the forecast as one input alongside `position-sizer`,
  `trader-risk` or `pre-trade-discipline-gate`. Never let a forecast skip
  the risk checks.
- Fine-tuning on your own data is in the upstream repo (`finetune_csv/`),
  which isn't vendored here.

Source: https://github.com/shiyu-coder/Kronos (MIT, see `LICENSE`).
