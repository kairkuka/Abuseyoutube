const fs = require("fs");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const childProcess = require("child_process");

function loadEnvFile(file = path.join(__dirname, ".env")) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadEnvFile();

const { YouTubeOAuth } = require("./youtube-oauth");
const { ExtensionBridge } = require("./bridge");
const { LocalFormAutomation, DEFAULT_CONFIG, generateAiValue } = require("./local-form-automation");
const { submitGoogleFormRows } = require("./google-form-direct-submit");
const { MarketNewsTracker } = require("./market-news-tracker");

const HOST = process.env.CONTROL_CENTER_HOST || (process.env.PORT ? "0.0.0.0" : "127.0.0.1");
const PORT = Number(process.env.CONTROL_CENTER_PORT || process.env.PORT || 8790);
const ORIGIN_SECRET = process.env.CONTROL_CENTER_ORIGIN_SECRET || "";
const OAUTH_REDIRECT = process.env.YOUTUBE_OAUTH_REDIRECT || `http://127.0.0.1:${PORT}/oauth/callback`;
const PUBLIC_DIR = path.join(__dirname, "public");
const PORTAL_DIR = path.join(__dirname, "portal");
const MANUAL_DIR = path.join(__dirname, "manual");
const LOCAL_FORM_DIR = path.join(__dirname, "local-form");
const ACCOUNTS_DIR = path.join(__dirname, "accounts");
const LOCAL_FORM_CONFIG_FILE = path.join(__dirname, "data", "local-form-config.json");
const QUOTA_USAGE_FILE = path.join(__dirname, "data", "quota-usage.json");
const STREAM_CACHE_FILE = path.join(__dirname, "data", "stream-cache.json");
const ACCOUNT_METADATA_FILE = path.join(__dirname, "data", "account-metadata.json");
const FORM_METADATA_FILE = path.join(__dirname, "data", "form-metadata.json");
const ACCOUNT_GMAIL_RULES_FILE = path.join(__dirname, "data", "account-gmail-rules.json");
const BUILTIN_ACCOUNT_GMAIL_RULES = Object.freeze({
  "@blinkdesign-y5r": "designblink1@gmail.com",
  "@bearorbull69": "designblink1@gmail.com",
  "@traderofsmcmethod": "madgrokai@gmail.com",
  "@nickdiamondhand": "madgrokai@gmail.com"
});
const BUILTIN_ADMIN_CHANNELS = Object.freeze([
  { id: "UCzz8Y4WztJaskGMiddEW6Cw", handle: "@blinkdesign-y5r", name: "Blink Design" },
  { id: "UCxW0gLPAPMr8aZuH6_jX_Ag", handle: "@bearorbull69", name: "BearorBull" },
  { id: "UCfSvzE1cbwH-eX5alu7Vw9Q", handle: "@traderofsmcmethod", name: "Tr" },
  { id: "UCVdDgcnMCsz4rQeUjfCjypA", handle: "@nickdiamondhand", name: "nickdiamondhand" }
]);
const ADMIN_CHANNEL_CATALOG_FILE = path.join(__dirname, "data", "admin-channel-catalog.json");
const OAUTH_CONNECTION_STATUS_FILE = path.join(__dirname, "data", "oauth-connection-status.json");
const MARKET_REACTIONS_DB_FILE = path.join(__dirname, "data", "market-reactions.sqlite");
const STREAMSCRIBE_DIR = [
  path.join(__dirname, "tools", "streamscribe"),
  path.join(__dirname, "tools", "StreamScribe")
].find((candidate) => fs.existsSync(candidate)) || path.join(__dirname, "tools", "streamscribe");
const STREAMSCRIBE_PORT = Number(process.env.STREAMSCRIBE_PORT || 8765);
const STREAMSCRIBE_URL = `http://127.0.0.1:${STREAMSCRIBE_PORT}`;
const STREAMSCRIBE_TRIGGERS = ["giveaway", "giveaways", "keyword", "keywords"];
const LONDON_FORMS_DIR = path.join(__dirname, "tools", "london-forms");
const LONDON_FORMS_SCRIPT = path.join(LONDON_FORMS_DIR, "fast-chat-handler.js");
const LONDON_FORMS_SUBMIT_SCRIPT = path.join(LONDON_FORMS_DIR, "fast-form-submit.js");
const LONDON_FORMS_CONFIG = path.join(LONDON_FORMS_DIR, "nicknames.json");
const LONDON_FORMS_TIMEOUT_MS = 30 * 60_000;
const ECONOMIC_CALENDAR_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
const ECONOMIC_CALENDAR_CACHE_MS = 5 * 60_000;
const ECONOMIC_CALENDAR_COUNTRIES = new Set(["USD", "CAD", "GBP", "EUR"]);
const ACCOUNT_METADATA_FIELDS = ["email", "title", "field1", "field2", "field3"];
const SEND_COOLDOWN_MS = 5_000;
const SEND_COOLDOWN_SECONDS = Math.ceil(SEND_COOLDOWN_MS / 1000);
const OAUTH_PUBLISHING_STATUS = String(process.env.GOOGLE_OAUTH_PUBLISHING_STATUS || "testing").trim().toLowerCase() === "production" ? "production" : "testing";
const OAUTH_TOKEN_MONITOR_HOURS = Math.min(168, Math.max(1, Number(process.env.OAUTH_TOKEN_MONITOR_HOURS || 24) || 24));
const OAUTH_TOKEN_MONITOR_CONCURRENCY = Math.min(6, Math.max(1, Number(process.env.OAUTH_TOKEN_MONITOR_CONCURRENCY || 2) || 2));
const OAUTH_TOKEN_MONITOR_INITIAL_DELAY_MS = Math.min(5 * 60_000, Math.max(1_000, Number(process.env.OAUTH_TOKEN_MONITOR_INITIAL_DELAY_MS || 10_000) || 10_000));
const OAUTH_TOKEN_MONITOR_INTERVAL_MS = OAUTH_TOKEN_MONITOR_HOURS * 60 * 60 * 1000;
const YOUTUBE_QUOTA_COSTS = {
  "channels.list.authorization": { method: "channels.list", units: 1, label: "OAuth channel lookup" },
  "videos.list.openStream": { method: "videos.list", units: 1, label: "Open livestream" },
  "videos.list.sendLookup": { method: "videos.list", units: 1, label: "Find chat before send" },
  "liveChatMessages.list": { method: "liveChatMessages.list", units: 5, label: "Read live chat" },
  "liveChatMessages.streamList": { method: "liveChatMessages.streamList", units: 5, label: "Stream live chat" },
  "liveChatMessages.insert": { method: "liveChatMessages.insert", units: 20, label: "Send live-chat message" }
};
const youtube = new YouTubeOAuth({ redirectUri: OAUTH_REDIRECT, onQuota: recordYoutubeQuota });
const browserBridge = new ExtensionBridge();
const localForms = new LocalFormAutomation({ configFile: LOCAL_FORM_CONFIG_FILE, accountsProvider: () => connectedAccountsWithMetadata() });
const marketNewsTracker = new MarketNewsTracker({ databaseFile: MARKET_REACTIONS_DB_FILE });
const staged = new Map();
const sentAt = new Map();
const sendingAccounts = new Set();
const formWatcher = {
  status: "idle",
  running: false,
  sequence: 0,
  events: [],
  controller: null,
  streamUrl: "",
  videoId: "",
  formUrl: "",
  startedAt: "",
  whisperStatus: "idle",
  whisperError: ""
};
const manualSentAt = new Map();
const manualActivity = [];
const activity = [];
const streams = new Map();
const disconnectedAccountIds = new Set();
const oauthMonitor = {
  running: false,
  lastStartedAt: "",
  lastFinishedAt: "",
  lastChecked: 0,
  lastInvalid: 0,
  lastFailed: 0,
  lastError: ""
};
let economicCalendarCache = { expiresAt: 0, fetchedAt: "", events: [] };
let streamscribeChild = null;
let streamscribeLog = "";
const MANUAL_LABELS_FILE = path.join(__dirname, "data", "manual-labels.json");
const MANUAL_ACCOUNTS_FILE = path.join(__dirname, "data", "manual-accounts.json");

function loadManualLabels() {
  try {
    const value = JSON.parse(fs.readFileSync(MANUAL_LABELS_FILE, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

function saveManualLabels(labels) {
  fs.mkdirSync(path.dirname(MANUAL_LABELS_FILE), { recursive: true });
  const temporary = `${MANUAL_LABELS_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(labels, null, 2), "utf8");
  fs.renameSync(temporary, MANUAL_LABELS_FILE);
}

function readJson(pathname, fallback) {
  try {
    const value = JSON.parse(fs.readFileSync(pathname, "utf8").replace(/^\uFEFF/, ""));
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

function writeJson(pathname, value) {
  fs.mkdirSync(path.dirname(pathname), { recursive: true });
  const temporary = `${pathname}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(temporary, pathname);
}

function cleanIsoTimestamp(value) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

function cleanOAuthConnectionStatus(row = {}) {
  const state = String(row.state || "");
  return {
    state: state === "ready" || state === "needsReconnect" || state === "checkFailed" ? state : "",
    lastCheckedAt: cleanIsoTimestamp(row.lastCheckedAt),
    error: cleanMetadataValue(row.error, 220)
  };
}

function loadOAuthConnectionStatuses() {
  const raw = readJson(OAUTH_CONNECTION_STATUS_FILE, {});
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const cleaned = {};
  for (const [accountId, row] of Object.entries(raw)) {
    if (!/^UC[A-Za-z0-9_-]{20,40}$/.test(accountId)) continue;
    const status = cleanOAuthConnectionStatus(row);
    if (status.state || status.lastCheckedAt || status.error) cleaned[accountId] = status;
  }
  return cleaned;
}

function saveOAuthConnectionStatuses(rows) {
  writeJson(OAUTH_CONNECTION_STATUS_FILE, rows && typeof rows === "object" && !Array.isArray(rows) ? rows : {});
}

function updateOAuthConnectionStatus(accountId, patch) {
  if (!/^UC[A-Za-z0-9_-]{20,40}$/.test(String(accountId || ""))) return;
  const rows = loadOAuthConnectionStatuses();
  rows[accountId] = cleanOAuthConnectionStatus({ ...rows[accountId], ...patch });
  saveOAuthConnectionStatuses(rows);
}

function oauthAutomationSnapshot() {
  return {
    enabled: true,
    publishingStatus: OAUTH_PUBLISHING_STATUS,
    checkIntervalHours: OAUTH_TOKEN_MONITOR_HOURS,
    running: oauthMonitor.running,
    lastStartedAt: oauthMonitor.lastStartedAt,
    lastFinishedAt: oauthMonitor.lastFinishedAt,
    lastChecked: oauthMonitor.lastChecked,
    lastInvalid: oauthMonitor.lastInvalid,
    lastFailed: oauthMonitor.lastFailed,
    lastError: oauthMonitor.lastError
  };
}

function cleanMetadataValue(value, limit = 220) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

function cleanMetadataMultilineValue(value, limit = 220) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .split("\n")
    .map((line) => line.slice(0, limit))
    .join("\n")
    .trim()
    .slice(0, limit);
}

function emptyAccountMetadata() {
  return { email: "", title: "", field1: "", field2: "", field3: "", records: [] };
}

function cleanAccountRecord(row = {}, multilineField3 = false) {
  const id = cleanMetadataValue(row.id, 80);
  const color = cleanMetadataValue(row.color, 20);
  const order = Number(row.order);
  const record = {
    id: /^[A-Za-z0-9_-]{8,80}$/.test(id) ? id : crypto.randomUUID(),
    field1: cleanMetadataValue(row.field1),
    field2: cleanMetadataValue(row.field2),
    field3: multilineField3 ? cleanMetadataMultilineValue(row.field3) : cleanMetadataValue(row.field3),
    color: color === "red" || color === "green" || color === "yellow" ? color : "",
    order: Number.isFinite(order) ? order : 0,
    manualOrder: Boolean(row.manualOrder),
    pinned: Boolean(row.pinned),
    sent: Boolean(row.sent),
    ticketed: Boolean(row.ticketed),
    createdAt: cleanMetadataValue(row.createdAt, 40),
    updatedAt: cleanMetadataValue(row.updatedAt, 40)
  };
  return record.field1 || record.field2 || record.field3 ? record : null;
}

function cleanAccountMetadata(row = {}) {
  return {
    email: cleanMetadataValue(row.email, 160),
    title: cleanMetadataValue(row.title, 160),
    field1: cleanMetadataValue(row.field1),
    field2: cleanMetadataValue(row.field2),
    field3: cleanMetadataMultilineValue(row.field3),
    records: Array.isArray(row.records)
      ? row.records.map((record) => cleanAccountRecord(record, true)).filter(Boolean).slice(0, 50)
      : []
  };
}

function hasAccountMetadata(metadata) {
  return ACCOUNT_METADATA_FIELDS.some((field) => metadata[field]) || Boolean(metadata.records && metadata.records.length);
}

function loadAccountMetadata() {
  const rows = readJson(ACCOUNT_METADATA_FILE, {});
  if (!rows || typeof rows !== "object" || Array.isArray(rows)) return {};
  const cleaned = {};
  for (const [id, row] of Object.entries(rows)) {
    if (!/^UC[A-Za-z0-9_-]{20,40}$/.test(id)) continue;
    const metadata = cleanAccountMetadata(row);
    if (hasAccountMetadata(metadata)) cleaned[id] = metadata;
  }
  return cleaned;
}

function saveAccountMetadata(rows) {
  writeJson(ACCOUNT_METADATA_FILE, rows && typeof rows === "object" && !Array.isArray(rows) ? rows : {});
}

function cleanEmail(value) {
  return cleanMetadataValue(value, 160).toLowerCase();
}

function cleanFormMetadataRow(row = {}) {
  return {
    nickname: cleanMetadataValue(row.nickname, 160),
    field1: cleanMetadataValue(row.field1),
    field2: cleanMetadataValue(row.field2),
    field3: cleanMetadataValue(row.field3),
    records: Array.isArray(row.records)
      ? row.records.map((record) => cleanAccountRecord(record, false)).filter(Boolean).slice(0, 50)
      : []
  };
}

function hasFormMetadataRow(row) {
  return Boolean(row.nickname || row.field1 || row.field2 || row.field3 || row.records && row.records.length);
}

function loadFormMetadata() {
  const rows = readJson(FORM_METADATA_FILE, {});
  if (!rows || typeof rows !== "object" || Array.isArray(rows)) return {};
  const cleaned = {};
  for (const [email, row] of Object.entries(rows)) {
    const key = cleanEmail(email);
    if (!key || !key.includes("@")) continue;
    const value = cleanFormMetadataRow(row);
    if (hasFormMetadataRow(value)) cleaned[key] = value;
  }
  return cleaned;
}

function saveFormMetadata(rows) {
  writeJson(FORM_METADATA_FILE, rows && typeof rows === "object" && !Array.isArray(rows) ? rows : {});
}

function normalizeAccountHandle(value) {
  const clean = String(value || "").trim().toLowerCase();
  return clean ? (clean.startsWith("@") ? clean : `@${clean}`) : "";
}

function loadAccountGmailRules() {
  const rows = readJson(ACCOUNT_GMAIL_RULES_FILE, {});
  const cleaned = { ...BUILTIN_ACCOUNT_GMAIL_RULES };
  if (!rows || typeof rows !== "object" || Array.isArray(rows)) return cleaned;
  for (const [handle, email] of Object.entries(rows)) {
    const key = normalizeAccountHandle(handle);
    const value = cleanMetadataValue(email, 160).toLowerCase();
    if (key && value) cleaned[key] = value;
  }
  return cleaned;
}

function cleanAdminCatalogAccount(row = {}) {
  const id = cleanMetadataValue(row.id, 64);
  if (!/^UC[A-Za-z0-9_-]{20,40}$/.test(id)) return null;
  return {
    id,
    handle: normalizeAccountHandle(row.handle),
    name: cleanMetadataValue(row.name || row.title || row.handle || id, 160),
    avatar: cleanMetadataValue(row.avatar || row.thumbnail || "", 500),
    connectedAt: cleanMetadataValue(row.connectedAt || "", 40),
    adminCatalog: true
  };
}

function loadAdminChannelCatalog() {
  const rows = readJson(ADMIN_CHANNEL_CATALOG_FILE, []);
  const saved = Array.isArray(rows) ? rows : [];
  return [...BUILTIN_ADMIN_CHANNELS, ...saved].map(cleanAdminCatalogAccount).filter(Boolean);
}

function adminAccountCatalog() {
  const catalog = loadAdminChannelCatalog();
  const byId = new Map(catalog.map((account) => [account.id, account]));
  for (const account of youtube.listAccounts()) {
    const existing = byId.get(account.id);
    byId.set(account.id, { ...(existing || {}), ...account, adminCatalog: Boolean(existing) });
  }
  return [...byId.values()];
}

function mappedAccountEmail(account, saved = {}, gmailRules = {}) {
  const handle = normalizeAccountHandle(account && account.handle);
  return cleanEmail(
    BUILTIN_ACCOUNT_GMAIL_RULES[handle] ||
    gmailRules[handle] ||
    saved.email ||
    account && account.email ||
    ""
  );
}

function accountsWithMetadata() {
  const metadata = loadAccountMetadata();
  const gmailRules = loadAccountGmailRules();
  const connectedIds = new Set(youtube.listAccounts().map((account) => account.id));
  return adminAccountCatalog().map((account) => {
    const saved = metadata[account.id] || {};
    return {
      ...account,
      connected: connectedIds.has(account.id) && !disconnectedAccountIds.has(account.id),
      metadata: {
        ...emptyAccountMetadata(),
        ...saved,
        email: mappedAccountEmail(account, saved, gmailRules)
      }
    };
  });
}

function connectedAccountsWithMetadata() {
  const metadata = loadAccountMetadata();
  const gmailRules = loadAccountGmailRules();
  return youtube.listAccounts().map((account) => {
    const saved = metadata[account.id] || {};
    return {
      ...account,
      metadata: {
        ...emptyAccountMetadata(),
        ...saved,
        email: mappedAccountEmail(account, saved, gmailRules)
      }
    };
  });
}

function formMetadataRows() {
  const saved = loadFormMetadata();
  const byEmail = new Map();
  for (const account of accountsWithMetadata()) {
    const email = cleanEmail(account.metadata && account.metadata.email);
    if (!email) continue;
    const item = byEmail.get(email) || { email, channels: 0, accounts: [], metadata: cleanFormMetadataRow(saved[email] || {}) };
    item.channels += 1;
    item.accounts.push({
      id: account.id,
      handle: normalizeAccountHandle(account.handle),
      name: cleanMetadataValue(account.name || account.handle || account.id, 160)
    });
    byEmail.set(email, item);
  }
  for (const [email, row] of Object.entries(saved)) {
    if (!byEmail.has(email)) byEmail.set(email, { email, channels: 0, accounts: [], metadata: cleanFormMetadataRow(row) });
  }
  return [...byEmail.values()].map((item) => {
    const selectedHandle = normalizeAccountHandle(item.metadata.field3 || item.metadata.nickname);
    const account = item.accounts.find((row) => row.handle === selectedHandle) || item.accounts[0] || null;
    return { email: item.email, channels: item.channels, account, metadata: item.metadata };
  }).sort((left, right) => left.email.localeCompare(right.email));
}

function accountsWithPublicMetadata() {
  const metadata = loadAccountMetadata();
  const gmailRules = loadAccountGmailRules();
  const oauthStatuses = loadOAuthConnectionStatuses();
  const connectedAccounts = youtube.listAccounts();
  const connectedById = new Map(connectedAccounts.map((account) => [account.id, account]));
  const byId = new Map();
  for (const account of adminAccountCatalog()) byId.set(account.id, account);
  for (const account of connectedAccounts) {
    if (!byId.has(account.id)) byId.set(account.id, { ...account, adminCatalog: false });
  }
  return [...byId.values()].map((account) => {
    const connected = connectedById.get(account.id);
    const disconnected = disconnectedAccountIds.has(account.id);
    const source = connected ? { ...account, ...connected } : account;
    const saved = metadata[account.id] || {};
    const oauthStatus = oauthStatuses[account.id] || {};
    return {
      ...source,
      connected: Boolean(connected) && !disconnected,
      connectionError: disconnected ? "Google login expired or was revoked. Reconnect this YouTube channel with Add." : "",
      oauth: {
        state: oauthStatus.state || (connected ? "unknown" : ""),
        lastCheckedAt: oauthStatus.lastCheckedAt || "",
        error: oauthStatus.error || "",
        refreshTokenIssuedAt: cleanIsoTimestamp(source.refreshTokenIssuedAt),
        refreshTokenExpiresAt: cleanIsoTimestamp(source.refreshTokenExpiresAt)
      },
      metadata: {
        email: mappedAccountEmail(source, saved, gmailRules),
        title: saved.title || ""
      }
    };
  });
}

function loadManualSavedAccounts() {
  const rows = readJson(MANUAL_ACCOUNTS_FILE, []);
  return Array.isArray(rows)
    ? [...new Set(rows.map(String).filter((id) => /^UC[A-Za-z0-9_-]{20,40}$/.test(id)))]
    : [];
}

function saveManualSavedAccounts(rows) {
  writeJson(MANUAL_ACCOUNTS_FILE, [...new Set(rows)].filter((id) => /^UC[A-Za-z0-9_-]{20,40}$/.test(id)));
}

function manualCatalog() {
  try {
    return youtube.listAccounts().map(({ id, handle, name, thumbnail }) => ({
      id: String(id || ""), handle: String(handle || ""), name: String(name || ""), thumbnail: String(thumbnail || "")
    }));
  } catch { return []; }
}

function normalizeHandle(value) {
  const clean = String(value || "").trim().toLowerCase();
  return clean && !clean.startsWith("@") ? `@${clean}` : clean;
}

function routeForAccount(routes, account) {
  const handle = normalizeHandle(account.handle);
  return routes.find((route) => account.id && (route.channelId === account.id || route.pageId === account.id))
    || routes.find((route) => handle && normalizeHandle(route.handle) === handle)
    || null;
}

function manualTargetChannel(value) {
  const match = /^vault_(UC[A-Za-z0-9_-]{20,40})$/.exec(String(value || ""));
  return match ? match[1] : "";
}

function manualRoutes() {
  try { return browserBridge.listRoutes(); } catch { return []; }
}

function savedManualRows(catalog, browserRows = []) {
  const byId = new Map(catalog.map((account) => [account.id, account]));
  const openIds = new Set(browserRows.map((account) => account.channelId).filter(Boolean));
  const routes = manualRoutes();
  return loadManualSavedAccounts()
    .filter((id) => byId.has(id) && !openIds.has(id))
    .map((id, index) => {
      const account = byId.get(id);
      const route = routeForAccount(routes, account);
      return {
        targetId: `vault_${id}`,
        source: "saved",
        windowId: 0,
        windowNumber: 0,
        tabNumber: index + 1,
        title: "Saved channel",
        url: "",
        videoId: browserBridge.status().videoId || "",
        loggedIn: Boolean(route),
        handle: account.handle,
        name: account.name,
        channelId: account.id,
        thumbnail: account.thumbnail,
        identitySource: "saved-account",
        liteState: "saved",
        ready: true,
        accountError: route ? "" : "Sync YouTube channels before first send"
      };
    });
}

function labeledManualAccounts(browserAccounts = browserBridge.listAccounts()) {
  const catalog = manualCatalog();
  const byId = new Map(catalog.map((account) => [account.id, account]));
  const labels = loadManualLabels();
  const browserRows = browserAccounts.map((account, index) => {
    const assignedId = String(labels[account.targetId] || "");
    const detected = byId.get(account.channelId) || null;
    const assigned = byId.get(assignedId) || null;
    const ordered = catalog[index] || null;
    const identity = detected || assigned || ordered;
    const identitySource = detected ? "detected" : assigned ? "saved" : ordered ? "order" : "";
    return identity ? { ...account, channelId: identity.id, handle: identity.handle, name: identity.name, thumbnail: identity.thumbnail, identitySource } : account;
  });
  return [...browserRows, ...savedManualRows(catalog, browserRows)];
}

function addActivity(type, text) {
  activity.unshift({ id: `${Date.now()}-${Math.random()}`, type, text: friendlyErrorMessage(text), at: new Date().toISOString() });
  if (activity.length > 100) activity.length = 100;
}

function addManualActivity(type, text) {
  manualActivity.unshift({ id: `${Date.now()}-${Math.random()}`, type, text: friendlyErrorMessage(text), at: new Date().toISOString() });
  if (manualActivity.length > 60) manualActivity.length = 60;
}

function cooldownError() {
  return `Wait ${SEND_COOLDOWN_SECONDS} seconds before another message from this account`;
}

async function verifyConnectedAccountTokens() {
  const rows = youtube.listAccounts();
  const invalid = [];
  const failed = [];
  const statuses = loadOAuthConnectionStatuses();
  const checkedAt = new Date().toISOString();
  let statusChanged = false;
  let index = 0;
  async function worker() {
    while (index < rows.length) {
      const account = rows[index];
      index += 1;
      try {
        await youtube.accessToken(account.id);
        disconnectedAccountIds.delete(account.id);
        statuses[account.id] = { state: "ready", lastCheckedAt: checkedAt, error: "" };
        statusChanged = true;
      } catch (error) {
        const code = String(error && error.code || "");
        if (code === "invalidGrant") {
          const wasNew = !disconnectedAccountIds.has(account.id);
          disconnectedAccountIds.add(account.id);
          invalid.push({ accountId: account.id, handle: accountName(account), error: error.message });
          statuses[account.id] = { state: "needsReconnect", lastCheckedAt: checkedAt, error: error.message };
          statusChanged = true;
          if (wasNew) addActivity("disconnected", `Disconnected: ${accountName(account)} - reconnect with Add`);
          continue;
        }
        failed.push({ accountId: account.id, handle: accountName(account), error: String(error && error.message || "Could not verify Google login") });
        statuses[account.id] = { state: "checkFailed", lastCheckedAt: checkedAt, error: String(error && error.message || "Could not verify Google login") };
        statusChanged = true;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(OAUTH_TOKEN_MONITOR_CONCURRENCY, rows.length) }, () => worker()));
  if (statusChanged) saveOAuthConnectionStatuses(statuses);
  return { checked: rows.length, invalid, failed };
}

async function runOAuthConnectionMonitor() {
  if (oauthMonitor.running) return { skipped: true, ...oauthAutomationSnapshot() };
  oauthMonitor.running = true;
  oauthMonitor.lastStartedAt = new Date().toISOString();
  oauthMonitor.lastError = "";
  try {
    const verification = await verifyConnectedAccountTokens();
    oauthMonitor.lastChecked = verification.checked;
    oauthMonitor.lastInvalid = verification.invalid.length;
    oauthMonitor.lastFailed = verification.failed.length;
    return verification;
  } catch (error) {
    oauthMonitor.lastError = String(error && error.message || "OAuth monitor failed");
    throw error;
  } finally {
    oauthMonitor.running = false;
    oauthMonitor.lastFinishedAt = new Date().toISOString();
  }
}

function startOAuthConnectionMonitor() {
  const run = () => {
    void runOAuthConnectionMonitor().catch(() => {});
  };
  const initial = setTimeout(() => {
    run();
    const interval = setInterval(run, OAUTH_TOKEN_MONITOR_INTERVAL_MS);
    interval.unref?.();
  }, OAUTH_TOKEN_MONITOR_INITIAL_DELAY_MS);
  initial.unref?.();
}

function headers(contentType = "application/json; charset=utf-8") {
  return {
    "content-type": contentType,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'self'; img-src 'self' https://yt3.ggpht.com https://yt3.googleusercontent.com https://i.ytimg.com https://*.ytimg.com data:; connect-src 'self'; frame-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'self'"
  };
}

function sameSecret(actual, expected) {
  const left = Buffer.from(String(actual || ""));
  const right = Buffer.from(String(expected || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function loopback(request) {
  const address = String(request.socket.remoteAddress || "");
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function authorized(request, response) {
  if (ORIGIN_SECRET && !loopback(request) && !sameSecret(request.headers["x-control-origin"], ORIGIN_SECRET)) {
    response.writeHead(403, headers("text/plain; charset=utf-8"));
    response.end("Forbidden");
    return false;
  }
  return true;
}

function sendJson(response, status, value) {
  response.writeHead(status, headers());
  response.end(JSON.stringify(sanitizeJson(value)));
}

function friendlyErrorMessage(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (
    /invalid\s+authentication\s+credentials/i.test(text)
    || /expected\s+oauth\s*2\s+access\s+token/i.test(text)
    || /login\s+cookie\s+or\s+other\s+valid\s+authentication\s+credential/i.test(text)
    || /request\s+had\s+invalid\s+authentication/i.test(text)
  ) {
    return "Google login expired. Saved channel connections were kept. Reconnect this channel with Add.";
  }
  return text;
}

function sanitizeJson(value) {
  if (typeof value === "string") return friendlyErrorMessage(value);
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sanitizeJson);
  const next = {};
  for (const [key, item] of Object.entries(value)) next[key] = sanitizeJson(item);
  return next;
}

function errorJson(error) {
  return { ok: false, error: friendlyErrorMessage(error && error.message || "Unexpected error"), code: String(error && error.code || "") };
}

function sendHtml(response, status, title, message, completion = null) {
  const safe = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const event = completion && typeof completion === "object"
    ? JSON.stringify(completion).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026")
    : "";
  const script = event
    ? `<script>if(window.opener){window.opener.postMessage(${event},window.location.origin);}</script>`
    : "";
  const document = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${safe(title)}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0c10;color:#edf1f7;font:16px/1.5 Segoe UI,sans-serif}.box{max-width:520px;padding:36px;border:1px solid #282f3a;border-radius:14px;background:#12161d}h1{margin:0 0 10px;font-size:24px}p{margin:0;color:#aab5c4}</style></head><body><main class="box"><h1>${safe(title)}</h1><p>${safe(friendlyErrorMessage(message))}</p></main>${script}</body></html>`;
  response.writeHead(status, { ...headers("text/html; charset=utf-8"), "content-security-policy": `default-src 'none'; style-src 'unsafe-inline';${event ? " script-src 'unsafe-inline';" : ""} frame-ancestors 'none'` });
  response.end(document);
}

function sendPublicPage(response, title, paragraphs) {
  const safe = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const body = paragraphs.map((paragraph) => `<p>${safe(paragraph)}</p>`).join("");
  const document = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${safe(title)}</title><style>body{margin:0;background:#0a0d12;color:#edf2f7;font:16px/1.6 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:760px;margin:0 auto;padding:56px 24px}h1{font-size:34px;line-height:1.1;margin:0 0 18px}p{margin:0 0 16px;color:#b7c2d0}a{color:#8eb1ff}</style></head><body><main class="wrap"><h1>${safe(title)}</h1>${body}</main></body></html>`;
  response.writeHead(200, { ...headers("text/html; charset=utf-8"), "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'" });
  response.end(document);
}

const PUBLIC_PAGES = {
  "/about": {
    title: "Account Control Center",
    paragraphs: [
      "Account Control Center is a web tool for connecting YouTube channels through Google OAuth and managing livestream chat actions selected by the channel owner.",
      "Choose the required workspace from the shared entry page before connecting any Google account. This public page exists so Google OAuth users can identify the app before granting access.",
      "Contact: kukaast95@gmail.com"
    ]
  },
  "/privacy": {
    title: "Privacy Policy",
    paragraphs: [
      "Account Control Center uses Google OAuth to connect YouTube channels that the user chooses to authorize.",
      "The app stores basic Google account metadata, YouTube channel metadata, and an encrypted OAuth refresh token so the selected channel can stay connected without repeated sign-in.",
      "Google user data is used only to identify the connected YouTube channel and perform YouTube actions requested inside the selected workspace. The app does not sell Google user data.",
      "Users can revoke access at any time from their Google Account security settings or reconnect/remove channels inside the dashboard.",
      "Contact: kukaast95@gmail.com"
    ]
  },
  "/terms": {
    title: "Terms of Service",
    paragraphs: [
      "Account Control Center is provided as a management tool. Users are responsible for actions they perform through connected Google and YouTube accounts.",
      "Users must only connect accounts and channels they own or are authorized to manage.",
      "Use of the tool must comply with Google, YouTube, and livestream community rules.",
      "Contact: kukaast95@gmail.com"
    ]
  }
};

async function body(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1000000) throw new Error("Request is too large");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function validateAccount(value) {
  const accountId = String(value || "");
  if (!/^UC[A-Za-z0-9_-]{20,40}$/.test(accountId)) throw new Error("Select exactly one connected YouTube channel");
  return accountId;
}

function validateAccountBatch(value) {
  const rows = Array.isArray(value) ? value : [];
  const accountIds = [];
  const seen = new Set();
  for (const row of rows) {
    const accountId = String(row || "");
    if (!/^UC[A-Za-z0-9_-]{20,40}$/.test(accountId)) throw new Error("Select connected YouTube channels");
    if (seen.has(accountId)) continue;
    seen.add(accountId);
    accountIds.push(accountId);
  }
  if (!accountIds.length) throw new Error("Select at least one connected YouTube channel");
  if (accountIds.length > 3) throw new Error("Send at most 3 channels at once");
  return accountIds;
}

function validateMessage(value) {
  const message = String(value || "").trim();
  if (!message) throw new Error("Message cannot be empty");
  if (message.length > 200) throw new Error("Message must be 200 characters or fewer");
  return message;
}

function validateTabTarget(value) {
  const targetId = String(value || "");
  if (!/^chrome_tab_\d{1,12}$/.test(targetId)) throw new Error("Select one available browser account");
  return targetId;
}

function validateManualTarget(value) {
  const targetId = String(value || "");
  if (/^chrome_tab_\d{1,12}$/.test(targetId)) return targetId;
  if (manualTargetChannel(targetId)) return targetId;
  throw new Error("Select one available browser account");
}

function videoIdFrom(value) {
  const input = String(value || "").trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;
  let url;
  try { url = new URL(input); } catch { throw new Error("Enter a valid YouTube livestream URL"); }
  if (!["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(url.hostname)) throw new Error("Enter a YouTube livestream URL");
  const videoId = url.hostname === "youtu.be" ? url.pathname.split("/").filter(Boolean)[0] : url.searchParams.get("v") || url.pathname.match(/^\/(?:live|shorts)\/([^/?]+)/)?.[1];
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId || "")) throw new Error("Could not find the YouTube video ID in this URL");
  return videoId;
}

function accountName(account) {
  return account.handle || account.name || account.id;
}

function quotaDay() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function emptyQuotaUsage(day = quotaDay()) {
  return {
    day,
    totals: { requests: 0, estimatedUnits: 0 },
    byAction: {},
    recent: []
  };
}

function loadQuotaUsage() {
  const usage = readJson(QUOTA_USAGE_FILE, null);
  return usage && usage.day === quotaDay() && usage.totals && usage.byAction ? usage : emptyQuotaUsage();
}

function saveQuotaUsage(usage) {
  writeJson(QUOTA_USAGE_FILE, usage);
}

function recordYoutubeQuota(action) {
  const cost = YOUTUBE_QUOTA_COSTS[action] || { method: action, units: 1, label: action };
  const usage = loadQuotaUsage();
  usage.totals.requests += 1;
  usage.totals.estimatedUnits += cost.units;
  if (!usage.byAction[action]) {
    usage.byAction[action] = {
      action,
      method: cost.method,
      label: cost.label,
      unitCost: cost.units,
      requests: 0,
      estimatedUnits: 0
    };
  }
  usage.byAction[action].requests += 1;
  usage.byAction[action].estimatedUnits += cost.units;
  usage.recent.unshift({ at: new Date().toISOString(), action, method: cost.method, units: cost.units });
  if (usage.recent.length > 50) usage.recent.length = 50;
  try { saveQuotaUsage(usage); } catch {}
}

function quotaSnapshot() {
  const usage = loadQuotaUsage();
  return {
    day: usage.day,
    totals: usage.totals,
    byAction: Object.values(usage.byAction).sort((a, b) => b.estimatedUnits - a.estimatedUnits || a.action.localeCompare(b.action)),
    recent: usage.recent
  };
}

function calendarNumber(value) {
  const text = String(value || "").trim().toUpperCase().replace(/[,%$€£]/g, "").replace(/\u2212/g, "-");
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const amount = Number(match[0]);
  if (!Number.isFinite(amount)) return null;
  const suffix = text.slice((match.index || 0) + match[0].length).trim().charAt(0);
  const multiplier = suffix === "K" ? 1_000 : suffix === "M" ? 1_000_000 : suffix === "B" ? 1_000_000_000 : suffix === "T" ? 1_000_000_000_000 : 1;
  return amount * multiplier;
}

function calendarCompare(left, right) {
  if (left == null || right == null) return 0;
  const scale = Math.max(Math.abs(left), Math.abs(right), 1);
  if (Math.abs(left - right) <= scale * 0.000001) return 0;
  return left > right ? 1 : -1;
}

function calendarMarket(country) {
  if (country === "CAD") return { symbol: "CAD", assets: "CAD futures, USD/CAD, Crude Oil" };
  if (country === "GBP") return { symbol: "GBP", assets: "GBP futures, GBP/USD, FTSE" };
  if (country === "EUR") return { symbol: "EUR", assets: "EUR futures, EUR/USD, Euro Stoxx" };
  return { symbol: "ES/NQ", assets: "ES, NQ, YM, USD, Treasury yields, Gold" };
}

function calendarDirection(symbol, comparison, higherIsPositive) {
  if (!comparison) return { direction: "mixed", label: `${symbol} \u2194` };
  const up = higherIsPositive ? comparison > 0 : comparison < 0;
  return { direction: up ? "up" : "down", label: `${symbol} ${up ? "\u2191" : "\u2193"}` };
}

function economicCalendarInsight(event) {
  const title = event.title.toLowerCase();
  const market = calendarMarket(event.country);
  const actual = calendarNumber(event.actual);
  const forecast = calendarNumber(event.forecast);
  const previous = calendarNumber(event.previous);
  const released = actual != null && forecast != null;
  const comparison = released ? calendarCompare(actual, forecast) : calendarCompare(forecast, previous);
  const values = released
    ? `Actual ${event.actual} vs forecast ${event.forecast}.`
    : event.forecast && event.previous
      ? `Forecast ${event.forecast} vs previous ${event.previous}.`
      : "No numeric consensus forecast is available.";
  const confidence = comparison && event.impact === "High" ? "Medium" : "Low";
  const response = (bias, summary, assets = market.assets) => ({
    ...bias,
    assets,
    confidence,
    summary: `${values} ${summary}`
  });

  if (/crude oil inventories|api weekly statistical bulletin/.test(title)) {
    return response(calendarDirection("Crude Oil", comparison, false), "Larger inventories usually pressure oil; a smaller draw or larger draw can support it.", "Crude Oil, energy stocks, CAD");
  }
  if (/natural gas storage/.test(title)) {
    return response(calendarDirection("Natural Gas", comparison, false), "More stored gas usually pressures NG; less supply than expected can support it.", "Natural Gas futures, energy stocks");
  }
  if (/cpi|ppi|inflation|price index|import prices/.test(title)) {
    const target = event.country === "USD" ? { symbol: "ES/NQ", positive: false } : { symbol: market.symbol, positive: true };
    return response(calendarDirection(target.symbol, comparison, target.positive), event.country === "USD"
      ? "Hotter inflation can lift yields and USD while pressuring ES/NQ; cooler inflation often does the reverse."
      : "Hotter inflation can strengthen the local currency through higher-rate expectations, while pressuring local equities.");
  }
  if (/unemployment claims|jobless claims|unemployment rate/.test(title)) {
    return response(calendarDirection(event.country === "USD" ? "ES/NQ" : market.symbol, comparison, event.country === "USD"), "Softer labor data can increase rate-cut expectations, but recession concerns can reverse the first move.");
  }
  if (/non-farm|payroll|employment change|adp employment/.test(title)) {
    return response(calendarDirection(event.country === "USD" ? "ES/NQ" : market.symbol, comparison, event.country !== "USD"), "Stronger hiring can lift the currency and yields; US equity futures may weaken if traders price fewer rate cuts.");
  }
  if (/interest rate|rate decision|cash rate|refinancing rate/.test(title)) {
    return response(calendarDirection(market.symbol, comparison, event.country !== "USD"), "A more hawkish rate path usually supports the currency and yields while weighing on equity futures.");
  }
  if (/fomc|fed chairman|fed chair|beige book|monetary policy|president .* speaks|gov .* speaks|member .* speaks|central bank|economic summit/.test(title)) {
    return response({ direction: "mixed", label: "Volatility \u2194" }, "No dependable numeric direction exists before the remarks. Hawkish language can lift yields and pressure equities; dovish language can do the reverse.");
  }
  if (/gdp|retail sales|industrial production|manufacturing|services|pmi|business confidence|consumer confidence|home sales|housing starts|building permits|leading index/.test(title)) {
    return response(calendarDirection(event.country === "USD" ? "ES/NQ" : market.symbol, comparison, true), "A stronger growth reading can support risk assets and the local currency, although a large upside surprise may also lift yields.");
  }
  if (/trade balance|foreign securities|tic long-term/.test(title)) {
    return response(calendarDirection(market.symbol, comparison, true), "A stronger external balance or capital inflow can support the local currency; the equity effect is usually smaller.");
  }
  return response({ direction: "mixed", label: "Market \u2194" }, "This release has no stable one-direction relationship. Watch the difference between Actual and Forecast and the first move in yields and USD.");
}

function cleanEconomicCalendarEvent(row = {}) {
  const title = cleanMetadataValue(row.title, 140);
  const country = cleanMetadataValue(row.country, 8).toUpperCase();
  const date = new Date(row.date);
  if (!title || !ECONOMIC_CALENDAR_COUNTRIES.has(country) || Number.isNaN(date.getTime())) return null;
  const impact = ["High", "Medium", "Low", "Holiday"].includes(row.impact) ? row.impact : "Low";
  const event = {
    id: crypto.createHash("sha1").update(`${country}|${date.toISOString()}|${title}`).digest("hex").slice(0, 16),
    title,
    country,
    date: date.toISOString(),
    impact,
    actual: cleanMetadataValue(row.actual, 40),
    forecast: cleanMetadataValue(row.forecast, 40),
    previous: cleanMetadataValue(row.previous, 40)
  };
  event.insight = economicCalendarInsight(event);
  return event;
}

async function economicCalendar(force = false) {
  const now = Date.now();
  if (!force && economicCalendarCache.events.length && economicCalendarCache.expiresAt > now) {
    return { ...economicCalendarCache, stale: false };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(ECONOMIC_CALENDAR_URL, {
      signal: controller.signal,
      headers: { accept: "application/json", "user-agent": "Account-Control-Center/1.0" }
    });
    if (!response.ok) throw new Error(`Calendar source returned ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error("Calendar source returned invalid data");
    const events = payload.map(cleanEconomicCalendarEvent).filter(Boolean).sort((left, right) => left.date.localeCompare(right.date));
    const fetchedAt = new Date().toISOString();
    economicCalendarCache = { expiresAt: now + ECONOMIC_CALENDAR_CACHE_MS, fetchedAt, events };
    return { ...economicCalendarCache, stale: false };
  } catch (error) {
    if (economicCalendarCache.events.length) return { ...economicCalendarCache, stale: true, error: error.message };
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function loadStreamCache() {
  const rows = readJson(STREAM_CACHE_FILE, {});
  return rows && typeof rows === "object" && !Array.isArray(rows) ? rows : {};
}

function saveStreamCache(rows) {
  writeJson(STREAM_CACHE_FILE, rows);
}

function streamCacheEntry(videoId) {
  const rows = loadStreamCache();
  const entry = rows[videoId];
  if (!entry || typeof entry !== "object") return null;
  if (!/^[A-Za-z0-9_-]{11}$/.test(String(entry.videoId || videoId))) return null;
  if (!entry.liveChatId) return null;
  return {
    videoId,
    liveChatId: String(entry.liveChatId),
    title: String(entry.title || "YouTube livestream"),
    channelTitle: String(entry.channelTitle || "YouTube"),
    thumbnail: String(entry.thumbnail || ""),
    concurrentViewers: Number(entry.concurrentViewers || 0),
    actualStartTime: String(entry.actualStartTime || ""),
    cachedAt: String(entry.cachedAt || "")
  };
}

function rememberStream(stream) {
  if (!stream || !stream.videoId || !stream.liveChatId) return;
  const rows = loadStreamCache();
  rows[stream.videoId] = {
    videoId: stream.videoId,
    liveChatId: stream.liveChatId,
    title: stream.title || "YouTube livestream",
    channelTitle: stream.channelTitle || "YouTube",
    thumbnail: stream.thumbnail || "",
    concurrentViewers: Number(stream.concurrentViewers || 0),
    actualStartTime: stream.actualStartTime || "",
    cachedAt: new Date().toISOString()
  };
  try { saveStreamCache(rows); } catch {}
}

function publicStream(stream, cached = false) {
  return {
    videoId: stream.videoId,
    title: stream.title,
    channelTitle: stream.channelTitle,
    thumbnail: stream.thumbnail,
    concurrentViewers: stream.concurrentViewers,
    actualStartTime: stream.actualStartTime,
    cached
  };
}

async function sendNowMessage(accountId, videoId, message, streamEntry = null) {
  const account = youtube.listAccounts().find((item) => item.id === accountId);
  if (!account) throw new Error("Selected YouTube channel is no longer connected");
  if (sendingAccounts.has(accountId)) throw new Error("This account is already sending");
  const previous = sentAt.get(accountId) || 0;
  if (Date.now() - previous < SEND_COOLDOWN_MS) throw new Error(cooldownError());
  sendingAccounts.add(accountId);
  try {
    const knownLiveChatId = streamEntry && streamEntry.liveChatId || "";
    const result = await youtube.sendMessage(accountId, videoId, message, knownLiveChatId);
    rememberStream({ ...(streamEntry || { videoId }), videoId, liveChatId: result.liveChatId });
    sentAt.set(accountId, Date.now());
    staged.delete(accountId);
    appendOwnStreamMessage(videoId, account, message, result.messageId);
    addActivity("sent", `Sent from ${accountName(account)}`);
    return {
      ok: true,
      accountId,
      handle: accountName(account),
      avatar: account.avatar || "",
      messageId: result.messageId
    };
  } catch (error) {
    const label = accountName(account);
    const code = String(error && error.code || "");
    const message = String(error && error.message || "YouTube did not accept the message");
    const labeledMessage = message.startsWith(`${label}: `) ? message : `${label}: ${message}`;
    error.message = labeledMessage;
    if (code === "invalidGrant") {
      disconnectedAccountIds.add(accountId);
      updateOAuthConnectionStatus(accountId, {
        state: "needsReconnect",
        lastCheckedAt: new Date().toISOString(),
        error: message
      });
    }
    addActivity(
      code === "invalidGrant" ? "disconnected" : "failed",
      code === "invalidGrant" ? `Disconnected: ${label} - reconnect with Add` : `Failed: ${labeledMessage}`
    );
    throw error;
  } finally {
    sendingAccounts.delete(accountId);
  }
}

function startLocalChatSession(stream, accountId) {
  return {
    ...stream,
    readerAccountId: accountId,
    openedAt: Date.now(),
    messages: [],
    messageIds: new Set(),
    sequence: 0,
    offlineAt: "",
    streamError: null,
    controller: null,
    ownOnly: true
  };
}

function appendOwnStreamMessage(videoId, account, text, messageId) {
  const stream = streams.get(videoId);
  if (!stream) return;
  const id = String(messageId || `local-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  if (stream.messageIds.has(id)) return;
  stream.messageIds.add(id);
  stream.sequence += 1;
  stream.messages.push({
    id,
    sequence: stream.sequence,
    type: "textMessageEvent",
    text,
    publishedAt: new Date().toISOString(),
    outgoing: true,
    author: {
      channelId: account.id || "",
      name: accountName(account),
      avatar: account.avatar || account.thumbnail || "",
      owner: false,
      moderator: false,
      sponsor: false,
      verified: false
    }
  });
  if (stream.messages.length > 500) stream.messages.splice(0, stream.messages.length - 500);
}

function addFormWatcherEvent(type, text, data = {}) {
  formWatcher.sequence += 1;
  const event = {
    id: `form-watch-${formWatcher.sequence}`,
    sequence: formWatcher.sequence,
    type,
    text: cleanMetadataValue(text, 1000),
    at: new Date().toISOString(),
    data
  };
  formWatcher.events.push(event);
  if (formWatcher.events.length > 300) formWatcher.events.splice(0, formWatcher.events.length - 300);
  return event;
}

function publicFormWatcher(cursor = 0) {
  return {
    status: formWatcher.status,
    running: formWatcher.running,
    streamUrl: formWatcher.streamUrl,
    videoId: formWatcher.videoId,
    formUrl: formWatcher.formUrl,
    startedAt: formWatcher.startedAt,
    whisperStatus: formWatcher.whisperStatus,
    whisperError: formWatcher.whisperError,
    nextCursor: formWatcher.sequence,
    events: formWatcher.events.filter((event) => event.sequence > cursor)
  };
}

function stopFormWatcher(reason = "Stopped") {
  const wasRunning = formWatcher.running;
  try { formWatcher.controller && formWatcher.controller.stop(); } catch {}
  stopStreamscribeMonitor().catch(() => {});
  formWatcher.controller = null;
  formWatcher.running = false;
  formWatcher.whisperStatus = "idle";
  if (wasRunning) {
    formWatcher.status = "stopped";
    addFormWatcherEvent("stopped", reason);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function streamscribePython() {
  const venvPython = process.platform === "win32"
    ? path.join(STREAMSCRIBE_DIR, ".venv", "Scripts", "python.exe")
    : path.join(STREAMSCRIBE_DIR, ".venv", "bin", "python");
  if (fs.existsSync(venvPython)) return venvPython;
  return process.env.STREAMSCRIBE_PYTHON || "python3";
}

async function streamscribeFetch(pathname, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${STREAMSCRIBE_URL}${pathname}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { detail: text }; }
    if (!response.ok) throw new Error(data.detail || data.error || `StreamScribe HTTP ${response.status}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function rememberStreamscribeOutput(chunk) {
  streamscribeLog = cleanMetadataValue(`${streamscribeLog}\n${chunk}`, 4000);
}

async function ensureStreamscribe() {
  try {
    await streamscribeFetch("/api/state", {}, 1200);
    return;
  } catch {}

  if (streamscribeChild && !streamscribeChild.killed) {
    // Process is still booting.
  } else {
    const appFile = path.join(STREAMSCRIBE_DIR, "app.py");
    if (!fs.existsSync(appFile)) throw new Error("StreamScribe source is missing");
    streamscribeLog = "";
    streamscribeChild = childProcess.spawn(streamscribePython(), ["app.py"], {
      cwd: STREAMSCRIBE_DIR,
      env: {
        ...process.env,
        STREAMSCRIBE_PORT: String(STREAMSCRIBE_PORT),
        STREAMSCRIBE_OPEN_BROWSER: "false",
        STREAMSCRIBE_INSTANCE_ID: "account-control",
        TRIGGER_WORDS: STREAMSCRIBE_TRIGGERS.join(","),
        TRIGGER_COOLDOWN_SECONDS: process.env.STREAMSCRIBE_TRIGGER_COOLDOWN_SECONDS || "20",
        ENABLE_FORM_LINK_MONITOR: "false",
        ENABLE_LIKE_MONITOR: "false"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    streamscribeChild.stdout.on("data", (chunk) => rememberStreamscribeOutput(chunk));
    streamscribeChild.stderr.on("data", (chunk) => rememberStreamscribeOutput(chunk));
    streamscribeChild.on("exit", (code, signal) => {
      rememberStreamscribeOutput(`StreamScribe exited ${code == null ? signal : code}`);
      streamscribeChild = null;
    });
    streamscribeChild.unref();
  }

  for (let attempt = 0; attempt < 40; attempt += 1) {
    await sleep(250);
    try {
      await streamscribeFetch("/api/state", {}, 1200);
      return;
    } catch {}
  }
  const detail = streamscribeLog ? `: ${streamscribeLog.split("\n").slice(-4).join(" ")}` : "";
  throw new Error(`StreamScribe did not start${detail}`);
}

async function startStreamscribeMonitor(streamUrl) {
  await ensureStreamscribe();
  await streamscribeFetch("/api/url/stop", { method: "POST", body: "{}" }, 3000).catch(() => {});
  await streamscribeFetch("/api/session/clear", { method: "POST", body: "{}" }, 3000).catch(() => {});
  await streamscribeFetch("/api/settings", {
    method: "POST",
    body: JSON.stringify({
      trigger_words: STREAMSCRIBE_TRIGGERS,
      cooldown_seconds: Number(process.env.STREAMSCRIBE_TRIGGER_COOLDOWN_SECONDS || 20),
      language: process.env.STREAMSCRIBE_WHISPER_LANGUAGE || "en",
      model: process.env.STREAMSCRIBE_WHISPER_MODEL || "base.en"
    })
  }, 5000).catch(() => {});
  await streamscribeFetch("/api/url/start", {
    method: "POST",
    body: JSON.stringify({ url: streamUrl })
  }, 8000);
}

async function stopStreamscribeMonitor() {
  await streamscribeFetch("/api/url/stop", { method: "POST", body: "{}" }, 3000).catch(() => {});
}

function transcriptClock(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(value / 60);
  return `${String(minutes).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function whisperContext(entries, entry) {
  const index = entries.findIndex((item) => item.id === entry.id);
  const context = entries.slice(Math.max(0, index - 3), index + 1);
  return context
    .map((item) => `${transcriptClock(item.seconds)} ${cleanMetadataValue(item.text, 220)}`)
    .join("\n");
}

async function pollStreamscribeTriggers(controller) {
  const seen = new Set();
  const cooldown = new Map();
  while (!controller.stopped) {
    try {
      const state = await streamscribeFetch("/api/state", {}, 5000);
      formWatcher.whisperStatus = state.status || "listening";
      formWatcher.whisperError = cleanMetadataValue(state.error || "", 240);
      const entries = Array.isArray(state.entries) ? state.entries : [];
      for (const entry of entries) {
        const key = `${entry.id}:${entry.created_at || ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const signal = formWatcherSignalFromText(entry.text);
        if (!signal) continue;
        const lastAt = cooldown.get(signal.type) || 0;
        if (Date.now() - lastAt < 20_000) continue;
        cooldown.set(signal.type, Date.now());
        const context = whisperContext(entries, entry);
        addFormWatcherEvent(
          signal.type,
          `Whisper trigger "${signal.word || signal.type}" at ${transcriptClock(entry.seconds)}\n${context}`,
          { source: "whisper", entry }
        );
      }
    } catch (error) {
      const message = cleanMetadataValue(error.message || error, 240);
      if (message !== formWatcher.whisperError) {
        formWatcher.whisperError = message;
        addFormWatcherEvent("error", `Whisper monitor error: ${message}`);
      }
    }
    await sleep(1500);
  }
}

function startWhisperWatcher(streamUrl, controller) {
  formWatcher.whisperStatus = "starting";
  formWatcher.whisperError = "";
  (async () => {
    try {
      await startStreamscribeMonitor(streamUrl);
      if (controller.stopped) return;
      formWatcher.whisperStatus = "listening";
      addFormWatcherEvent("armed", "Whisper transcription armed: giveaway + keyword.");
      await pollStreamscribeTriggers(controller);
    } catch (error) {
      formWatcher.whisperStatus = "error";
      formWatcher.whisperError = cleanMetadataValue(error.message || error, 240);
      addFormWatcherEvent("error", `Whisper monitor unavailable: ${formWatcher.whisperError}`);
    }
  })();
}

function normalizeGoogleFormUrl(value) {
  let text = String(value || "").trim().replace(/&amp;/g, "&").replace(/[.,);\]>"']+$/, "");
  if (!text) return "";
  if (!/^https?:\/\//i.test(text)) text = `https://${text}`;
  let parsed;
  try { parsed = new URL(text); } catch { return ""; }
  if (["youtube.com", "www.youtube.com"].includes(parsed.hostname) && parsed.pathname === "/redirect") {
    return normalizeGoogleFormUrl(parsed.searchParams.get("q") || "");
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "forms.gle" && parsed.pathname.length > 1) return parsed.toString();
  if (host === "docs.google.com" && parsed.pathname.toLowerCase().startsWith("/forms/")) return parsed.toString();
  return "";
}

function formLinksFromText(value) {
  const pattern = /(?:https?:\/\/)?(?:docs\.google\.com\/forms\/[^\s<>"']+|forms\.gle\/[A-Za-z0-9_-]+(?:\?[^\s<>"']*)?)/gi;
  return [...new Set([...String(value || "").matchAll(pattern)].map((match) => normalizeGoogleFormUrl(match[0])).filter(Boolean))];
}

function formWatcherSignalFromText(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const keyword = text.match(/\b(keywords?|key\s*words?|code|codes|secret\s*words?|pass\s*words?)\b|ключев\w*\s+слов\w*|\bкод\b/i);
  if (keyword) {
    return { type: "keyword", label: "Keyword mentioned", word: keyword[0] };
  }
  const giveaway = text.match(/\b(giveaways?|give\s*away|giv|give|raffle|draw)\b|\bгив\b|розыгрыш/i);
  if (giveaway) {
    return { type: "giveaway", label: "Giveaway mentioned", word: giveaway[0] };
  }
  return null;
}

async function resolveGoogleFormUrl(url, redirects = 0, method = "HEAD") {
  if (redirects > 5) throw new Error("Google Form link redirected too many times");
  const parsed = new URL(url);
  if (parsed.hostname === "docs.google.com") return parsed.toString();
  const response = await fetch(parsed.toString(), { method, redirect: "manual", headers: { "user-agent": "Mozilla/5.0" } });
  if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
    return resolveGoogleFormUrl(new URL(response.headers.get("location"), parsed).toString(), redirects + 1, "HEAD");
  }
  if (method === "HEAD") return resolveGoogleFormUrl(url, redirects, "GET");
  throw new Error(`Could not resolve Google Form short link: HTTP ${response.status}`);
}

function formWatcherRowsFromMetadata() {
  const rows = [];
  const skipped = [];
  const seenUsernames = new Set();
  const seenEmails = new Set();
  const addRow = (source, values = {}) => {
    const email = cleanEmail(values.email);
    const username = normalizeAccountHandle(values.username);
    const label = cleanMetadataValue(source || username || email || "row", 180);
    const missing = [];
    if (!email) missing.push("email");
    if (!username) missing.push("username");
    if (missing.length) {
      skipped.push({ label, missing });
      return;
    }
    if (seenUsernames.has(username) || seenEmails.has(email)) return;
    seenUsernames.add(username);
    seenEmails.add(email);
    rows.push({ email, username });
  };

  for (const account of connectedAccountsWithMetadata()) {
    addRow(account.handle || account.name || account.id, {
      email: account.metadata && account.metadata.email || account.email,
      username: account.handle
    });
  }

  for (const item of formMetadataRows()) {
    const metadata = item.metadata || {};
    const baseEmail = metadata.field2 || item.email;
    const baseUsername = metadata.field3 || metadata.nickname;
    const records = Array.isArray(metadata.records) ? metadata.records : [];
    if (records.length) {
      for (const record of records) {
        addRow(record.field3 || metadata.nickname || item.email, {
          email: record.field2 || baseEmail,
          username: record.field3 || baseUsername
        });
      }
    } else {
      addRow(metadata.nickname || item.email, {
        email: baseEmail,
        username: baseUsername
      });
    }
  }
  return { rows, skipped };
}

async function generateFormWatcherComments(rows) {
  const previous = [];
  const generated = [];
  const config = { ...DEFAULT_CONFIG, aiMaxChars: 220 };
  for (const row of rows) {
    const profile = {
      accountId: row.username,
      email: row.email,
      handle: row.username,
      channelName: row.username,
      field1: row.email,
      field3: row.username,
      profileDir: row.username,
      name: row.username
    };
    const comment = await generateAiValue(profile, config, previous);
    previous.push(comment);
    generated.push({ ...row, comment });
  }
  return generated;
}

async function runFormWatcher({ streamUrl, accountId = "" }) {
  stopFormWatcher("Restarted");
  formWatcher.events = [];
  formWatcher.sequence = 0;
  formWatcher.streamUrl = String(streamUrl || "").trim();
  formWatcher.formUrl = "";
  formWatcher.startedAt = new Date().toISOString();
  formWatcher.status = "starting";
  formWatcher.running = true;

  const accounts = youtube.listAccounts();
  const reader = accounts.find((account) => account.id === accountId) || accounts[0];
  if (!reader) throw new Error("Connect at least one Google account before starting Form Scanner");
  const { rows, skipped } = formWatcherRowsFromMetadata();
  if (!rows.length) throw new Error("Add form rows in Rows first: email and YouTube username");
  const videoId = videoIdFrom(formWatcher.streamUrl);
  formWatcher.videoId = videoId;
  const controller = { stopped: false, stop() { this.stopped = true; } };
  formWatcher.controller = controller;

  addFormWatcherEvent("armed", `Waiting for Google Form link on ${videoId}. Rows ready: ${rows.length}. Skipped incomplete: ${skipped.length}.`);
  startWhisperWatcher(formWatcher.streamUrl, controller);

  (async () => {
    try {
      let stream = streamCacheEntry(videoId);
      if (!stream) {
        stream = await youtube.openLiveStream(reader.id, videoId);
        rememberStream(stream);
      }
      formWatcher.status = "armed";
      const armedAt = Date.now() - 5000;
      let pageToken = "";
      const seen = new Set();
      const signalSeen = new Set();
      const signalCooldown = new Map();
      while (!controller.stopped) {
        const batch = await youtube.listLiveChat(reader.id, stream.liveChatId, pageToken);
        pageToken = batch.nextPageToken || pageToken;
        for (const message of batch.messages || []) {
          if (message.id && seen.has(message.id)) continue;
          if (message.id) seen.add(message.id);
          const published = Date.parse(message.publishedAt || "");
          if (Number.isFinite(published) && published < armedAt) continue;
          const signal = formWatcherSignalFromText(message.text);
          if (signal) {
            const normalizedSignal = `${signal.type}:${String(message.text || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 180)}`;
            const lastSignalAt = signalCooldown.get(signal.type) || 0;
            if (!signalSeen.has(normalizedSignal) && Date.now() - lastSignalAt > 20_000) {
              signalSeen.add(normalizedSignal);
              signalCooldown.set(signal.type, Date.now());
              addFormWatcherEvent(signal.type, `${signal.label} from ${message.author && message.author.name || "YouTube"}: ${message.text}`, { message });
            }
          }
          const links = formLinksFromText(message.text);
          if (!links.length) continue;
          formWatcher.status = "submitting";
          const formUrl = await resolveGoogleFormUrl(links[0]);
          formWatcher.formUrl = formUrl;
          addFormWatcherEvent("detected", `Detected form from ${message.author && message.author.name || "YouTube"}: ${formUrl}`);
          addFormWatcherEvent("generating", `Generating ${rows.length} unique MFF comments.`);
          const rowsWithComments = await generateFormWatcherComments(rows);
          const result = await submitGoogleFormRows({
            formUrl,
            concurrency: 8,
            fields: [
              { key: "email", label: "Email" },
              { key: "comment", label: "what you think about mff" },
              { key: "username", label: "Your unique username on Youtube" }
            ],
            rows: rowsWithComments
          });
          for (const row of result.results) {
            const prefix = row.ok ? "Filled" : "Failed";
            addFormWatcherEvent(row.ok ? "filled" : "failed", `${prefix} ${row.row.username} (${row.row.email}) — ${row.row.comment}`, row);
          }
          formWatcher.status = result.failed ? "failed" : "complete";
          formWatcher.running = false;
          formWatcher.controller = null;
          controller.stopped = true;
          stopStreamscribeMonitor().catch(() => {});
          addFormWatcherEvent(result.failed ? "failed" : "complete", `Form Scanner done: ${result.ok}/${result.total} confirmed.`);
          return;
        }
        if (seen.size > 5000) seen.clear();
        if (batch.offlineAt) throw new Error("Livestream ended before a form link was detected");
        await sleep(Math.max(1000, Number(batch.pollingIntervalMillis || 5000)));
      }
    } catch (error) {
      if (!controller.stopped) {
        formWatcher.status = "error";
        formWatcher.running = false;
        formWatcher.controller = null;
        controller.stopped = true;
        stopStreamscribeMonitor().catch(() => {});
        addFormWatcherEvent("error", error.message);
      }
    }
  })();

  return publicFormWatcher();
}

function stopChatSession(session) {
  try { session && session.controller && session.controller.stop(); } catch {}
}

async function manualApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/manual/accounts") {
    let browserAccounts = [];
    let bridgeOnline = true;
    let bridgeError = "";
    try {
      browserAccounts = browserBridge.listAccounts();
    } catch (error) {
      bridgeOnline = false;
      bridgeError = String(error && error.message || error);
    }
    try {
      const accounts = labeledManualAccounts(browserAccounts);
      sendJson(response, 200, {
        ok: true,
        bridgeOnline,
        bridgeError,
        accounts,
        savedAccountIds: loadManualSavedAccounts(),
        catalog: manualCatalog(),
        routes: manualRoutes(),
        chat: browserBridge.listChat(),
        chatDebug: browserBridge.chatStatus(),
        lite: browserBridge.status(),
        activity: manualActivity
      });
    } catch (error) {
      sendJson(response, 503, { ...errorJson(error), bridgeOnline, bridgeError, accounts: [], lite: browserBridge.status(), activity: manualActivity });
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/manual/accounts/add") {
    try {
      const payload = await body(request);
      const channelId = validateAccount(payload.channelId);
      if (!manualCatalog().some((account) => account.id === channelId)) throw new Error("Choose a saved connected channel");
      const saved = loadManualSavedAccounts();
      if (!saved.includes(channelId)) saved.push(channelId);
      saveManualSavedAccounts(saved);
      addManualActivity("account", "Saved manual account added");
      sendJson(response, 200, { ok: true, savedAccountIds: saved });
    } catch (error) {
      sendJson(response, 400, errorJson(error));
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/manual/accounts/add-all") {
    try {
      const saved = manualCatalog().map((account) => account.id).filter(Boolean);
      saveManualSavedAccounts(saved);
      addManualActivity("account", `Saved ${saved.length} manual accounts`);
      sendJson(response, 200, { ok: true, savedAccountIds: saved });
    } catch (error) {
      sendJson(response, 400, errorJson(error));
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/manual/accounts/remove") {
    try {
      const payload = await body(request);
      const channelId = validateAccount(payload.channelId);
      const saved = loadManualSavedAccounts().filter((id) => id !== channelId);
      saveManualSavedAccounts(saved);
      addManualActivity("account", "Saved manual account removed");
      sendJson(response, 200, { ok: true, savedAccountIds: saved });
    } catch (error) {
      sendJson(response, 400, errorJson(error));
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/manual/routes/sync") {
    try {
      const result = await browserBridge.syncRoutes();
      addManualActivity("vault", `Synced ${result.total || 0} YouTube channel routes`);
      sendJson(response, 200, { ok: true, ...result });
    } catch (error) {
      sendJson(response, 400, errorJson(error));
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/manual/vault/start") {
    try {
      const payload = await body(request);
      const videoId = videoIdFrom(payload.streamUrl || payload.videoId);
      const result = await browserBridge.useVaultStream(videoId);
      addManualActivity("vault", `Saved-account stream set to ${videoId}`);
      sendJson(response, 200, { ok: true, videoId, ...result });
    } catch (error) {
      sendJson(response, 400, errorJson(error));
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/manual/label") {
    try {
      const payload = await body(request);
      const targetId = validateTabTarget(payload.targetId);
      const channelId = payload.channelId ? validateAccount(payload.channelId) : "";
      if (!browserBridge.listAccounts().some((account) => account.targetId === targetId)) throw new Error("Browser account is no longer available");
      if (channelId && !manualCatalog().some((account) => account.id === channelId)) throw new Error("Choose a connected channel");
      const labels = loadManualLabels();
      if (channelId) labels[targetId] = channelId;
      else delete labels[targetId];
      saveManualLabels(labels);
      sendJson(response, 200, { ok: true });
    } catch (error) {
      sendJson(response, 400, errorJson(error));
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/manual/lite/start") {
    try {
      const payload = await body(request);
      const videoId = videoIdFrom(payload.streamUrl || payload.videoId);
      const result = await browserBridge.startLite(videoId);
      addManualActivity("lite", `Lite Mode started for ${videoId}`);
      sendJson(response, 200, { ok: true, videoId, ...result });
    } catch (error) {
      sendJson(response, 400, errorJson(error));
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/manual/lite/stop") {
    try {
      const result = await browserBridge.stopLite();
      addManualActivity("lite", "Lite Mode stopped");
      sendJson(response, 200, { ok: true, ...result });
    } catch (error) {
      sendJson(response, 400, errorJson(error));
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/manual/vault/build") {
    try {
      const result = await browserBridge.buildVault();
      addManualActivity("vault", `Session Vault captured ${result.uniqueRoutes || 0} unique channel routes`);
      sendJson(response, 200, { ok: true, ...result });
    } catch (error) {
      sendJson(response, 400, errorJson(error));
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/manual/vault/test") {
    try {
      const payload = await body(request);
      const targetId = validateTabTarget(payload.targetId);
      const result = await browserBridge.testVault(targetId);
      sendJson(response, 200, { ok: true, ...result });
    } catch (error) {
      sendJson(response, 400, errorJson(error));
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/manual/routes/debug") {
    try {
      const payload = await body(request);
      const targetId = validateTabTarget(payload.targetId);
      const result = await browserBridge.debugRoutes(targetId);
      sendJson(response, 200, { ok: true, ...result });
    } catch (error) {
      sendJson(response, 400, errorJson(error));
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/manual/prepare") {
    try {
      const payload = await body(request);
      const targetId = validateManualTarget(payload.targetId);
      const vaultChannelId = manualTargetChannel(targetId);
      if (vaultChannelId) {
        const videoId = videoIdFrom(payload.streamUrl || payload.videoId);
        if (!browserBridge.status().enabled || browserBridge.status().videoId !== videoId) await browserBridge.useVaultStream(videoId);
      }
      const account = labeledManualAccounts().find((item) => item.targetId === targetId);
      if (!account) throw new Error("Selected browser tab is no longer available");
      if (!account.channelId) throw new Error("Assign the correct username before preparing this account");
      const result = await browserBridge.prepare(targetId, account.channelId, account.handle);
      sendJson(response, 200, { ok: true, ...result });
    } catch (error) {
      sendJson(response, 400, errorJson(error));
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/manual/send") {
    try {
      const payload = await body(request);
      const targetId = validateManualTarget(payload.targetId);
      const vaultChannelId = manualTargetChannel(targetId);
      if (vaultChannelId) {
        const videoId = videoIdFrom(payload.streamUrl || payload.videoId);
        if (!browserBridge.status().enabled || browserBridge.status().videoId !== videoId) await browserBridge.useVaultStream(videoId);
      }
      const message = validateMessage(payload.message);
      if (payload.confirmed !== true) throw new Error("Explicit send confirmation is required");
      const account = labeledManualAccounts().find((item) => item.targetId === targetId);
      if (!account) throw new Error("Selected browser tab is no longer available");
      if (!vaultChannelId && !account.loggedIn && account.liteState === "full") throw new Error("Selected browser tab is signed out");
      const previous = manualSentAt.get(targetId) || 0;
      if (Date.now() - previous < SEND_COOLDOWN_MS) throw new Error(cooldownError());
      if (!account.channelId) throw new Error("Assign the correct username before sending");
      const prepared = await browserBridge.stage(targetId, message, account.channelId, account.handle);
      if (prepared.channelId && prepared.channelId !== account.channelId) throw new Error("Selected account identity did not match; message was not sent");
      await browserBridge.sendStaged(targetId, account.channelId);
      manualSentAt.set(targetId, Date.now());
      const name = account.handle || account.name || `Window ${account.windowNumber}`;
      addManualActivity("sent", `Sent manually from ${name}`);
      sendJson(response, 200, { ok: true, targetId, handle: name });
    } catch (error) {
      sendJson(response, 400, errorJson(error));
    }
    return true;
  }
  return false;
}

async function agent(request, response, url) {
  if (request.method === "POST" && url.pathname === "/agent/snapshot") {
    try {
      browserBridge.updateSnapshot(await body(request));
      sendJson(response, 200, { ok: true });
    } catch (error) {
      sendJson(response, 400, errorJson(error));
    }
    return true;
  }
  if (request.method === "GET" && url.pathname === "/agent/commands") {
    const commands = url.searchParams.get("wait") === "1"
      ? await browserBridge.waitCommands()
      : browserBridge.takeCommands();
    sendJson(response, 200, { ok: true, commands });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/agent/result") {
    try {
      sendJson(response, 200, { ok: browserBridge.complete(await body(request)) });
    } catch (error) {
      sendJson(response, 400, errorJson(error));
    }
    return true;
  }
  return false;
}

function londonFormsConfig() {
  const config = readJson(LONDON_FORMS_CONFIG, {});
  const targets = Array.isArray(config.targets) ? config.targets : [];
  return {
    fieldLabel: cleanMetadataValue(config.fieldLabel || "", 120),
    radioLabel: cleanMetadataValue(config.radioLabel || "", 120),
    youtubeUrl: cleanMetadataValue(config.youtubeUrl || "", 500),
    chatAuthors: Array.isArray(config.chatAuthors) ? config.chatAuthors.map((value) => cleanMetadataValue(value, 120)).filter(Boolean) : [],
    targetCount: targets.filter((target) => normalizeAccountHandle(target && target.youtubeUsername)).length
  };
}

function londonFormsStatus() {
  return {
    available: fs.existsSync(LONDON_FORMS_SCRIPT) && fs.existsSync(LONDON_FORMS_SUBMIT_SCRIPT) && fs.existsSync(LONDON_FORMS_CONFIG),
    ...londonFormsConfig()
  };
}

function londonStreamUrl(value) {
  const streamUrl = String(value || "").replace(/\\_/g, "_").trim();
  videoIdFrom(streamUrl);
  return streamUrl;
}

function londonFormsOutputSummary(output) {
  const lines = String(output || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const results = lines.map((line) => {
    const match = line.match(/^(OK|FAIL)\s+(@\S+)\s+HTTP\s+(\d+)/i);
    if (!match) return null;
    return { ok: match[1].toUpperCase() === "OK", username: match[2], status: Number(match[3]) || 0, line };
  }).filter(Boolean);
  const done = lines.join("\n").match(/Done:\s+(\d+)\/(\d+)\s+confirmed/i);
  const underFive = lines.join("\n").match(/Confirmed under 5 seconds:\s+(\d+)\/(\d+)/i);
  const formLine = [...lines].reverse().find((line) => line.startsWith("FIRST LINK: "));
  const detectedLine = [...lines].reverse().find((line) => line.startsWith("DETECTED: "));
  return {
    lines,
    results,
    detected: Boolean(detectedLine || formLine),
    detectedText: detectedLine || "",
    formUrl: formLine ? formLine.replace(/^FIRST LINK:\s*/, "") : "",
    confirmed: done ? Number(done[1]) : results.filter((result) => result.ok).length,
    total: done ? Number(done[2]) : results.length,
    underFive: underFive ? Number(underFive[1]) : 0
  };
}

function runLondonFormsHelper(streamUrl) {
  if (!fs.existsSync(LONDON_FORMS_SCRIPT)) throw new Error("London Forms helper is missing");
  if (!fs.existsSync(LONDON_FORMS_SUBMIT_SCRIPT)) throw new Error("London Forms submitter is missing");
  if (!fs.existsSync(LONDON_FORMS_CONFIG)) throw new Error("London Forms nicknames.json is missing");
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(process.execPath, [LONDON_FORMS_SCRIPT, streamUrl, "--include-recent"], {
      cwd: LONDON_FORMS_DIR,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    let settled = false;
    const append = (chunk) => {
      output += String(chunk || "");
      if (output.length > 60_000) output = output.slice(-60_000);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      const summary = londonFormsOutputSummary(output);
      reject(Object.assign(new Error("London Forms timed out"), { summary }));
    }, LONDON_FORMS_TIMEOUT_MS);
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const summary = londonFormsOutputSummary(output);
      resolve({
        ok: code === 0,
        code,
        streamUrl,
        videoId: videoIdFrom(streamUrl),
        ...summary
      });
    });
  });
}

async function londonFormsApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/london-forms/status") {
    try {
      sendJson(response, 200, { ok: true, ...londonFormsStatus() });
    } catch (error) {
      sendJson(response, 503, errorJson(error));
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/london-forms/run") {
    try {
      const payload = await body(request);
      const streamUrl = londonStreamUrl(payload && payload.streamUrl);
      const result = await runLondonFormsHelper(streamUrl);
      sendJson(response, result.ok ? 200 : 400, result);
    } catch (error) {
      const details = error.summary || {};
      sendJson(response, 400, { ...errorJson(error), ...details });
    }
    return true;
  }

  return false;
}

async function localFormApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/local-form/status") {
    try {
      sendJson(response, 200, { ok: true, ...localForms.status() });
    } catch (error) {
      sendJson(response, 503, errorJson(error));
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/local-form/config") {
    try {
      const payload = await body(request);
      const config = localForms.saveConfig(payload && payload.config || payload);
      sendJson(response, 200, { ok: true, config, ...localForms.status() });
    } catch (error) {
      sendJson(response, 400, errorJson(error));
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/local-form/preview") {
    try {
      const payload = await body(request);
      const result = await localForms.preview(payload && payload.profileDirs);
      sendJson(response, 200, { ok: true, ...result });
    } catch (error) {
      sendJson(response, 400, errorJson(error));
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/local-form/run") {
    try {
      const payload = await body(request);
      if (!payload || payload.confirmed !== true) throw new Error("Explicit confirmation is required before opening Chrome profiles");
      const result = await localForms.run(payload.previewId, payload.profileDirs);
      sendJson(response, result.opened ? 200 : 400, { ok: Boolean(result.opened), ...result });
    } catch (error) {
      sendJson(response, 400, errorJson(error));
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/local-form/direct-submit") {
    try {
      const payload = await body(request);
      if (!payload || payload.confirmed !== true) throw new Error("Explicit confirmation is required before submitting Google Form rows");
      const result = await submitGoogleFormRows(payload);
      sendJson(response, result.failed ? 400 : 200, { ok: result.failed === 0, ...result });
    } catch (error) {
      sendJson(response, 400, errorJson(error));
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/local-form/close") {
    try {
      sendJson(response, 200, { ok: true, ...localForms.closeAll() });
    } catch (error) {
      sendJson(response, 400, errorJson(error));
    }
    return true;
  }
  return false;
}

async function api(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/economic-calendar") {
    try {
      const calendar = await economicCalendar(url.searchParams.get("refresh") === "1");
      marketNewsTracker.syncEvents(calendar.events);
      sendJson(response, 200, {
        ok: true,
        source: "Forex Factory weekly export",
        sourceUrl: "https://www.forexfactory.com/calendar",
        fetchedAt: calendar.fetchedAt,
        stale: calendar.stale,
        timeZone: "Asia/Almaty",
        timeZoneLabel: "Astana",
        market: marketNewsTracker.status(),
        events: marketNewsTracker.addReactions(calendar.events)
      });
    } catch (error) {
      sendJson(response, 503, errorJson(error));
    }
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/market-reactions") {
    try {
      const eventId = cleanMetadataValue(url.searchParams.get("eventId"), 80);
      if (!/^[a-f0-9]{16}$/.test(eventId)) throw new Error("Valid eventId is required");
      sendJson(response, 200, {
        ok: true,
        eventId,
        market: marketNewsTracker.status(),
        reactions: marketNewsTracker.reactionsForEvent(eventId)
      });
    } catch (error) {
      sendJson(response, 400, errorJson(error));
    }
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/form-watcher/status") {
    try {
      const cursor = Number(url.searchParams.get("cursor") || 0);
      sendJson(response, 200, { ok: true, ...publicFormWatcher(Number.isFinite(cursor) ? cursor : 0) });
    } catch (error) {
      sendJson(response, 503, errorJson(error));
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/form-watcher/start") {
    try {
      const payload = await body(request);
      if (!payload || payload.confirmed !== true) throw new Error("Explicit confirmation is required before watching live chat for form links");
      const result = await runFormWatcher({
        streamUrl: payload.streamUrl,
        accountId: payload.accountId
      });
      sendJson(response, 200, { ok: true, ...result });
    } catch (error) {
      formWatcher.status = "error";
      formWatcher.running = false;
      addFormWatcherEvent("error", error.message);
      sendJson(response, 400, errorJson(error));
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/form-watcher/stop") {
    try {
      stopFormWatcher("Stopped by user");
      sendJson(response, 200, { ok: true, ...publicFormWatcher() });
    } catch (error) {
      sendJson(response, 400, errorJson(error));
    }
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/accounts") {
    try {
      const accounts = accountsWithPublicMetadata();
      sendJson(response, 200, {
        ok: true,
        configured: youtube.configured(),
        accounts,
        activity,
        quota: quotaSnapshot(),
        oauthAutomation: oauthAutomationSnapshot()
      });
    } catch (error) {
      sendJson(response, 503, {
        ok: false,
        configured: youtube.configured(),
        error: error.message,
        accounts: [],
        activity,
        oauthAutomation: oauthAutomationSnapshot()
      });
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/accounts/verify") {
    try {
      const verification = await runOAuthConnectionMonitor();
      const accounts = accountsWithPublicMetadata();
      sendJson(response, 200, {
        ok: true,
        configured: youtube.configured(),
        accounts,
        activity,
        quota: quotaSnapshot(),
        oauthAutomation: oauthAutomationSnapshot(),
        ...verification
      });
    } catch (error) {
      sendJson(response, 503, {
        ...errorJson(error),
        configured: youtube.configured(),
        accounts: accountsWithPublicMetadata(),
        activity,
        quota: quotaSnapshot(),
        oauthAutomation: oauthAutomationSnapshot()
      });
    }
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/identity/accounts") {
    try {
      sendJson(response, 200, { ok: true, configured: youtube.configured(), accounts: connectedAccountsWithMetadata() });
    } catch (error) {
      sendJson(response, 503, errorJson(error));
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/identity/accounts") {
    try {
      const payload = await body(request);
      const incoming = payload && payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata)
        ? payload.metadata
        : {};
      const allowed = new Set(youtube.listAccounts().map((account) => account.id));
      const next = { ...loadAccountMetadata() };
      for (const id of allowed) {
        if (!Object.prototype.hasOwnProperty.call(incoming, id)) continue;
        const metadata = cleanAccountMetadata(incoming[id] || {});
        if (hasAccountMetadata(metadata)) next[id] = metadata;
        else delete next[id];
      }
      saveAccountMetadata(next);
      sendJson(response, 200, { ok: true, configured: youtube.configured(), accounts: connectedAccountsWithMetadata(), metadata: next });
    } catch (error) {
      sendJson(response, 400, errorJson(error));
    }
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/admin/account-metadata") {
    try {
      sendJson(response, 200, { ok: true, accounts: accountsWithMetadata(), formRows: formMetadataRows(), metadata: loadAccountMetadata() });
    } catch (error) {
      sendJson(response, 503, errorJson(error));
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/account-metadata") {
    try {
      const payload = await body(request);
      const incoming = payload && payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata)
        ? payload.metadata
        : {};
      const allowed = new Set(adminAccountCatalog().map((account) => account.id));
      const next = {};
      for (const id of allowed) {
        const metadata = cleanAccountMetadata(incoming[id] || {});
        if (hasAccountMetadata(metadata)) next[id] = metadata;
      }
      saveAccountMetadata(next);
      sendJson(response, 200, { ok: true, accounts: accountsWithMetadata(), formRows: formMetadataRows(), metadata: next });
    } catch (error) {
      sendJson(response, 400, errorJson(error));
    }
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/admin/form-metadata") {
    try {
      sendJson(response, 200, { ok: true, rows: formMetadataRows(), metadata: loadFormMetadata() });
    } catch (error) {
      sendJson(response, 503, errorJson(error));
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/form-metadata") {
    try {
      const payload = await body(request);
      const incoming = payload && payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata)
        ? payload.metadata
        : {};
      const allowed = new Set(formMetadataRows().map((row) => row.email));
      for (const email of Object.keys(incoming)) {
        const clean = cleanEmail(email);
        if (clean && clean.includes("@")) allowed.add(clean);
      }
      const next = {};
      for (const email of allowed) {
        const row = cleanFormMetadataRow(incoming[email] || {});
        if (hasFormMetadataRow(row)) next[email] = row;
      }
      saveFormMetadata(next);
      sendJson(response, 200, { ok: true, rows: formMetadataRows(), metadata: next });
    } catch (error) {
      sendJson(response, 400, errorJson(error));
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/oauth/import") {
    try {
      const imported = youtube.importClient(await body(request));
      addActivity("configured", "Google OAuth client configured");
      sendJson(response, 200, { ok: true, ...imported });
    } catch (error) {
      sendJson(response, 400, errorJson(error));
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/stage") {
    try {
      const payload = await body(request);
      const accountId = validateAccount(payload.accountId);
      const message = validateMessage(payload.message);
      const streamUrl = String(payload.streamUrl || "").trim();
      const videoId = videoIdFrom(streamUrl);
      const account = youtube.listAccounts().find((item) => item.id === accountId);
      if (!account) throw new Error("Selected YouTube channel is no longer connected");
      staged.set(accountId, { message, streamUrl, videoId, at: Date.now(), handle: accountName(account) });
      addActivity("staged", `Prepared for ${accountName(account)}`);
      sendJson(response, 200, { ok: true, accountId, handle: accountName(account), message, streamUrl });
    } catch (error) {
      sendJson(response, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/stream/open") {
    try {
      const payload = await body(request);
      const accountId = validateAccount(payload.accountId);
      const streamUrl = String(payload.streamUrl || "").trim();
      const videoId = videoIdFrom(streamUrl);
      const account = youtube.listAccounts().find((item) => item.id === accountId);
      if (!account) throw new Error("Choose a connected channel to open this livestream");
      let cached = true;
      let stream = streamCacheEntry(videoId);
      if (!stream) {
        cached = false;
        stream = await youtube.openLiveStream(accountId, videoId);
        rememberStream(stream);
      }
      stopChatSession(streams.get(videoId));
      streams.set(videoId, startLocalChatSession(stream, accountId));
      for (const [key, item] of streams) {
        if (Date.now() - item.openedAt <= 12 * 60 * 60 * 1000) continue;
        stopChatSession(item);
        streams.delete(key);
      }
      addActivity("stream", `${cached ? "Connected cached live chat" : "Opened live chat"}: ${stream.title}`);
      sendJson(response, 200, {
        ok: true,
        readMode: "own-only",
        cached,
        quota: quotaSnapshot(),
        stream: publicStream(stream, cached)
      });
    } catch (error) {
      sendJson(response, 400, errorJson(error));
    }
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/live-chat") {
    try {
      const videoId = String(url.searchParams.get("videoId") || "");
      if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error("Open a livestream first");
      const stream = streams.get(videoId);
      if (!stream) throw new Error("Livestream session expired; load the link again");
      const pageToken = String(url.searchParams.get("pageToken") || "");
      if (!/^\d*$/.test(pageToken) || pageToken.length > 16) throw new Error("Invalid live-chat cursor");
      const cursor = Number(pageToken || 0);
      const messages = stream.messages
        .filter((message) => message.sequence > cursor)
        .map(({ sequence, ...message }) => message);
      sendJson(response, 200, {
        ok: true,
        messages,
        nextPageToken: String(stream.sequence),
        pollingIntervalMillis: 10000,
        offlineAt: stream.offlineAt,
        streamError: stream.streamError
      });
    } catch (error) {
      sendJson(response, 400, errorJson(error));
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/send") {
    try {
      const payload = await body(request);
      const accountId = validateAccount(payload.accountId);
      const message = validateMessage(payload.message);
      const streamUrl = String(payload.streamUrl || "").trim();
      if (payload.confirmed !== true) throw new Error("Explicit send confirmation is required");
      const prepared = staged.get(accountId);
      if (!prepared || prepared.message !== message || prepared.streamUrl !== streamUrl) throw new Error("Prepare this exact account, livestream, and message before sending");
      if (Date.now() - prepared.at > 120000) throw new Error("Prepared message expired; review it again");
      const previous = sentAt.get(accountId) || 0;
      if (Date.now() - previous < SEND_COOLDOWN_MS) throw new Error(cooldownError());
      const stream = streams.get(prepared.videoId);
      const account = youtube.listAccounts().find((item) => item.id === accountId) || { id: accountId, handle: prepared.handle };
      const result = await youtube.sendMessage(accountId, prepared.videoId, message, stream && stream.liveChatId || streamCacheEntry(prepared.videoId)?.liveChatId || "");
      rememberStream({ ...(stream || streamCacheEntry(prepared.videoId) || { videoId: prepared.videoId }), liveChatId: result.liveChatId });
      sentAt.set(accountId, Date.now());
      staged.delete(accountId);
      appendOwnStreamMessage(prepared.videoId, account, message, result.messageId);
      addActivity("sent", `Sent from ${prepared.handle}`);
      sendJson(response, 200, { ok: true, messageId: result.messageId, quota: quotaSnapshot() });
    } catch (error) {
      sendJson(response, 400, errorJson(error));
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/send-now") {
    try {
      const payload = await body(request);
      const accountId = validateAccount(payload.accountId);
      const message = validateMessage(payload.message);
      const streamUrl = String(payload.streamUrl || "").trim();
      if (payload.confirmed !== true) throw new Error("Explicit send confirmation is required");
      const videoId = videoIdFrom(streamUrl);
      const stream = streams.get(videoId) || streamCacheEntry(videoId);
      const result = await sendNowMessage(accountId, videoId, message, stream);
      sendJson(response, 200, { ok: true, ...result, quota: quotaSnapshot() });
    } catch (error) {
      sendJson(response, 400, errorJson(error));
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/send-batch") {
    try {
      const payload = await body(request);
      const accountIds = validateAccountBatch(payload.accountIds);
      const message = validateMessage(payload.message);
      const streamUrl = String(payload.streamUrl || "").trim();
      if (payload.confirmed !== true) throw new Error("Explicit send confirmation is required");
      const videoId = videoIdFrom(streamUrl);
      const stream = streams.get(videoId) || streamCacheEntry(videoId);
      const results = await Promise.all(accountIds.map(async (accountId) => {
        try {
          return await sendNowMessage(accountId, videoId, message, stream);
        } catch (error) {
          const account = youtube.listAccounts().find((item) => item.id === accountId);
          return {
            ok: false,
            accountId,
            handle: account ? accountName(account) : "",
            error: String(error && error.message || "YouTube did not accept the message"),
            code: String(error && error.code || "")
          };
        }
      }));
      const sent = results.filter((result) => result.ok);
      const payloadResponse = {
        ok: Boolean(sent.length),
        sent: sent.length,
        failed: results.length - sent.length,
        results,
        quota: quotaSnapshot()
      };
      if (!sent.length) {
        sendJson(response, 400, { ...payloadResponse, error: results[0] && results[0].error || "YouTube did not accept the messages" });
      } else {
        sendJson(response, 200, payloadResponse);
      }
    } catch (error) {
      sendJson(response, 400, errorJson(error));
    }
    return true;
  }
  return false;
}

const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".mp3": "audio/mpeg" };

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${HOST}:${PORT}`);
  try {
    const localFormRequest = url.pathname === "/local-form" || url.pathname.startsWith("/local-form/") || url.pathname.startsWith("/api/local-form/");
    const londonFormsRequest = url.pathname.startsWith("/api/london-forms/");
    if ((localFormRequest || londonFormsRequest) && !loopback(request)) {
      response.writeHead(403, headers("text/plain; charset=utf-8")).end("Local automation is available only from this computer");
      return;
    }
    if (url.pathname.startsWith("/agent/") && loopback(request)) {
      if (!await agent(request, response, url)) sendJson(response, 404, { ok: false, error: "Not found" });
      return;
    }
    if (request.method === "GET" && PUBLIC_PAGES[url.pathname]) {
      const page = PUBLIC_PAGES[url.pathname];
      sendPublicPage(response, page.title, page.paragraphs);
      return;
    }
    if (!authorized(request, response)) return;
    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, {
        ok: true,
        configured: youtube.configured(),
        accounts: youtube.listAccounts().length,
        quota: quotaSnapshot().totals,
        oauthAutomation: oauthAutomationSnapshot(),
        market: marketNewsTracker.status()
      });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/quota-usage") {
      sendJson(response, 200, { ok: true, quota: quotaSnapshot() });
      return;
    }
    if (request.method === "GET" && url.pathname === "/oauth/start") {
      const requestedAccountId = String(url.searchParams.get("accountId") || "").trim();
      const completionMode = url.searchParams.get("migration") === "1" ? "migration" : "";
      let target = null;
      if (requestedAccountId) {
        const account = accountsWithPublicMetadata().find((item) => item.id === requestedAccountId);
        if (!account) throw new Error("Selected channel is no longer available. Refresh and try again.");
        const email = cleanEmail(account.metadata && account.metadata.email || account.email);
        if (!email) throw new Error("This channel has no Gmail mapping. Add the Gmail in Admin first.");
        target = { accountId: account.id, email, label: accountName(account) };
      }
      const destination = youtube.beginAuthorization({ target, completionMode });
      response.writeHead(302, { location: destination, "cache-control": "no-store", "referrer-policy": "no-referrer" });
      response.end();
      return;
    }
    if (request.method === "GET" && url.pathname === "/oauth/callback") {
      try {
        const account = await youtube.finishAuthorization(url.searchParams);
        disconnectedAccountIds.delete(account.id);
        updateOAuthConnectionStatus(account.id, { state: "ready", lastCheckedAt: new Date().toISOString(), error: "" });
        addActivity("connected", `Connected ${accountName(account)}`);
        const migration = account.authorizationCompletionMode === "migration";
        sendHtml(
          response,
          200,
          "Channel connected",
          migration ? `${accountName(account)} is ready. Opening the next queued channel.` : `${accountName(account)} is ready. Close this tab and return to Account Control.`,
          migration ? { type: "oauth-migration-result", status: "connected", accountId: account.id, handle: accountName(account) } : null
        );
      } catch (error) {
        const migration = error && error.authorizationCompletionMode === "migration";
        sendHtml(
          response,
          400,
          "Connection failed",
          error.message,
          migration ? {
            type: "oauth-migration-result",
            status: "failed",
            accountId: String(error.authorizationTargetAccountId || ""),
            message: friendlyErrorMessage(error.message)
          } : null
        );
      }
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      const handled = url.pathname.startsWith("/api/manual/")
        ? await manualApi(request, response, url)
        : url.pathname.startsWith("/api/local-form/")
          ? await localFormApi(request, response, url)
          : url.pathname.startsWith("/api/london-forms/")
            ? await londonFormsApi(request, response, url)
            : await api(request, response, url);
      if (!handled) sendJson(response, 404, { ok: false, error: "Not found" });
      return;
    }
    const manual = url.pathname === "/manual" || url.pathname.startsWith("/manual/");
    const localForm = url.pathname === "/local-form" || url.pathname.startsWith("/local-form/");
    const accountsPage = url.pathname === "/accounts" || url.pathname.startsWith("/accounts/");
    const live = url.pathname === "/live" || url.pathname.startsWith("/live/");
    const portal = url.pathname === "/choose" || url.pathname.startsWith("/choose/");
    const directory = portal ? PORTAL_DIR : manual ? MANUAL_DIR : localForm ? LOCAL_FORM_DIR : accountsPage ? ACCOUNTS_DIR : PUBLIC_DIR;
    const requested = portal
      ? (url.pathname === "/choose" || url.pathname === "/choose/" ? "index.html" : url.pathname.replace(/^\/choose\//, ""))
      : manual
      ? (url.pathname === "/manual" || url.pathname === "/manual/" ? "index.html" : url.pathname.replace(/^\/manual\//, ""))
      : localForm
        ? (url.pathname === "/local-form" || url.pathname === "/local-form/" ? "index.html" : url.pathname.replace(/^\/local-form\//, ""))
        : accountsPage
          ? (url.pathname === "/accounts" || url.pathname === "/accounts/" ? "index.html" : url.pathname.replace(/^\/accounts\//, ""))
          : live
            ? (url.pathname === "/live" || url.pathname === "/live/" ? "live.html" : url.pathname.replace(/^\/live\//, ""))
            : (url.pathname === "/" ? "index.html" : url.pathname.replace(/^\//, ""));
    const file = path.resolve(directory, requested);
    const relative = path.relative(directory, file);
    if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404, headers("text/plain; charset=utf-8")).end("Not found");
      return;
    }
    response.writeHead(200, headers(types[path.extname(file)] || "application/octet-stream"));
    fs.createReadStream(file).pipe(response);
  } catch (error) {
    sendJson(response, 500, errorJson(error));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Account Control Center API mode: http://${HOST}:${PORT}`);
  startOAuthConnectionMonitor();
});

marketNewsTracker.start(async () => (await economicCalendar()).events);
