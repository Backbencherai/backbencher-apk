"""Optional Telegram alerts and remote commands (/stop, /stopall, /status,
/resume). Free: create a bot with @BotFather, put the token and your chat id
in environment variables. Messages from other chats are ignored."""
from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request
from pathlib import Path


class Telegram:
    def __init__(self, cfg: dict, state_dir: str):
        t = cfg["telegram"]
        self.token = os.environ.get(t["bot_token_env"]) if t.get("enabled") else None
        self.chat = os.environ.get(t["chat_id_env"]) if t.get("enabled") else None
        self.offset_file = Path(state_dir) / "telegram_offset"

    @property
    def on(self) -> bool:
        return bool(self.token and self.chat)

    def _call(self, method: str, params: dict) -> dict:
        url = f"https://api.telegram.org/bot{self.token}/{method}"
        data = urllib.parse.urlencode(params).encode()
        with urllib.request.urlopen(url, data=data, timeout=20) as r:
            return json.load(r)

    def send(self, text: str) -> None:
        if self.on:
            try:
                self._call("sendMessage", {"chat_id": self.chat, "text": text[:4000]})
            except Exception:
                pass

    def commands(self) -> list[str]:
        if not self.on:
            return []
        off = int(self.offset_file.read_text()) if self.offset_file.exists() else 0
        try:
            res = self._call("getUpdates", {"offset": off, "timeout": 0})
        except Exception:
            return []
        cmds = []
        for u in res.get("result", []):
            off = max(off, u["update_id"] + 1)
            msg = u.get("message") or {}
            if str(msg.get("chat", {}).get("id")) == str(self.chat):
                cmds.append((msg.get("text") or "").strip().lower())
        self.offset_file.write_text(str(off))
        return cmds
