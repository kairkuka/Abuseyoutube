# StreamScribe

Local live transcription for a YouTube stream. Exact trigger-word matches send a Telegram alert with recent context.

## Start

1. Double-click `start.cmd`, or run:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\run.ps1
   ```

2. First launch installs the local Python environment. First capture downloads the selected Whisper model once.
3. Paste the stream URL under **Silent YouTube source**.
4. Press **Start silent monitor**. The browser video can stay paused or muted.

Chrome or Edge recommended. Keep the terminal window open while listening.

## Telegram setup

The local app cannot read a bot secret stored in a GPT Project. Copy that bot's token into StreamScribe once:

1. Open the bot in Telegram and send `/start`.
2. Paste its Bot API token into **Telegram**.
3. Leave Chat ID blank; StreamScribe finds the latest chat.
4. Press **Connect and test**.

The token and discovered chat ID are saved only in local `.env`, excluded from Git. You can also copy `.env.example` to `.env` and fill both values manually. Add `YOUTUBE_INNERTUBE_API_KEY` there to enable YouTube live-chat and like monitoring.

## Behavior

- Default trigger: whole word `giveaway`, case-insensitive.
- Default cooldown: 90 seconds per trigger word.
- Alert context: matched transcript chunk plus up to three preceding chunks.
- Expected alert latency: roughly the 4-second audio chunk plus local model decode time.
- Silent URL mode reads YouTube audio directly and transcribes it locally. It produces no speaker playback. Only alert text is sent to Telegram.
- While silent URL mode runs, likes are checked every 5 minutes. Telegram alerts fire on each newly crossed 100-like milestone; 600 likes sends **ITS TIME**. Milestones persist across restarts.
- Live chat is watched directly for `forms.gle` and `docs.google.com/forms` links. New form links are deduplicated and sent to Telegram with the author and chat message.
- **Share YouTube tab** remains a fallback. Browser playback suppression is best-effort and varies by browser build.
- Transcript sessions save as local JSONL files under `data/`; **Export** creates readable text.

## Multiple simultaneous streams

Run each stream as an isolated StreamScribe process with its own port and data folder. All processes may reuse the Telegram credentials from `.env`.

```powershell
$env:STREAMSCRIBE_PORT = '8766'
$env:STREAMSCRIBE_INSTANCE_ID = 'lucid'
$env:STREAMSCRIBE_OPEN_BROWSER = 'false'
$env:TELEGRAM_MESSAGE_HEADER = 'LUCID STREAM'
.\.venv\Scripts\python.exe app.py
```

Open `http://127.0.0.1:8766` or call `POST /api/url/start` on that port. The default process remains on port `8765`. Each instance stores transcripts under its own `data/instances/<instance-id>/` folder. A configured Telegram header is prepended to every message from that instance.

Change trigger words, language, model, or cooldown in **Detection**. Stop listening before changing the model.

## Manual commands

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe app.py
```

Tests:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

App binds only to `127.0.0.1:8765`.
