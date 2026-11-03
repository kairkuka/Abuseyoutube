# Account Control Center — Diploma Project

Unified local platform with three connected modules:

1. **Accounts** — connect multiple Google identities with OAuth 2.0 and bind each identity to its YouTube channel.
2. **Form Scanner** — use the same Gmail identities / local Chrome profiles to open a supplied form URL and fill three fields independently per account: `Field 1 → AI Field 2 → Field 3`.
3. **Live Center** — open a YouTube livestream and send a live-chat message from the explicitly selected connected YouTube channel.

The architecture is intentionally connector-based at the boundary: today Google OAuth + YouTube API are used as the reference ecosystem; later that integration can be replaced by the Web3 identity/video APIs of the companion diploma project while keeping the same Account Manager and UI flow.

## Requirements

- Node.js 22+
- Google Chrome installed locally for Form Scanner
- OpenAI API key for AI Field 2
- Google Cloud OAuth client with YouTube Data API v3 enabled

## Start

```bash
npm start
```

Open:

- Accounts: `http://127.0.0.1:8790/accounts/`
- Form Scanner: `http://127.0.0.1:8790/local-form/`
- Live Center: `http://127.0.0.1:8790/`

## 1. Google OAuth / Accounts

The project uses the OAuth 2.0 authorization-code flow with PKCE and requests:

- `openid`
- `email`
- `profile`
- `https://www.googleapis.com/auth/youtube.force-ssl`

It requests `access_type=offline`, so Google can return a refresh token. Refresh tokens are stored only in the local token vault and are encrypted at rest. Google passwords are never requested or stored.

The Google identity is resolved through the OpenID Connect UserInfo endpoint. The stable Google `sub` is stored together with the Gmail address. After authorization, the project calls YouTube `channels.list(mine=true)` to identify the YouTube channel belonging to the authenticated account.

### Google Cloud setup

1. Create or choose a Google Cloud project.
2. Enable **YouTube Data API v3**.
3. Configure the OAuth consent screen.
4. If the consent screen is in Testing mode, add the Gmail accounts you will use as test users.
5. Create an OAuth Client (Desktop app is supported by this local project; a Web client can also be imported when its redirect URI is configured).
6. Download the client JSON.
7. Open `/accounts/` and click **Import OAuth JSON**.
8. Click **Connect Google account** once for every Gmail account.
9. Select the required Google identity on Google's consent screen and approve access.

A connected account appears as:

```text
Google identity / Gmail
        ↓
YouTube channel
        ↓
Account Control Center account
        ├── Form Scanner
        └── Live Center
```

Each Google identity needs a YouTube channel for the Live Center integration.

### Automatic OAuth maintenance

The server keeps the authorization state healthy without storing Google passwords or bypassing Google security checks:

1. A channel is initially connected through **Add**: select the mapped Gmail, select the exact YouTube channel, and complete Google's consent flow.
2. The callback stores only the encrypted refresh token, the selected channel ID, and non-secret connection metadata.
3. Every `OAUTH_TOKEN_MONITOR_HOURS` (24 by default), the server exchanges each saved refresh token for a short-lived access token in the background.
4. A successful refresh records a healthy check. An `invalid_grant` marks only that channel as needing reconnection and moves it to the top of the Add picker.
5. The next manual reconnect follows the same exact Gmail -> channel flow. Google password, passkey, 2FA, and consent remain under the account owner's control.

The scheduler starts automatically with the Node/Docker service and persists its non-secret status in `data/oauth-connection-status.json`.

### Batch reconnect after an OAuth-client move

When moving the platform to a different Google Cloud OAuth client, Google requires a fresh consent grant for every channel. In the Add dialog, use **Connect all** instead of repeating the Gmail/channel picker manually.

1. Click **Add** -> **Connect all**.
2. The queue opens the exact mapped Gmail and channel in a single reusable Google popup.
3. On Google, choose the shown Gmail, choose the shown YouTube channel, complete 2FA if Google requests it, and approve the consent screen.
4. After a successful callback, the next queued channel opens automatically.
5. A wrong channel, denied consent, missing checkbox, or other Google error pauses the queue on that channel. Use **Retry** or **Skip**; the queue position is kept in the browser's local storage.

The platform never stores Google passwords, enters a password, handles 2FA, or grants consent without the account owner. Those steps are enforced by Google and must remain manual.

```bash
# .env on the server
GOOGLE_OAUTH_PUBLISHING_STATUS=testing
OAUTH_TOKEN_MONITOR_HOURS=24
```

`Testing` is deliberately shown because Google limits refresh tokens issued to an external OAuth app in Testing to seven days. Background refresh cannot extend that Google-enforced limit. To remove the weekly reauthorization cycle:

1. Open the correct Google Cloud project.
2. Go to **Google Auth Platform -> Audience**.
3. Change **Publishing status** from **Testing** to **In production** and complete Google's verification requirements for the YouTube scope if prompted.
4. In the EC2 file `/opt/account-control-center/.env`, set `GOOGLE_OAUTH_PUBLISHING_STATUS=production`.
5. Restart the service with `docker restart account-control-center`.
6. Reconnect each channel once so it receives a production refresh token.

In production, the system still detects revoked, manually removed, or otherwise invalid refresh tokens. Those cases must be reauthorized by the account owner; no compliant application can silently enter a Google password or bypass 2FA.

## 2. Form Scanner

Form Scanner uses the same account registry, but browser execution remains local so the target page can use the already-authenticated Chrome session for that Gmail account.

For each selected account:

```text
Google OAuth account
        ↕ matched by email
Local Chrome profile already logged into the same Gmail
        ↓
Target form URL
        ↓
Field 1 = configured account value
Field 2 = separately generated OpenAI value
Field 3 = configured account value
```

The program does not read or store Chrome passwords.

### Automatic field detection

CSS selectors are optional. When all three selectors are blank, the scanner waits for the target page and automatically selects the first three visible editable text fields in DOM order.

If the form is complex, open **Точная настройка полей** and provide all three CSS selectors.

### AI configuration

Set the OpenAI API key only in the Node.js environment.

macOS / Linux:

```bash
export OPENAI_API_KEY="..."
export OPENAI_MODEL="gpt-5.6-luna"   # optional
npm start
```

Windows PowerShell:

```powershell
$env:OPENAI_API_KEY="..."
$env:OPENAI_MODEL="gpt-5.6-luna"     # optional
npm start
```

The prompt is configured per form campaign. The system generates a separate Field 2 value for every selected account and shows a preview before opening browsers.

### Adding another account later

1. Connect the new Gmail in `/accounts/` through Google OAuth.
2. Create/open a separate Chrome profile and sign into that same Gmail once.
3. Return to `/local-form/` and click **Пересканировать**.
4. The OAuth identity and Chrome profile are matched by email.
5. Set Field 1 and Field 3 and enable the row.

For a stable local snapshot, it is recommended to close ordinary Chrome windows before starting a Form Scanner run. Closing Chrome does not sign the accounts out.

The scanner opens temporary local copies of the selected Chrome profiles, fills the fields, and leaves the page open for review. **Submit is not automatically clicked.** Temporary snapshots are removed after the automation windows close; stale snapshots are cleaned on subsequent launches.

## 3. YouTube Live Center

Paste a YouTube livestream URL in `/` and select one connected channel from the left panel.

The backend:

1. Resolves the livestream through `videos.list`.
2. Gets the active `liveChatId`.
3. Sends the message with `liveChatMessages.insert` using the OAuth credentials of the selected channel.

One UI send action uses **one explicitly selected account/channel**. There is no automatic rotation or automatic mass commenting in the main workflow.

## Migration to the companion Web3 ecosystem

The current Google/YouTube integration is the reference implementation for the diploma demonstration.

A later migration can replace:

```text
Google OAuth 2.0       → Web3 ecosystem identity provider
YouTube channels       → Web3 video-platform accounts
YouTube Live Chat API  → Web3 live-chat API / WebSocket
```

The platform-level concepts remain unchanged:

- account registry;
- per-account identity;
- per-account form data;
- AI generation;
- selected-account live interaction;
- audit/activity information.

## Tests

```bash
npm run check
npm test
```

Current automated tests cover:

- Chrome profile discovery;
- Gmail/profile mapping;
- OAuth-account ↔ Chrome-profile matching;
- form configuration validation;
- automatic/explicit field configuration support;
- profile snapshot copying and cache exclusion;
- OpenAI response parsing;
- Google OAuth scopes (`openid`, `email`, YouTube);
- offline access request;
- OAuth callback identity resolution;
- Gmail + Google `sub` + YouTube channel persistence.

## Security notes

- Google passwords are never stored.
- OAuth refresh tokens are encrypted in the local token vault.
- OAuth authorization uses `state` and PKCE.
- OpenAI API keys remain server-side.
- Form Scanner is restricted to the local computer.
- Form runs require an explicit preview and confirmation.
- Live-chat sends require an explicitly selected account.
