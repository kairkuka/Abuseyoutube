const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

function ensureDir(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function atomicJson(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporary, file);
}

function readJsonFile(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";

function apiError(data, fallback) {
  const details = data && data.error;
  const raw = details && typeof details === "object"
    ? (details.message || details.error_description || details)
    : (data && data.error_description || details);
  const reasons = Array.isArray(details && details.errors) ? details.errors.map((item) => String(item && item.reason || "")) : [];
  const message = String(raw || fallback).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  const invalidGrant = /^invalid_grant$/i.test(String(details || "")) || /invalid_grant/i.test(message);
  const invalidCredentials = !invalidGrant && (
    /invalid authentication credentials/i.test(message)
    || /Expected OAuth 2 access token/i.test(message)
    || /login cookie or other valid authentication credential/i.test(message)
    || /unauthenticated/i.test(message)
  );
  const quota = reasons.some((reason) => /quota|dailyLimit/i.test(reason)) || /exceeded.*quota|quota.*exceeded|RESOURCE_EXHAUSTED/i.test(message);
  const chatInsert = /live-chat message/i.test(String(fallback || ""));
  const permission = chatInsert && (
    reasons.some((reason) => /^forbidden$|insufficientPermissions/i.test(reason))
    || /insufficient permissions|not permitted to create/i.test(message)
  );
  const insufficientScopes = !permission && (
    reasons.some((reason) => /insufficientPermissions/i.test(reason))
    || /insufficient authentication scopes|insufficient.*scope/i.test(message)
  );
  const error = new Error(
    invalidGrant
      ? "Google login expired or was revoked. Reconnect this YouTube channel with Add."
      : invalidCredentials
      ? "Google access token was rejected. The saved channel connection was kept; try again, or reconnect this channel with Add if it repeats."
      : quota
      ? "YouTube API daily quota is exhausted. Existing channel connections are safe. Google resets the quota at midnight Pacific Time."
      : permission
        ? "This YouTube channel is not allowed to post in this livestream. OAuth access is valid. Check subscribers-only, members-only, approved-user mode, timeout, or hidden-user restrictions."
        : insufficientScopes
          ? "Google did not grant YouTube permission. Press Add again and approve the YouTube permission checkbox."
        : message
  );
  error.code = invalidGrant ? "invalidGrant" : invalidCredentials ? "invalidCredentials" : quota ? "quotaExceeded" : permission ? "channelNotAllowed" : insufficientScopes ? "insufficientScopes" : (reasons.find(Boolean) || "");
  return error;
}

const CHAT_TYPES = {
  TEXT_MESSAGE_EVENT: "textMessageEvent",
  TOMBSTONE: "tombstone",
  FAN_FUNDING_EVENT: "fanFundingEvent",
  CHAT_ENDED_EVENT: "chatEndedEvent",
  SPONSOR_ONLY_MODE_STARTED_EVENT: "sponsorOnlyModeStartedEvent",
  SPONSOR_ONLY_MODE_ENDED_EVENT: "sponsorOnlyModeEndedEvent",
  NEW_SPONSOR_EVENT: "newSponsorEvent",
  USER_BANNED_EVENT: "userBannedEvent",
  SUPER_CHAT_EVENT: "superChatEvent",
  SUPER_STICKER_EVENT: "superStickerEvent",
  MEMBER_MILESTONE_CHAT_EVENT: "memberMilestoneChatEvent",
  MEMBERSHIP_GIFTING_EVENT: "membershipGiftingEvent",
  GIFT_MEMBERSHIP_RECEIVED_EVENT: "giftMembershipReceivedEvent",
  POLL_EVENT: "pollEvent",
  GIFT_EVENT: "giftEvent"
};

function mapLiveChatMessages(items) {
  return (items || []).map((item) => {
    const snippet = item.snippet || {};
    const author = item.authorDetails || {};
    const superChat = snippet.superChatDetails || {};
    return {
      id: String(item.id || ""),
      type: CHAT_TYPES[snippet.type] || String(snippet.type || "textMessageEvent"),
      text: String(snippet.displayMessage || ""),
      publishedAt: String(snippet.publishedAt || ""),
      amount: String(superChat.amountDisplayString || ""),
      author: {
        channelId: String(author.channelId || ""),
        name: String(author.displayName || "YouTube"),
        avatar: String(author.profileImageUrl || ""),
        owner: Boolean(author.isChatOwner),
        moderator: Boolean(author.isChatModerator),
        sponsor: Boolean(author.isChatSponsor),
        verified: Boolean(author.isVerified)
      }
    };
  });
}

function loadLiveChatClient() {
  const definition = protoLoader.loadSync(path.join(__dirname, "stream-list.proto"), {
    keepCase: false,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  });
  const service = grpc.loadPackageDefinition(definition).youtube.api.v3.V3DataLiveChatMessageService;
  return new service("youtube.googleapis.com:443", grpc.credentials.createSsl());
}

async function readJson(response, fallback) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw apiError(data, `${fallback} (HTTP ${response.status})`);
  return data;
}

function missingAccessTokenError() {
  const error = new Error("Google did not return a usable OAuth access token. The saved refresh token was kept; reconnect this channel with Add if it repeats.");
  error.code = "invalidCredentials";
  return error;
}

class TokenVault {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.configFile = path.join(dataDir, "oauth-client.json");
    this.webConfigFile = path.join(dataDir, "oauth-web-client.json");
    this.accountsFile = path.join(dataDir, "accounts.json");
    this.masterFile = path.join(dataDir, process.platform === "win32" ? "master-key.dpapi" : "master-key.local");
    this.masterKey = null;
    ensureDir(dataDir);
    if (process.platform !== "win32") {
      try { fs.chmodSync(dataDir, 0o700); } catch {}
    }
    if (process.platform === "win32" && /^SYSTEM$/i.test(process.env.USERNAME || "")) {
      execFileSync("icacls.exe", [dataDir, "/inheritance:r", "/grant:r", "SYSTEM:(OI)(CI)F", "Administrators:(OI)(CI)F"], { stdio: "ignore" });
    }
  }

  config(kind = "authorization") {
    const selected = kind === "web" ? this.webConfigFile : kind === "desktop" ? this.configFile : (fs.existsSync(this.webConfigFile) ? this.webConfigFile : this.configFile);
    if (!fs.existsSync(selected)) return null;
    return readJsonFile(selected);
  }

  saveConfig(input) {
    const kind = input && input.web ? "web" : "desktop";
    const source = input && (kind === "web" ? input.web : input.installed);
    if (!source || typeof source !== "object") throw new Error("Choose a Google OAuth client JSON file");
    if (!source.client_id || !source.auth_uri || !source.token_uri) throw new Error("OAuth JSON is missing required Google client fields");
    const config = {
      client_id: String(source.client_id),
      client_secret: String(source.client_secret || ""),
      auth_uri: String(source.auth_uri),
      token_uri: String(source.token_uri),
      project_id: String(source.project_id || "")
    };
    if (!/^https:\/\/accounts\.google\.com\//.test(config.auth_uri)) throw new Error("OAuth authorization endpoint must be accounts.google.com");
    if (!/^https:\/\/oauth2\.googleapis\.com\//.test(config.token_uri)) throw new Error("OAuth token endpoint must be oauth2.googleapis.com");
    atomicJson(kind === "web" ? this.webConfigFile : this.configFile, config);
    return { projectId: config.project_id, clientIdSuffix: config.client_id.slice(-18), kind };
  }

  loadRows() {
    if (!fs.existsSync(this.accountsFile)) return [];
    const value = readJsonFile(this.accountsFile);
    return Array.isArray(value) ? value : [];
  }

  saveRows(rows) {
    atomicJson(this.accountsFile, rows);
  }

  key() {
    if (this.masterKey) return this.masterKey;
    if (process.platform !== "win32") {
      if (!fs.existsSync(this.masterFile)) {
        const temporary = `${this.masterFile}.${process.pid}.tmp`;
        fs.writeFileSync(temporary, crypto.randomBytes(32).toString("base64"), { encoding: "utf8", mode: 0o600 });
        fs.renameSync(temporary, this.masterFile);
      }
      fs.chmodSync(this.masterFile, 0o600);
      this.masterKey = Buffer.from(fs.readFileSync(this.masterFile, "utf8").trim(), "base64");
      if (this.masterKey.length !== 32) throw new Error("Could not unlock the local token vault");
      return this.masterKey;
    }
    const quoted = this.masterFile.replace(/'/g, "''");
    const script = [
      "$ErrorActionPreference='Stop'",
      "Add-Type -AssemblyName System.Security",
      `$p='${quoted}'`,
      "if(Test-Path -LiteralPath $p){$protected=[IO.File]::ReadAllBytes($p);$plain=[Security.Cryptography.ProtectedData]::Unprotect($protected,$null,[Security.Cryptography.DataProtectionScope]::LocalMachine)}else{$plain=New-Object byte[] 32;$rng=[Security.Cryptography.RandomNumberGenerator]::Create();$rng.GetBytes($plain);$rng.Dispose();$protected=[Security.Cryptography.ProtectedData]::Protect($plain,$null,[Security.Cryptography.DataProtectionScope]::LocalMachine);[IO.File]::WriteAllBytes($p,$protected);& icacls.exe $p /inheritance:r /grant:r 'SYSTEM:F' 'Administrators:F' | Out-Null}",
      "[Convert]::ToBase64String($plain)"
    ].join(";");
    const output = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8" }).trim();
    this.masterKey = Buffer.from(output, "base64");
    if (this.masterKey.length !== 32) throw new Error("Could not unlock the local token vault");
    return this.masterKey;
  }

  encrypt(value) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.key(), iv);
    const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
    return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: encrypted.toString("base64") };
  }

  decrypt(value) {
    const decipher = crypto.createDecipheriv("aes-256-gcm", this.key(), Buffer.from(value.iv, "base64"));
    decipher.setAuthTag(Buffer.from(value.tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(value.data, "base64")), decipher.final()]).toString("utf8");
  }

  list() {
    return this.loadRows()
      .filter((row) => row && row.token && row.token.iv && row.token.tag && row.token.data)
      .map(({ token, oauthClientKind, ...account }) => account);
  }

  credentials(accountId) {
    const row = this.loadRows().find((item) => item.id === accountId);
    if (!row || !row.token || !row.token.iv || !row.token.tag || !row.token.data) throw new Error("Selected YouTube channel is not connected; connect it through Google OAuth first");
    return { refreshToken: this.decrypt(row.token), kind: row.oauthClientKind || "desktop" };
  }

  upsert(account, refreshToken, oauthClientKind = "desktop", refreshTokenMetadata = {}) {
    const rows = this.loadRows();
    const index = rows.findIndex((item) => item.id === account.id);
    const existing = index >= 0 ? rows[index] : null;
    if (!refreshToken && !existing) throw new Error("Google did not return offline access; reconnect and approve access");
    const receivedRefreshToken = Boolean(refreshToken);
    const row = {
      ...(existing || {}),
      ...account,
      token: receivedRefreshToken ? this.encrypt(refreshToken) : existing.token,
      oauthClientKind: receivedRefreshToken ? oauthClientKind : (existing.oauthClientKind || "desktop"),
      refreshTokenIssuedAt: receivedRefreshToken
        ? String(refreshTokenMetadata.issuedAt || account.connectedAt || new Date().toISOString())
        : String(existing && existing.refreshTokenIssuedAt || ""),
      refreshTokenExpiresAt: receivedRefreshToken
        ? String(refreshTokenMetadata.expiresAt || "")
        : String(existing && existing.refreshTokenExpiresAt || "")
    };
    if (index >= 0) rows[index] = row;
    else rows.push(row);
    this.saveRows(rows);
    return account;
  }
}

class YouTubeOAuth {
  constructor(options = {}) {
    this.redirectUri = options.redirectUri || process.env.YOUTUBE_OAUTH_REDIRECT || "http://127.0.0.1:8790/oauth/callback";
    this.vault = new TokenVault(options.dataDir || process.env.CONTROL_CENTER_DATA || path.join(__dirname, "data"));
    this.states = new Map();
    this.accessTokens = new Map();
    this.accountsCache = { mtimeMs: -1, rows: [] };
    this.liveChatClient = loadLiveChatClient();
    this.onQuota = typeof options.onQuota === "function" ? options.onQuota : () => {};
  }

  quota(action) {
    try { this.onQuota(action); } catch {}
  }

  configured() {
    return Boolean(this.vault.config());
  }

  importClient(value) {
    return this.vault.saveConfig(value);
  }

  listAccounts() {
    let mtimeMs = 0;
    try { mtimeMs = fs.statSync(this.vault.accountsFile).mtimeMs; } catch {}
    if (this.accountsCache.mtimeMs === mtimeMs) {
      return this.accountsCache.rows.map((account) => ({ ...account }));
    }
    const rows = this.vault.list();
    this.accountsCache = { mtimeMs, rows };
    return rows.map((account) => ({ ...account }));
  }

  beginAuthorization(options = {}) {
    const config = this.vault.config();
    if (!config) throw new Error("Import the Google OAuth client JSON first");
    const state = crypto.randomBytes(24).toString("base64url");
    const verifier = crypto.randomBytes(48).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    const kind = this.vault.config("web") && config.client_id === this.vault.config("web").client_id ? "web" : "desktop";
    const inputTarget = options && options.target && typeof options.target === "object" ? options.target : null;
    const target = inputTarget && (inputTarget.email || inputTarget.accountId) ? {
      email: String(inputTarget.email || "").trim().toLowerCase(),
      accountId: String(inputTarget.accountId || "").trim(),
      label: String(inputTarget.label || inputTarget.accountId || inputTarget.email || "account").trim().slice(0, 160)
    } : null;
    const completionMode = options && options.completionMode === "migration" ? "migration" : "";
    this.states.set(state, { verifier, createdAt: Date.now(), kind, target, completionMode });
    for (const [key, item] of this.states) if (Date.now() - item.createdAt > 10 * 60 * 1000) this.states.delete(key);
    const url = new URL(config.auth_uri);
    const parameters = new URLSearchParams({
      client_id: config.client_id,
      redirect_uri: this.redirectUri,
      response_type: "code",
      scope: `openid email profile ${YOUTUBE_SCOPE}`,
      access_type: "offline",
      // Reconnects must not silently reuse Google's currently active channel.
      prompt: "consent select_account",
      include_granted_scopes: "false",
      code_challenge: challenge,
      code_challenge_method: "S256",
      state
    });
    if (target && target.email) parameters.set("login_hint", target.email);
    url.search = parameters.toString();
    return url.toString();
  }

  async finishAuthorization(parameters) {
    const state = String(parameters.get("state") || "");
    const code = String(parameters.get("code") || "");
    const pending = this.states.get(state);
    this.states.delete(state);
    if (!pending || Date.now() - pending.createdAt > 10 * 60 * 1000) throw new Error("Authorization session expired; start again");
    try {
      if (parameters.get("error")) throw new Error(`Google authorization failed: ${parameters.get("error")}`);
      if (!code) throw new Error("Google did not return an authorization code");
      const config = this.vault.config(pending.kind);
      if (!config) throw new Error("The OAuth client used for this authorization is no longer configured");
      const tokenBody = new URLSearchParams({
        client_id: config.client_id,
        code,
        code_verifier: pending.verifier,
        grant_type: "authorization_code",
        redirect_uri: this.redirectUri
      });
      if (config.client_secret) tokenBody.set("client_secret", config.client_secret);
      const tokenResponse = await fetch(config.token_uri, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: tokenBody
      });
      const token = await readJson(tokenResponse, "Could not exchange Google authorization code");
      const grantedScopes = String(token.scope || "").split(/\s+/).filter(Boolean);
      if (grantedScopes.length && !grantedScopes.includes(YOUTUBE_SCOPE)) {
        const error = new Error("Google did not grant YouTube permission. Press Add again and approve the YouTube permission checkbox.");
        error.code = "insufficientScopes";
        throw error;
      }

      // Resolve the Google identity that owns this OAuth grant. The email is used only
      // as human-readable account metadata; the stable OIDC `sub` is the identity key.
      const userInfoResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { authorization: `Bearer ${token.access_token}` }
      });
      const userInfo = await readJson(userInfoResponse, "Could not identify the Google account");
      if (!userInfo.sub) throw new Error("Google did not return a stable account identifier");

      this.quota("channels.list.authorization");
      const channelResponse = await fetch("https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true", {
        headers: { authorization: `Bearer ${token.access_token}` }
      });
      const channels = await readJson(channelResponse, "Could not identify the authorized YouTube channel");
      const channel = channels.items && channels.items[0];
      if (!channel) throw new Error("This Google identity has no selectable YouTube channel");
      const authorizedEmail = String(userInfo.email || "").trim().toLowerCase();
      const authorizedChannelId = String(channel.id || "");
      const custom = String(channel.snippet && channel.snippet.customUrl || "");
      const authorizedChannelLabel = custom.startsWith("@")
        ? custom
        : String(channel.snippet && channel.snippet.title || authorizedChannelId || "another channel");
      if (pending.target && pending.target.accountId && authorizedChannelId !== pending.target.accountId) {
        const error = new Error(`Google authorized ${authorizedChannelLabel}, but this reconnect expects ${pending.target.label}. Choose the requested YouTube channel and try again.`);
        error.code = "targetChannelMismatch";
        throw error;
      }
      // A Brand Account can return its generated @pages.plusgoogle.com address even
      // when the user selected the mapped Gmail. The exact YouTube channel ID is the
      // authoritative target in that case; retain email validation for email-only flows.
      if (pending.target && pending.target.email && !pending.target.accountId && authorizedEmail !== pending.target.email) {
        const error = new Error(`Wrong Google account. Reconnect ${pending.target.label} with ${pending.target.email}.`);
        error.code = "targetEmailMismatch";
        throw error;
      }
      const connectedAt = new Date().toISOString();
      const refreshTokenExpiresIn = Number(token.refresh_token_expires_in);
      const refreshTokenExpiresAt = token.refresh_token
        && Number.isFinite(refreshTokenExpiresIn)
        && refreshTokenExpiresIn > 0
        ? new Date(Date.now() + refreshTokenExpiresIn * 1000).toISOString()
        : "";
      const account = {
        id: authorizedChannelId,
        googleSub: String(userInfo.sub),
        email: authorizedEmail,
        emailVerified: Boolean(userInfo.email_verified),
        googleName: String(userInfo.name || ""),
        googleAvatar: String(userInfo.picture || ""),
        handle: custom.startsWith("@") ? custom : "",
        name: String(channel.snippet && channel.snippet.title || "YouTube channel"),
        avatar: String(channel.snippet && channel.snippet.thumbnails && (channel.snippet.thumbnails.default || channel.snippet.thumbnails.medium || {}).url || ""),
        connectedAt
      };
      return {
        ...this.vault.upsert(account, token.refresh_token, pending.kind, {
          issuedAt: token.refresh_token ? connectedAt : "",
          expiresAt: refreshTokenExpiresAt
        }),
        authorizationCompletionMode: pending.completionMode || ""
      };
    } catch (error) {
      if (pending.completionMode === "migration") {
        error.authorizationCompletionMode = "migration";
        error.authorizationTargetAccountId = pending.target && pending.target.accountId || "";
      }
      throw error;
    }
  }

  async accessToken(accountId) {
    const cached = this.accessTokens.get(accountId);
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;
    return this.refreshAccessToken(accountId);
  }

  async refreshAccessToken(accountId) {
    const credentials = this.vault.credentials(accountId);
    const config = this.vault.config(credentials.kind);
    if (!config) throw new Error("Google OAuth is not configured");
    const body = new URLSearchParams({
      client_id: config.client_id,
      refresh_token: credentials.refreshToken,
      grant_type: "refresh_token"
    });
    if (config.client_secret) body.set("client_secret", config.client_secret);
    const response = await fetch(config.token_uri, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    });
    const data = await readJson(response, "Could not refresh Google access");
    const accessToken = String(data.access_token || "").trim();
    if (!accessToken) throw missingAccessTokenError();
    this.accessTokens.set(accountId, {
      value: accessToken,
      expiresAt: Date.now() + Math.max(60, Number(data.expires_in || 3600)) * 1000
    });
    return accessToken;
  }

  async authenticatedJson(accountId, url, options = {}, fallback = "YouTube request failed") {
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const accessToken = attempt === 0 ? await this.accessToken(accountId) : await this.refreshAccessToken(accountId);
      const headers = {
        ...(options.headers || {}),
        authorization: `Bearer ${accessToken}`
      };
      try {
        const response = await fetch(url, { ...options, headers });
        return await readJson(response, fallback);
      } catch (error) {
        lastError = error;
        if (error && error.code === "invalidCredentials" && attempt === 0) {
          this.accessTokens.delete(accountId);
          continue;
        }
        throw error;
      }
    }
    throw lastError || missingAccessTokenError();
  }

  async openLiveStream(accountId, videoId) {
    this.quota("videos.list.openStream");
    const data = await this.authenticatedJson(
      accountId,
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${encodeURIComponent(videoId)}`,
      {},
      "Could not load the YouTube livestream"
    );
    const video = data.items && data.items[0];
    if (!video) throw new Error("YouTube could not find this video");
    const details = video.liveStreamingDetails || {};
    if (!details.activeLiveChatId) throw new Error("This video does not have an active live chat");
    const thumbnail = video.snippet && video.snippet.thumbnails && (video.snippet.thumbnails.medium || video.snippet.thumbnails.default || {}).url;
    return {
      videoId: String(video.id || videoId),
      liveChatId: String(details.activeLiveChatId),
      title: String(video.snippet && video.snippet.title || "YouTube livestream"),
      channelTitle: String(video.snippet && video.snippet.channelTitle || "YouTube"),
      thumbnail: String(thumbnail || ""),
      concurrentViewers: Number(details.concurrentViewers || 0),
      actualStartTime: String(details.actualStartTime || "")
    };
  }

  async listLiveChat(accountId, liveChatId, pageToken = "") {
    const parameters = new URLSearchParams({
      part: "id,snippet,authorDetails",
      liveChatId,
      maxResults: "200"
    });
    if (pageToken) parameters.set("pageToken", pageToken);
    this.quota("liveChatMessages.list");
    const data = await this.authenticatedJson(
      accountId,
      `https://www.googleapis.com/youtube/v3/liveChat/messages?${parameters}`,
      {},
      "Could not read YouTube live chat"
    );
    return {
      messages: mapLiveChatMessages(data.items),
      nextPageToken: String(data.nextPageToken || ""),
      pollingIntervalMillis: Math.max(2000, Number(data.pollingIntervalMillis || 5000)),
      offlineAt: String(data.offlineAt || "")
    };
  }

  startLiveChatStream(accountId, liveChatId, handlers = {}) {
    let stopped = false;
    let call = null;
    let pageToken = "";
    let failures = 0;

    const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
    const run = async () => {
      while (!stopped) {
        try {
          const accessToken = await this.accessToken(accountId);
          const metadata = new grpc.Metadata();
          metadata.set("authorization", `Bearer ${accessToken}`);
          this.quota("liveChatMessages.streamList");
          call = this.liveChatClient.streamList({
            liveChatId,
            part: ["id", "snippet", "authorDetails"],
            profileImageSize: 48,
            pageToken
          }, metadata);
          await new Promise((resolve, reject) => {
            let ended = false;
            const finish = (error) => {
              if (ended) return;
              ended = true;
              if (error) reject(error);
              else resolve();
            };
            call.on("data", (data) => {
              failures = 0;
              pageToken = String(data.nextPageToken || pageToken);
              handlers.onBatch?.({
                messages: mapLiveChatMessages(data.items),
                nextPageToken: pageToken,
                offlineAt: String(data.offlineAt || "")
              });
              if (data.offlineAt) {
                stopped = true;
                call.cancel();
              }
            });
            call.on("error", (error) => {
              if (stopped && error.code === grpc.status.CANCELLED) finish();
              else finish(error);
            });
            call.on("end", () => finish());
          });
          if (!stopped) await delay(1000);
        } catch (error) {
          if (stopped) break;
          failures += 1;
          const quota = error.code === grpc.status.RESOURCE_EXHAUSTED && /quota|resource has been exhausted/i.test(String(error.details || error.message || ""));
          const invalidCredentials = error.code === grpc.status.UNAUTHENTICATED || /invalid authentication|OAuth 2 access token|unauthenticated/i.test(String(error.details || error.message || ""));
          if (quota) error.code = "quotaExceeded";
          if (invalidCredentials) {
            this.accessTokens.delete(accountId);
            error = apiError({ error: { message: String(error.details || error.message || "Unauthenticated") } }, "Could not stream YouTube live chat");
          }
          handlers.onError?.(error);
          await delay(quota ? 15 * 60 * 1000 : Math.min(30_000, 1000 * 2 ** Math.min(failures, 5)));
        }
      }
    };

    run().catch((error) => handlers.onError?.(error));
    return {
      stop() {
        stopped = true;
        if (call) call.cancel();
      }
    };
  }

  async sendMessage(accountId, videoId, message, knownLiveChatId = "") {
    let liveChatId = String(knownLiveChatId || "");
    if (!liveChatId) {
      this.quota("videos.list.sendLookup");
      const videoData = await this.authenticatedJson(
        accountId,
        `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${encodeURIComponent(videoId)}`,
        {},
        "Could not read livestream details"
      );
      liveChatId = String(videoData.items && videoData.items[0] && videoData.items[0].liveStreamingDetails && videoData.items[0].liveStreamingDetails.activeLiveChatId || "");
    }
    if (!liveChatId) throw new Error("This video has no active live chat");
    this.quota("liveChatMessages.insert");
    const data = await this.authenticatedJson(
      accountId,
      "https://www.googleapis.com/youtube/v3/liveChat/messages?part=snippet",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          snippet: {
            liveChatId,
            type: "textMessageEvent",
            textMessageDetails: { messageText: message }
          }
        })
      },
      "YouTube rejected the live-chat message"
    );
    return { messageId: String(data.id || ""), liveChatId };
  }
}

module.exports = { YouTubeOAuth, TokenVault };
