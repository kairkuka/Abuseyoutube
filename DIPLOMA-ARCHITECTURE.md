# Diploma architecture: Account Control Center

## Core idea

A single platform manages multiple user identities across two interaction scenarios while preserving strict per-account separation.

## Identity model

```text
Google OAuth identity
  ├─ stable Google OIDC subject (`sub`)
  ├─ Gmail address
  └─ YouTube channel
       └─ encrypted refresh token
```

The same identity is matched by email to a local Chrome profile for browser-based form automation.

## Module A — Form Scanner

Input:
- target URL;
- per-account Field 1;
- AI prompt;
- per-account Field 3.

Processing:
1. select enabled account;
2. find local Chrome profile with same Gmail;
3. generate unique Field 2 with OpenAI;
4. create preview;
5. create temporary Chrome-profile snapshot;
6. open target URL;
7. auto-detect first three visible editable fields (or use explicit CSS selectors);
8. fill Field 1 → AI Field 2 → Field 3;
9. leave page open for review.

## Module B — Live Center

Input:
- YouTube livestream URL;
- explicitly selected connected account;
- message.

Processing:
1. resolve authenticated YouTube channel;
2. resolve video and active live-chat ID;
3. send message through YouTube Live Chat API using the selected account OAuth token;
4. record activity and quota estimate.

## Migration boundary

Reference implementation today:

```text
Google OAuth / OIDC → YouTube Data & Live Streaming API
```

Companion Web3 platform later:

```text
Web3 identity provider → Web3 video/live-chat API
```

The Account Manager, form data model, AI module, UI and audit concepts remain unchanged; only the external connector boundary is replaced.
