from __future__ import annotations

import html
from typing import Any

import httpx


class TelegramError(RuntimeError):
    pass


class TelegramClient:
    def __init__(
        self,
        token: str = "",
        chat_id: str = "",
        timeout: float = 12.0,
        header: str = "",
    ) -> None:
        self.token = token.strip()
        self.chat_id = str(chat_id).strip()
        self.timeout = timeout
        self.header = " ".join(str(header).split())

    @property
    def ready(self) -> bool:
        return bool(self.token and self.chat_id)

    def configure(self, token: str, chat_id: str = "") -> None:
        self.token = token.strip()
        self.chat_id = str(chat_id).strip()

    def discover_chat_id(self) -> str:
        if not self.token:
            raise TelegramError("Bot token is missing.")
        payload = self._request("getUpdates", {"limit": 20, "timeout": 0})
        for update in reversed(payload.get("result", [])):
            message = update.get("message") or update.get("channel_post")
            chat = message.get("chat") if message else None
            if chat and chat.get("id") is not None:
                self.chat_id = str(chat["id"])
                return self.chat_id
        raise TelegramError("No Telegram chat found. Send /start to your bot, then try again.")

    def send_html(self, text: str) -> None:
        if not self.ready:
            raise TelegramError("Telegram is not connected.")
        message = str(text)
        if self.header:
            message = f"<b>{html.escape(self.header)}</b>\n{message}"
        self._request(
            "sendMessage",
            {
                "chat_id": self.chat_id,
                "text": message[:4096],
                "parse_mode": "HTML",
                "disable_web_page_preview": True,
            },
        )

    def test(self) -> None:
        self.send_html(
            "✅ <b>StreamScribe connected</b>\n"
            "Giveaway alerts from your local transcript will arrive here."
        )

    def _request(self, method: str, payload: dict[str, Any]) -> dict[str, Any]:
        url = f"https://api.telegram.org/bot{self.token}/{method}"
        try:
            response = httpx.post(url, json=payload, timeout=self.timeout)
        except httpx.RequestError as exc:
            raise TelegramError("Could not reach Telegram. Check your connection and try again.") from exc
        try:
            data = response.json()
        except ValueError as exc:
            raise TelegramError(f"Telegram returned HTTP {response.status_code} without a valid response.") from exc
        if not data.get("ok"):
            description = data.get("description", "Unknown Telegram error")
            raise TelegramError(str(description))
        return data
