# Fast Google Form Handler for Windows

One-shot YouTube live-chat watcher and direct parallel Google Forms submitter.

Before starting the live-chat watcher, set `YOUTUBE_INNERTUBE_API_KEY` in the terminal environment. Keep this key outside the repository.

## Setup

Requires Windows 10 or 11 and Node.js 16 or newer.

On another computer:

1. Install Node.js.
2. Extract the ZIP.
3. Double-click `RUN-ME.cmd`.
4. Type `START`, or paste a Google Form link directly.

The ZIP already includes its small browser-fallback dependency. `npm install` is only needed if `node_modules` is removed.

Optional browser fallback requires Brave Browser and uses DevTools port `9222`.

Reinstall fallback dependency if needed:

```powershell
npm install
```

## Use

Double-click `RUN-ME.cmd`, paste the Google Form URL, and press Enter. The terminal immediately parses the form and dispatches all saved usernames through direct parallel HTTP/2 submissions. It does not load browser tabs.

Or type `START` and press Enter. The terminal arms a one-shot live-chat watcher for the configured `youtubeUrl`. It ignores chat history, accepts the first new Google Form link from a configured `chatAuthors` account, dispatches one response per saved username, ignores repeated links, then returns to the prompt. Type `START` again to arm the next one-shot run.

From a terminal:

```powershell
.\form.cmd
```

One-line version:

```powershell
.\form.cmd "https://docs.google.com/forms/..."
```

Default terminal behavior:

- fetches only the form metadata;
- detects the username field and configured radio option;
- dispatches all saved usernames concurrently over HTTP/2;
- reports dispatch time and each Google confirmation time;
- never retries uncertain submissions, avoiding duplicates.

The browser implementation remains available as a fallback:

```powershell
node form-fill.js run "https://docs.google.com/forms/..."
```

Edit `nicknames.json` to change the watched YouTube stream, allowed chat authors, usernames, field label, or radio label:

```json
{
  "fieldLabel": "Name",
  "radioLabel": "Tradeify",
  "youtubeUrl": "https://www.youtube.com/watch?v=VIDEO_ID",
  "chatAuthors": ["@OfficialChannel"],
  "targets": [
    {
      "youtubeUsername": "@example",
      "note": "Brave tab 1"
    }
  ]
}
```

Markdown links copied from chat also work; the helper extracts the real URL.
