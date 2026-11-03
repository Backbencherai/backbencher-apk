# backbencher-apk
## Claude skills

`.claude/skills/` holds project skills vendored from three MIT-licensed repos (licenses alongside):

- [tradermonty/claude-trading-skills](https://github.com/tradermonty/claude-trading-skills) @ d8e71ce — 74 skills. Repo-root `skills/<name>/` paths in the docs were rewritten to `.claude/skills/<name>/`; the repo-level `workflows/`, `config/` and `scripts/` folders were not copied.
- [Jakeschincariol/trader-skill](https://github.com/Jakeschincariol/trader-skill) @ 5189e79 — the 11 `trader-*` skills. SEC scripts need `SEC_USER_AGENT` (or `trader/config.json`) set to your name and email.
- [shiyu-coder/Kronos](https://github.com/shiyu-coder/Kronos) @ 67b630e — wrapped as `kronos-forecast`: its `model/` package plus a `forecast.py` CLI. Needs `pip install -r .claude/skills/kronos-forecast/requirements.txt`; weights download from Hugging Face.
