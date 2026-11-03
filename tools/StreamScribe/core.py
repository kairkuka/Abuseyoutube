from __future__ import annotations

import html
import json
import re
import threading
from collections import deque
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable
from urllib.parse import parse_qs, urlparse


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_time(value: datetime | None = None) -> str:
    return (value or utc_now()).isoformat(timespec="seconds")


def clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def validate_youtube_url(value: str) -> str:
    value = clean_text(value)
    parsed = urlparse(value)
    host = (parsed.hostname or "").casefold()
    allowed_hosts = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"}
    if parsed.scheme != "https" or host not in allowed_hosts:
        raise ValueError("Enter a valid HTTPS YouTube URL.")
    if host == "youtu.be":
        video_id = parsed.path.strip("/").split("/")[0]
    else:
        video_id = parse_qs(parsed.query).get("v", [""])[0]
    if not re.fullmatch(r"[A-Za-z0-9_-]{6,20}", video_id):
        raise ValueError("YouTube URL must identify a video or live stream.")
    return value


class LikeMilestoneTracker:
    def __init__(self, state_file: Path, step: int = 100, target: int = 600) -> None:
        self.state_file = state_file
        self.step = max(1, int(step))
        self.target = max(self.step, int(target))
        self._lock = threading.RLock()
        self._videos: dict[str, dict] = self._load()

    def observe(self, video_id: str, likes: int) -> list[int]:
        video_id = clean_text(video_id)
        likes = max(0, int(likes))
        if not video_id:
            return []
        with self._lock:
            previous = self._videos.get(video_id)
            if previous is None:
                alerts = [self.target] if likes >= self.target else []
                self._videos[video_id] = {
                    "highest": likes,
                    "alerted": alerts.copy(),
                }
                self._save()
                return alerts

            highest = max(0, int(previous.get("highest", 0)))
            alerted = {int(value) for value in previous.get("alerted", [])}
            new_highest = max(highest, likes)
            alerts = [
                milestone
                for milestone in range(((highest // self.step) + 1) * self.step,
                                       (new_highest // self.step) * self.step + 1,
                                       self.step)
                if milestone not in alerted
            ]
            if new_highest >= self.target and self.target not in alerted and self.target not in alerts:
                alerts.append(self.target)
                alerts.sort()
            alerted.update(alerts)
            previous["highest"] = new_highest
            previous["alerted"] = sorted(alerted)
            self._save()
            return alerts

    def highest(self, video_id: str) -> int | None:
        with self._lock:
            state = self._videos.get(video_id)
            return int(state["highest"]) if state is not None else None

    def _load(self) -> dict[str, dict]:
        try:
            payload = json.loads(self.state_file.read_text(encoding="utf-8"))
            videos = payload.get("videos", {})
            return videos if isinstance(videos, dict) else {}
        except (OSError, ValueError, TypeError):
            return {}

    def _save(self) -> None:
        try:
            self.state_file.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.state_file.with_suffix(self.state_file.suffix + ".tmp")
            temporary.write_text(
                json.dumps({"videos": self._videos}, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            temporary.replace(self.state_file)
        except OSError:
            pass


def compile_trigger_pattern(words: list[str]) -> re.Pattern[str] | None:
    cleaned = [clean_text(word) for word in words if clean_text(word)]
    if not cleaned:
        return None
    parts = []
    for word in sorted(cleaned, key=len, reverse=True):
        escaped = re.escape(word)
        if word.casefold() in {"giveaway", "keyword"}:
            escaped = f"{escaped}s?"
        parts.append(escaped)
    body = "|".join(parts)
    return re.compile(rf"(?<!\w)({body})(?!\w)", re.IGNORECASE)


def highlight_trigger_html(text: str, pattern: re.Pattern[str] | None) -> str:
    if pattern is None:
        return html.escape(text)
    pieces: list[str] = []
    cursor = 0
    for match in pattern.finditer(text):
        pieces.append(html.escape(text[cursor : match.start()]))
        pieces.append(f"<b>{html.escape(match.group(0))}</b>")
        cursor = match.end()
    pieces.append(html.escape(text[cursor:]))
    return "".join(pieces)


@dataclass(slots=True)
class TranscriptEntry:
    id: int
    text: str
    created_at: str
    seconds: float
    trigger: bool = False
    trigger_word: str | None = None


@dataclass(slots=True)
class AlertEntry:
    id: int
    entry_id: int
    word: str
    created_at: str
    context: str
    delivered: bool
    error: str | None = None


class TranscriptStore:
    def __init__(self, data_dir: Path, max_entries: int = 500) -> None:
        self.data_dir = data_dir
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.max_entries = max_entries
        self._lock = threading.RLock()
        self._entries: deque[TranscriptEntry] = deque(maxlen=max_entries)
        self._alerts: deque[AlertEntry] = deque(maxlen=50)
        self._next_entry_id = 1
        self._next_alert_id = 1
        self._session_started: datetime | None = None
        self._session_file: Path | None = None
        self.capture_active = False
        self.capture_mode: str | None = None
        self.source = "YouTube tab"
        self.status = "Ready"
        self.error: str | None = None
        self.model_status = "Not loaded"
        self.audio_level = 0.0
        self.queue_depth = 0
        self.dropped_chunks = 0
        self.telegram_error: str | None = None

    def start_session(self, source: str = "YouTube tab", mode: str = "tab") -> None:
        with self._lock:
            if self._session_started is None:
                self._session_started = utc_now()
                stamp = self._session_started.strftime("%Y%m%d-%H%M%S")
                self._session_file = self.data_dir / f"transcript-{stamp}.jsonl"
            self.capture_active = True
            self.capture_mode = mode
            self.source = clean_text(source) or "Shared browser tab"
            self.status = "Listening"
            self.error = None

    def stop_session(self) -> None:
        with self._lock:
            self.capture_active = False
            self.capture_mode = None
            self.audio_level = 0.0
            self.queue_depth = 0
            if self.error is None:
                self.status = "Paused"

    def set_error(self, message: str) -> None:
        with self._lock:
            self.error = clean_text(message)
            self.status = "Needs attention"

    def clear_error(self) -> None:
        with self._lock:
            self.error = None

    def listening_status(self) -> str:
        with self._lock:
            if not self.capture_active:
                return "Paused"
            return "Listening silently" if self.capture_mode == "url" else "Listening"

    def set_telegram_health(self, error: str | None = None) -> None:
        with self._lock:
            self.telegram_error = clean_text(error) if error else None

    def set_runtime(self, *, status: str | None = None, model_status: str | None = None,
                    audio_level: float | None = None, queue_depth: int | None = None,
                    dropped: bool = False) -> None:
        with self._lock:
            if status is not None:
                self.status = status
            if model_status is not None:
                self.model_status = model_status
            if audio_level is not None:
                self.audio_level = max(0.0, min(1.0, float(audio_level)))
            if queue_depth is not None:
                self.queue_depth = max(0, int(queue_depth))
            if dropped:
                self.dropped_chunks += 1

    def add_transcript(self, text: str, *, trigger: bool = False,
                       trigger_word: str | None = None,
                       created_at: datetime | None = None) -> TranscriptEntry | None:
        text = clean_text(text)
        if not text:
            return None
        now = created_at or utc_now()
        with self._lock:
            if self._session_started is None:
                self.start_session(self.source)
            seconds = max(0.0, (now - self._session_started).total_seconds())
            entry = TranscriptEntry(
                id=self._next_entry_id,
                text=text,
                created_at=iso_time(now),
                seconds=round(seconds, 1),
                trigger=trigger,
                trigger_word=trigger_word,
            )
            self._next_entry_id += 1
            self._entries.append(entry)
            self._append_jsonl({"type": "transcript", **asdict(entry)})
            return entry

    def mark_trigger(self, entry_id: int, word: str) -> None:
        with self._lock:
            for entry in self._entries:
                if entry.id == entry_id:
                    entry.trigger = True
                    entry.trigger_word = word
                    break

    def add_alert(self, entry_id: int, word: str, context: str, delivered: bool,
                  error: str | None = None) -> AlertEntry:
        with self._lock:
            alert = AlertEntry(
                id=self._next_alert_id,
                entry_id=entry_id,
                word=word,
                created_at=iso_time(),
                context=context,
                delivered=delivered,
                error=clean_text(error) if error else None,
            )
            self._next_alert_id += 1
            self._alerts.append(alert)
            self._append_jsonl({"type": "alert", **asdict(alert)})
            return alert

    def recent_context(self, limit: int = 4, include_entry_id: int | None = None) -> list[TranscriptEntry]:
        with self._lock:
            entries = list(self._entries)
            if include_entry_id is not None:
                entries = [entry for entry in entries if entry.id <= include_entry_id]
            return entries[-limit:]

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()
            self._alerts.clear()
            self._next_entry_id = 1
            self._next_alert_id = 1
            self._session_started = utc_now() if self.capture_active else None
            if self._session_started:
                stamp = self._session_started.strftime("%Y%m%d-%H%M%S")
                self._session_file = self.data_dir / f"transcript-{stamp}.jsonl"
            else:
                self._session_file = None

    def export_text(self) -> str:
        with self._lock:
            lines = [f"StreamScribe transcript — {self.source}", ""]
            for entry in self._entries:
                minutes, seconds = divmod(int(entry.seconds), 60)
                marker = f" [{entry.trigger_word}]" if entry.trigger_word else ""
                lines.append(f"[{minutes:02d}:{seconds:02d}]{marker} {entry.text}")
            return "\n".join(lines).rstrip() + "\n"

    def snapshot(self, *, trigger_words: list[str], telegram_ready: bool,
                 model: str, language: str) -> dict:
        with self._lock:
            started = self._session_started
            elapsed = max(0, int((utc_now() - started).total_seconds())) if started else 0
            return {
                "capture_active": self.capture_active,
                "capture_mode": self.capture_mode,
                "source": self.source,
                "status": self.status,
                "error": self.error,
                "model_status": self.model_status,
                "audio_level": self.audio_level,
                "queue_depth": self.queue_depth,
                "dropped_chunks": self.dropped_chunks,
                "elapsed_seconds": elapsed,
                "entries": [asdict(entry) for entry in self._entries],
                "alerts": [asdict(alert) for alert in self._alerts],
                "trigger_words": trigger_words,
                "telegram_ready": telegram_ready,
                "telegram_error": self.telegram_error,
                "model": model,
                "language": language,
            }

    def _append_jsonl(self, payload: dict) -> None:
        if self._session_file is None:
            return
        try:
            with self._session_file.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(payload, ensure_ascii=False) + "\n")
        except OSError:
            pass


class TriggerDetector:
    def __init__(self, words: list[str], cooldown_seconds: int = 90) -> None:
        self._lock = threading.RLock()
        self._words = words
        self._pattern = compile_trigger_pattern(words)
        self.cooldown_seconds = cooldown_seconds
        self._last_alert: dict[str, datetime] = {}

    @property
    def words(self) -> list[str]:
        with self._lock:
            return list(self._words)

    @property
    def pattern(self) -> re.Pattern[str] | None:
        with self._lock:
            return self._pattern

    def update(self, words: list[str], cooldown_seconds: int) -> None:
        cleaned = list(dict.fromkeys(clean_text(word) for word in words if clean_text(word)))
        with self._lock:
            self._words = cleaned
            self._pattern = compile_trigger_pattern(cleaned)
            self.cooldown_seconds = max(0, cooldown_seconds)

    def match(self, text: str, now: datetime | None = None) -> str | None:
        when = now or utc_now()
        with self._lock:
            if self._pattern is None:
                return None
            found = self._pattern.search(text)
            if not found:
                return None
            word = found.group(0).casefold()
            previous = self._last_alert.get(word)
            if previous and (when - previous).total_seconds() < self.cooldown_seconds:
                return None
            self._last_alert[word] = when
            return found.group(0)


def build_alert_html(word: str, source: str, context_entries: list[TranscriptEntry],
                     pattern: re.Pattern[str] | None) -> str:
    lines = []
    for entry in context_entries:
        minutes, seconds = divmod(int(entry.seconds), 60)
        lines.append(f"<code>{minutes:02d}:{seconds:02d}</code> {highlight_trigger_html(entry.text, pattern)}")
    context = "\n".join(lines)
    title = "Giveaway detected" if word.casefold() == "giveaway" else "Trigger detected"
    return (
        f"🚨 <b>{title}</b>\n"
        f"<b>Trigger:</b> {html.escape(word)}\n"
        f"<b>Source:</b> {html.escape(source)}\n\n"
        f"<b>Recent context</b>\n{context}"
    )[:4000]


AlertSender = Callable[[str], tuple[bool, str | None]]
