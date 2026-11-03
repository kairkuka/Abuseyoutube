from __future__ import annotations

import html
import json
import math
import os
import queue
import re
import threading
import time
import webbrowser
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen

import numpy as np
import uvicorn
from dotenv import load_dotenv, set_key
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from live_chat_monitor import ChatFormMonitor
from core import (
    LikeMilestoneTracker,
    TranscriptStore,
    TriggerDetector,
    build_alert_html,
    clean_text,
    validate_youtube_url,
)
from telegram_client import TelegramClient, TelegramError


ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
ENV_FILE = ROOT / ".env"
load_dotenv(ENV_FILE)


def env_list(name: str, default: str) -> list[str]:
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().casefold() in {"1", "true", "yes", "on"}


class RuntimeConfig:
    def __init__(self) -> None:
        instance_id = re.sub(r"[^a-zA-Z0-9_-]+", "-", os.getenv("STREAMSCRIBE_INSTANCE_ID", "").strip())
        self.instance_id = instance_id.strip("-")[:64]
        self.telegram_message_header = clean_text(os.getenv("TELEGRAM_MESSAGE_HEADER", ""))[:120]
        self.port = int(os.getenv("STREAMSCRIBE_PORT", "8765"))
        if not 1 <= self.port <= 65535:
            raise ValueError("STREAMSCRIBE_PORT must be between 1 and 65535.")
        self.open_browser = env_bool("STREAMSCRIBE_OPEN_BROWSER", True)
        self.model = os.getenv("WHISPER_MODEL", "base.en").strip() or "base.en"
        self.language = os.getenv("WHISPER_LANGUAGE", "en").strip()
        self.device = os.getenv("WHISPER_DEVICE", "cpu").strip() or "cpu"
        default_compute = "int8" if self.device == "cpu" else "float16"
        self.compute_type = os.getenv("WHISPER_COMPUTE_TYPE", default_compute).strip()
        self.trigger_words = env_list("TRIGGER_WORDS", "giveaway,keyword")
        self.cooldown_seconds = int(os.getenv("TRIGGER_COOLDOWN_SECONDS", "90"))
        self.silence_threshold = float(os.getenv("SILENCE_THRESHOLD", "0.0015"))
        self.like_check_seconds = max(30, int(os.getenv("LIKE_CHECK_SECONDS", "300")))
        self.like_milestone_step = 100
        self.like_target = 600
        self.enable_like_monitor = env_bool("ENABLE_LIKE_MONITOR", False)
        self.enable_form_link_monitor = env_bool("ENABLE_FORM_LINK_MONITOR", False)


config = RuntimeConfig()
DATA_DIR = ROOT / "data" if not config.instance_id else ROOT / "data" / "instances" / config.instance_id
store = TranscriptStore(DATA_DIR)
detector = TriggerDetector(config.trigger_words, config.cooldown_seconds)
telegram = TelegramClient(
    os.getenv("TELEGRAM_BOT_TOKEN", ""),
    os.getenv("TELEGRAM_CHAT_ID", ""),
    header=config.telegram_message_header,
)
like_tracker = LikeMilestoneTracker(
    DATA_DIR / "like-milestones.json",
    step=config.like_milestone_step,
    target=config.like_target,
)
chat_monitor = ChatFormMonitor(
    DATA_DIR / "chat-form-links.json",
    telegram,
    store.set_telegram_health,
)


def persist_env(updates: dict[str, str]) -> None:
    ENV_FILE.touch(exist_ok=True)
    for key, value in updates.items():
        set_key(str(ENV_FILE), key, value, quote_mode="always")
        os.environ[key] = value


class AudioWorker:
    def __init__(self) -> None:
        self._queue: queue.Queue[np.ndarray | None] = queue.Queue(maxsize=6)
        self._thread: threading.Thread | None = None
        self._model: Any = None
        self._model_key = ""
        self._stop = threading.Event()

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="stt-worker", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        try:
            self._queue.put_nowait(None)
        except queue.Full:
            pass

    def reset_model(self) -> None:
        self._model = None
        self._model_key = ""
        store.set_runtime(model_status="Not loaded")

    def submit(self, audio: np.ndarray) -> None:
        if not self._thread or not self._thread.is_alive():
            self.start()
        try:
            self._queue.put_nowait(audio)
        except queue.Full:
            try:
                self._queue.get_nowait()
                self._queue.task_done()
            except queue.Empty:
                pass
            store.set_runtime(dropped=True)
            self._queue.put_nowait(audio)
        store.set_runtime(queue_depth=self._queue.qsize())

    def _load_model(self) -> Any:
        key = f"{config.model}:{config.device}:{config.compute_type}"
        if self._model is not None and self._model_key == key:
            return self._model
        store.set_runtime(status="Loading speech model", model_status=f"Loading {config.model}")
        try:
            from faster_whisper import WhisperModel

            self._model = WhisperModel(
                config.model,
                device=config.device,
                compute_type=config.compute_type,
            )
            self._model_key = key
            next_status = store.listening_status()
            store.set_runtime(status=next_status, model_status=f"{config.model} ready")
            return self._model
        except Exception as exc:
            store.set_error(f"Could not load Whisper model: {exc}")
            raise

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                audio = self._queue.get(timeout=0.5)
            except queue.Empty:
                continue
            if audio is None:
                self._queue.task_done()
                break
            store.set_runtime(queue_depth=self._queue.qsize())
            try:
                self._transcribe(audio)
            except Exception as exc:
                store.set_error(f"Transcription failed: {exc}")
            finally:
                self._queue.task_done()

    def _transcribe(self, audio: np.ndarray) -> None:
        if audio.size < 8000:
            return
        rms = float(np.sqrt(np.mean(np.square(audio), dtype=np.float64)))
        level = min(1.0, max(0.0, (math.log10(max(rms, 1e-6)) + 3.0) / 2.4))
        store.set_runtime(audio_level=level)
        if rms < config.silence_threshold:
            store.set_runtime(status=store.listening_status())
            return

        model = self._load_model()
        store.set_runtime(status="Transcribing")
        kwargs: dict[str, Any] = {
            "beam_size": 1,
            "best_of": 1,
            "vad_filter": True,
            "vad_parameters": {"min_silence_duration_ms": 220},
            "condition_on_previous_text": False,
            "temperature": 0.0,
        }
        if config.language and config.language.lower() != "auto":
            kwargs["language"] = config.language
        segments, _ = model.transcribe(audio, **kwargs)
        texts = [segment.text.strip() for segment in segments if segment.text.strip() and segment.no_speech_prob < 0.82]
        text = clean_text(" ".join(texts))
        if not text:
            store.set_runtime(status=store.listening_status())
            return

        entry = store.add_transcript(text)
        if entry:
            word = detector.match(text)
            if word:
                store.mark_trigger(entry.id, word)
                self._send_alert(entry.id, word)
        store.set_runtime(status=store.listening_status())

    def _send_alert(self, entry_id: int, word: str) -> None:
        context_entries = store.recent_context(limit=4, include_entry_id=entry_id)
        context_plain = "\n".join(entry.text for entry in context_entries)
        message = build_alert_html(word, store.source, context_entries, detector.pattern)

        def send() -> None:
            try:
                telegram.send_html(message)
                store.set_telegram_health()
                store.add_alert(entry_id, word, context_plain, delivered=True)
            except TelegramError as exc:
                store.set_telegram_health(str(exc))
                store.add_alert(entry_id, word, context_plain, delivered=False, error=str(exc))

        threading.Thread(target=send, name="telegram-alert", daemon=True).start()


worker = AudioWorker()


class DirectStreamCapture:
    def __init__(self) -> None:
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._lock = threading.RLock()
        self._container: Any = None
        self.url = ""

    @property
    def running(self) -> bool:
        return bool(self._thread and self._thread.is_alive() and not self._stop.is_set())

    def start(self, url: str) -> None:
        with self._lock:
            if self.running:
                raise RuntimeError("A silent URL monitor is already running.")
            self.url = validate_youtube_url(url)
            self._stop = threading.Event()
            stop_event = self._stop
            self._thread = threading.Thread(target=self._run, args=(stop_event,), name="youtube-direct-capture", daemon=True)
            self._thread.start()

    def stop(self) -> None:
        with self._lock:
            stop_event = self._stop
            container = self._container
            thread = self._thread
        stop_event.set()
        if container is not None:
            try:
                container.close()
            except Exception:
                pass
        if thread and thread is not threading.current_thread():
            thread.join(timeout=5.0)
        with self._lock:
            if self._thread is thread:
                self._thread = None
        store.stop_session()

    def _resolve(self) -> tuple[str, str, dict[str, str]]:
        import yt_dlp

        options = {
            "quiet": True,
            "no_warnings": True,
            "format": "bestaudio/best",
            "noplaylist": True,
            "socket_timeout": 15,
        }
        info = yt_dlp.YoutubeDL(options).extract_info(self.url, download=False)
        media_url = str(info.get("url") or "")
        if not media_url:
            raise RuntimeError("YouTube did not provide a playable audio stream.")
        title = clean_text(str(info.get("title") or "YouTube live stream"))
        headers = {str(key): str(value) for key, value in (info.get("http_headers") or {}).items()}
        return media_url, title, headers

    def _run(self, stop_event: threading.Event) -> None:
        import av

        worker.start()
        store.start_session("Resolving YouTube stream", mode="url")
        store.set_runtime(status="Connecting silently")
        while not stop_event.is_set():
            try:
                media_url, title, headers = self._resolve()
                if stop_event.is_set():
                    break
                store.start_session(f"{title} · silent URL", mode="url")
                store.set_runtime(status="Listening silently")
                header_blob = "".join(f"{key}: {value}\r\n" for key, value in headers.items())
                container = av.open(
                    media_url,
                    options={
                        "headers": header_blob,
                        "reconnect": "1",
                        "reconnect_streamed": "1",
                        "reconnect_delay_max": "5",
                    },
                    timeout=(15.0, 15.0),
                )
                with self._lock:
                    self._container = container
                audio_stream = next(stream for stream in container.streams if stream.type == "audio")
                resampler = av.AudioResampler(format="fltp", layout="mono", rate=16000)
                chunks: list[np.ndarray] = []
                sample_count = 0
                for frame in container.decode(audio_stream):
                    if stop_event.is_set():
                        break
                    output = resampler.resample(frame)
                    frames = output if isinstance(output, list) else [output]
                    for resampled in frames:
                        audio = resampled.to_ndarray().astype(np.float32, copy=False).reshape(-1)
                        if not audio.size:
                            continue
                        chunks.append(audio)
                        sample_count += audio.size
                    if sample_count >= 64000:
                        merged = np.concatenate(chunks)
                        worker.submit(merged[:64000].copy())
                        remainder = merged[64000:]
                        chunks = [remainder] if remainder.size else []
                        sample_count = int(remainder.size)
                container.close()
                with self._lock:
                    self._container = None
                if not stop_event.is_set():
                    store.set_runtime(status="Reconnecting to YouTube")
            except Exception as exc:
                with self._lock:
                    self._container = None
                if stop_event.is_set():
                    break
                store.set_error(f"YouTube reconnecting: {clean_text(str(exc))[:210]}")
            if stop_event.wait(3.0):
                break
            store.clear_error()
        store.stop_session()


direct_capture = DirectStreamCapture()


class LikeMonitor:
    def __init__(self) -> None:
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._lock = threading.RLock()
        self.url = ""
        self.video_id = ""
        self.title = ""
        self.like_count: int | None = None
        self.error: str | None = None
        self.last_checked_at: float | None = None
        self.next_check_at: float | None = None

    @property
    def running(self) -> bool:
        return bool(self._thread and self._thread.is_alive() and not self._stop.is_set())

    def start(self, url: str) -> None:
        url = validate_youtube_url(url)
        self.stop()
        with self._lock:
            self.url = url
            self.video_id = ""
            self.title = ""
            self.like_count = None
            self.error = None
            self.last_checked_at = None
            self.next_check_at = time.time()
            self._stop = threading.Event()
            stop_event = self._stop
            self._thread = threading.Thread(
                target=self._run,
                args=(stop_event,),
                name="youtube-like-monitor",
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
            self.next_check_at = None

    def snapshot(self) -> dict:
        with self._lock:
            next_in = None
            if self.next_check_at is not None and self.running:
                next_in = max(0, int(self.next_check_at - time.time()))
            next_milestone = None
            if self.like_count is not None:
                next_milestone = ((self.like_count // config.like_milestone_step) + 1) * config.like_milestone_step
            return {
                "like_monitor_active": self.running,
                "like_count": self.like_count,
                "like_error": self.error,
                "like_video_id": self.video_id,
                "like_check_seconds": config.like_check_seconds,
                "like_next_check_seconds": next_in,
                "like_next_milestone": next_milestone,
                "like_target": config.like_target,
            }

    def _fetch(self) -> tuple[str, str, int]:
        parsed = urlparse(self.url)
        video_id = parsed.path.strip("/").split("/")[0] if parsed.hostname == "youtu.be" else parse_qs(parsed.query)["v"][0]
        youtube_key = os.getenv("YOUTUBE_INNERTUBE_API_KEY", "").strip()
        if not youtube_key:
            raise RuntimeError("Set YOUTUBE_INNERTUBE_API_KEY in .env to enable like monitoring.")
        endpoint = f"https://www.youtube.com/youtubei/v1/next?key={youtube_key}"
        payload = {
            "context": {
                "client": {
                    "clientName": "WEB",
                    "clientVersion": "2.20260820.01.00",
                    "hl": "en",
                    "gl": "US",
                }
            },
            "videoId": video_id,
        }
        request = Request(
            endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Origin": "https://www.youtube.com",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/139 Safari/537.36",
            },
        )
        with urlopen(request, timeout=20) as response:
            info = json.load(response)

        like_text = ""
        title = "YouTube live stream"
        stack: list[Any] = [info]
        while stack:
            value = stack.pop()
            if isinstance(value, dict):
                if value.get("accessibilityId") == "id.video.like.button":
                    like_text = str(value.get("accessibilityText") or "")
                renderer = value.get("videoPrimaryInfoRenderer")
                if isinstance(renderer, dict):
                    runs = renderer.get("title", {}).get("runs", [])
                    candidate = clean_text("".join(str(run.get("text") or "") for run in runs))
                    if candidate:
                        title = candidate
                stack.extend(value.values())
            elif isinstance(value, list):
                stack.extend(value)
        match = re.search(r"like this video along with ([\d,]+) other (?:person|people)", like_text, re.IGNORECASE)
        if not match:
            raise RuntimeError("YouTube does not expose the like count for this stream.")
        return video_id, title, int(match.group(1).replace(",", ""))

    def _run(self, stop_event: threading.Event) -> None:
        while not stop_event.is_set():
            try:
                video_id, title, likes = self._fetch()
                milestones = like_tracker.observe(video_id, likes)
                with self._lock:
                    self.video_id = video_id
                    self.title = title
                    self.like_count = likes
                    self.error = None
                    self.last_checked_at = time.time()
                for milestone in milestones:
                    self._notify(milestone, likes, title)
            except Exception as exc:
                with self._lock:
                    self.error = clean_text(str(exc))[:240]
                    self.last_checked_at = time.time()
            with self._lock:
                self.next_check_at = time.time() + config.like_check_seconds
            if stop_event.wait(config.like_check_seconds):
                break
        with self._lock:
            self.next_check_at = None

    def _notify(self, milestone: int, likes: int, title: str) -> None:
        if milestone == config.like_target:
            message = (
                "🚨 <b>ITS TIME</b>\n"
                f"<b>{milestone} likes reached</b>\n"
                f"<b>Current:</b> {likes}\n"
                f"<b>Source:</b> {html.escape(title)}"
            )
        else:
            message = (
                f"👍 <b>{milestone} likes reached</b>\n"
                f"<b>Current:</b> {likes}\n"
                f"<b>Source:</b> {html.escape(title)}"
            )
        try:
            telegram.send_html(message)
            store.set_telegram_health()
        except TelegramError as exc:
            store.set_telegram_health(str(exc))


like_monitor = LikeMonitor()
app = FastAPI(title="StreamScribe", docs_url=None, redoc_url=None)
app.mount("/static", StaticFiles(directory=STATIC), name="static")


class TelegramSetup(BaseModel):
    token: str = Field(min_length=20, max_length=256)
    chat_id: str = Field(default="", max_length=64)


class DetectionSettings(BaseModel):
    trigger_words: list[str] = Field(min_length=1, max_length=10)
    cooldown_seconds: int = Field(ge=0, le=3600)
    language: str = Field(default="en", max_length=20)
    model: str = Field(default="base.en", max_length=80)


class UrlCaptureRequest(BaseModel):
    url: str = Field(min_length=20, max_length=500)


@app.get("/", response_class=HTMLResponse)
def index() -> str:
    return (STATIC / "index.html").read_text(encoding="utf-8")


@app.get("/api/state")
def get_state() -> dict:
    state = store.snapshot(
        trigger_words=detector.words,
        telegram_ready=telegram.ready,
        model=config.model,
        language=config.language or "auto",
    )
    state["source_url"] = direct_capture.url if state["capture_mode"] == "url" else ""
    state.update(like_monitor.snapshot())
    state.update(chat_monitor.snapshot())
    state["like_monitor_enabled"] = config.enable_like_monitor
    state["form_link_monitor_enabled"] = config.enable_form_link_monitor
    state["instance_id"] = config.instance_id or "default"
    state["telegram_message_header"] = config.telegram_message_header
    state["port"] = config.port
    return state


@app.post("/api/session/clear")
def clear_session() -> dict:
    store.clear()
    return {"ok": True}


@app.post("/api/url/start")
def start_url_capture(payload: UrlCaptureRequest) -> dict:
    if store.capture_active:
        raise HTTPException(status_code=409, detail="Stop the current capture before starting silent URL monitoring.")
    try:
        direct_capture.start(payload.url)
        if config.enable_like_monitor:
            like_monitor.start(payload.url)
        if config.enable_form_link_monitor:
            chat_monitor.start(payload.url)
    except (ValueError, RuntimeError) as exc:
        chat_monitor.stop()
        like_monitor.stop()
        direct_capture.stop()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True}


@app.post("/api/url/stop")
def stop_url_capture() -> dict:
    chat_monitor.stop()
    like_monitor.stop()
    direct_capture.stop()
    return {"ok": True}


@app.get("/api/export", response_class=PlainTextResponse)
def export_transcript() -> PlainTextResponse:
    return PlainTextResponse(
        store.export_text(),
        headers={"Content-Disposition": "attachment; filename=streamscribe-transcript.txt"},
    )


@app.post("/api/telegram/configure")
def configure_telegram(payload: TelegramSetup) -> dict:
    previous = (telegram.token, telegram.chat_id)
    telegram.configure(payload.token, payload.chat_id)
    try:
        if not telegram.chat_id:
            telegram.discover_chat_id()
        telegram.test()
    except TelegramError as exc:
        telegram.configure(*previous)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    persist_env({"TELEGRAM_BOT_TOKEN": telegram.token, "TELEGRAM_CHAT_ID": telegram.chat_id})
    store.set_telegram_health()
    return {"ok": True, "chat_id": telegram.chat_id}


@app.post("/api/telegram/test")
def test_telegram() -> dict:
    try:
        telegram.test()
    except TelegramError as exc:
        store.set_telegram_health(str(exc))
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    store.set_telegram_health()
    return {"ok": True}


@app.post("/api/settings")
def update_settings(payload: DetectionSettings) -> dict:
    if store.capture_active and payload.model != config.model:
        raise HTTPException(status_code=409, detail="Stop listening before changing the speech model.")
    words = list(dict.fromkeys(clean_text(word) for word in payload.trigger_words if clean_text(word)))
    if not words:
        raise HTTPException(status_code=400, detail="Add at least one trigger word.")
    model_changed = payload.model != config.model
    config.trigger_words = words
    config.cooldown_seconds = payload.cooldown_seconds
    config.language = payload.language.strip() or "auto"
    config.model = payload.model.strip() or "base.en"
    detector.update(words, payload.cooldown_seconds)
    persist_env({
        "TRIGGER_WORDS": ",".join(words),
        "TRIGGER_COOLDOWN_SECONDS": str(payload.cooldown_seconds),
        "WHISPER_LANGUAGE": config.language,
        "WHISPER_MODEL": config.model,
    })
    if model_changed:
        worker.reset_model()
    return {"ok": True}


@app.websocket("/api/audio")
async def audio_socket(websocket: WebSocket) -> None:
    await websocket.accept()
    store.start_session("Shared browser tab", mode="tab")
    worker.start()
    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break
            if message.get("bytes") is not None:
                raw = message["bytes"]
                if len(raw) % 4:
                    continue
                audio = np.frombuffer(raw, dtype="<f4").astype(np.float32, copy=True)
                worker.submit(audio)
            elif message.get("text"):
                source = clean_text(message["text"])
                if source:
                    store.start_session(source[:180], mode="tab")
    except WebSocketDisconnect:
        pass
    finally:
        store.stop_session()


if __name__ == "__main__":
    if config.open_browser:
        threading.Timer(1.1, lambda: webbrowser.open(f"http://127.0.0.1:{config.port}")).start()
    uvicorn.run(app, host="127.0.0.1", port=config.port, reload=False)
