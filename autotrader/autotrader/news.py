"""Global news -> per-asset sentiment scores in [-1, 1].

Free sources: Google News RSS searches and the GDELT 2.0 DOC API (worldwide
news, no key). Default scoring is an offline finance word list (Loughran-
McDonald style), so it costs nothing. Optionally a cheap Claude model scores
the headlines instead, capped at `max_calls_per_day`.

News is an OVERLAY: it can shrink or block entries and nudge size within
+/- `weight`. It never opens a trade on its own, because headline sentiment
alone has weak, fast-decaying predictive power once costs are paid.
"""
from __future__ import annotations

import json
import os
import re
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

UA = "Mozilla/5.0 autotrader/0.1"

POS = set("""beat beats surge surges soar soars rally rallies jump jumps gain gains record
upgrade upgraded upgrades outperform bullish growth grew profit profits profitable strong
stronger robust boost boosted expand expands expansion approval approved wins win rebound
rebounds recovery recover recovers optimism optimistic beat-estimates raise raises raised
hike-dividend buyback upbeat accelerate accelerates high highs eases easing cut-rates
stimulus deal agreement ceasefire peace inflows""".split())
NEG = set("""miss misses plunge plunges crash crashes slump slumps fall falls drop drops
tumble tumbles sink sinks downgrade downgraded downgrades underperform bearish loss losses
weak weaker decline declines declined fraud probe investigation lawsuit ban banned
sanction sanctions war attack attacks default defaults bankruptcy recession inflation
layoff layoffs cut-guidance warning warns warn slowdown selloff sell-off outflows risk
fears fear crisis collapse halt halted tariff tariffs strike strikes escalation conflict
penalty fine fined resign resigns scandal shortage disruption volatile""".split())
NEGATORS = {"not", "no", "never", "without", "despite"}


def lexicon_score(text: str) -> float:
    words = re.findall(r"[a-z][a-z\-]+", text.lower())
    s, n = 0.0, 0
    for i, w in enumerate(words):
        v = 1.0 if w in POS else -1.0 if w in NEG else 0.0
        if v:
            if i and words[i - 1] in NEGATORS:
                v = -v
            s += v
            n += 1
    return 0.0 if n == 0 else max(-1.0, min(1.0, s / (n + 1)))


def _get(url: str, timeout: int = 15) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def fetch_rss(url: str, since: datetime) -> list[dict]:
    out = []
    root = ET.fromstring(_get(url))
    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        pub = item.findtext("pubDate")
        try:
            ts = parsedate_to_datetime(pub) if pub else datetime.now(timezone.utc)
        except (TypeError, ValueError):
            ts = datetime.now(timezone.utc)
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        if ts >= since and title:
            out.append({"title": title, "time": ts.isoformat(), "link": item.findtext("link") or ""})
    return out


def fetch_gdelt(query: str, hours: int) -> list[dict]:
    q = urllib.parse.urlencode({"query": f"{query} sourcelang:english", "mode": "artlist",
                                "format": "json", "maxrecords": 50,
                                "timespan": f"{max(1, hours)}h"})
    data = json.loads(_get(f"https://api.gdeltproject.org/api/v2/doc/doc?{q}") or b"{}")
    return [{"title": a.get("title", ""), "time": a.get("seendate", ""), "link": a.get("url", "")}
            for a in data.get("articles", [])]


def collect(cfg: dict, assets: list[dict]) -> dict[str, list[dict]]:
    """Headlines keyed by query (asset name/keywords and global themes)."""
    ncfg = cfg["news"]
    since = datetime.now(timezone.utc) - timedelta(hours=ncfg["lookback_hours"])
    queries = {}
    for a in assets:
        kw = a.get("news_query") or a.get("name") or a["symbol"]
        queries[a["symbol"]] = kw
    for g in ncfg["global_queries"]:
        queries[f"global:{g}"] = g
    out: dict[str, list[dict]] = {}
    for key, q in queries.items():
        items = []
        for src in ncfg["sources"]:
            try:
                items += fetch_rss(src.format(query=urllib.parse.quote(q)), since)
            except Exception as e:
                items.append({"error": f"{src[:40]}: {e}"})
        if ncfg.get("gdelt"):
            try:
                items += fetch_gdelt(q, ncfg["lookback_hours"])
            except Exception as e:
                items.append({"error": f"gdelt: {e}"})
        seen, uniq = set(), []
        for it in items:
            t = it.get("title", "").lower()[:80]
            if "error" in it or (t and t not in seen):
                seen.add(t)
                uniq.append(it)
        out[key] = uniq
        time.sleep(0.3)
    return out


def _llm_scores(cfg: dict, headlines: dict[str, list[str]], state_dir: str) -> dict[str, float] | None:
    llm = cfg["news"]["llm"]
    if llm.get("provider") != "anthropic":
        return None
    key = os.environ.get(llm.get("api_key_env", "ANTHROPIC_API_KEY"))
    if not key:
        return None
    budget_file = Path(state_dir) / "llm_budget.json"
    b = json.loads(budget_file.read_text()) if budget_file.exists() else {}
    today = str(date.today())
    if b.get("date") != today:
        b = {"date": today, "calls": 0}
    if b["calls"] >= llm.get("max_calls_per_day", 30):
        return None
    prompt = (
        "You score financial news for a trading system. For each key, read its headlines "
        "and return the likely short-term (1-5 day) price impact on that asset or theme as a "
        "number from -1 (strongly negative) to 1 (strongly positive); 0 if unclear or stale. "
        "Return ONLY a JSON object mapping each key to its score.\n\n"
        + json.dumps({k: v[:15] for k, v in headlines.items()}, ensure_ascii=False)
    )
    body = json.dumps({"model": llm.get("model", "claude-haiku-5-5"), "max_tokens": 800,
                       "messages": [{"role": "user", "content": prompt}]}).encode()
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body, headers={
        "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            text = json.load(r)["content"][0]["text"]
        b["calls"] += 1
        budget_file.write_text(json.dumps(b))
        m = re.search(r"\{.*\}", text, re.S)
        raw = json.loads(m.group(0)) if m else {}
        return {k: max(-1.0, min(1.0, float(v))) for k, v in raw.items() if k in headlines}
    except Exception:
        return None


def score(cfg: dict, assets: list[dict], state_dir: str) -> dict:
    """Return {'assets': {symbol: score}, 'global': score, 'headlines': n, 'by': 'lexicon'|'llm'}
    and cache it to state/news.json."""
    raw = collect(cfg, assets)
    titles = {k: [i["title"] for i in v if i.get("title")] for k, v in raw.items()}
    llm = _llm_scores(cfg, titles, state_dir)
    per = {}
    for k, ts in titles.items():
        if llm is not None and k in llm:
            per[k] = llm[k]
        else:
            per[k] = sum(lexicon_score(t) for t in ts) / len(ts) if ts else 0.0
    glob = [v for k, v in per.items() if k.startswith("global:")]
    out = {
        "time": datetime.now(timezone.utc).isoformat(),
        "by": "llm" if llm is not None else "lexicon",
        "global": sum(glob) / len(glob) if glob else 0.0,
        "assets": {k: v for k, v in per.items() if not k.startswith("global:")},
        "themes": {k[7:]: v for k, v in per.items() if k.startswith("global:")},
        "headlines": sum(len(v) for v in titles.values()),
        "errors": [i["error"] for v in raw.values() for i in v if "error" in i][:10],
        "sample": {k: v[:3] for k, v in titles.items()},
    }
    Path(state_dir, "news.json").write_text(json.dumps(out, indent=2, ensure_ascii=False))
    return out


def adjustment(news: dict | None, symbol: str, cfg: dict) -> tuple[float, bool]:
    """(multiplier on exposure, block_new_entries) for one asset."""
    if not news:
        return 1.0, False
    w = cfg["news"]["weight"]
    s = 0.7 * news.get("assets", {}).get(symbol, 0.0) + 0.3 * news.get("global", 0.0)
    block = s <= cfg["news"]["block_threshold"]
    return max(0.0, 1.0 + w * s), block
