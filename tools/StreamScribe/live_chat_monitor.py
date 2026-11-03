from __future__ import annotations

import html
import json
import os
import re
import threading
import time
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable
from urllib.parse import parse_qs, unquote, urlparse
from urllib.request import Request, urlopen

from core import clean_text, validate_youtube_url
from telegram_client import TelegramClient, TelegramError


YOUTUBE_CLIENT_VERSION = "2.20260820.01.00"
FORM_PATTERN = re.compile(
    r"(?:https?://)?(?:docs\.google\.com/forms(?:/[^\s<>\"']*)?|forms\.gle/[A-Za-z0-9_-]+(?:\?[^\s<>\"']*)?)",
    re.IGNORECASE,
)


@dataclass(slots=True)
class ChatMessage:
    id: str
    author: str
    text: str
    timestamp_usec: int | None
    urls: list[str]


def youtube_video_id(url: str) -> str:
    parsed = urlparse(validate_youtube_url(url))
    if parsed.hostname == "youtu.be":
        return parsed.path.strip("/").split("/")[0]
    return parse_qs(parsed.query)["v"][0]


def normalize_form_url(value: str) -> str | None:
    value = html.unescape(value).strip().rstrip(".,);]>\"'")
    parsed = urlparse(value if "://" in value else f"https://{value}")
    if parsed.hostname in {"youtube.com", "www.youtube.com"} and parsed.path == "/redirect":
        target = parse_qs(parsed.query).get("q", [""])[0]
        return normalize_form_url(unquote(target)) if target else None
    host = (parsed.hostname or "").casefold()
    if host == "forms.gle" and parsed.path.strip("/"):
        return parsed._replace(scheme="https", netloc=host, fragment="").geturl()
    if host == "docs.google.com" and parsed.path.casefold().startswith("/forms/"):
        return parsed._replace(scheme="https", netloc=host, fragment="").geturl()
    return None


def extract_form_urls(text: str, candidates: list[str] | None = None) -> list[str]:
    values = list(candidates or [])
    values.extend(match.group(0) for match in FORM_PATTERN.finditer(text))
    found: list[str] = []
    for value in values:
        normalized = normalize_form_url(value)
        if normalized and normalized not in found:
            found.append(normalized)
    return found


class YouTubeLiveChatClient:
    def __init__(self, url: str) -> None:
        self.url = validate_youtube_url(url)
        self.video_id = youtube_video_id(url)
        self.continuation = ""

    @staticmethod
    def _context() -> dict:
        return {
            "client": {
                "clientName": "WEB",
                "clientVersion": YOUTUBE_CLIENT_VERSION,
                "hl": "en",
                "gl": "US",
            }
        }

    def _post(self, path: str, payload: dict) -> dict:
        youtube_key = os.getenv("YOUTUBE_INNERTUBE_API_KEY", "").strip()
        if not youtube_key:
            raise RuntimeError("Set YOUTUBE_INNERTUBE_API_KEY to enable live chat monitoring.")
        request = Request(
            f"https://www.youtube.com/youtubei/v1/{path}?key={youtube_key}",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Origin": "https://www.youtube.com",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/139 Safari/537.36",
            },
        )
        with urlopen(request, timeout=25) as response:
            return json.load(response)

    def bootstrap(self) -> None:
        info = self._post("next", {"context": self._context(), "videoId": self.video_id})
        try:
            chat = info["contents"]["twoColumnWatchNextResults"]["conversationBar"]["liveChatRenderer"]
            continuation_data = chat["continuations"][0]
            continuation = next(iter(continuation_data.values()))["continuation"]
        except (KeyError, IndexError, StopIteration, TypeError) as exc:
            raise RuntimeError("YouTube live chat is unavailable for this stream.") from exc
        self.continuation = str(continuation)

    def poll(self) -> tuple[list[ChatMessage], int]:
        if not self.continuation:
            self.bootstrap()
        info = self._post(
            "live_chat/get_live_chat",
            {"context": self._context(), "continuation": self.continuation},
        )
        return self.parse_poll_response(info)

    def parse_poll_response(self, info: dict) -> tuple[list[ChatMessage], int]:
        try:
            live = info["continuationContents"]["liveChatContinuation"]
        except (KeyError, TypeError) as exc:
            raise RuntimeError("YouTube live chat returned an invalid update.") from exc

        timeout_ms = 2000
        for item in live.get("continuations", []):
            if not isinstance(item, dict) or not item:
                continue
            data = next(iter(item.values()))
            if isinstance(data, dict) and data.get("continuation"):
                self.continuation = str(data["continuation"])
                timeout_ms = int(data.get("timeoutMs") or timeout_ms)
                break

        messages: list[ChatMessage] = []
        for action in live.get("actions", []):
            item = action.get("addChatItemAction", {}).get("item", {})
            if not isinstance(item, dict):
                continue
            for renderer in item.values():
                if not isinstance(renderer, dict) or not isinstance(renderer.get("message"), dict):
                    continue
                runs = renderer["message"].get("runs", [])
                text = clean_text("".join(str(run.get("text") or "") for run in runs))
                candidates: list[str] = []
                for run in runs:
                    endpoint = run.get("navigationEndpoint", {})
                    url = endpoint.get("urlEndpoint", {}).get("url")
                    if not url:
                        url = endpoint.get("commandMetadata", {}).get("webCommandMetadata", {}).get("url")
                    if url:
                        candidates.append(str(url))
                author = clean_text(str(renderer.get("authorName", {}).get("simpleText") or "Unknown"))
                timestamp = renderer.get("timestampUsec")
                messages.append(
                    ChatMessage(
                        id=str(renderer.get("id") or f"{author}:{timestamp}:{text}"),
                        author=author,
                        text=text,
                        timestamp_usec=int(timestamp) if timestamp else None,
                        urls=extract_form_urls(text, candidates),
                    )
                )
        return messages, timeout_ms


class ChatFormMonitor:
    def __init__(self, state_file: Path, telegram: TelegramClient,
                 health_callback: Callable[[str | None], None] | None = None) -> None:
        self.state_file = state_file
        self.telegram = telegram
        self.health_callback = health_callback
        self._lock = threading.RLock()
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._seen_ids: deque[str] = deque(maxlen=3000)
        self._seen_set: set[str] = set()
        self._sent_urls = self._load()
        self.url = ""
        self.error: str | None = None
        self.last_message_at: float | None = None
        self.links_sent = 0

    @property
    def running(self) -> bool:
        return bool(self._thread and self._thread.is_alive() and not self._stop.is_set())

    def start(self, url: str) -> None:
        url = validate_youtube_url(url)
        self.stop()
        with self._lock:
            self.url = url
            self.error = None
            self.last_message_at = None
            self.links_sent = 0
            self._stop = threading.Event()
            stop_event = self._stop
            self._thread = threading.Thread(
                target=self._run,
                args=(stop_event,),
                name="youtube-chat-form-monitor",
                daemon=True,
            )
            self._thread.start()

    def stop(self) -> None:
        with self._lock:
            stop_event = self._stop
            thread = self._thread
        stop_event.set()
        if thread and thread is not threading.current_thread():
            thread.join(timeout=1.0)
        with self._lock:
            if self._thread is thread:
                self._thread = None

    def snapshot(self) -> dict:
        with self._lock:
            return {
                "chat_monitor_active": self.running,
                "chat_monitor_error": self.error,
                "chat_links_sent": self.links_sent,
            }

    def _remember_message(self, message_id: str) -> bool:
        if message_id in self._seen_set:
            return False
        if len(self._seen_ids) == self._seen_ids.maxlen:
            expired = self._seen_ids.popleft()
            self._seen_set.discard(expired)
        self._seen_ids.append(message_id)
        self._seen_set.add(message_id)
        return True

    def _run(self, stop_event: threading.Event) -> None:
        client = YouTubeLiveChatClient(self.url)
        started_usec = int((time.time() - 60) * 1_000_000)
        first_poll = True
        while not stop_event.is_set():
            try:
                messages, timeout_ms = client.poll()
                with self._lock:
                    self.error = None
                for message in messages:
                    if not self._remember_message(message.id):
                        continue
                    if first_poll and message.timestamp_usec and message.timestamp_usec < started_usec:
                        continue
                    if message.text:
                        with self._lock:
                            self.last_message_at = time.time()
                    for form_url in message.urls:
                        self._send(message, form_url)
                first_poll = False
                wait_seconds = min(2.0, max(0.75, timeout_ms / 1000))
            except Exception as exc:
                with self._lock:
                    self.error = clean_text(str(exc))[:240]
                client.continuation = ""
                wait_seconds = 3.0
            if stop_event.wait(wait_seconds):
                break

    def _send(self, message: ChatMessage, form_url: str) -> None:
        with self._lock:
            if form_url in self._sent_urls:
                return
        alert = (
            "🔗 <b>Google Form posted in live chat</b>\n"
            f"<b>Author:</b> {html.escape(message.author)}\n"
            f"<b>Message:</b> {html.escape(message.text or '(link only)')}\n\n"
            f'<a href="{html.escape(form_url, quote=True)}">Open Google Form</a>\n'
            f"<code>{html.escape(form_url)}</code>"
        )[:4000]
        try:
            self.telegram.send_html(alert)
            if self.health_callback:
                self.health_callback(None)
        except TelegramError as exc:
            if self.health_callback:
                self.health_callback(str(exc))
            return
        with self._lock:
            self._sent_urls.add(form_url)
            self.links_sent += 1
            self._save()

    def _load(self) -> set[str]:
        try:
            payload = json.loads(self.state_file.read_text(encoding="utf-8"))
            return {str(value) for value in payload.get("sent_urls", [])}
        except (OSError, ValueError, TypeError):
            return set()

    def _save(self) -> None:
        try:
            self.state_file.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.state_file.with_suffix(self.state_file.suffix + ".tmp")
            temporary.write_text(
                json.dumps({"sent_urls": sorted(self._sent_urls)}, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            temporary.replace(self.state_file)
        except OSError:
            pass
