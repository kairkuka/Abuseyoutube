const elements = {
  connection: document.querySelector("#connection"),
  count: document.querySelector("#account-count"),
  list: document.querySelector("#account-list"),
  search: document.querySelector("#search"),
  refresh: document.querySelector("#refresh"),
  oauthMissing: document.querySelector("#oauth-missing"),
  oauthReady: document.querySelector("#oauth-ready"),
  oauthFile: document.querySelector("#oauth-file"),
  addAccount: document.querySelector("#add-account"),
  reconnectModal: document.querySelector("#reconnect-modal"),
  reconnectClose: document.querySelector("#reconnect-close"),
  reconnectStatus: document.querySelector("#reconnect-status"),
  reconnectGmails: document.querySelector("#reconnect-gmails"),
  reconnectChannels: document.querySelector("#reconnect-channels"),
  reconnectNew: document.querySelector("#reconnect-new"),
  reconnectSkip: document.querySelector("#reconnect-skip"),
  reconnectBatch: document.querySelector("#reconnect-batch"),
  reconnectContinue: document.querySelector("#reconnect-continue"),
  previousAccount: document.querySelector("#previous-account"),
  nextAccount: document.querySelector("#next-account"),
  selectedHandle: document.querySelector("#selected-handle"),
  selectedMeta: document.querySelector("#selected-meta"),
  empty: document.querySelector("#empty-selection"),
  composer: document.querySelector("#composer"),
  streamForm: document.querySelector("#stream-form"),
  streamUrl: document.querySelector("#stream-url"),
  openStream: document.querySelector("#open-stream"),
  subscribeForm: document.querySelector("#subscribe-form"),
  subscribeUrl: document.querySelector("#subscribe-url"),
  openSubscribe: document.querySelector("#open-subscribe"),
  subscribeChecklist: document.querySelector("#subscribe-checklist"),
  subscribeRows: document.querySelector("#subscribe-rows"),
  subscribeProgress: document.querySelector("#subscribe-progress"),
  subscribeReset: document.querySelector("#subscribe-reset"),
  streamSummary: document.querySelector("#stream-summary"),
  streamThumbnail: document.querySelector("#stream-thumbnail"),
  streamTitle: document.querySelector("#stream-title"),
  streamChannel: document.querySelector("#stream-channel"),
  viewerCount: document.querySelector("#viewer-count"),
  chatFeed: document.querySelector("#chat-feed"),
  chatEmpty: document.querySelector("#chat-empty"),
  chatState: document.querySelector("#chat-state"),
  jumpLatest: document.querySelector("#jump-latest"),
  starterWord: document.querySelector("#starter-word"),
  message: document.querySelector("#message"),
  characterCount: document.querySelector("#character-count"),
  clear: document.querySelector("#clear"),
  sendSize: [...document.querySelectorAll("input[name='send-size']")],
  sendModeNote: document.querySelector("#send-mode-note"),
  stage: document.querySelector("#stage"),
  notice: document.querySelector("#notice"),
  quotaDay: document.querySelector("#quota-day"),
  quotaTotal: document.querySelector("#quota-total"),
  economicCalendarSummary: document.querySelector("#economic-calendar-summary"),
  economicCalendarStatus: document.querySelector("#economic-calendar-status"),
  economicCalendarRefresh: document.querySelector("#economic-calendar-refresh"),
  economicCalendarList: document.querySelector("#economic-calendar-list"),
  economicCalendarPanel: document.querySelector(".market-calendar"),
  activity: document.querySelector("#activity-list"),
  adminOpen: document.querySelector("#admin-open"),
  adminModal: document.querySelector("#admin-modal"),
  adminClose: document.querySelector("#admin-close"),
  adminRefresh: document.querySelector("#admin-refresh"),
  adminSave: document.querySelector("#admin-save"),
  adminSearch: document.querySelector("#admin-search"),
  adminViewButtons: [...document.querySelectorAll("[data-admin-view]")],
  adminSingleList: document.querySelector("#admin-single-list"),
  adminRows: document.querySelector("#admin-rows"),
  adminStatus: document.querySelector("#admin-status"),
  mffOpen: document.querySelector("#mff-open"),
  mffModal: document.querySelector("#mff-modal"),
  mffClose: document.querySelector("#mff-close"),
  mffSearch: document.querySelector("#mff-search"),
  mffSingleList: document.querySelector("#mff-single-list"),
  mffRows: document.querySelector("#mff-rows"),
  mffStatus: document.querySelector("#mff-status"),
  formWatchOpen: document.querySelector("#form-watch-open"),
  formWatchModal: document.querySelector("#form-watch-modal"),
  formWatchClose: document.querySelector("#form-watch-close"),
  formWatchForm: document.querySelector("#form-watch-form"),
  formWatchUrl: document.querySelector("#form-watch-url"),
  formWatchStart: document.querySelector("#form-watch-start"),
  formWatchStop: document.querySelector("#form-watch-stop"),
  formWatchStatus: document.querySelector("#form-watch-status"),
  londonFormsOpen: document.querySelector("#london-forms-open"),
  londonFormsModal: document.querySelector("#london-forms-modal"),
  londonFormsClose: document.querySelector("#london-forms-close"),
  londonFormsForm: document.querySelector("#london-forms-form"),
  londonFormsUrl: document.querySelector("#london-forms-url"),
  londonFormsSubmit: document.querySelector("#london-forms-submit"),
  londonFormsStatus: document.querySelector("#london-forms-status"),
  londonFormsOutput: document.querySelector("#london-forms-output"),
  notificationsOpen: document.querySelector("#notifications-open"),
  notificationsBadge: document.querySelector("#notifications-badge"),
  notificationsModal: document.querySelector("#notifications-modal"),
  notificationsClose: document.querySelector("#notifications-close"),
  notificationsClear: document.querySelector("#notifications-clear"),
  notificationsSound: document.querySelector("#notifications-sound"),
  notificationsVolume: document.querySelector("#notifications-volume"),
  notificationsVolumeValue: document.querySelector("#notifications-volume-value"),
  notificationsStatus: document.querySelector("#notifications-status"),
  notificationsList: document.querySelector("#notifications-list")
};

let accounts = [];
let selected = null;
let configured = false;
let loadingAccounts = false;
let reconnectEmail = "";
let reconnectAccountId = "";
let oauthMigration = null;
let oauthMigrationPopup = null;
let activeStream = null;
let nextPageToken = "";
let chatTimer = null;
let chatGeneration = 0;
let loadingChat = false;
let accountRenderKey = "";
let activityRenderKey = "";
let accountRefreshTimer = null;
let searchFrame = null;
let chatScrollFrame = null;
let adminSearchFrame = null;
let chatNodeCount = 0;
let activityItems = [];
let adminAccounts = [];
let adminSingleItems = [];
let adminLoading = false;
let adminAutosaveTimer = null;
let mffItems = [];
let mffLoading = false;
let mffSearchFrame = null;
let mffAutosaveTimer = null;
let formWatchCursor = 0;
let formWatchTimer = null;
let notificationItems = [];
let notificationUnread = 0;
let notificationAudio = null;
let notificationSoundUnlocked = false;
let accountVerifyTimer = null;
let lastAccountVerifyAt = 0;
let economicCalendarTimer = null;
let economicCalendarEvents = [];
const adminEditingRecords = new Set();
const mffEditingRecords = new Set();
const accountRows = new Map();
const chatMessageIds = new Set();
const notificationIds = new Set();
const disconnectedAccountIds = new Set();
const STARTER_WORD_KEY = "account-control-starter-word";
const STARTER_PHRASE_LIMIT = 80;
const SEND_BATCH_SIZE_KEY = "account-control-send-batch-size";
const SUBSCRIBE_CHANNEL_KEY = "account-control-subscribe-channel";
const SUBSCRIBE_STATUS_PREFIX = "account-control-subscribe-status:";
const ADMIN_VIEW_KEY = "account-control-admin-view";
const NOTIFICATION_SOUND_KEY = "account-control-notification-sound";
const NOTIFICATION_VOLUME_KEY = "account-control-notification-volume";
const NOTIFICATION_SOUND_SRC = "/notification-sound.mp3?v=1";
const OAUTH_MIGRATION_STORAGE_KEY = "account-control-oauth-migration-v1";

oauthMigration = loadOauthMigration();
const LONDON_FORMS_URL_KEY = "account-control-london-forms-url";
const LONDON_FORMS_LOCAL = ["127.0.0.1", "localhost", "::1"].includes(window.location.hostname);
const ASTANA_TIME_ZONE = "Asia/Almaty";
const ASTANA_OFFSET_MS = 5 * 60 * 60 * 1000;
const OAUTH_TEST_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const OAUTH_EXPIRY_WARNING_MS = 24 * 60 * 60 * 1000;
let oauthAutomation = { publishingStatus: "testing" };
let adminViewMode = localStorage.getItem(ADMIN_VIEW_KEY) === "2" ? "2" : "1";
let notificationSoundEnabled = localStorage.getItem(NOTIFICATION_SOUND_KEY) !== "off";
let notificationSoundVolume = readNotificationVolume();

elements.streamUrl.value = localStorage.getItem("account-control-stream") || "";
elements.formWatchUrl.value = localStorage.getItem("account-control-form-watch-stream") || elements.streamUrl.value;
elements.londonFormsUrl.value = localStorage.getItem(LONDON_FORMS_URL_KEY) || "";
elements.subscribeUrl.value = localStorage.getItem(SUBSCRIBE_CHANNEL_KEY) || "";
elements.starterWord.value = normalizeStarterWord(localStorage.getItem(STARTER_WORD_KEY) || "");
setSendBatchSize(localStorage.getItem(SEND_BATCH_SIZE_KEY) || "1");
if (!LONDON_FORMS_LOCAL) elements.londonFormsOpen.hidden = true;

function normalizeStarterWord(value) {
  return cleanStarterDraft(value).trim();
}

function cleanStarterDraft(value) {
  return String(value || "").replace(/[\t\r\n]+/g, " ").replace(/ {2,}/g, " ").slice(0, STARTER_PHRASE_LIMIT);
}

function currentStarterWord() {
  return normalizeStarterWord(elements.starterWord.value);
}

function setMessage(value, focus = false) {
  elements.message.value = value;
  elements.message.dispatchEvent(new Event("input"));
  if (focus) elements.message.focus();
}

function starterMessage(word = currentStarterWord()) {
  return word ? `${word} ` : "";
}

function ensureStarterMessage(focus = false) {
  const word = currentStarterWord();
  if (word && !elements.message.value.trim()) setMessage(starterMessage(word), focus);
  else if (focus) elements.message.focus();
}

function messageForSend() {
  const word = currentStarterWord();
  const text = elements.message.value.trim();
  if (!word) return text;
  if (!text) return word;
  if (text === word || text.startsWith(`${word} `)) return text;
  return `${word} ${text}`;
}

function setSendBatchSize(value = "1") {
  const size = String(value) === "3" || String(value) === "4" ? "3" : "1";
  localStorage.setItem(SEND_BATCH_SIZE_KEY, size);
  for (const input of elements.sendSize) input.checked = input.value === size;
  if (elements.sendModeNote) {
    elements.sendModeNote.textContent = size === "3"
      ? "3 accounts per send"
      : "1 selected account per send";
  }
}

function sendBatchSize() {
  return localStorage.getItem(SEND_BATCH_SIZE_KEY) === "3" ? 3 : 1;
}

function setConnection(state, text) {
  elements.connection.className = `connection ${state}`;
  elements.connection.querySelector("strong").textContent = text;
}

function setChatState(state, text) {
  elements.chatState.className = `chat-state ${state || ""}`;
  elements.chatState.lastChild.textContent = ` ${friendlyErrorText(text)}`;
}

function showNotice(text, error = false) {
  elements.notice.textContent = friendlyErrorText(text);
  elements.notice.className = `notice${error ? " error" : ""}`;
  elements.notice.hidden = false;
}

function hideNotice() {
  elements.notice.hidden = true;
}

function friendlyErrorText(value) {
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

function sanitizeVisibleGoogleErrors() {
  const safe = friendlyErrorText(elements.notice.textContent);
  if (safe !== elements.notice.textContent.trim()) elements.notice.textContent = safe;
}

new MutationObserver(sanitizeVisibleGoogleErrors).observe(document.body, { childList: true, subtree: true, characterData: true });

function initials(value) {
  const text = typeof value === "string" ? value : value.handle || value.name || "?";
  return text.replace("@", "").trim().slice(0, 2).toUpperCase() || "?";
}

function accountName(account) {
  return account.handle || account.name || account.id;
}

function setAdminStatus(text, error = false) {
  elements.adminStatus.textContent = friendlyErrorText(text);
  elements.adminStatus.className = error ? "error" : "";
}

function setAdminViewMode(mode) {
  adminViewMode = mode === "2" ? "2" : "1";
  localStorage.setItem(ADMIN_VIEW_KEY, adminViewMode);
  for (const button of elements.adminViewButtons) {
    const active = button.dataset.adminView === adminViewMode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  if (elements.adminRows) elements.adminRows.hidden = false;
  if (elements.adminSingleList) elements.adminSingleList.hidden = true;
}

function adminValue(value) {
  return String(value || "").replace(/[\t\r\n]+/g, " ").replace(/ {2,}/g, " ").slice(0, 220);
}

function adminMultilineValue(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .slice(0, 220);
}

function adminFieldValue(field, value) {
  return field === "field3" ? adminMultilineValue(value) : adminValue(value);
}

function adminEmail(account) {
  return adminValue(account.metadata && account.metadata.email).trim().toLowerCase();
}

function looksBrokenText(value) {
  return /[�ÐÑ]/.test(value);
}

function adminTitle(account) {
  const saved = adminValue(account.metadata && account.metadata.title).trim();
  const name = adminValue(account.name).trim();
  const handle = adminValue(account.handle).replace(/^@/, "").trim();
  const raw = saved || (looksBrokenText(name) ? "" : name) || handle || account.id;
  return raw
    .replace(/\s*\bYouTube\b\s*$/i, "")
    .replace(/^@/, "")
    .trim() || account.id;
}

function groupAdminAccounts(rows) {
  const groups = new Map();
  for (const account of rows) {
    const email = adminEmail(account);
    const key = email || "__other__";
    if (!groups.has(key)) groups.set(key, { key, email, label: email || "Другие аккаунты", accounts: [] });
    groups.get(key).accounts.push(account);
  }
  return [...groups.values()].sort((left, right) => {
    if (left.key === "__other__") return 1;
    if (right.key === "__other__") return -1;
    return left.label.localeCompare(right.label);
  });
}

function renderAdminSingleList(rows) {
  if (!elements.adminSingleList) return;
  const groups = groupAdminAccounts(rows).filter((group) => group.email);
  const visibleEmails = new Set(groups.map((group) => group.email));
  const formRows = adminSingleItems.filter((item) => visibleEmails.has(mffEmail(item)));
  const useFormRows = formRows.length > 0;
  const fragment = document.createDocumentFragment();
  const section = document.createElement("section");
  section.className = "mff-single-card";

  const header = document.createElement("header");
  const title = document.createElement("strong");
  title.textContent = "One Gmail = one YouTube account";
  const count = document.createElement("span");
  count.textContent = `${(useFormRows ? formRows : groups).length} ${(useFormRows ? formRows : groups).length === 1 ? "row" : "rows"}`;
  header.append(title, count);
  section.appendChild(header);

  const list = document.createElement("div");
  list.className = "mff-single-rows";
  if (useFormRows) {
    for (const item of formRows) {
      const linked = mffLinkedAccount(item);
      const row = document.createElement("div");
      row.className = "mff-single-row";

      const gmail = document.createElement("div");
      const gmailText = document.createElement("strong");
      gmailText.textContent = mffEmail(item);
      const gmailMeta = document.createElement("small");
      gmailMeta.textContent = `${linked.count} ${linked.count === 1 ? "channel" : "channels"}`;
      gmail.append(gmailText, gmailMeta);

      const channel = document.createElement("div");
      const channelText = document.createElement("strong");
      channelText.textContent = linked.handle || "No account";
      const channelMeta = document.createElement("small");
      channelMeta.textContent = linked.name || "Linked YouTube account";
      channel.append(channelText, channelMeta);

      row.append(gmail, channel);
      list.appendChild(row);
    }
  } else {
    for (const group of groups) {
      const account = group.accounts[0] || {};
      const row = document.createElement("div");
      row.className = "mff-single-row";

      const gmail = document.createElement("div");
      const gmailText = document.createElement("strong");
      gmailText.textContent = group.email;
      const gmailMeta = document.createElement("small");
      gmailMeta.textContent = `${group.accounts.length} ${group.accounts.length === 1 ? "channel" : "channels"}`;
      gmail.append(gmailText, gmailMeta);

      const channel = document.createElement("div");
      const channelText = document.createElement("strong");
      channelText.textContent = adminValue(account.handle).trim() || "No account";
      const channelMeta = document.createElement("small");
      channelMeta.textContent = adminTitle(account);
      channel.append(channelText, channelMeta);

      row.append(gmail, channel);
      list.appendChild(row);
    }
  }
  section.appendChild(list);
  fragment.appendChild(section);
  elements.adminSingleList.replaceChildren(fragment);
}

function singleAdminAccounts(rows) {
  const preferredIds = new Map(
    adminSingleItems
      .map((item) => [mffEmail(item), item.account && item.account.id || ""])
      .filter(([email]) => email)
  );
  return groupAdminAccounts(rows)
    .filter((group) => group.email)
    .map((group) => {
      const preferredId = preferredIds.get(group.email);
      return group.accounts.find((account) => account.id === preferredId) || group.accounts[0] || null;
    })
    .filter(Boolean);
}

function adminStatusSummary(rows) {
  const groups = groupAdminAccounts(rows);
  const gmailGroups = groups.filter((group) => group.email).length;
  return `${rows.length} accounts · ${gmailGroups} Gmail`;
}

function adminSearchQuery() {
  return adminValue(elements.adminSearch && elements.adminSearch.value).trim().toLowerCase();
}

function adminSearchText(account) {
  const metadata = account.metadata || {};
  const records = Array.isArray(metadata.records) ? metadata.records : [];
  return [
    adminEmail(account),
    adminTitle(account),
    account.handle,
    account.name,
    account.id,
    metadata.field1,
    metadata.field2,
    metadata.field3,
    ...records.flatMap((record) => [record.field1, record.field2, record.field3])
  ].map((value) => adminValue(value).toLowerCase()).join(" ");
}

function filteredAdminAccounts() {
  const query = adminSearchQuery();
  if (!query) return adminAccounts;
  const terms = query.split(/\s+/).filter(Boolean);
  return adminAccounts.filter((account) => {
    const text = adminSearchText(account);
    return terms.every((term) => text.includes(term));
  });
}

function resizeMetadataTextarea(textarea) {
  if (!(textarea instanceof HTMLTextAreaElement)) return;
  textarea.style.height = "auto";
  textarea.style.height = `${Math.max(36, textarea.scrollHeight)}px`;
}

function createMetadataTextarea(value, placeholder, email = false, multiline = false) {
  const textarea = document.createElement("textarea");
  textarea.rows = 1;
  textarea.wrap = "soft";
  textarea.maxLength = 220;
  textarea.autocomplete = "off";
  textarea.spellcheck = false;
  textarea.placeholder = placeholder;
  textarea.setAttribute("aria-label", placeholder);
  if (email) textarea.inputMode = "email";
  textarea.value = multiline ? adminMultilineValue(value) : adminValue(value);
  textarea.addEventListener("input", () => {
    const cleaned = multiline ? adminMultilineValue(textarea.value) : adminValue(textarea.value);
    if (textarea.value !== cleaned) textarea.value = cleaned;
    resizeMetadataTextarea(textarea);
  });
  requestAnimationFrame(() => resizeMetadataTextarea(textarea));
  return textarea;
}

const GIVEAWAY_AMOUNTS = ["25", "50", "100", "150"];
const GIVEAWAY_TYPES = ["select", "growth", "light"];

function parseGiveawayValue(value) {
  const text = adminValue(value).trim();
  if (!text) return { count: "", amount: "", type: "" };
  const normalized = text.toLowerCase();
  const countAmount = normalized.match(/(\d{1,2})\s*[xх×]\s*(25|50|100|150)/);
  const amountMatch = countAmount || normalized.match(/(?:^|\D)(25|50|100|150)(?=\D|$)/);
  const type = /\blight\b/.test(normalized)
    ? "light"
    : /\b(?:growth|gr)\b/.test(normalized)
      ? "growth"
      : /\b(?:select|sel)\b/.test(normalized)
        ? "select"
        : "";
  return {
    count: countAmount ? String(Math.min(99, Math.max(1, Number(countAmount[1])))) : "1",
    amount: amountMatch ? String(countAmount ? countAmount[2] : amountMatch[1]) : "",
    type
  };
}

function giveawayStoredValue({ count, amount, type }) {
  const cleanAmount = GIVEAWAY_AMOUNTS.includes(String(amount)) ? String(amount) : "";
  const cleanType = GIVEAWAY_TYPES.includes(String(type)) ? String(type) : "";
  if (!count && !cleanAmount && !cleanType) return "";
  const cleanCount = String(Math.min(99, Math.max(1, Number(count) || 1)));
  return `${cleanCount}x${cleanAmount || "25"} ${cleanType || "select"}`;
}

function giveawayDisplayValue(value) {
  const parsed = parseGiveawayValue(value);
  if (!parsed.count && !parsed.amount && !parsed.type) return "—";
  const count = Math.max(1, Number(parsed.count) || 1);
  const prefix = count > 1 ? `${count}×` : "";
  return `${prefix}${parsed.amount || "25"}${parsed.type ? ` ${parsed.type}` : ""}`;
}

function createGiveawaySelect(label, choices, value) {
  const select = document.createElement("select");
  select.setAttribute("aria-label", label);
  select.title = label;
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = label;
  select.appendChild(empty);
  for (const choice of choices) {
    const option = document.createElement("option");
    option.value = choice;
    option.textContent = choice;
    select.appendChild(option);
  }
  select.value = value;
  return select;
}

function setGiveawayControlValue(hidden, value) {
  const control = hidden && hidden.closest(".admin-giveaway-control");
  if (!control) return;
  const parsed = parseGiveawayValue(value);
  control.querySelector(".admin-giveaway-count").value = parsed.count;
  control.querySelector(".admin-giveaway-amount").value = parsed.amount;
  const type = control.querySelector(".admin-giveaway-type");
  type.value = parsed.type;
  type.dataset.value = parsed.type;
  hidden.value = adminValue(value).trim();
}

function createGiveawayControl(value, dataset = {}) {
  const parsed = parseGiveawayValue(value);
  const control = document.createElement("div");
  control.className = "admin-giveaway-control";

  const count = document.createElement("input");
  count.className = "admin-giveaway-count";
  count.type = "number";
  count.min = "1";
  count.max = "99";
  count.inputMode = "numeric";
  count.placeholder = "Акки";
  count.setAttribute("aria-label", "Количество аккаунтов");
  count.title = "Количество аккаунтов";
  count.value = parsed.count;

  const amount = createGiveawaySelect("Сумма", GIVEAWAY_AMOUNTS, parsed.amount);
  amount.className = "admin-giveaway-amount";
  const type = createGiveawaySelect("Тип", GIVEAWAY_TYPES, parsed.type);
  type.className = "admin-giveaway-type";
  type.dataset.value = parsed.type;

  const hidden = document.createElement("input");
  hidden.type = "hidden";
  hidden.value = adminValue(value).trim();
  Object.assign(hidden.dataset, dataset);

  const update = () => {
    if (count.value || amount.value || type.value) {
      if (!count.value) count.value = "1";
      if (!amount.value) amount.value = "25";
      if (!type.value) type.value = "select";
    }
    hidden.value = giveawayStoredValue({ count: count.value, amount: amount.value, type: type.value });
    type.dataset.value = type.value;
    hidden.dispatchEvent(new Event("input", { bubbles: true }));
  };
  count.addEventListener("input", update);
  amount.addEventListener("change", update);
  type.addEventListener("change", update);
  control.append(count, amount, type, hidden);
  return control;
}

function formatRecordCreatedAt(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "Время неизвестно";
  const formatted = new Intl.DateTimeFormat("ru-RU", {
    timeZone: ASTANA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
  return formatted;
}

function accountConnectedTime(account) {
  const time = Date.parse(adminValue(account && account.connectedAt));
  return Number.isFinite(time) ? time : 0;
}

function accountTestingExpiryTime(account) {
  const oauth = account && account.oauth || {};
  const exactExpiry = Date.parse(adminValue(oauth.refreshTokenExpiresAt || account && account.refreshTokenExpiresAt));
  if (Number.isFinite(exactExpiry)) return exactExpiry;
  if (oauthAutomation.publishingStatus === "production") return 0;
  const connectedAt = accountConnectedTime(account);
  return connectedAt ? connectedAt + OAUTH_TEST_TOKEN_TTL_MS : 0;
}

function accountExpiryWarning(account) {
  if (!account || account.connected === false || disconnectedAccountIds.has(account.id)) return false;
  const expiresAt = accountTestingExpiryTime(account);
  const remaining = expiresAt - Date.now();
  return Boolean(expiresAt && remaining > 0 && remaining <= OAUTH_EXPIRY_WARNING_MS);
}

function russianQuantity(value, forms) {
  const lastTwo = Math.abs(value) % 100;
  const last = Math.abs(value) % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

function accountExpiryRemainingText(expiresAt) {
  const remainingHours = Math.max(0, Math.floor((expiresAt - Date.now()) / (60 * 60 * 1000)));
  const days = Math.floor(remainingHours / 24);
  const hours = remainingHours % 24;
  return [
    `Осталось ${days} ${russianQuantity(days, ["день", "дня", "дней"])}`,
    `${hours} ${russianQuantity(hours, ["час", "часа", "часов"])}`
  ].join(" ");
}

function createAccountDateTime(value, className) {
  const timestamp = document.createElement("time");
  timestamp.className = className;
  timestamp.dateTime = adminValue(value);
  timestamp.textContent = formatRecordCreatedAt(value);
  timestamp.title = timestamp.textContent;
  return timestamp;
}

function updateAccountExpiryCountdown(timestamp) {
  const expiresAt = Number(timestamp.dataset.expiresAt);
  if (!Number.isFinite(expiresAt)) return;
  timestamp.textContent = accountExpiryRemainingText(expiresAt);
  timestamp.title = formatRecordCreatedAt(expiresAt);
}

function createAccountExpiryCountdown(expiresAt) {
  const timestamp = document.createElement("time");
  timestamp.className = "account-expiry-warning";
  timestamp.dateTime = new Date(expiresAt).toISOString();
  timestamp.dataset.expiresAt = String(expiresAt);
  updateAccountExpiryCountdown(timestamp);
  return timestamp;
}

function refreshAccountExpiryCountdowns() {
  for (const timestamp of document.querySelectorAll(".account-expiry-warning[data-expires-at]")) {
    updateAccountExpiryCountdown(timestamp);
  }
}

function createRecordLabel(labelText, labelMeta, createdAt, accountId = "", record = null) {
  const label = document.createElement("div");
  label.className = "admin-record-label";
  if (labelMeta) label.classList.add("with-meta");

  const heading = document.createElement("div");
  heading.className = "admin-record-label-heading";
  const strong = document.createElement("strong");
  strong.className = "admin-record-label-title";
  strong.textContent = labelText;
  heading.appendChild(strong);
  if (accountId && record) {
    const statuses = document.createElement("span");
    statuses.className = "admin-record-label-statuses";
    statuses.append(
      createAdminRecordStatusButton(accountId, record, "sent"),
      createAdminRecordStatusButton(accountId, record, "ticketed")
    );
    heading.appendChild(statuses);
  }
  label.appendChild(heading);

  const metadata = document.createElement("div");
  metadata.className = "admin-record-label-meta";
  if (labelMeta) {
    const small = document.createElement("small");
    small.textContent = labelMeta;
    metadata.appendChild(small);
  }

  const created = document.createElement("time");
  created.className = "admin-record-created";
  created.dateTime = adminValue(createdAt);
  created.textContent = formatRecordCreatedAt(createdAt);
  created.title = adminValue(createdAt) || created.textContent;
  metadata.appendChild(created);
  label.appendChild(metadata);
  return label;
}

function createAdminInput(account, field, placeholder) {
  if (field === "field1") {
    return createGiveawayControl(account.metadata && account.metadata[field], {
      accountId: account.id,
      field
    });
  }
  const input = createMetadataTextarea(
    field === "title" ? adminTitle(account) : adminFieldValue(field, account.metadata && account.metadata[field]),
    placeholder,
    field === "email" || field === "field2",
    field === "field3"
  );
  input.dataset.accountId = account.id;
  input.dataset.field = field;
  if (field === "title") input.dataset.defaultValue = adminValue(account.name || account.handle || account.id).trim();
  return input;
}

function adminRecords(account) {
  const rows = account.metadata && Array.isArray(account.metadata.records) ? account.metadata.records : [];
  const hasStoredOrder = rows.some((record) => Number.isFinite(Number(record.order)) && Number(record.order) !== 0);
  return sortRecordsByColor(rows
    .map((record, index) => ({
      id: adminValue(record.id).replace(/[^A-Za-z0-9_-]/g, "") || adminRecordId(),
      field1: adminValue(record.field1),
      field2: adminValue(record.field2),
      field3: adminMultilineValue(record.field3),
      color: adminRecordColor(record.color),
      order: hasStoredOrder ? recordOrderValue(record, index) : index,
      manualOrder: Boolean(record.manualOrder),
      pinned: Boolean(record.pinned),
      sent: Boolean(record.sent),
      ticketed: Boolean(record.ticketed),
      createdAt: adminValue(record.createdAt),
      updatedAt: adminValue(record.updatedAt)
    }))
    .filter((record) => record.field1 || record.field2 || record.field3));
}

function adminRecordColor(value) {
  return value === "red" || value === "green" || value === "yellow" ? value : "";
}

function recordColorRank(record) {
  if (record.color === "green") return 0;
  if (record.color === "yellow") return 1;
  if (record.color === "red") return 2;
  return 3;
}

function recordOrderValue(record, fallback = 0) {
  const order = Number(record && record.order);
  return Number.isFinite(order) ? order : fallback;
}

function recordCreatedTime(record) {
  const time = Date.parse(adminValue(record && record.createdAt));
  return Number.isFinite(time) ? time : 0;
}

function recordGiveawayAmount(record) {
  return Number(parseGiveawayValue(record && record.field1).amount) || 0;
}

function sortRecordsByColor(records) {
  return records
    .map((record, index) => ({ record, index }))
    .sort((left, right) => {
      const colorRank = recordColorRank(left.record) - recordColorRank(right.record);
      if (colorRank) return colorRank;
      return recordGiveawayAmount(right.record) - recordGiveawayAmount(left.record)
        || recordCreatedTime(right.record) - recordCreatedTime(left.record)
        || recordOrderValue(left.record, left.index) - recordOrderValue(right.record, right.index)
        || left.index - right.index;
    })
    .map((item) => item.record);
}

function sortRecordEntriesByColor(entries) {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const colorRank = recordColorRank(left.entry.record) - recordColorRank(right.entry.record);
      if (colorRank) return colorRank;
      return recordGiveawayAmount(right.entry.record) - recordGiveawayAmount(left.entry.record)
        || recordCreatedTime(right.entry.record) - recordCreatedTime(left.entry.record)
        || recordOrderValue(left.entry.record, left.index) - recordOrderValue(right.entry.record, right.index)
        || left.index - right.index;
    })
    .map((item) => item.entry);
}

function normalizeRecordOrders(records) {
  return sortRecordsByColor(records).map((record, index) => ({ ...record, order: index }));
}

function nextRecordOrderForColor(records, color) {
  const matching = records.filter((record) => adminRecordColor(record.color) === color);
  if (!matching.length) return 0;
  return Math.max(...matching.map((record, index) => recordOrderValue(record, index))) + 1;
}

function canMoveRecord(records, index, direction) {
  const target = index + direction;
  return target >= 0
    && target < records.length
    && recordColorRank(records[index]) === recordColorRank(records[target]);
}

function canMoveRecordEntry(entries, index, direction) {
  const target = index + direction;
  return target >= 0
    && target < entries.length
    && recordColorRank(entries[index].record) === recordColorRank(entries[target].record);
}

function moveRecordWithinColor(records, recordId, direction, now) {
  const sorted = normalizeRecordOrders(records);
  const index = sorted.findIndex((record) => record.id === recordId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= sorted.length) return { moved: false, records: sorted };
  if (recordColorRank(sorted[index]) !== recordColorRank(sorted[target])) return { moved: false, records: sorted };
  const movedColor = adminRecordColor(sorted[index].color);
  const next = sorted.map((record) => ({ ...record }));
  [next[index], next[target]] = [next[target], next[index]];
  return {
    moved: true,
    records: next.map((record, nextIndex) => ({
      ...record,
      order: nextIndex,
      manualOrder: adminRecordColor(record.color) === movedColor ? true : Boolean(record.manualOrder),
      ...(nextIndex === index || nextIndex === target ? { updatedAt: now } : {})
    }))
  };
}

function adminRecordId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
  return `record-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function adminRecordKey(accountId, recordId) {
  return `${accountId}:${recordId}`;
}

function adminRecordDomRows(accountId, recordId) {
  return [...elements.adminRows.querySelectorAll(".admin-record[data-account-id][data-record-id]")]
    .filter((row) => row.dataset.accountId === accountId && row.dataset.recordId === recordId);
}

function syncAdminRecordDomValues(accountId, recordId, sourceRow, now = new Date().toISOString()) {
  const rows = adminRecordDomRows(accountId, recordId);
  const source = rows.includes(sourceRow) ? sourceRow : rows.find((row) => row.querySelector("[data-record-field]"));
  const values = {};
  for (const field of ["field1", "field2", "field3"]) {
    const input = source && source.querySelector(`[data-record-field="${field}"]`);
    values[field] = adminFieldValue(field, input ? input.value : source && source.dataset[field]).trim();
  }
  for (const row of rows) {
    row.dataset.updatedAt = now;
    for (const [field, value] of Object.entries(values)) {
      row.dataset[field] = value;
      const input = row.querySelector(`[data-record-field="${field}"]`);
      if (input && input.value !== value) {
        if (field === "field1") setGiveawayControlValue(input, value);
        else {
          input.value = value;
          resizeMetadataTextarea(input);
        }
      }
    }
  }
  return values;
}

function createAdminRecordValue(value, field = "") {
  const item = document.createElement("div");
  item.className = "admin-record-value";
  if (field === "field1") {
    const parsed = parseGiveawayValue(value);
    item.classList.add("admin-giveaway-value");
    if (parsed.type) item.classList.add(`is-${parsed.type}`);
    item.textContent = giveawayDisplayValue(value);
  } else {
    item.textContent = adminFieldValue(field, value).trim() || "—";
  }
  return item;
}

function createAdminRecordInput(accountId, record, field, placeholder) {
  if (field === "field1") {
    return createGiveawayControl(record[field], {
      accountId,
      recordId: record.id,
      recordField: field
    });
  }
  const input = createMetadataTextarea(record[field], placeholder, field === "field2", field === "field3");
  input.dataset.accountId = accountId;
  input.dataset.recordId = record.id;
  input.dataset.recordField = field;
  return input;
}

function createAdminIconButton(action, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "admin-check-button";
  button.dataset.adminAction = action;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
  return button;
}

function createAdminTextButton(action, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "admin-edit-button";
  button.dataset.adminAction = action;
  button.textContent = label;
  return button;
}

function createAdminColorButton(accountId, record, color) {
  const labels = { red: "Red", green: "Green", yellow: "Yellow" };
  const button = document.createElement("button");
  button.type = "button";
  button.className = `admin-color-button ${color}`;
  button.dataset.adminAction = "set-record-color";
  button.dataset.accountId = accountId;
  button.dataset.recordId = record.id;
  button.dataset.color = color;
  button.title = labels[color] || "Color";
  button.setAttribute("aria-label", button.title);
  button.setAttribute("aria-pressed", String(record.color === color));
  return button;
}

function createAdminRecordStatusButton(accountId, record, status) {
  const sent = status === "sent";
  const button = document.createElement("button");
  button.type = "button";
  button.className = `admin-record-status-button ${status}`;
  button.dataset.adminAction = "toggle-record-status";
  button.dataset.accountId = accountId;
  button.dataset.recordId = record.id;
  button.dataset.status = status;
  button.title = sent ? "Я написал с этого аккаунта" : "Они запустили тикет";
  button.setAttribute("aria-label", button.title);
  button.setAttribute("aria-pressed", String(sent ? record.sent : record.ticketed));
  button.innerHTML = sent
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4Z"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18v3a3 3 0 0 0 0 6v3H3v-3a3 3 0 0 0 0-6V7Z"/><path d="M13 7v2M13 15v4"/></svg>';
  return button;
}

function createAdminMoveButton(accountId, record, direction, disabled = false) {
  const up = direction < 0;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "admin-move-button";
  button.dataset.adminAction = up ? "move-record-up" : "move-record-down";
  button.dataset.accountId = accountId;
  button.dataset.recordId = record.id;
  button.title = up ? "Move up" : "Move down";
  button.setAttribute("aria-label", button.title);
  button.disabled = Boolean(disabled);
  button.innerHTML = up
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 5 7 7h-4v7H9v-7H5l7-7z"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 19-7-7h4V5h6v7h4l-7 7z"/></svg>';
  return button;
}

function createAdminRecordActions(accountId, record, editing, move = {}) {
  const actions = document.createElement("div");
  actions.className = "admin-record-actions";
  const pin = createAdminTextButton("toggle-record-pin", record.pinned ? "Pinned" : "Pin");
  pin.className = "admin-pin-button";
  pin.dataset.accountId = accountId;
  pin.dataset.recordId = record.id;
  pin.setAttribute("aria-pressed", String(record.pinned));
  actions.appendChild(pin);
  actions.append(
    createAdminColorButton(accountId, record, "red"),
    createAdminColorButton(accountId, record, "green"),
    createAdminColorButton(accountId, record, "yellow")
  );
  const edit = createAdminTextButton(editing ? "finish-record-edit" : "edit-record", editing ? "Done" : "Edit");
  edit.dataset.accountId = accountId;
  edit.dataset.recordId = record.id;
  actions.appendChild(edit);
  return actions;
}

function createAdminRecordRow(account, record, labelText, labelMeta = "", move = {}) {
  const row = document.createElement("div");
  row.className = "admin-record";
  row.dataset.accountId = account.id;
  row.dataset.recordId = record.id;
  row.dataset.order = recordOrderValue(record);
  row.dataset.manualOrder = String(Boolean(record.manualOrder));
  row.dataset.createdAt = record.createdAt;
  row.dataset.updatedAt = record.updatedAt;
  row.dataset.field1 = record.field1;
  row.dataset.field2 = record.field2;
  row.dataset.field3 = record.field3;
  row.dataset.color = record.color;
  row.dataset.pinned = String(Boolean(record.pinned));
  row.dataset.sent = String(Boolean(record.sent));
  row.dataset.ticketed = String(Boolean(record.ticketed));
  if (record.color) row.classList.add(`is-${record.color}`);
  if (record.pinned) row.classList.add("is-pinned");
  const editing = adminEditingRecords.has(adminRecordKey(account.id, record.id));
  if (editing) row.classList.add("is-editing");

  const label = createRecordLabel(labelText, labelMeta, record.createdAt, account.id, record);

  const actions = createAdminRecordActions(account.id, record, editing, move);

  if (editing) {
    row.append(
      label,
      createAdminRecordInput(account.id, record, "field1", "Giveaway"),
      createAdminRecordInput(account.id, record, "field2", "Email"),
      createAdminRecordInput(account.id, record, "field3", "Столбик 3"),
      actions
    );
  } else {
    row.append(
      label,
      createAdminRecordValue(record.field1, "field1"),
      createAdminRecordValue(record.field2, "field2"),
      createAdminRecordValue(record.field3, "field3"),
      actions
    );
  }
  return row;
}

function createAdminRecords(account) {
  const records = adminRecords(account);
  if (!records.length) return null;
  const wrap = document.createElement("div");
  wrap.className = "admin-records";
  wrap.dataset.accountId = account.id;
  records.forEach((record, index) => {
    wrap.appendChild(createAdminRecordRow(account, record, adminEmail(account) || adminTitle(account), adminTitle(account), {
      up: canMoveRecord(records, index, -1),
      down: canMoveRecord(records, index, 1)
    }));
  });
  return wrap;
}

function createAdminPinnedSection(rows) {
  const pinned = sortRecordEntriesByColor(rows.flatMap((account) => (
    adminRecords(account)
      .filter((record) => record.pinned)
      .map((record) => ({ account, record }))
  )));
  if (!pinned.length) return null;
  const section = document.createElement("section");
  section.className = "admin-group admin-pinned-group";

  const header = document.createElement("header");
  header.className = "admin-group-head";
  const label = document.createElement("span");
  label.className = "admin-group-label";
  const strong = document.createElement("strong");
  strong.textContent = "Pinned";
  const small = document.createElement("small");
  small.textContent = `${pinned.length} ${pinned.length === 1 ? "record" : "records"}`;
  label.append(strong, small);
  header.appendChild(label);
  section.appendChild(header);

  const list = document.createElement("div");
  list.className = "admin-lines";
  const headRow = document.createElement("div");
  headRow.className = "admin-line admin-line-head";
  for (const title of ["Канал / Gmail", "Giveaway", "Email", "Столбик 3", ""]) {
    const heading = document.createElement("span");
    heading.textContent = title;
    headRow.appendChild(heading);
  }
  list.appendChild(headRow);
  pinned.forEach(({ account, record }, index) => {
    list.appendChild(createAdminRecordRow(account, record, adminEmail(account) || "Другие аккаунты", adminTitle(account), {
      up: canMoveRecordEntry(pinned, index, -1),
      down: canMoveRecordEntry(pinned, index, 1)
    }));
  });
  section.appendChild(list);
  return section;
}

function renderAdminRows(rows) {
  const fragment = document.createDocumentFragment();
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "admin-empty";
    empty.textContent = adminSearchQuery() ? "No matches" : "No accounts";
    fragment.appendChild(empty);
    elements.adminRows.replaceChildren(fragment);
    return;
  }
  const pinnedSection = createAdminPinnedSection(rows);
  if (pinnedSection) fragment.appendChild(pinnedSection);
  const groups = groupAdminAccounts(rows);
  groups.forEach((group) => {
    const section = document.createElement("section");
    section.className = "admin-group";

    const header = document.createElement("header");
    header.className = "admin-group-head";
    const label = document.createElement("span");
    label.className = "admin-group-label";
    const strong = document.createElement("strong");
    strong.textContent = group.label;
    const small = document.createElement("small");
    small.textContent = `${group.accounts.length} ${group.accounts.length === 1 ? "channel" : "channels"}`;
    label.append(strong, small);
    header.appendChild(label);
    section.appendChild(header);

    const list = document.createElement("div");
    list.className = "admin-lines";

    const headRow = document.createElement("div");
    headRow.className = "admin-line admin-line-head";
    for (const title of ["Канал", "Giveaway", "Email", "Столбик 3", ""]) {
      const heading = document.createElement("span");
      heading.textContent = title;
      headRow.appendChild(heading);
    }
    list.appendChild(headRow);

    for (const account of group.accounts) {
      const row = document.createElement("div");
      row.className = "admin-line";
      row.dataset.accountId = account.id;

      const channelCell = document.createElement("div");
      channelCell.className = "admin-line-name";
      const channelName = document.createElement("strong");
      channelName.textContent = adminTitle(account);
      channelCell.appendChild(channelName);

      row.appendChild(channelCell);
      const commit = createAdminIconButton("commit-entry", "Save entry below this channel");
      commit.dataset.accountId = account.id;
      row.append(
        createAdminInput(account, "field1", "Giveaway"),
        createAdminInput(account, "field2", "Email"),
        createAdminInput(account, "field3", "Столбик 3"),
        commit
      );
      list.appendChild(row);
      const records = createAdminRecords(account);
      if (records) list.appendChild(records);
    }
    section.appendChild(list);
    fragment.appendChild(section);
  });
  elements.adminRows.replaceChildren(fragment);
}

function adminMetadataFromRows() {
  const metadata = {};
  for (const account of adminAccounts) {
    metadata[account.id] = { ...(account.metadata || {}) };
  }
  for (const input of elements.adminRows.querySelectorAll("[data-account-id][data-field]:not([data-record-id])")) {
    const id = input.dataset.accountId;
    const field = input.dataset.field;
    if (!metadata[id]) metadata[id] = { email: "", title: "", field1: "", field2: "", field3: "", records: [] };
    let value = adminFieldValue(field, input.value).trim();
    if (field === "title" && value === input.dataset.defaultValue) value = "";
    metadata[id][field] = field === "email" ? value.toLowerCase() : value;
  }
  const recordBuckets = new Map();
  for (const row of elements.adminRows.querySelectorAll(".admin-group:not(.admin-pinned-group) .admin-record[data-account-id][data-record-id]")) {
    const id = row.dataset.accountId;
    if (!metadata[id]) metadata[id] = { email: "", title: "", field1: "", field2: "", field3: "", records: [] };
    if (!recordBuckets.has(id)) recordBuckets.set(id, []);
    const record = {
      id: adminValue(row.dataset.recordId).replace(/[^A-Za-z0-9_-]/g, "") || adminRecordId(),
      field1: adminValue(row.dataset.field1).trim(),
      field2: adminValue(row.dataset.field2).trim(),
      field3: adminMultilineValue(row.dataset.field3).trim(),
      color: adminRecordColor(row.dataset.color),
      order: recordOrderValue(row.dataset, recordBuckets.get(id).length),
      manualOrder: row.dataset.manualOrder === "true",
      pinned: row.dataset.pinned === "true",
      sent: row.dataset.sent === "true",
      ticketed: row.dataset.ticketed === "true",
      createdAt: adminValue(row.dataset.createdAt),
      updatedAt: adminValue(row.dataset.updatedAt)
    };
    for (const input of row.querySelectorAll("[data-record-field]")) {
      record[input.dataset.recordField] = adminFieldValue(input.dataset.recordField, input.value).trim();
    }
    if (record.field1 || record.field2 || record.field3) recordBuckets.get(id).push(record);
  }
  for (const [id, records] of recordBuckets) {
    metadata[id].records = records;
  }
  return metadata;
}

function syncVisibleAdminMetadata() {
  const metadata = adminMetadataFromRows();
  adminAccounts = adminAccounts.map((account) => ({
    ...account,
    metadata: metadata[account.id] || account.metadata || {}
  }));
}

function renderAdminView(prefix = "") {
  const query = adminSearchQuery();
  const sourceRows = filteredAdminAccounts();
  const rows = adminViewMode === "2" ? singleAdminAccounts(sourceRows) : sourceRows;
  if (elements.adminSingleList) elements.adminSingleList.replaceChildren();
  renderAdminRows(rows);
  setAdminViewMode(adminViewMode);
  const allRows = adminViewMode === "2" ? singleAdminAccounts(adminAccounts) : adminAccounts;
  const summary = query ? `${rows.length}/${allRows.length} shown · ${adminStatusSummary(rows)}` : adminStatusSummary(allRows);
  setAdminStatus(prefix ? `${prefix} · ${summary}` : summary);
}

async function loadAdminMetadata() {
  if (adminLoading) return;
  adminLoading = true;
  elements.adminRefresh.disabled = true;
  elements.adminSave.disabled = true;
  setAdminStatus("Loading");
  try {
    const response = await fetch("/api/admin/account-metadata", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not load admin data");
    adminAccounts = data.accounts || [];
    adminSingleItems = data.formRows || [];
    renderAdminView();
  } catch (error) {
    setAdminStatus(error.message, true);
  } finally {
    adminLoading = false;
    elements.adminRefresh.disabled = false;
    elements.adminSave.disabled = false;
  }
}

async function saveAdminMetadata(prefix = "Saved") {
  elements.adminSave.disabled = true;
  setAdminStatus("Saving");
  try {
    syncVisibleAdminMetadata();
    const response = await fetch("/api/admin/account-metadata", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ metadata: adminMetadataFromRows() })
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not save admin data");
    adminAccounts = data.accounts || [];
    adminSingleItems = data.formRows || adminSingleItems;
    renderAdminView(prefix);
  } catch (error) {
    setAdminStatus(error.message, true);
  } finally {
    elements.adminSave.disabled = false;
  }
}

async function autosaveAdminMetadata(prefix = "Auto saved", render = false) {
  elements.adminSave.disabled = true;
  setAdminStatus("Saving");
  try {
    syncVisibleAdminMetadata();
    const response = await fetch("/api/admin/account-metadata", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ metadata: adminMetadataFromRows() })
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not save admin data");
    adminAccounts = data.accounts || [];
    adminSingleItems = data.formRows || adminSingleItems;
    if (render) renderAdminView(prefix);
    else setAdminStatus(`${prefix} · ${adminStatusSummary(adminAccounts)}`);
  } catch (error) {
    setAdminStatus(error.message, true);
  } finally {
    elements.adminSave.disabled = false;
  }
}

function queueAdminAutosave(accountId, recordId, sourceRow = null) {
  syncAdminRecordDomValues(accountId, recordId, sourceRow);
  clearTimeout(adminAutosaveTimer);
  adminAutosaveTimer = setTimeout(() => {
    adminAutosaveTimer = null;
    autosaveAdminMetadata();
  }, 550);
}

async function commitAdminEntry(accountId) {
  const row = elements.adminRows.querySelector(`.admin-line[data-account-id="${accountId}"]`);
  if (!row) return;
  const values = {};
  for (const field of ["field1", "field2", "field3"]) {
    values[field] = adminFieldValue(field, row.querySelector(`[data-field="${field}"]`)?.value).trim();
  }
  if (!values.field1 && !values.field2 && !values.field3) {
    setAdminStatus("Fill any column first", true);
    return;
  }
  syncVisibleAdminMetadata();
  const account = adminAccounts.find((item) => item.id === accountId);
  if (!account) return;
  const metadata = account.metadata || {};
  const now = new Date().toISOString();
  const currentRecords = adminRecords(account);
  account.metadata = {
    ...metadata,
    records: normalizeRecordOrders([
      { id: adminRecordId(), ...values, color: "", order: nextRecordOrderForColor(currentRecords, ""), manualOrder: false, pinned: false, sent: false, ticketed: false, createdAt: now, updatedAt: now },
      ...currentRecords
    ]).slice(0, 50)
  };
  renderAdminView("Saving");
  await saveAdminMetadata("Entry saved");
}

function editAdminRecord(accountId, recordId) {
  syncVisibleAdminMetadata();
  adminEditingRecords.add(adminRecordKey(accountId, recordId));
  renderAdminView("Editing");
  requestAnimationFrame(() => {
    const input = elements.adminRows.querySelector(`.admin-record[data-account-id="${accountId}"][data-record-id="${recordId}"] .admin-giveaway-count, .admin-record[data-account-id="${accountId}"][data-record-id="${recordId}"] textarea`);
    if (input) input.focus();
  });
}

async function finishAdminRecordEdit(accountId, recordId, sourceRow = null) {
  clearTimeout(adminAutosaveTimer);
  adminAutosaveTimer = null;
  const now = new Date().toISOString();
  const values = syncAdminRecordDomValues(accountId, recordId, sourceRow, now);
  syncVisibleAdminMetadata();
  adminAccounts = adminAccounts.map((account) => ({
    ...account,
    metadata: {
      ...(account.metadata || {}),
      records: adminRecords(account).map((record) => (
        account.id === accountId && record.id === recordId ? { ...record, ...values, updatedAt: now } : record
      ))
    }
  }));
  adminEditingRecords.delete(adminRecordKey(accountId, recordId));
  await autosaveAdminMetadata("Done", true);
}

async function setAdminRecordColor(accountId, recordId, color) {
  syncVisibleAdminMetadata();
  const cleanColor = adminRecordColor(color);
  if (!cleanColor) return;
  const now = new Date().toISOString();
  adminAccounts = adminAccounts.map((account) => {
    if (account.id !== accountId) return account;
    const records = adminRecords(account);
    const order = nextRecordOrderForColor(records.filter((record) => record.id !== recordId), cleanColor);
    return {
      ...account,
      metadata: {
        ...(account.metadata || {}),
        records: normalizeRecordOrders(records.map((record) => (
          record.id === recordId ? {
            ...record,
            color: cleanColor,
            order,
            manualOrder: record.color === cleanColor ? Boolean(record.manualOrder) : false,
            updatedAt: now
          } : record
        )))
      }
    };
  });
  for (const row of adminRecordDomRows(accountId, recordId)) {
    row.dataset.color = cleanColor;
    row.dataset.updatedAt = now;
    row.classList.toggle("is-red", cleanColor === "red");
    row.classList.toggle("is-green", cleanColor === "green");
    row.classList.toggle("is-yellow", cleanColor === "yellow");
    for (const button of row.querySelectorAll(".admin-color-button")) {
      button.setAttribute("aria-pressed", String(button.dataset.color === cleanColor));
    }
  }
  renderAdminView("Saving");
  await autosaveAdminMetadata("Color saved", true);
}

async function moveAdminRecord(accountId, recordId, direction, sourceRow = null) {
  if (sourceRow && sourceRow.closest(".admin-pinned-group")) {
    await moveAdminPinnedRecord(accountId, recordId, direction, sourceRow);
    return;
  }
  clearTimeout(adminAutosaveTimer);
  adminAutosaveTimer = null;
  const now = new Date().toISOString();
  syncAdminRecordDomValues(accountId, recordId, sourceRow, now);
  syncVisibleAdminMetadata();
  let moved = false;
  adminAccounts = adminAccounts.map((account) => {
    if (account.id !== accountId) return account;
    const result = moveRecordWithinColor(adminRecords(account), recordId, direction, now);
    moved = result.moved;
    return {
      ...account,
      metadata: {
        ...(account.metadata || {}),
        records: result.records
      }
    };
  });
  if (moved) renderAdminView("Saving");
  await autosaveAdminMetadata(moved ? "Moved" : "No move", true);
}

async function moveAdminPinnedRecord(accountId, recordId, direction, sourceRow = null) {
  clearTimeout(adminAutosaveTimer);
  adminAutosaveTimer = null;
  const now = new Date().toISOString();
  syncAdminRecordDomValues(accountId, recordId, sourceRow, now);
  syncVisibleAdminMetadata();
  const entries = sortRecordEntriesByColor(adminAccounts.flatMap((account) => (
    adminRecords(account)
      .filter((record) => record.pinned)
      .map((record) => ({ account, record, key: adminRecordKey(account.id, record.id) }))
  )));
  const index = entries.findIndex((entry) => entry.account.id === accountId && entry.record.id === recordId);
  const target = index + direction;
  const moved = index >= 0
    && target >= 0
    && target < entries.length
    && recordColorRank(entries[index].record) === recordColorRank(entries[target].record);
  if (moved) {
    const next = entries.slice();
    [next[index], next[target]] = [next[target], next[index]];
    const movedColor = adminRecordColor(entries[index].record.color);
    const orders = new Map(next.map((entry, order) => [entry.key, order]));
    const changed = new Set([entries[index].key, entries[target].key]);
    adminAccounts = adminAccounts.map((account) => ({
      ...account,
      metadata: {
        ...(account.metadata || {}),
        records: adminRecords(account).map((record) => {
          const key = adminRecordKey(account.id, record.id);
          if (!orders.has(key)) return record;
          const ordered = {
            ...record,
            order: orders.get(key),
            manualOrder: adminRecordColor(record.color) === movedColor ? true : Boolean(record.manualOrder)
          };
          return changed.has(key) ? { ...ordered, updatedAt: now } : ordered;
        })
      }
    }));
    renderAdminView("Saving");
  }
  await autosaveAdminMetadata(moved ? "Moved" : "No move", true);
}

async function toggleAdminRecordPin(accountId, recordId) {
  syncVisibleAdminMetadata();
  let pinned = false;
  const now = new Date().toISOString();
  adminAccounts = adminAccounts.map((account) => {
    if (account.id !== accountId) return account;
    return {
      ...account,
      metadata: {
        ...(account.metadata || {}),
        records: adminRecords(account).map((record) => {
          if (record.id !== recordId) return record;
          pinned = !record.pinned;
          return { ...record, pinned, updatedAt: now };
        })
      }
    };
  });
  for (const row of adminRecordDomRows(accountId, recordId)) {
    row.dataset.pinned = String(pinned);
    row.dataset.updatedAt = now;
    row.classList.toggle("is-pinned", pinned);
    const button = row.querySelector('[data-admin-action="toggle-record-pin"]');
    if (button) {
      button.textContent = pinned ? "Pinned" : "Pin";
      button.setAttribute("aria-pressed", String(pinned));
    }
  }
  await autosaveAdminMetadata(pinned ? "Pinned" : "Unpinned", true);
}

async function toggleAdminRecordStatus(accountId, recordId, status) {
  const field = status === "sent" ? "sent" : status === "ticketed" ? "ticketed" : "";
  if (!field) return;
  syncVisibleAdminMetadata();
  let active = false;
  const now = new Date().toISOString();
  adminAccounts = adminAccounts.map((account) => {
    if (account.id !== accountId) return account;
    return {
      ...account,
      metadata: {
        ...(account.metadata || {}),
        records: adminRecords(account).map((record) => {
          if (record.id !== recordId) return record;
          active = !record[field];
          return { ...record, [field]: active, updatedAt: now };
        })
      }
    };
  });
  for (const row of adminRecordDomRows(accountId, recordId)) {
    row.dataset[field] = String(active);
    row.dataset.updatedAt = now;
    const button = row.querySelector(`[data-admin-action="toggle-record-status"][data-status="${status}"]`);
    if (button) button.setAttribute("aria-pressed", String(active));
  }
  await autosaveAdminMetadata(active ? "Отмечено" : "Отметка снята", false);
}

function openAdmin() {
  elements.mffModal.hidden = true;
  elements.adminModal.hidden = false;
  elements.adminSearch.value = "";
  setAdminViewMode(adminViewMode);
  loadAdminMetadata();
  setTimeout(() => elements.adminSearch.focus(), 0);
}

function closeAdmin() {
  elements.adminModal.hidden = true;
}

function setMffStatus(text, error = false) {
  elements.mffStatus.textContent = friendlyErrorText(text);
  elements.mffStatus.className = error ? "error" : "";
}

function mffEmail(item) {
  return adminValue(item.email).trim().toLowerCase();
}

function mffNickname(item) {
  return adminValue(item.metadata && item.metadata.nickname).trim();
}

function mffStatusSummary(rows) {
  return `${rows.length} Gmail`;
}

function mffSearchQuery() {
  return adminValue(elements.mffSearch && elements.mffSearch.value).trim().toLowerCase();
}

function mffRecords(item) {
  const rows = item.metadata && Array.isArray(item.metadata.records) ? item.metadata.records : [];
  const hasStoredOrder = rows.some((record) => Number.isFinite(Number(record.order)) && Number(record.order) !== 0);
  return sortRecordsByColor(rows
    .map((record, index) => ({
      id: adminValue(record.id).replace(/[^A-Za-z0-9_-]/g, "") || adminRecordId(),
      field1: adminValue(record.field1),
      field2: adminValue(record.field2),
      field3: adminValue(record.field3),
      color: adminRecordColor(record.color),
      order: hasStoredOrder ? recordOrderValue(record, index) : index,
      manualOrder: Boolean(record.manualOrder),
      pinned: Boolean(record.pinned),
      createdAt: adminValue(record.createdAt),
      updatedAt: adminValue(record.updatedAt)
    }))
    .filter((record) => record.field1 || record.field2 || record.field3));
}

function mffSearchText(item) {
  const metadata = item.metadata || {};
  const records = mffRecords(item);
  return [
    item.email,
    metadata.nickname,
    metadata.field1,
    metadata.field2,
    metadata.field3,
    ...records.flatMap((record) => [record.field1, record.field2, record.field3])
  ].map((value) => adminValue(value).toLowerCase()).join(" ");
}

function filteredMffItems() {
  const query = mffSearchQuery();
  if (!query) return mffItems;
  const terms = query.split(/\s+/).filter(Boolean);
  return mffItems.filter((item) => {
    const text = mffSearchText(item);
    return terms.every((term) => text.includes(term));
  });
}

function mffRecordKey(email, recordId) {
  return `${email}:${recordId}`;
}

function mffRecordDomRows(email, recordId) {
  return [...elements.mffRows.querySelectorAll(".mff-record[data-mff-email][data-record-id]")]
    .filter((row) => row.dataset.mffEmail === email && row.dataset.recordId === recordId);
}

function syncMffRecordDomValues(email, recordId, sourceRow, now = new Date().toISOString()) {
  const rows = mffRecordDomRows(email, recordId);
  const source = rows.includes(sourceRow) ? sourceRow : rows.find((row) => row.querySelector("[data-mff-record-field]"));
  const values = { field1: "" };
  for (const field of ["field2", "field3"]) {
    const input = source && source.querySelector(`[data-mff-record-field="${field}"]`);
    values[field] = adminValue(input ? input.value : source && source.dataset[field]).trim();
  }
  for (const row of rows) {
    row.dataset.updatedAt = now;
    for (const [field, value] of Object.entries(values)) {
      row.dataset[field] = value;
      const input = row.querySelector(`[data-mff-record-field="${field}"]`);
      if (input && input.value !== value) {
        input.value = value;
        resizeMetadataTextarea(input);
      }
    }
  }
  return values;
}

function findMffLine(email) {
  return [...elements.mffRows.querySelectorAll(".mff-line[data-mff-email]")]
    .find((row) => row.dataset.mffEmail === email);
}

function createMffInput(item, field, placeholder) {
  const input = createMetadataTextarea(item.metadata && item.metadata[field], placeholder, field === "field2");
  input.dataset.mffEmail = mffEmail(item);
  input.dataset.mffField = field;
  return input;
}

function createMffRecordInput(email, record, field, placeholder) {
  const input = createMetadataTextarea(record[field], placeholder, field === "field2");
  input.dataset.mffEmail = email;
  input.dataset.recordId = record.id;
  input.dataset.mffRecordField = field;
  return input;
}

function createMffIconButton(action, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "admin-check-button";
  button.dataset.mffAction = action;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
  return button;
}

function createMffTextButton(action, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "admin-edit-button";
  button.dataset.mffAction = action;
  button.textContent = label;
  return button;
}

function createMffColorButton(email, record, color) {
  const labels = { red: "Red", green: "Green", yellow: "Yellow" };
  const button = document.createElement("button");
  button.type = "button";
  button.className = `admin-color-button ${color}`;
  button.dataset.mffAction = "set-record-color";
  button.dataset.mffEmail = email;
  button.dataset.recordId = record.id;
  button.dataset.color = color;
  button.title = labels[color] || "Color";
  button.setAttribute("aria-label", button.title);
  button.setAttribute("aria-pressed", String(record.color === color));
  return button;
}

function createMffMoveButton(email, record, direction, disabled = false) {
  const up = direction < 0;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "admin-move-button";
  button.dataset.mffAction = up ? "move-record-up" : "move-record-down";
  button.dataset.mffEmail = email;
  button.dataset.recordId = record.id;
  button.title = up ? "Move up" : "Move down";
  button.setAttribute("aria-label", button.title);
  button.disabled = Boolean(disabled);
  button.innerHTML = up
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 5 7 7h-4v7H9v-7H5l7-7z"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 19-7-7h4V5h6v7h4l-7 7z"/></svg>';
  return button;
}

function createMffRecordActions(email, record, editing, move = {}) {
  const actions = document.createElement("div");
  actions.className = "admin-record-actions";
  actions.append(
    createMffMoveButton(email, record, -1, !move.up),
    createMffMoveButton(email, record, 1, !move.down)
  );
  const pin = createMffTextButton("toggle-record-pin", record.pinned ? "Pinned" : "Pin");
  pin.className = "admin-pin-button";
  pin.dataset.mffEmail = email;
  pin.dataset.recordId = record.id;
  pin.setAttribute("aria-pressed", String(record.pinned));
  actions.appendChild(pin);
  actions.append(
    createMffColorButton(email, record, "red"),
    createMffColorButton(email, record, "green"),
    createMffColorButton(email, record, "yellow")
  );
  const edit = createMffTextButton(editing ? "finish-record-edit" : "edit-record", editing ? "Done" : "Edit");
  edit.dataset.mffEmail = email;
  edit.dataset.recordId = record.id;
  actions.appendChild(edit);
  return actions;
}

function createMffRecordRow(item, record, labelText, labelMeta = "", move = {}) {
  const email = mffEmail(item);
  const row = document.createElement("div");
  row.className = "admin-record mff-record";
  row.dataset.mffEmail = email;
  row.dataset.recordId = record.id;
  row.dataset.order = recordOrderValue(record);
  row.dataset.manualOrder = String(Boolean(record.manualOrder));
  row.dataset.createdAt = record.createdAt;
  row.dataset.updatedAt = record.updatedAt;
  row.dataset.field1 = record.field1;
  row.dataset.field2 = record.field2;
  row.dataset.field3 = record.field3;
  row.dataset.color = record.color;
  row.dataset.pinned = String(Boolean(record.pinned));
  if (record.color) row.classList.add(`is-${record.color}`);
  if (record.pinned) row.classList.add("is-pinned");
  const editing = mffEditingRecords.has(mffRecordKey(email, record.id));
  if (editing) row.classList.add("is-editing");

  const label = createRecordLabel(labelText, labelMeta, record.createdAt);

  const actions = createMffRecordActions(email, record, editing, move);
  if (editing) {
    row.append(
      label,
      createMffRecordInput(email, record, "field2", "Email"),
      createMffRecordInput(email, record, "field3", "YouTube username"),
      actions
    );
  } else {
    row.append(
      label,
      createAdminRecordValue(record.field2),
      createAdminRecordValue(record.field3),
      actions
    );
  }
  return row;
}

function createMffRecords(item) {
  const records = mffRecords(item);
  if (!records.length) return null;
  const wrap = document.createElement("div");
  wrap.className = "admin-records mff-records";
  wrap.dataset.mffEmail = mffEmail(item);
  records.forEach((record, index) => {
    wrap.appendChild(createMffRecordRow(item, record, `Запись ${records.length - index}`, "", {
      up: canMoveRecord(records, index, -1),
      down: canMoveRecord(records, index, 1)
    }));
  });
  return wrap;
}

function createMffHeadRow(titles) {
  const headRow = document.createElement("div");
  headRow.className = "admin-line admin-line-head mff-line";
  for (const title of titles) {
    const heading = document.createElement("span");
    heading.textContent = title;
    headRow.appendChild(heading);
  }
  return headRow;
}

function createMffPinnedSection(rows) {
  const pinned = sortRecordEntriesByColor(rows.flatMap((item) => (
    mffRecords(item)
      .filter((record) => record.pinned)
      .map((record) => ({ item, record }))
  )));
  if (!pinned.length) return null;
  const section = document.createElement("section");
  section.className = "admin-group admin-pinned-group";

  const header = document.createElement("header");
  header.className = "admin-group-head";
  const label = document.createElement("span");
  label.className = "admin-group-label";
  const strong = document.createElement("strong");
  strong.textContent = "Pinned";
  const small = document.createElement("small");
  small.textContent = `${pinned.length} ${pinned.length === 1 ? "record" : "records"}`;
  label.append(strong, small);
  header.appendChild(label);
  section.appendChild(header);

  const list = document.createElement("div");
  list.className = "admin-lines mff-lines";
  list.appendChild(createMffHeadRow(["Gmail / Nickname", "", "Email", "YouTube username", ""]));
  pinned.forEach(({ item, record }, index) => {
    list.appendChild(createMffRecordRow(item, record, mffEmail(item), mffNickname(item) || `${Number(item.channels || 0)} channels`, {
      up: canMoveRecordEntry(pinned, index, -1),
      down: canMoveRecordEntry(pinned, index, 1)
    }));
  });
  section.appendChild(list);
  return section;
}

function renderMffRows(rows) {
  const fragment = document.createDocumentFragment();
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "admin-empty";
    empty.textContent = mffSearchQuery() ? "No matches" : "No Gmail rows";
    fragment.appendChild(empty);
    elements.mffRows.replaceChildren(fragment);
    return;
  }
  const pinnedSection = createMffPinnedSection(rows);
  if (pinnedSection) fragment.appendChild(pinnedSection);

  const section = document.createElement("section");
  section.className = "admin-group";
  const header = document.createElement("header");
  header.className = "admin-group-head";
  const label = document.createElement("span");
  label.className = "admin-group-label";
  const strong = document.createElement("strong");
  strong.textContent = "Gmail";
  const small = document.createElement("small");
  small.textContent = `${rows.length} ${rows.length === 1 ? "row" : "rows"}`;
  label.append(strong, small);
  header.appendChild(label);
  section.appendChild(header);

  const list = document.createElement("div");
  list.className = "admin-lines mff-lines";
  list.appendChild(createMffHeadRow(["Gmail", "Nickname", "Email", "YouTube username", ""]));

  for (const item of rows) {
    const email = mffEmail(item);
    const row = document.createElement("div");
    row.className = "admin-line mff-line";
    row.dataset.mffEmail = email;

    const gmailCell = document.createElement("div");
    gmailCell.className = "mff-email-cell";
    const strongEmail = document.createElement("strong");
    strongEmail.textContent = email;
    const smallCount = document.createElement("small");
    const count = Number(item.channels || 0);
    smallCount.textContent = `${count} ${count === 1 ? "channel" : "channels"}`;
    gmailCell.append(strongEmail, smallCount);

    const commit = createMffIconButton("commit-entry", "Save entry below this Gmail");
    commit.dataset.mffEmail = email;
    row.append(
      gmailCell,
      createMffInput(item, "nickname", "Nickname"),
      createMffInput(item, "field2", "Email"),
      createMffInput(item, "field3", "YouTube username"),
      commit
    );
    list.appendChild(row);
    const records = createMffRecords(item);
    if (records) list.appendChild(records);
  }

  section.appendChild(list);
  fragment.appendChild(section);
  elements.mffRows.replaceChildren(fragment);
}

function mffLinkedAccount(item) {
  const metadata = item.metadata || {};
  const account = item.account || {};
  const handle = adminValue(metadata.field3 || metadata.nickname || account.handle).trim();
  const name = adminValue(account.name).trim();
  return {
    handle,
    name: name && name !== handle ? name : "",
    count: Number(item.channels || 0)
  };
}

function renderMffSingleList(rows) {
  if (!elements.mffSingleList) return;
  const fragment = document.createDocumentFragment();
  const section = document.createElement("section");
  section.className = "mff-single-card";

  const header = document.createElement("header");
  const title = document.createElement("strong");
  title.textContent = "One Gmail = one account";
  const count = document.createElement("span");
  count.textContent = `${rows.length} ${rows.length === 1 ? "row" : "rows"}`;
  header.append(title, count);
  section.appendChild(header);

  const list = document.createElement("div");
  list.className = "mff-single-rows";
  for (const item of rows) {
    const linked = mffLinkedAccount(item);
    const row = document.createElement("div");
    row.className = "mff-single-row";

    const gmail = document.createElement("div");
    const gmailText = document.createElement("strong");
    gmailText.textContent = mffEmail(item);
    const gmailMeta = document.createElement("small");
    gmailMeta.textContent = `${linked.count} ${linked.count === 1 ? "channel" : "channels"}`;
    gmail.append(gmailText, gmailMeta);

    const account = document.createElement("div");
    const accountText = document.createElement("strong");
    accountText.textContent = linked.handle || "No account";
    const accountMeta = document.createElement("small");
    accountMeta.textContent = linked.name || "Linked YouTube account";
    account.append(accountText, accountMeta);

    row.append(gmail, account);
    list.appendChild(row);
  }
  section.appendChild(list);
  fragment.appendChild(section);
  elements.mffSingleList.replaceChildren(fragment);
}

function mffMetadataFromRows() {
  const metadata = {};
  for (const item of mffItems) {
    const email = mffEmail(item);
    if (email) metadata[email] = { ...(item.metadata || {}), field1: "" };
  }
  for (const input of elements.mffRows.querySelectorAll("[data-mff-email][data-mff-field]:not([data-record-id])")) {
    const email = input.dataset.mffEmail;
    const field = input.dataset.mffField;
    if (!email) continue;
    if (!metadata[email]) metadata[email] = { nickname: "", field1: "", field2: "", field3: "", records: [] };
    metadata[email][field] = adminValue(input.value).trim();
  }
  const recordBuckets = new Map();
  for (const row of elements.mffRows.querySelectorAll(".admin-group:not(.admin-pinned-group) .mff-record[data-mff-email][data-record-id]")) {
    const email = row.dataset.mffEmail;
    if (!email) continue;
    if (!metadata[email]) metadata[email] = { nickname: "", field1: "", field2: "", field3: "", records: [] };
    if (!recordBuckets.has(email)) recordBuckets.set(email, []);
    const record = {
      id: adminValue(row.dataset.recordId).replace(/[^A-Za-z0-9_-]/g, "") || adminRecordId(),
      field1: "",
      field2: adminValue(row.dataset.field2).trim(),
      field3: adminValue(row.dataset.field3).trim(),
      color: adminRecordColor(row.dataset.color),
      order: recordOrderValue(row.dataset, recordBuckets.get(email).length),
      manualOrder: row.dataset.manualOrder === "true",
      pinned: row.dataset.pinned === "true",
      createdAt: adminValue(row.dataset.createdAt),
      updatedAt: adminValue(row.dataset.updatedAt)
    };
    for (const input of row.querySelectorAll("[data-mff-record-field]")) {
      record[input.dataset.mffRecordField] = adminValue(input.value).trim();
    }
    if (record.field1 || record.field2 || record.field3) recordBuckets.get(email).push(record);
  }
  for (const [email, records] of recordBuckets) {
    metadata[email].records = records;
  }
  return metadata;
}

function syncVisibleMffMetadata() {
  const metadata = mffMetadataFromRows();
  mffItems = mffItems.map((item) => {
    const email = mffEmail(item);
    return {
      ...item,
      metadata: metadata[email] || item.metadata || {}
    };
  });
}

function renderMffView(prefix = "") {
  const query = mffSearchQuery();
  const rows = filteredMffItems();
  renderMffSingleList(rows);
  renderMffRows(rows);
  const summary = query ? `${rows.length}/${mffItems.length} shown · ${mffStatusSummary(rows)}` : mffStatusSummary(mffItems);
  setMffStatus(prefix ? `${prefix} · ${summary}` : summary);
}

async function loadMffMetadata() {
  if (mffLoading) return;
  mffLoading = true;
  setMffStatus("Loading");
  try {
    const response = await fetch("/api/admin/form-metadata", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not load metadata");
    mffItems = data.rows || [];
    renderMffView();
  } catch (error) {
    setMffStatus(error.message, true);
  } finally {
    mffLoading = false;
  }
}

async function saveMffMetadata(prefix = "Saved", render = true) {
  setMffStatus("Saving");
  try {
    syncVisibleMffMetadata();
    const response = await fetch("/api/admin/form-metadata", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ metadata: mffMetadataFromRows() })
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not save metadata");
    mffItems = data.rows || [];
    if (render) renderMffView(prefix);
    else setMffStatus(`${prefix} · ${mffStatusSummary(mffItems)}`);
  } catch (error) {
    setMffStatus(error.message, true);
  }
}

function queueMffAutosave(email = "", recordId = "", sourceRow = null) {
  if (email && recordId) {
    syncMffRecordDomValues(email, recordId, sourceRow);
  }
  clearTimeout(mffAutosaveTimer);
  mffAutosaveTimer = setTimeout(() => {
    mffAutosaveTimer = null;
    saveMffMetadata("Auto saved", false);
  }, 550);
}

async function commitMffEntry(email) {
  const row = findMffLine(email);
  if (!row) return;
  const values = { field1: "" };
  for (const field of ["field2", "field3"]) {
    values[field] = adminValue(row.querySelector(`[data-mff-field="${field}"]`)?.value).trim();
  }
  if (!values.field2 && !values.field3) {
    setMffStatus("Fill any column first", true);
    return;
  }
  syncVisibleMffMetadata();
  const item = mffItems.find((rowItem) => mffEmail(rowItem) === email);
  if (!item) return;
  const metadata = item.metadata || {};
  const now = new Date().toISOString();
  const currentRecords = mffRecords(item);
  item.metadata = {
    ...metadata,
    records: normalizeRecordOrders([
      { id: adminRecordId(), ...values, color: "", order: nextRecordOrderForColor(currentRecords, ""), manualOrder: false, pinned: false, createdAt: now, updatedAt: now },
      ...currentRecords
    ]).slice(0, 50)
  };
  renderMffView("Saving");
  await saveMffMetadata("Entry saved");
}

function editMffRecord(email, recordId) {
  syncVisibleMffMetadata();
  mffEditingRecords.add(mffRecordKey(email, recordId));
  renderMffView("Editing");
  requestAnimationFrame(() => {
    const input = [...elements.mffRows.querySelectorAll(`.mff-record[data-record-id="${recordId}"] textarea`)]
      .find((item) => item.closest(".mff-record")?.dataset.mffEmail === email);
    if (input) input.focus();
  });
}

async function finishMffRecordEdit(email, recordId, sourceRow = null) {
  clearTimeout(mffAutosaveTimer);
  mffAutosaveTimer = null;
  const now = new Date().toISOString();
  const values = syncMffRecordDomValues(email, recordId, sourceRow, now);
  syncVisibleMffMetadata();
  mffItems = mffItems.map((item) => {
    if (mffEmail(item) !== email) return item;
    return {
      ...item,
      metadata: {
        ...(item.metadata || {}),
        records: mffRecords(item).map((record) => (
          record.id === recordId ? { ...record, ...values, updatedAt: now } : record
        ))
      }
    };
  });
  mffEditingRecords.delete(mffRecordKey(email, recordId));
  await saveMffMetadata("Done", true);
}

async function setMffRecordColor(email, recordId, color) {
  syncVisibleMffMetadata();
  const cleanColor = adminRecordColor(color);
  if (!cleanColor) return;
  const now = new Date().toISOString();
  mffItems = mffItems.map((item) => {
    if (mffEmail(item) !== email) return item;
    const records = mffRecords(item);
    const order = nextRecordOrderForColor(records.filter((record) => record.id !== recordId), cleanColor);
    return {
      ...item,
      metadata: {
        ...(item.metadata || {}),
        records: normalizeRecordOrders(records.map((record) => (
          record.id === recordId ? {
            ...record,
            color: cleanColor,
            order,
            manualOrder: record.color === cleanColor ? Boolean(record.manualOrder) : false,
            updatedAt: now
          } : record
        )))
      }
    };
  });
  for (const row of mffRecordDomRows(email, recordId)) {
    row.dataset.color = cleanColor;
    row.dataset.updatedAt = now;
    row.classList.toggle("is-red", cleanColor === "red");
    row.classList.toggle("is-green", cleanColor === "green");
    row.classList.toggle("is-yellow", cleanColor === "yellow");
    for (const button of row.querySelectorAll(".admin-color-button")) {
      button.setAttribute("aria-pressed", String(button.dataset.color === cleanColor));
    }
  }
  renderMffView("Saving");
  await saveMffMetadata("Color saved", true);
}

async function moveMffRecord(email, recordId, direction, sourceRow = null) {
  if (sourceRow && sourceRow.closest(".admin-pinned-group")) {
    await moveMffPinnedRecord(email, recordId, direction, sourceRow);
    return;
  }
  clearTimeout(mffAutosaveTimer);
  mffAutosaveTimer = null;
  const now = new Date().toISOString();
  syncMffRecordDomValues(email, recordId, sourceRow, now);
  syncVisibleMffMetadata();
  let moved = false;
  mffItems = mffItems.map((item) => {
    if (mffEmail(item) !== email) return item;
    const result = moveRecordWithinColor(mffRecords(item), recordId, direction, now);
    moved = result.moved;
    return {
      ...item,
      metadata: {
        ...(item.metadata || {}),
        records: result.records
      }
    };
  });
  if (moved) renderMffView("Saving");
  await saveMffMetadata(moved ? "Moved" : "No move", true);
}

async function moveMffPinnedRecord(email, recordId, direction, sourceRow = null) {
  clearTimeout(mffAutosaveTimer);
  mffAutosaveTimer = null;
  const now = new Date().toISOString();
  syncMffRecordDomValues(email, recordId, sourceRow, now);
  syncVisibleMffMetadata();
  const entries = sortRecordEntriesByColor(mffItems.flatMap((item) => {
    const itemEmail = mffEmail(item);
    return mffRecords(item)
      .filter((record) => record.pinned)
      .map((record) => ({ item, record, email: itemEmail, key: mffRecordKey(itemEmail, record.id) }));
  }));
  const index = entries.findIndex((entry) => entry.email === email && entry.record.id === recordId);
  const target = index + direction;
  const moved = index >= 0
    && target >= 0
    && target < entries.length
    && recordColorRank(entries[index].record) === recordColorRank(entries[target].record);
  if (moved) {
    const next = entries.slice();
    [next[index], next[target]] = [next[target], next[index]];
    const movedColor = adminRecordColor(entries[index].record.color);
    const orders = new Map(next.map((entry, order) => [entry.key, order]));
    const changed = new Set([entries[index].key, entries[target].key]);
    mffItems = mffItems.map((item) => {
      const itemEmail = mffEmail(item);
      return {
        ...item,
        metadata: {
          ...(item.metadata || {}),
          records: mffRecords(item).map((record) => {
            const key = mffRecordKey(itemEmail, record.id);
            if (!orders.has(key)) return record;
            const ordered = {
              ...record,
              order: orders.get(key),
              manualOrder: adminRecordColor(record.color) === movedColor ? true : Boolean(record.manualOrder)
            };
            return changed.has(key) ? { ...ordered, updatedAt: now } : ordered;
          })
        }
      };
    });
    renderMffView("Saving");
  }
  await saveMffMetadata(moved ? "Moved" : "No move", true);
}

async function toggleMffRecordPin(email, recordId) {
  syncVisibleMffMetadata();
  let pinned = false;
  const now = new Date().toISOString();
  mffItems = mffItems.map((item) => {
    if (mffEmail(item) !== email) return item;
    return {
      ...item,
      metadata: {
        ...(item.metadata || {}),
        records: mffRecords(item).map((record) => {
          if (record.id !== recordId) return record;
          pinned = !record.pinned;
          return { ...record, pinned, updatedAt: now };
        })
      }
    };
  });
  for (const row of mffRecordDomRows(email, recordId)) {
    row.dataset.pinned = String(pinned);
    row.dataset.updatedAt = now;
    row.classList.toggle("is-pinned", pinned);
    const button = row.querySelector('[data-mff-action="toggle-record-pin"]');
    if (button) {
      button.textContent = pinned ? "Pinned" : "Pin";
      button.setAttribute("aria-pressed", String(pinned));
    }
  }
  await saveMffMetadata(pinned ? "Pinned" : "Unpinned", true);
}

function openMff() {
  elements.adminModal.hidden = true;
  elements.mffModal.hidden = false;
  elements.mffSearch.value = "";
  loadMffMetadata();
  setTimeout(() => elements.mffSearch.focus(), 0);
}

function closeMff() {
  elements.mffModal.hidden = true;
}

function isAccountConnected(account) {
  return account && account.connected !== false && !disconnectedAccountIds.has(account.id);
}

function connectedAccounts() {
  return accounts.filter(isAccountConnected);
}

function markAccountDisconnected(accountId) {
  if (!accountId) return;
  disconnectedAccountIds.add(accountId);
  const account = accounts.find((item) => item.id === accountId);
  if (account) {
    account.connected = false;
    account.connectionError = "Google login expired or was revoked. Reconnect this YouTube channel with Add.";
  }
}

function mainAccountEmail(account) {
  return adminValue(account.metadata && account.metadata.email).trim().toLowerCase();
}

function youtubeStudioUrl(account) {
  const studio = `https://studio.youtube.com/channel/${encodeURIComponent(account.id)}`;
  const email = mainAccountEmail(account);
  if (!email) return studio;
  const chooser = new URL("https://accounts.google.com/AccountChooser");
  chooser.searchParams.set("continue", studio);
  chooser.searchParams.set("Email", email);
  return chooser.toString();
}

function accountSearchText(account) {
  return [
    account.handle,
    account.name,
    account.id,
    mainAccountEmail(account),
    isAccountConnected(account) ? "connected" : "logged out"
  ].join(" ").toLowerCase();
}

function groupedMainAccounts(rows) {
  const groups = new Map();
  for (const account of rows) {
    const email = mainAccountEmail(account);
    const key = email || "other";
    if (!groups.has(key)) groups.set(key, { email, label: email || "Other accounts", accounts: [] });
    groups.get(key).accounts.push(account);
  }
  return [...groups.values()].sort((left, right) => left.label.localeCompare(right.label));
}

function reconnectPriority(account) {
  if (!isAccountConnected(account)) return 0;
  if (accountExpiryWarning(account)) return 1;
  return 2;
}

function reconnectState(account) {
  if (!isAccountConnected(account)) return "Login expired";
  if (accountExpiryWarning(account)) return "Expires soon";
  return "Connected";
}

function reconnectGroupLastLogin(group) {
  const timestamp = Math.max(0, ...group.accounts.map(accountConnectedTime));
  return timestamp ? formatRecordCreatedAt(timestamp) : "No saved login";
}

function reconnectGroups() {
  return groupedMainAccounts(accounts.filter((account) => mainAccountEmail(account)))
    .map((group) => ({
      ...group,
      accounts: group.accounts.slice().sort((left, right) => (
        reconnectPriority(left) - reconnectPriority(right)
        || accountName(left).localeCompare(accountName(right))
      ))
    }))
    .sort((left, right) => (
      Math.min(...left.accounts.map(reconnectPriority)) - Math.min(...right.accounts.map(reconnectPriority))
      || left.label.localeCompare(right.label)
    ));
}

function loadOauthMigration() {
  try {
    const saved = JSON.parse(localStorage.getItem(OAUTH_MIGRATION_STORAGE_KEY) || "null");
    if (!saved || !Array.isArray(saved.accountIds)) return null;
    const accountIds = [...new Set(saved.accountIds
      .map((accountId) => String(accountId || ""))
      .filter((accountId) => /^UC[A-Za-z0-9_-]{20,40}$/.test(accountId)))];
    if (!accountIds.length) return null;
    return {
      accountIds,
      index: Math.min(Math.max(0, Number(saved.index) || 0), accountIds.length),
      status: saved.status === "paused" ? "paused" : "waiting",
      scopeEmail: String(saved.scopeEmail || "").trim().toLowerCase()
    };
  } catch {
    return null;
  }
}

function saveOauthMigration() {
  try {
    if (oauthMigration) localStorage.setItem(OAUTH_MIGRATION_STORAGE_KEY, JSON.stringify(oauthMigration));
    else localStorage.removeItem(OAUTH_MIGRATION_STORAGE_KEY);
  } catch {}
}

function migrationCandidates(email = "") {
  const scopeEmail = String(email || "").trim().toLowerCase();
  return accounts
    .filter((account) => {
      const accountEmail = mainAccountEmail(account).toLowerCase();
      return accountEmail && !isAccountConnected(account) && (!scopeEmail || accountEmail === scopeEmail);
    })
    .slice()
    .sort((left, right) => (
      mainAccountEmail(left).localeCompare(mainAccountEmail(right))
      || reconnectPriority(left) - reconnectPriority(right)
      || accountName(left).localeCompare(accountName(right))
    ));
}

function currentOauthMigrationAccount() {
  if (!oauthMigration || oauthMigration.index >= oauthMigration.accountIds.length) return null;
  return accounts.find((account) => account.id === oauthMigration.accountIds[oauthMigration.index]) || null;
}

function oauthMigrationMatchesEmail(email) {
  if (!oauthMigration) return false;
  const scopeEmail = String(oauthMigration.scopeEmail || "").trim().toLowerCase();
  return Boolean(scopeEmail) && scopeEmail === String(email || "").trim().toLowerCase();
}

function migrationLabel(account = currentOauthMigrationAccount()) {
  if (!oauthMigration) return "";
  const total = oauthMigration.accountIds.length;
  const position = Math.min(oauthMigration.index + 1, total);
  return account
    ? `Migration ${position}/${total} · ${mainAccountEmail(account)} · ${accountName(account)}`
    : `Migration ${position}/${total}`;
}

function resolveOauthMigrationTarget() {
  while (oauthMigration && oauthMigration.index < oauthMigration.accountIds.length) {
    const account = currentOauthMigrationAccount();
    if (account && mainAccountEmail(account)) return account;
    oauthMigration.index += 1;
  }
  saveOauthMigration();
  return null;
}

function finishOauthMigration() {
  if (!oauthMigration) return;
  const total = oauthMigration.accountIds.length;
  oauthMigration = null;
  saveOauthMigration();
  if (oauthMigrationPopup && !oauthMigrationPopup.closed) {
    try { oauthMigrationPopup.close(); } catch {}
  }
  oauthMigrationPopup = null;
  renderReconnectPicker();
  renderAccounts();
  showNotice(`Migration complete: ${total} channels processed.`);
}

function renderOauthMigrationControls() {
  const candidates = migrationCandidates();
  const account = currentOauthMigrationAccount();
  if (!oauthMigration) {
    elements.reconnectBatch.textContent = candidates.length ? `Connect all (${candidates.length})` : "Connect all";
    elements.reconnectBatch.disabled = !configured || !candidates.length;
    elements.reconnectSkip.hidden = true;
    return;
  }

  const total = oauthMigration.accountIds.length;
  const position = Math.min(oauthMigration.index + 1, total);
  elements.reconnectBatch.disabled = false;
  elements.reconnectBatch.textContent = oauthMigration.status === "paused"
    ? `Retry ${position}/${total}`
    : `Pause ${position}/${total}`;
  elements.reconnectSkip.hidden = !account;
  elements.reconnectSkip.disabled = !account;
  elements.reconnectSkip.textContent = `Skip ${position}/${total}`;
}

function pauseOauthMigration() {
  if (!oauthMigration || oauthMigration.status !== "waiting") return;
  oauthMigration.status = "paused";
  saveOauthMigration();
  renderReconnectPicker();
  renderAccounts();
}

function navigateOauthMigrationPopup(url) {
  if (oauthMigrationPopup && !oauthMigrationPopup.closed) {
    try {
      oauthMigrationPopup.location.href = url;
      oauthMigrationPopup.focus();
      return true;
    } catch {}
  }
  const popup = window.open(url, "oauth-connect");
  if (!popup) return false;
  oauthMigrationPopup = popup;
  popup.focus();
  return true;
}

function launchOauthMigration() {
  if (!oauthMigration || oauthMigration.status !== "waiting") return;
  const account = resolveOauthMigrationTarget();
  if (!account) {
    finishOauthMigration();
    return;
  }
  saveOauthMigration();
  renderReconnectPicker();
  renderAccounts();
  const target = `/oauth/start?accountId=${encodeURIComponent(account.id)}&migration=1`;
  if (navigateOauthMigrationPopup(target)) {
    showNotice(`${migrationLabel(account)}. Choose this exact Gmail and YouTube channel in Google.`);
    return;
  }
  oauthMigration.status = "paused";
  saveOauthMigration();
  renderReconnectPicker();
  renderAccounts();
  showNotice("Allow the OAuth popup, then resume the migration.", true);
}

function startOauthMigration(email = "") {
  if (!configured) {
    showNotice("Import the OAuth client before starting the migration.", true);
    return;
  }
  const scopeEmail = String(email || "").trim().toLowerCase();
  const candidates = migrationCandidates(scopeEmail);
  if (!candidates.length) {
    showNotice(scopeEmail ? `No logged-out channels found for ${scopeEmail}.` : "No channels with Gmail mappings are available.", true);
    return;
  }
  oauthMigration = {
    accountIds: candidates.map((account) => account.id),
    index: 0,
    status: "waiting",
    scopeEmail
  };
  saveOauthMigration();
  launchOauthMigration();
}

function toggleOauthMigration() {
  if (!oauthMigration) {
    startOauthMigration();
    return;
  }
  if (oauthMigration.status === "waiting") {
    pauseOauthMigration();
    showNotice("Migration paused. Resume when ready.");
    return;
  }
  oauthMigration.status = "waiting";
  saveOauthMigration();
  launchOauthMigration();
}

function toggleOauthMigrationForEmail(email) {
  const scopeEmail = String(email || "").trim().toLowerCase();
  if (!scopeEmail) return;
  if (!oauthMigration) {
    startOauthMigration(scopeEmail);
    return;
  }
  if (!oauthMigrationMatchesEmail(scopeEmail)) {
    showNotice("Another reconnect queue is active. Pause or finish it first.", true);
    return;
  }
  if (oauthMigration.status === "waiting") {
    pauseOauthMigration();
    showNotice(`Reconnect queue paused for ${scopeEmail}.`);
    return;
  }
  oauthMigration.status = "waiting";
  saveOauthMigration();
  launchOauthMigration();
}

function skipOauthMigration() {
  if (!oauthMigration) return;
  const account = currentOauthMigrationAccount();
  const continueAutomatically = oauthMigration.status === "waiting";
  oauthMigration.index += 1;
  saveOauthMigration();
  if (oauthMigrationPopup && !oauthMigrationPopup.closed) {
    try { oauthMigrationPopup.close(); } catch {}
  }
  oauthMigrationPopup = null;
  if (!resolveOauthMigrationTarget()) {
    finishOauthMigration();
    return;
  }
  renderReconnectPicker();
  renderAccounts();
  showNotice(`${accountName(account || {})} skipped.`);
  if (continueAutomatically) window.setTimeout(launchOauthMigration, 250);
}

async function completeOauthMigrationAccount(payload) {
  if (!oauthMigration || !payload) return;
  const account = currentOauthMigrationAccount();
  if (!account || account.id !== payload.accountId) return;
  if (payload.status === "failed") {
    pauseOauthMigration();
    showNotice(`${migrationLabel(account)} paused: ${payload.message || "Google did not finish the connection."} Retry or Skip this channel.`, true);
    return;
  }
  if (payload.status !== "connected") return;
  oauthMigration.index += 1;
  saveOauthMigration();
  await loadAccounts(true);
  if (!resolveOauthMigrationTarget()) {
    finishOauthMigration();
    return;
  }
  renderReconnectPicker();
  renderAccounts();
  if (oauthMigration.status === "waiting") window.setTimeout(launchOauthMigration, 250);
}

function createReconnectEmpty(text) {
  const empty = document.createElement("div");
  empty.className = "reconnect-empty";
  empty.textContent = text;
  return empty;
}

function createReconnectChoice({ id, title, meta, state = "", stateTitle = "", priority = 2, selected = false }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `reconnect-choice${priority === 0 ? " is-expired" : priority === 1 ? " is-priority" : ""}`;
  button.dataset[id.kind] = id.value;
  button.setAttribute("aria-pressed", String(selected));

  const dot = document.createElement("i");
  dot.setAttribute("aria-hidden", "true");
  const copy = document.createElement("span");
  copy.className = "reconnect-choice-copy";
  const heading = document.createElement("strong");
  heading.textContent = title;
  const detail = document.createElement("span");
  detail.textContent = meta;
  copy.append(heading, detail);
  const badge = document.createElement("em");
  badge.textContent = state;
  if (stateTitle) badge.title = stateTitle;
  button.append(dot, copy, badge);
  return button;
}

function selectedReconnectAccount() {
  return accounts.find((account) => account.id === reconnectAccountId && mainAccountEmail(account) === reconnectEmail) || null;
}

function renderReconnectPicker() {
  const groups = reconnectGroups();
  if (!groups.some((group) => group.email === reconnectEmail)) {
    reconnectEmail = "";
    reconnectAccountId = "";
  }
  const selectedGroup = groups.find((group) => group.email === reconnectEmail) || null;
  if (selectedGroup && !selectedGroup.accounts.some((account) => account.id === reconnectAccountId)) reconnectAccountId = "";
  const target = selectedReconnectAccount();

  const gmailFragment = document.createDocumentFragment();
  if (!groups.length) {
    gmailFragment.appendChild(createReconnectEmpty("No saved Gmail mappings"));
  } else {
    for (const group of groups) {
      const priority = Math.min(...group.accounts.map(reconnectPriority));
      gmailFragment.appendChild(createReconnectChoice({
        id: { kind: "reconnectEmail", value: group.email },
        title: group.label,
        meta: `${group.accounts.length} ${group.accounts.length === 1 ? "channel" : "channels"}`,
      state: `Previous login: ${reconnectGroupLastLogin(group)}`,
      stateTitle: `Previous login for ${group.label}`,
        priority,
        selected: group.email === reconnectEmail
      }));
    }
  }
  elements.reconnectGmails.replaceChildren(gmailFragment);

  const channelFragment = document.createDocumentFragment();
  if (!selectedGroup) {
    channelFragment.appendChild(createReconnectEmpty("Select Gmail"));
  } else {
    for (const account of selectedGroup.accounts) {
      channelFragment.appendChild(createReconnectChoice({
        id: { kind: "reconnectAccountId", value: account.id },
        title: accountName(account),
        meta: account.name || account.id,
        state: reconnectState(account),
        priority: reconnectPriority(account),
        selected: account.id === reconnectAccountId
      }));
    }
  }
  elements.reconnectChannels.replaceChildren(channelFragment);

  elements.reconnectContinue.disabled = !target;
  elements.reconnectStatus.textContent = oauthMigration
    ? migrationLabel()
    : target
      ? `${reconnectEmail} · ${accountName(target)}`
      : reconnectEmail
        ? "Choose YouTube channel"
        : "Choose Gmail";
  renderOauthMigrationControls();
}

function openReconnectPicker() {
  reconnectEmail = "";
  reconnectAccountId = "";
  renderReconnectPicker();
  elements.reconnectModal.hidden = false;
  setTimeout(() => elements.reconnectGmails.querySelector("button")?.focus(), 0);
}

function closeReconnectPicker() {
  pauseOauthMigration();
  elements.reconnectModal.hidden = true;
}

function openAuthorizationWindow(url, notice, options = {}) {
  const popup = window.open(url, "oauth-connect");
  if (!popup) {
    if (!options.requirePopup) window.location.assign(url);
    else showNotice("Allow the OAuth popup, then resume the migration.", true);
    return null;
  }
  popup.focus();
  showNotice(notice);
  if (!options.deferRefresh) setTimeout(() => loadAccounts(true), 2500);
  return popup;
}

function continueReconnect() {
  if (oauthMigration) {
    showNotice("Retry or Skip the queued channel before reconnecting manually.", true);
    return;
  }
  const account = selectedReconnectAccount();
  if (!account) return;
  const email = mainAccountEmail(account);
  if (!email) {
    showNotice("This channel has no Gmail mapping.", true);
    return;
  }
  closeReconnectPicker();
  openAuthorizationWindow(
    `/oauth/start?accountId=${encodeURIComponent(account.id)}`,
    `Google opened for ${email}. Select ${accountName(account)} exactly, then approve YouTube permission.`
  );
}

function continueNewGoogleAccount() {
  if (oauthMigration) {
    showNotice("Retry or Skip the queued channel before connecting a new Gmail manually.", true);
    return;
  }
  closeReconnectPicker();
  openAuthorizationWindow("/oauth/start", "Google authorization opened. Approve YouTube permission if Google asks, then return here.");
}

function renderAccounts() {
  const query = elements.search.value.trim().toLowerCase();
  const filtered = accounts.filter((account) => accountSearchText(account).includes(query));
  const connectedCount = connectedAccounts().length;
  const loggedOutCount = accounts.length - connectedCount;
  const migrationKey = oauthMigration
    ? `${oauthMigration.accountIds.join(",")}:${oauthMigration.index}:${oauthMigration.status}:${oauthMigration.scopeEmail || ""}`
    : "idle";
  const renderKey = `${configured}:${oauthAutomation.publishingStatus || "testing"}:${migrationKey}:${query}:${connectedCount}:${loggedOutCount}|${filtered.map((account) => `${account.id}:${account.handle}:${account.name}:${account.avatar}:${account.connected}:${account.connectedAt || ""}:${account.connectionError || ""}:${account.oauth && account.oauth.refreshTokenExpiresAt || ""}:${account.oauth && account.oauth.lastCheckedAt || ""}:${mainAccountEmail(account)}`).join("|")}`;
  if (renderKey === accountRenderKey) {
    for (const [id, row] of accountRows) row.setAttribute("aria-selected", String(Boolean(selected && selected.id === id)));
    return;
  }
  accountRenderKey = renderKey;
  accountRows.clear();
  const fragment = document.createDocumentFragment();
  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "no-results";
    empty.textContent = query ? "No matching channels" : configured ? "No channels connected yet" : "Import OAuth JSON to begin";
    fragment.appendChild(empty);
    elements.list.replaceChildren(fragment);
    return;
  }
  const label = document.createElement("div");
  label.className = "window-group";
  label.textContent = `${connectedCount} connected · ${loggedOutCount} logged out`;
  fragment.appendChild(label);
  for (const group of groupedMainAccounts(filtered)) {
    const connectedInGroup = group.accounts.filter(isAccountConnected).length;
    const loggedOutInGroup = group.accounts.length - connectedInGroup;
    const groupLabel = document.createElement("div");
    groupLabel.className = "account-gmail-group";
    const groupCopy = document.createElement("div");
    groupCopy.className = "account-gmail-copy";
    const gmail = document.createElement("strong");
    gmail.textContent = group.label;
    const meta = document.createElement("span");
    meta.textContent = `${group.accounts.length} ${group.accounts.length === 1 ? "channel" : "channels"}${loggedOutInGroup ? ` · ${loggedOutInGroup} logged out` : ""}`;
    groupCopy.append(gmail, meta);
    groupLabel.appendChild(groupCopy);
    if (loggedOutInGroup) {
      const activeQueue = oauthMigrationMatchesEmail(group.label);
      const actions = document.createElement("div");
      actions.className = "account-gmail-actions";
      const queueButton = document.createElement("button");
      queueButton.type = "button";
      queueButton.className = `gmail-reconnect-action${activeQueue ? " is-active" : ""}`;
      queueButton.dataset.reconnectGmailBatch = group.label;
      queueButton.disabled = !configured || Boolean(oauthMigration && !activeQueue);
      if (activeQueue && oauthMigration) {
        const position = Math.min(oauthMigration.index + 1, oauthMigration.accountIds.length);
        queueButton.textContent = oauthMigration.status === "waiting" ? `Pause ${position}/${oauthMigration.accountIds.length}` : `Retry ${position}/${oauthMigration.accountIds.length}`;
      } else {
        queueButton.textContent = `Reconnect ${loggedOutInGroup}`;
      }
      queueButton.title = `Reconnect logged-out channels for ${group.label}`;
      actions.appendChild(queueButton);
      if (activeQueue && oauthMigration) {
        const skipButton = document.createElement("button");
        skipButton.type = "button";
        skipButton.className = "gmail-reconnect-action gmail-reconnect-skip";
        skipButton.dataset.reconnectMigrationSkip = "true";
        skipButton.textContent = "Skip";
        skipButton.title = "Skip the current channel in this reconnect queue";
        actions.appendChild(skipButton);
      }
      groupLabel.appendChild(actions);
    }
    fragment.appendChild(groupLabel);

    for (const account of group.accounts) {
      const connected = isAccountConnected(account);
      const expiringSoon = accountExpiryWarning(account);
      const shell = document.createElement("div");
      shell.className = `account-row-shell${connected ? "" : " is-logged-out"}${expiringSoon ? " is-expiring-soon" : ""}`;

      const button = document.createElement("button");
      button.type = "button";
      button.className = `account-row${connected ? "" : " is-logged-out"}`;
      button.role = "option";
      button.dataset.accountId = account.id;
      button.disabled = !connected;
      button.title = connected ? "" : (account.connectionError || "Logged out - reconnect with Add");
      button.setAttribute("aria-selected", String(connected && selected && selected.id === account.id));

      const avatar = document.createElement(account.avatar ? "img" : "span");
      avatar.className = "avatar";
      if (account.avatar) {
        avatar.src = account.avatar;
        avatar.alt = "";
        avatar.referrerPolicy = "no-referrer";
        avatar.loading = "lazy";
        avatar.decoding = "async";
      } else {
        avatar.textContent = initials(account);
      }

      const info = document.createElement("span");
      info.className = "account-info";
      const strong = document.createElement("strong");
      strong.textContent = accountName(account);
      const detail = document.createElement("span");
      detail.textContent = `${account.handle ? account.name : `Channel ${account.id.slice(-8)}`}${connected ? "" : ` · ${account.connectionError ? "login expired" : "logged out"}`}`;
      info.append(strong, detail);
      if (account.connectedAt) info.appendChild(createAccountDateTime(account.connectedAt, "account-login-time"));
      if (expiringSoon) info.appendChild(createAccountExpiryCountdown(accountTestingExpiryTime(account)));

      const status = document.createElement("span");
      status.className = "account-status";
      button.append(avatar, info, status);

      const studio = document.createElement("a");
      studio.className = "account-studio-link";
      studio.href = youtubeStudioUrl(account);
      studio.target = "_blank";
      studio.rel = "noopener noreferrer";
      studio.title = `Open ${accountName(account)} in YouTube Studio${mainAccountEmail(account) ? ` as ${mainAccountEmail(account)}` : ""}`;
      studio.setAttribute("aria-label", studio.title);
      studio.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M13 11l6-6M19 13v6H5V5h6"/></svg>';

      shell.append(button, studio);
      accountRows.set(account.id, button);
      fragment.appendChild(shell);
    }
  }
  elements.list.replaceChildren(fragment);
}

function selectAccount(account, focusMessage = false) {
  if (!account || !isAccountConnected(account)) return;
  const previousId = selected && selected.id;
  const changed = !selected || selected.id !== account.id;
  const liveAccounts = connectedAccounts();
  selected = account;
  localStorage.setItem("account-control-selected", account.id);
  if (changed) hideNotice();
  elements.selectedHandle.textContent = accountName(account);
  elements.selectedMeta.textContent = account.name || `Channel ${account.id.slice(-10)}`;
  elements.empty.hidden = true;
  elements.composer.hidden = false;
  elements.previousAccount.disabled = liveAccounts.length < 2;
  elements.nextAccount.disabled = liveAccounts.length < 2;
  if (previousId && accountRows.has(previousId)) accountRows.get(previousId).setAttribute("aria-selected", "false");
  if (accountRows.has(account.id)) accountRows.get(account.id).setAttribute("aria-selected", "true");
  ensureStarterMessage(focusMessage);
}

function cycleAccount(offset) {
  const liveAccounts = connectedAccounts();
  if (!liveAccounts.length) return;
  const current = selected ? liveAccounts.findIndex((account) => account.id === selected.id) : -1;
  const index = (current + offset + liveAccounts.length) % liveAccounts.length;
  selectAccount(liveAccounts[index], true);
}

function advanceAfterSend(sender) {
  const liveAccounts = connectedAccounts();
  if (!sender || liveAccounts.length < 2) return null;
  if (selected && selected.id !== sender.id) return null;
  const current = liveAccounts.findIndex((account) => account.id === sender.id);
  if (current === -1) return null;
  const next = liveAccounts[(current + 1) % liveAccounts.length];
  selectAccount(next, true);
  return next;
}

function sendBatchAccounts() {
  if (!selected || !isAccountConnected(selected)) return [];
  const liveAccounts = connectedAccounts();
  const start = liveAccounts.findIndex((account) => account.id === selected.id);
  if (start === -1) return [];
  const count = Math.min(sendBatchSize(), liveAccounts.length);
  const picked = [];
  const seen = new Set();
  for (let offset = 0; offset < liveAccounts.length && picked.length < count; offset += 1) {
    const account = liveAccounts[(start + offset) % liveAccounts.length];
    if (!account || seen.has(account.id)) continue;
    seen.add(account.id);
    picked.push(account);
  }
  return picked;
}

function advanceAfterBatch(senders) {
  const liveAccounts = connectedAccounts();
  if (!senders.length || liveAccounts.length < 2) return null;
  if (selected && selected.id !== senders[0].id) return null;
  const last = senders[senders.length - 1];
  const current = liveAccounts.findIndex((account) => account.id === last.id);
  if (current === -1) return null;
  const next = liveAccounts[(current + 1) % liveAccounts.length];
  selectAccount(next, true);
  return next;
}

function renderActivity(items = []) {
  activityItems = items;
  const renderKey = items.slice(0, 10).map((item) => `${item.id}:${item.type}:${friendlyErrorText(item.text)}:${item.at}`).join("|");
  if (renderKey === activityRenderKey) return;
  activityRenderKey = renderKey;
  elements.activity.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "activity-empty";
    empty.textContent = "No actions yet";
    elements.activity.appendChild(empty);
    return;
  }
  for (const item of items.slice(0, 10)) {
    const row = document.createElement("div");
    row.className = `activity-item ${String(item.type || "").replace(/[^a-z-]/gi, "")}`;
    const strong = document.createElement("strong");
    strong.textContent = friendlyErrorText(item.text);
    const time = document.createElement("time");
    time.dateTime = item.at;
    time.textContent = new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    row.append(strong, time);
    elements.activity.appendChild(row);
  }
}

function prependActivity(type, text) {
  renderActivity([{ id: `local-${Date.now()}`, type, text: friendlyErrorText(text), at: new Date().toISOString() }, ...activityItems].slice(0, 100));
}

function visibleEconomicEvents(events) {
  const now = Date.now();
  const astanaDay = Math.floor((now + ASTANA_OFFSET_MS) / (24 * 60 * 60 * 1000));
  const todayAndTomorrow = events.filter((event) => {
    const time = new Date(event.date).getTime();
    const eventDay = Math.floor((time + ASTANA_OFFSET_MS) / (24 * 60 * 60 * 1000));
    return Number.isFinite(time) && eventDay >= astanaDay && eventDay <= astanaDay + 1;
  });
  if (todayAndTomorrow.length) return todayAndTomorrow.slice(0, 30);
  return events.filter((event) => new Date(event.date).getTime() >= now).slice(0, 20);
}

function calendarDayLabel(date) {
  return date.toLocaleDateString("en-GB", { timeZone: ASTANA_TIME_ZONE, weekday: "short", month: "short", day: "numeric" });
}

function calendarDayKey(date) {
  return date.toLocaleDateString("en-CA", { timeZone: ASTANA_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
}

function calendarValue(label, value) {
  const span = document.createElement("span");
  const name = document.createElement("b");
  name.textContent = `${label}:`;
  span.append(name, ` ${value || "-"}`);
  return span;
}

function reactionValue(move) {
  const span = document.createElement("span");
  const hasPercent = move && move.percent != null && move.percent !== "";
  const hasPrice = move && move.price != null && move.price !== "";
  const percent = hasPercent ? Number(move.percent) : NaN;
  const price = hasPrice ? Number(move.price) : NaN;
  if (!Number.isFinite(percent)) {
    span.className = "is-waiting";
    span.textContent = "-";
    return span;
  }
  span.className = percent > 0 ? "is-up" : percent < 0 ? "is-down" : "is-flat";
  span.textContent = `${percent > 0 ? "+" : ""}${percent.toFixed(2)}%`;
  if (Number.isFinite(price)) span.title = `Price ${price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return span;
}

function marketReactionPanel(event) {
  const section = document.createElement("section");
  section.className = "economic-market-reactions";
  const heading = document.createElement("div");
  heading.className = "economic-market-reactions-head";
  const title = document.createElement("strong");
  title.textContent = "Recorded market reaction";
  const note = document.createElement("span");
  note.textContent = "Delayed data · SQLite";
  heading.append(title, note);

  const grid = document.createElement("div");
  grid.className = "economic-market-reactions-grid";
  for (const label of ["Market", "+5m", "+15m", "+30m", "+60m"]) {
    const cell = document.createElement("b");
    cell.textContent = label;
    grid.appendChild(cell);
  }
  for (const reaction of event.marketReactions || []) {
    const label = document.createElement("strong");
    label.textContent = reaction.label || reaction.instrument;
    grid.appendChild(label);
    for (const horizon of ["5", "15", "30", "60"]) grid.appendChild(reactionValue(reaction.moves && reaction.moves[horizon]));
  }
  section.append(heading, grid);
  return section;
}

function refreshNextEconomicEvent() {
  const now = Date.now();
  const next = economicCalendarEvents.find((event) => new Date(event.date).getTime() >= now);
  for (const row of elements.economicCalendarList.querySelectorAll(".economic-event")) {
    const active = Boolean(next && row.dataset.eventId === next.id);
    row.classList.toggle("is-next", active);
    const badge = row.querySelector(".economic-event-next");
    if (badge) badge.hidden = !active;
  }
}

function scrollEconomicCalendarToNext() {
  const next = elements.economicCalendarList.querySelector(".economic-event.is-next");
  if (!next) return;
  const stickyHeight = elements.economicCalendarList.querySelector(".economic-calendar-day")?.offsetHeight || 0;
  const listTop = elements.economicCalendarList.getBoundingClientRect().top;
  const nextTop = next.getBoundingClientRect().top - listTop + elements.economicCalendarList.scrollTop;
  elements.economicCalendarList.scrollTop = Math.max(0, nextTop - stickyHeight);
}

function renderEconomicCalendar(events = [], { focusNext = false } = {}) {
  const rows = visibleEconomicEvents(events);
  const nextEvent = rows.find((event) => new Date(event.date).getTime() >= Date.now());
  const fragment = document.createDocumentFragment();
  let previousDay = "";
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "economic-calendar-empty";
    empty.textContent = "No upcoming events in this weekly feed";
    fragment.appendChild(empty);
  }
  for (const event of rows) {
    const date = new Date(event.date);
    const dayKey = calendarDayKey(date);
    if (dayKey !== previousDay) {
      const heading = document.createElement("div");
      heading.className = "economic-calendar-day";
      heading.textContent = calendarDayLabel(date);
      fragment.appendChild(heading);
      previousDay = dayKey;
    }

    const row = document.createElement("article");
    row.className = "economic-event";
    if (nextEvent && nextEvent.id === event.id) row.classList.add("is-next");
    row.dataset.eventId = event.id;

    const main = document.createElement("div");
    main.className = "economic-event-main";
    const time = document.createElement("time");
    time.className = "economic-event-time";
    time.dateTime = event.date;
    time.textContent = date.toLocaleTimeString("en-GB", { timeZone: ASTANA_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false });
    const impact = document.createElement("span");
    impact.className = `economic-event-impact is-${String(event.impact || "Low").toLowerCase()}`;
    impact.title = `${event.impact || "Low"} impact`;

    const copy = document.createElement("div");
    copy.className = "economic-event-copy";
    const title = document.createElement("strong");
    const country = document.createElement("span");
    country.textContent = event.country;
    const next = document.createElement("em");
    next.className = "economic-event-next";
    next.textContent = "NEXT";
    next.hidden = !(nextEvent && nextEvent.id === event.id);
    title.append(country, event.title, next);
    const values = document.createElement("div");
    values.className = "economic-event-values";
    values.append(calendarValue("A", event.actual), calendarValue("F", event.forecast), calendarValue("P", event.previous));
    copy.append(title, values);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "economic-event-insight";
    button.dataset.calendarInsight = event.id;
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", `Show market scenario for ${event.title}`);
    button.title = "Impact and expected direction";
    button.textContent = "!";

    const analysis = document.createElement("section");
    analysis.className = "economic-event-analysis";
    analysis.dataset.calendarAnalysis = event.id;
    analysis.hidden = true;
    const analysisHead = document.createElement("header");
    const analysisLabel = document.createElement("span");
    analysisLabel.textContent = "Expected scenario";
    const direction = document.createElement("strong");
    direction.className = `is-${event.insight && event.insight.direction || "mixed"}`;
    direction.textContent = event.insight && event.insight.label || "Market \u2194";
    analysisHead.append(analysisLabel, direction);
    const explanation = document.createElement("p");
    explanation.textContent = event.insight && event.insight.summary || "Direction is uncertain before the release.";
    const affected = document.createElement("small");
    affected.textContent = `Can affect: ${event.insight && event.insight.assets || "risk assets"} \u00b7 Confidence: ${event.insight && event.insight.confidence || "Low"}`;
    analysis.append(analysisHead, explanation, affected, marketReactionPanel(event));

    main.append(time, impact, copy, button);
    row.append(main, analysis);
    fragment.appendChild(row);
  }
  elements.economicCalendarList.replaceChildren(fragment);
  elements.economicCalendarSummary.textContent = `${rows.length} events`;
  if (focusNext) requestAnimationFrame(scrollEconomicCalendarToNext);
}

async function loadEconomicCalendar(force = false) {
  clearTimeout(economicCalendarTimer);
  elements.economicCalendarRefresh.disabled = true;
  elements.economicCalendarStatus.textContent = force ? "Refreshing" : "Loading events";
  try {
    const response = await fetch(`/api/economic-calendar${force ? "?refresh=1" : ""}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Calendar is unavailable");
    const firstLoad = !economicCalendarEvents.length;
    economicCalendarEvents = data.events || [];
    renderEconomicCalendar(economicCalendarEvents, { focusNext: firstLoad || force });
    const refreshed = data.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString("en-GB", { timeZone: ASTANA_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }) : "now";
    elements.economicCalendarStatus.textContent = `${data.stale ? "Cached" : "Updated"} ${refreshed} · Astana`;
  } catch (error) {
    elements.economicCalendarSummary.textContent = "Unavailable";
    elements.economicCalendarStatus.textContent = friendlyErrorText(error.message);
    if (!elements.economicCalendarList.children.length) renderEconomicCalendar([]);
  } finally {
    elements.economicCalendarRefresh.disabled = false;
    economicCalendarTimer = setTimeout(() => loadEconomicCalendar(), 5 * 60 * 1000);
  }
}

function renderQuota(quota) {
  if (!quota || !quota.totals) {
    elements.quotaDay.textContent = "Pacific day";
    elements.quotaTotal.textContent = "0 estimated units · 0 requests";
    return;
  }
  elements.quotaDay.textContent = quota.day ? `PT ${quota.day}` : "Pacific day";
  elements.quotaTotal.textContent = `${new Intl.NumberFormat().format(quota.totals.estimatedUnits || 0)} estimated units · ${new Intl.NumberFormat().format(quota.totals.requests || 0)} requests`;
}

function scheduleAccountRefresh(delay = 1500) {
  clearTimeout(accountRefreshTimer);
  accountRefreshTimer = setTimeout(() => loadAccounts(), delay);
}

function renderSetup() {
  const liveCount = connectedAccounts().length;
  elements.oauthMissing.hidden = configured;
  elements.oauthReady.hidden = !configured;
  setConnection(configured ? "online" : "error", configured ? `${liveCount} channels ready` : "Setup required");
}

function applyAccountsPayload(data) {
  configured = Boolean(data.configured);
  oauthAutomation = data.oauthAutomation && typeof data.oauthAutomation === "object"
    ? data.oauthAutomation
    : { publishingStatus: "testing" };
  accounts = data.accounts || [];
  disconnectedAccountIds.clear();
  for (const account of accounts) {
    if (account && account.connected === false) disconnectedAccountIds.add(account.id);
  }
  const liveAccounts = connectedAccounts();
  const selectedId = selected && selected.id;
  selected = selectedId ? liveAccounts.find((account) => account.id === selectedId) || null : null;
  if (!selected && liveAccounts.length) {
    const preferred = localStorage.getItem("account-control-selected");
    selectAccount(liveAccounts.find((account) => account.id === preferred) || liveAccounts[0], false);
  } else if (selected) {
    selectAccount(selected, false);
  }
  if (!selected) {
    elements.selectedHandle.textContent = "Choose a channel";
    elements.selectedMeta.textContent = "No channel selected";
    elements.empty.hidden = false;
    elements.composer.hidden = true;
    elements.previousAccount.disabled = true;
    elements.nextAccount.disabled = true;
  }
  const loggedOutCount = Math.max(0, accounts.length - liveAccounts.length);
  elements.count.textContent = configured
    ? `${liveAccounts.length} connected${loggedOutCount ? ` · ${loggedOutCount} logged out` : ""}`
    : "OAuth client needed";
  renderSetup();
  renderAccounts();
  if (!elements.reconnectModal.hidden) renderReconnectPicker();
  renderSubscribeChecklist();
  if (data.quota) renderQuota(data.quota);
  if (data.activity) renderActivity(data.activity);
}

function scheduleAccountVerify(delay = 600) {
  clearTimeout(accountVerifyTimer);
  accountVerifyTimer = setTimeout(verifyAccounts, delay);
}

async function verifyAccounts() {
  if (!configured || !connectedAccounts().length) return;
  if (Date.now() - lastAccountVerifyAt < 5 * 60 * 1000) return;
  lastAccountVerifyAt = Date.now();
  try {
    const response = await fetch("/api/accounts/verify", { method: "POST", cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not verify accounts");
    applyAccountsPayload(data);
    if (data.invalid && data.invalid.length) {
      const names = data.invalid.slice(0, 3).map((row) => row.handle || row.accountId).join(", ");
      showNotice(`${data.invalid.length} login expired: ${names}. Reconnect with Add.`, true);
    }
  } catch {
    lastAccountVerifyAt = 0;
  }
}

async function loadAccounts(manual = false) {
  if (loadingAccounts) return;
  loadingAccounts = true;
  if (manual) elements.refresh.disabled = true;
  try {
    const response = await fetch("/api/accounts", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not load connected channels");
    applyAccountsPayload(data);
    scheduleAccountVerify(manual ? 0 : 600);
  } catch (error) {
    setConnection("error", "API unavailable");
    elements.count.textContent = "Connection needed";
    if (manual) showNotice(error.message, true);
  } finally {
    loadingAccounts = false;
    elements.refresh.disabled = false;
  }
}

function isNearChatBottom() {
  return elements.chatFeed.scrollHeight - elements.chatFeed.scrollTop - elements.chatFeed.clientHeight < 90;
}

function scrollChatToBottom(smooth = false) {
  elements.chatFeed.scrollTo({ top: elements.chatFeed.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  elements.jumpLatest.hidden = true;
}

function messageText(message) {
  if (message.text) return message.text;
  if (message.type === "messageDeletedEvent") return "A message was deleted";
  if (message.type === "userBannedEvent") return "A user was hidden from this chat";
  if (message.type === "newSponsorEvent") return `${message.author.name} became a member`;
  return "Live-chat event";
}

function createChatMessage(message) {
  const row = document.createElement("article");
  row.className = "chat-message";
  if (message.amount) row.classList.add("super");
  if (message.outgoing) row.classList.add("outgoing");
  if (message.type !== "textMessageEvent" && !message.text) row.classList.add("system");
  row.dataset.messageId = message.id;

  const avatar = document.createElement(message.author.avatar ? "img" : "span");
  avatar.className = "chat-avatar";
  if (message.author.avatar) {
    avatar.src = message.author.avatar;
    avatar.alt = "";
    avatar.referrerPolicy = "no-referrer";
    avatar.loading = "lazy";
    avatar.decoding = "async";
  } else {
    avatar.textContent = initials(message.author.name);
  }

  const copy = document.createElement("div");
  copy.className = "chat-copy";
  const line = document.createElement("div");
  line.className = "chat-line";
  const author = document.createElement("span");
  author.className = "chat-author";
  if (message.author.owner) author.classList.add("owner");
  else if (message.author.moderator) author.classList.add("moderator");
  else if (message.author.sponsor) author.classList.add("sponsor");
  author.textContent = message.author.name;
  const time = document.createElement("time");
  time.className = "chat-time";
  time.dateTime = message.publishedAt;
  time.textContent = message.publishedAt ? new Date(message.publishedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  line.append(author, time);
  if (message.amount) {
    const amount = document.createElement("span");
    amount.className = "chat-amount";
    amount.textContent = message.amount;
    line.appendChild(amount);
  }
  const text = document.createElement("p");
  text.className = "chat-text";
  text.textContent = messageText(message);
  copy.append(line, text);
  row.append(avatar, copy);
  return row;
}

function appendChatMessages(messages) {
  const shouldFollow = isNearChatBottom();
  let added = 0;
  const fragment = document.createDocumentFragment();
  for (const message of messages) {
    if (!message.id || chatMessageIds.has(message.id)) continue;
    chatMessageIds.add(message.id);
    fragment.appendChild(createChatMessage(message));
    added += 1;
  }
  if (added) {
    elements.chatFeed.appendChild(fragment);
    chatNodeCount += added;
  }
  while (chatNodeCount > 250) {
    const oldest = elements.chatFeed.querySelector(":scope > .chat-message");
    if (!oldest) break;
    chatMessageIds.delete(oldest.dataset.messageId);
    oldest.remove();
    chatNodeCount -= 1;
  }
  if (added) {
    elements.chatEmpty.hidden = true;
    if (shouldFollow) scrollChatToBottom();
    else elements.jumpLatest.hidden = false;
  }
}

function notificationTitle(type) {
  if (type === "stream-open") return "Stream connected";
  if (type === "stream-ended") return "Stream ended";
  if (type === "detected") return "Form link detected";
  if (type === "giveaway") return "Giveaway mentioned";
  if (type === "keyword") return "Keyword mentioned";
  if (type === "complete") return "Form Scanner complete";
  if (type === "failed") return "Form Scanner failed";
  if (type === "error") return "Stream monitor error";
  if (type === "stopped") return "Form Scanner stopped";
  if (type === "generating") return "Generating comments";
  if (type === "filled") return "Account filled";
  if (type === "armed") return "Watching stream";
  return "Stream notification";
}

function notificationNeedsSound(type) {
  return ["giveaway", "keyword", "detected", "complete", "failed", "error", "stopped", "stream-ended"].includes(type);
}

function readNotificationVolume() {
  const stored = localStorage.getItem(NOTIFICATION_VOLUME_KEY);
  if (stored == null) return 0.7;
  const value = Number(stored);
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.7;
}

function getNotificationAudio() {
  if (!notificationAudio) {
    notificationAudio = document.createElement("audio");
    notificationAudio.src = NOTIFICATION_SOUND_SRC;
    notificationAudio.preload = "auto";
  }
  return notificationAudio;
}

function renderNotifications() {
  elements.notificationsBadge.hidden = notificationUnread <= 0;
  elements.notificationsBadge.textContent = notificationUnread > 99 ? "99+" : String(notificationUnread);
  elements.notificationsSound.textContent = notificationSoundEnabled ? "Sound on" : "Sound off";
  elements.notificationsSound.setAttribute("aria-pressed", String(notificationSoundEnabled));
  const volumePercent = String(Math.round(notificationSoundVolume * 100));
  elements.notificationsVolume.value = volumePercent;
  elements.notificationsVolume.disabled = !notificationSoundEnabled;
  elements.notificationsVolumeValue.textContent = `${volumePercent}%`;
  elements.notificationsStatus.textContent = notificationItems.length
    ? `${notificationItems.length} stream ${notificationItems.length === 1 ? "event" : "events"}`
    : "No stream events yet";

  const fragment = document.createDocumentFragment();
  if (!notificationItems.length) {
    const empty = document.createElement("div");
    empty.className = "notifications-empty";
    empty.textContent = "YouTube stream and Form Scanner events will appear here.";
    fragment.appendChild(empty);
    elements.notificationsList.replaceChildren(fragment);
    return;
  }
  for (const item of notificationItems.slice(0, 80)) {
    const row = document.createElement("article");
    row.className = `notification-item is-${item.type || "info"}`;
    const head = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = item.title;
    const time = document.createElement("time");
    time.dateTime = item.at;
    time.textContent = new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    head.append(title, time);
    const body = document.createElement("p");
    body.textContent = item.text;
    row.append(head, body);
    fragment.appendChild(row);
  }
  elements.notificationsList.replaceChildren(fragment);
}

async function unlockNotificationSound() {
  if (!notificationSoundEnabled || notificationSoundUnlocked) return;
  try {
    const audio = getNotificationAudio();
    audio.volume = 0;
    audio.currentTime = 0;
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    notificationSoundUnlocked = true;
  } catch {
    notificationSoundUnlocked = false;
  }
}

function playNotificationSound(type = "info") {
  if (!notificationSoundEnabled) return;
  unlockNotificationSound().then(() => {
    if (!notificationSoundUnlocked) return;
    const audio = getNotificationAudio().cloneNode(true);
    audio.volume = notificationSoundVolume;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }).catch(() => {});
}

async function setNotificationVolume(value, { preview = false } = {}) {
  const next = Math.min(100, Math.max(0, Number(value)));
  notificationSoundVolume = Number.isFinite(next) ? next / 100 : 0.7;
  localStorage.setItem(NOTIFICATION_VOLUME_KEY, String(notificationSoundVolume));
  renderNotifications();
  if (preview && notificationSoundEnabled) {
    await unlockNotificationSound();
    playNotificationSound("detected");
  }
}

function addNotification(event, { sound = true } = {}) {
  if (!event) return;
  const id = event.id || `notification-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  if (notificationIds.has(id)) return;
  notificationIds.add(id);
  const item = {
    id,
    type: event.type || "info",
    title: notificationTitle(event.type),
    text: friendlyErrorText(event.text || ""),
    at: event.at || new Date().toISOString()
  };
  notificationItems.unshift(item);
  if (notificationItems.length > 100) {
    for (const old of notificationItems.splice(100)) notificationIds.delete(old.id);
  }
  if (elements.notificationsModal.hidden) notificationUnread += 1;
  renderNotifications();
  if (sound && notificationNeedsSound(item.type)) playNotificationSound(item.type);
}

function addFormWatcherNotifications(events = [], options = {}) {
  for (const event of events) addNotification(event, options);
}

async function openNotifications() {
  await unlockNotificationSound();
  elements.notificationsModal.hidden = false;
  notificationUnread = 0;
  renderNotifications();
}

function closeNotifications() {
  elements.notificationsModal.hidden = true;
}

function clearNotifications() {
  notificationItems = [];
  notificationUnread = 0;
  notificationIds.clear();
  renderNotifications();
}

async function toggleNotificationSound() {
  notificationSoundEnabled = !notificationSoundEnabled;
  localStorage.setItem(NOTIFICATION_SOUND_KEY, notificationSoundEnabled ? "on" : "off");
  if (notificationSoundEnabled) {
    await unlockNotificationSound();
    playNotificationSound("detected");
  }
  renderNotifications();
}

function formWatchMessage(event) {
  return {
    id: event.id || `form-watch-${Date.now()}-${Math.random()}`,
    type: "textMessageEvent",
    text: event.text || "",
    publishedAt: event.at || new Date().toISOString(),
    outgoing: true,
    author: { name: "Form Scanner", avatar: "", owner: false, moderator: false, sponsor: false }
  };
}

function setFormWatchStatus(text, error = false) {
  elements.formWatchStatus.textContent = friendlyErrorText(text);
  elements.formWatchStatus.className = error ? "error" : "";
}

function scheduleFormWatchPoll(delay = 1000) {
  clearTimeout(formWatchTimer);
  formWatchTimer = setTimeout(pollFormWatcher, delay);
}

async function pollFormWatcher() {
  try {
    const response = await fetch(`/api/form-watcher/status?cursor=${formWatchCursor}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not read Form Scanner status");
    formWatchCursor = Number(data.nextCursor || formWatchCursor);
    if (data.events && data.events.length) {
      appendChatMessages(data.events.map(formWatchMessage));
      addFormWatcherNotifications(data.events);
    }
    const whisper = data.whisperError
      ? `Whisper error`
      : (data.whisperStatus && data.whisperStatus !== "idle" ? `Whisper ${data.whisperStatus}` : "");
    const label = data.running
      ? [`Watching ${data.videoId || ""}`, whisper].filter(Boolean).join(" · ")
      : data.status || "idle";
    setFormWatchStatus(label);
    if (data.running) scheduleFormWatchPoll(1000);
  } catch (error) {
    setFormWatchStatus(error.message, true);
    scheduleFormWatchPoll(3000);
  }
}

function openFormWatcher() {
  elements.formWatchModal.hidden = false;
  elements.formWatchUrl.value = elements.formWatchUrl.value || elements.streamUrl.value || "";
  setTimeout(() => elements.formWatchUrl.focus(), 0);
  pollFormWatcher();
}

function closeFormWatcher() {
  elements.formWatchModal.hidden = true;
}

async function startFormWatcher() {
  const streamUrl = elements.formWatchUrl.value.trim();
  if (!streamUrl) throw new Error("Paste a YouTube livestream link");
  localStorage.setItem("account-control-form-watch-stream", streamUrl);
  await unlockNotificationSound();
  elements.formWatchStart.disabled = true;
  elements.formWatchStart.textContent = "Starting...";
  setFormWatchStatus("Starting");
  const response = await fetch("/api/form-watcher/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ streamUrl, accountId: selected && selected.id, confirmed: true })
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || "Could not start Form Scanner");
  formWatchCursor = Number(data.nextCursor || 0);
  if (data.events && data.events.length) {
    appendChatMessages(data.events.map(formWatchMessage));
    addFormWatcherNotifications(data.events);
  }
  setFormWatchStatus("Watching");
  closeFormWatcher();
  scheduleFormWatchPoll(500);
}

async function stopFormWatcher() {
  elements.formWatchStop.disabled = true;
  try {
    const response = await fetch("/api/form-watcher/stop", { method: "POST" });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not stop Form Scanner");
    if (data.events && data.events.length) {
      appendChatMessages(data.events.map(formWatchMessage));
      addFormWatcherNotifications(data.events);
    }
    formWatchCursor = Number(data.nextCursor || formWatchCursor);
    setFormWatchStatus("Stopped");
  } finally {
    elements.formWatchStop.disabled = false;
  }
}

function setLondonFormsStatus(text, error = false) {
  elements.londonFormsStatus.textContent = friendlyErrorText(text);
  elements.londonFormsStatus.className = error ? "error" : "";
}

function renderLondonFormsOutput(data = {}, error = false) {
  elements.londonFormsOutput.hidden = false;
  elements.londonFormsOutput.className = `london-forms-output${error ? " error" : ""}`;
  const fragment = document.createDocumentFragment();
  const summary = document.createElement("strong");
  const total = Number(data.total || 0);
  const confirmed = Number(data.confirmed || 0);
  summary.textContent = data.error
    ? data.error
    : (total ? `Confirmed ${confirmed}/${total}` : (data.detected ? "Form detected" : "London Forms output"));
  fragment.appendChild(summary);
  if (data.formUrl) {
    const link = document.createElement("p");
    link.textContent = data.formUrl;
    fragment.appendChild(link);
  }
  const lines = Array.isArray(data.lines) ? data.lines : [];
  if (lines.length) {
    const pre = document.createElement("pre");
    pre.textContent = lines.slice(-80).join("\n");
    fragment.appendChild(pre);
  }
  elements.londonFormsOutput.replaceChildren(fragment);
}

async function loadLondonFormsStatus() {
  try {
    const response = await fetch("/api/london-forms/status", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "London Forms unavailable");
    const targetLabel = `${Number(data.targetCount || 0)} ${Number(data.targetCount || 0) === 1 ? "target" : "targets"}`;
    setLondonFormsStatus(data.available ? `${targetLabel} ready` : "Helper files missing", !data.available);
  } catch (error) {
    setLondonFormsStatus(error.message, true);
  }
}

function openLondonForms() {
  elements.londonFormsModal.hidden = false;
  elements.londonFormsUrl.value = elements.londonFormsUrl.value || "";
  setTimeout(() => elements.londonFormsUrl.focus(), 0);
  loadLondonFormsStatus();
}

function closeLondonForms() {
  elements.londonFormsModal.hidden = true;
}

async function runLondonForms() {
  const streamUrl = elements.londonFormsUrl.value.trim();
  if (!streamUrl) throw new Error("Paste a YouTube livestream link");
  localStorage.setItem(LONDON_FORMS_URL_KEY, streamUrl);
  elements.londonFormsSubmit.disabled = true;
  elements.londonFormsSubmit.textContent = "Running...";
  setLondonFormsStatus("Watching chat locally");
  elements.londonFormsOutput.hidden = false;
  elements.londonFormsOutput.className = "london-forms-output";
  elements.londonFormsOutput.textContent = "Waiting for Google Form link in YouTube chat...";
  const response = await fetch("/api/london-forms/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ streamUrl })
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) {
    renderLondonFormsOutput(data, true);
    throw new Error(data.error || `London Forms finished with code ${data.code || 1}`);
  }
  renderLondonFormsOutput(data);
  setLondonFormsStatus(`Done: ${data.confirmed}/${data.total}`);
}

function renderStream(stream) {
  elements.streamSummary.hidden = false;
  elements.streamTitle.textContent = stream.title;
  elements.streamChannel.textContent = stream.channelTitle;
  elements.viewerCount.textContent = stream.concurrentViewers ? `${new Intl.NumberFormat().format(stream.concurrentViewers)} watching` : "";
  elements.streamThumbnail.src = stream.thumbnail;
  elements.streamThumbnail.hidden = !stream.thumbnail;
}

function scheduleChat(delay) {
  clearTimeout(chatTimer);
  chatTimer = setTimeout(pollLiveChat, delay);
}

async function pollLiveChat() {
  if (!activeStream || loadingChat) return;
  if (document.hidden) {
    scheduleChat(3000);
    return;
  }
  const generation = chatGeneration;
  loadingChat = true;
  try {
    const parameters = new URLSearchParams({ videoId: activeStream.videoId });
    if (nextPageToken) parameters.set("pageToken", nextPageToken);
    const response = await fetch(`/api/live-chat?${parameters}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok || data.streamError) {
      const detail = data.streamError || data;
      const error = new Error(detail.message || detail.error || "Could not load sent messages");
      error.code = detail.code || "";
      throw error;
    }
    if (generation !== chatGeneration) return;
    nextPageToken = data.nextPageToken || nextPageToken;
    appendChatMessages(data.messages || []);
    if (data.offlineAt) {
      setChatState("", "Livestream ended");
      addNotification({
        id: `stream-ended-${activeStream.videoId}`,
        type: "stream-ended",
        text: `${activeStream.title || "Livestream"} ended.`,
        at: new Date().toISOString()
      });
      return;
    }
    setChatState("live", "Ready · own messages only");
    scheduleChat(Math.max(750, Number(data.pollingIntervalMillis || 1000)));
  } catch (error) {
    if (generation !== chatGeneration) return;
    setChatState("error", error.message);
    addNotification({
      id: `stream-error-${activeStream && activeStream.videoId || "stream"}-${error.message}`,
      type: "error",
      text: error.message,
      at: new Date().toISOString()
    });
    scheduleChat(error.code === "quotaExceeded" ? 15 * 60 * 1000 : 15000);
  } finally {
    loadingChat = false;
  }
}

async function openLiveStream() {
  if (!selected) throw new Error("Choose one connected channel first");
  const streamUrl = elements.streamUrl.value.trim();
  if (!streamUrl) throw new Error("Paste a YouTube livestream link");
  chatGeneration += 1;
  clearTimeout(chatTimer);
  loadingChat = false;
  elements.openStream.disabled = true;
  elements.openStream.textContent = "Connecting…";
  setChatState("", "Connecting to livestream");
  const response = await fetch("/api/stream/open", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accountId: selected.id, streamUrl })
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || "Could not open livestream");
  renderQuota(data.quota);
  activeStream = { ...data.stream, streamUrl };
  nextPageToken = "";
  chatMessageIds.clear();
  chatNodeCount = 0;
  elements.chatFeed.querySelectorAll(".chat-message").forEach((element) => element.remove());
  elements.chatEmpty.hidden = false;
  elements.chatEmpty.querySelector("h2").textContent = "Own messages only";
  elements.chatEmpty.querySelector("p").textContent = "Public chat is not read. Sent messages will appear here.";
  renderStream(data.stream);
  addNotification({
    id: `stream-open-${data.stream.videoId || data.stream.liveChatId || Date.now()}`,
    type: "stream-open",
    text: `Connected to ${data.stream.title || "YouTube livestream"}.`,
    at: new Date().toISOString()
  }, { sound: false });
  localStorage.setItem("account-control-stream", streamUrl);
  setChatState("live", "Ready · own messages only");
  await pollLiveChat();
}

function normalizeChannelUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^@[\w.-]{2,}$/.test(text)) return `https://www.youtube.com/${text}`;
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return "";
  }
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  if (host !== "youtube.com" && host !== "m.youtube.com") return "";
  const path = url.pathname.replace(/\/+$/, "");
  if (!path || path === "/") return "";
  const channelPath = /^\/(@[\w.-]+|channel\/[\w-]+|c\/[\w.-]+|user\/[\w.-]+)$/i.test(path);
  return channelPath ? url.toString() : "";
}

function prepareSubscribeChannel(event) {
  const channelUrl = normalizeChannelUrl(elements.subscribeUrl.value);
  if (!channelUrl) {
    if (event) event.preventDefault();
    throw new Error("Paste a YouTube channel link or @handle");
  }
  elements.openSubscribe.href = channelUrl;
  localStorage.setItem(SUBSCRIBE_CHANNEL_KEY, elements.subscribeUrl.value.trim());
  showNotice("Channel opened. Subscribe manually in YouTube.");
  return channelUrl;
}

function updateSubscribeLink() {
  const channelUrl = normalizeChannelUrl(elements.subscribeUrl.value);
  elements.openSubscribe.href = channelUrl || "https://www.youtube.com/";
  elements.openSubscribe.setAttribute("aria-disabled", String(!channelUrl));
  renderSubscribeChecklist();
}

function subscribeStatusKey() {
  const channelUrl = normalizeChannelUrl(elements.subscribeUrl.value);
  return channelUrl ? `${SUBSCRIBE_STATUS_PREFIX}${channelUrl}` : "";
}

function loadSubscribeStatuses() {
  const key = subscribeStatusKey();
  if (!key) return {};
  try {
    const rows = JSON.parse(localStorage.getItem(key) || "{}");
    return rows && typeof rows === "object" && !Array.isArray(rows) ? rows : {};
  } catch {
    return {};
  }
}

function saveSubscribeStatuses(rows) {
  const key = subscribeStatusKey();
  if (!key) return;
  localStorage.setItem(key, JSON.stringify(rows));
}

function subscribeAccountTitle(account) {
  const title = adminValue(account.metadata && account.metadata.title).trim();
  return title || account.name || account.handle || account.id;
}

function subscribeAccountMeta(account) {
  const email = adminValue(account.metadata && account.metadata.email).trim();
  const handle = adminValue(account.handle).trim();
  return [email, handle].filter(Boolean).join(" · ") || `Channel ${account.id.slice(-8)}`;
}

function setSubscribeStatus(accountId, status) {
  const rows = loadSubscribeStatuses();
  if (status) rows[accountId] = status;
  else delete rows[accountId];
  saveSubscribeStatuses(rows);
  renderSubscribeChecklist();
}

function renderSubscribeChecklist() {
  if (!elements.subscribeChecklist) return;
  const channelUrl = normalizeChannelUrl(elements.subscribeUrl.value);
  const rows = connectedAccounts();
  if (!channelUrl || !rows.length) {
    elements.subscribeChecklist.hidden = true;
    elements.subscribeRows.replaceChildren();
    elements.subscribeProgress.textContent = "0 / 0 done";
    return;
  }
  elements.subscribeChecklist.hidden = false;
  const statuses = loadSubscribeStatuses();
  const doneCount = rows.filter((account) => statuses[account.id] === "done").length;
  const skipCount = rows.filter((account) => statuses[account.id] === "skip").length;
  elements.subscribeProgress.textContent = `${doneCount} / ${rows.length} done${skipCount ? ` · ${skipCount} skipped` : ""}`;

  const fragment = document.createDocumentFragment();
  for (const account of rows) {
    const status = statuses[account.id] || "";
    const row = document.createElement("div");
    row.className = `subscribe-row${status ? ` is-${status}` : ""}`;
    row.dataset.accountId = account.id;

    const info = document.createElement("div");
    info.className = "subscribe-account";
    const title = document.createElement("strong");
    title.textContent = subscribeAccountTitle(account);
    const meta = document.createElement("span");
    meta.textContent = subscribeAccountMeta(account);
    info.append(title, meta);

    const open = document.createElement("a");
    open.className = "button compact secondary";
    open.dataset.subscribeAction = "open";
    open.href = channelUrl;
    open.target = "_blank";
    open.rel = "noopener noreferrer";
    open.textContent = "Open";

    const done = document.createElement("button");
    done.type = "button";
    done.className = "button compact secondary subscribe-done";
    done.dataset.subscribeAction = "done";
    done.setAttribute("aria-pressed", String(status === "done"));
    done.textContent = "Done";

    const skip = document.createElement("button");
    skip.type = "button";
    skip.className = "button compact secondary subscribe-skip";
    skip.dataset.subscribeAction = "skip";
    skip.setAttribute("aria-pressed", String(status === "skip"));
    skip.textContent = "Skip";

    row.append(info, open, done, skip);
    fragment.appendChild(row);
  }
  elements.subscribeRows.replaceChildren(fragment);
}

elements.oauthFile.addEventListener("change", async () => {
  const file = elements.oauthFile.files && elements.oauthFile.files[0];
  if (!file) return;
  hideNotice();
  try {
    const payload = JSON.parse(await file.text());
    const response = await fetch("/api/oauth/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not import OAuth JSON");
    showNotice("OAuth client imported. Add each YouTube channel once.");
    await loadAccounts();
  } catch (error) {
    showNotice(error.message === "Unexpected token" ? "This is not valid JSON" : error.message, true);
  } finally {
    elements.oauthFile.value = "";
  }
});

elements.addAccount.addEventListener("click", () => {
  openAuthorizationWindow(
    "/oauth/start",
    "Google account chooser opened. Select Gmail, then approve YouTube permission."
  );
});
elements.reconnectClose.addEventListener("click", closeReconnectPicker);
elements.reconnectGmails.addEventListener("click", (event) => {
  const button = event.target.closest("[data-reconnect-email]");
  if (!button || !elements.reconnectGmails.contains(button)) return;
  reconnectEmail = button.dataset.reconnectEmail || "";
  reconnectAccountId = "";
  renderReconnectPicker();
  elements.reconnectChannels.querySelector("button")?.focus();
});
elements.reconnectChannels.addEventListener("click", (event) => {
  const button = event.target.closest("[data-reconnect-account-id]");
  if (!button || !elements.reconnectChannels.contains(button)) return;
  reconnectAccountId = button.dataset.reconnectAccountId || "";
  renderReconnectPicker();
  elements.reconnectContinue.focus();
});
elements.reconnectContinue.addEventListener("click", continueReconnect);
elements.reconnectNew.addEventListener("click", continueNewGoogleAccount);
elements.reconnectBatch.addEventListener("click", toggleOauthMigration);
elements.reconnectSkip.addEventListener("click", skipOauthMigration);
elements.reconnectModal.addEventListener("click", (event) => {
  if (event.target === elements.reconnectModal) closeReconnectPicker();
});

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) return;
  const payload = event.data;
  if (!payload || payload.type !== "oauth-migration-result") return;
  completeOauthMigrationAccount(payload).catch((error) => showNotice(error.message || "Could not continue the migration.", true));
});

elements.search.addEventListener("input", () => {
  cancelAnimationFrame(searchFrame);
  searchFrame = requestAnimationFrame(renderAccounts);
});
elements.list.addEventListener("click", (event) => {
  const queueButton = event.target.closest("[data-reconnect-gmail-batch]");
  if (queueButton && elements.list.contains(queueButton)) {
    toggleOauthMigrationForEmail(queueButton.dataset.reconnectGmailBatch || "");
    return;
  }
  const skipButton = event.target.closest("[data-reconnect-migration-skip]");
  if (skipButton && elements.list.contains(skipButton)) {
    skipOauthMigration();
    return;
  }
  const row = event.target.closest(".account-row");
  if (!row || !elements.list.contains(row)) return;
  if (row.disabled) return;
  const account = accounts.find((item) => item.id === row.dataset.accountId);
  if (account) selectAccount(account, true);
});
elements.search.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    const first = elements.list.querySelector(".account-row:not(:disabled)");
    if (first) first.click();
  }
});
elements.previousAccount.addEventListener("click", () => cycleAccount(-1));
elements.nextAccount.addEventListener("click", () => cycleAccount(1));
elements.refresh.addEventListener("click", () => loadAccounts(true));
elements.economicCalendarRefresh.addEventListener("click", () => loadEconomicCalendar(true));
elements.economicCalendarPanel.addEventListener("toggle", () => {
  if (elements.economicCalendarPanel.open) requestAnimationFrame(scrollEconomicCalendarToNext);
});
elements.economicCalendarList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-calendar-insight]");
  if (!button || !elements.economicCalendarList.contains(button)) return;
  const eventId = button.dataset.calendarInsight;
  const analysis = elements.economicCalendarList.querySelector(`[data-calendar-analysis="${eventId}"]`);
  if (!analysis) return;
  const opening = button.getAttribute("aria-expanded") !== "true";
  for (const other of elements.economicCalendarList.querySelectorAll("[data-calendar-insight]")) {
    const otherAnalysis = elements.economicCalendarList.querySelector(`[data-calendar-analysis="${other.dataset.calendarInsight}"]`);
    const expanded = other === button && opening;
    other.setAttribute("aria-expanded", String(expanded));
    if (otherAnalysis) otherAnalysis.hidden = !expanded;
  }
});
elements.adminOpen.addEventListener("click", openAdmin);
elements.adminClose.addEventListener("click", closeAdmin);
elements.adminRefresh.addEventListener("click", loadAdminMetadata);
elements.adminSave.addEventListener("click", () => saveAdminMetadata());
for (const button of elements.adminViewButtons) {
  button.addEventListener("click", () => {
    syncVisibleAdminMetadata();
    setAdminViewMode(button.dataset.adminView);
    renderAdminView();
  });
}
elements.formWatchOpen.addEventListener("click", openFormWatcher);
elements.formWatchClose.addEventListener("click", closeFormWatcher);
elements.londonFormsOpen.addEventListener("click", openLondonForms);
elements.londonFormsClose.addEventListener("click", closeLondonForms);
elements.notificationsOpen.addEventListener("click", () => openNotifications());
elements.notificationsClose.addEventListener("click", closeNotifications);
elements.notificationsClear.addEventListener("click", clearNotifications);
elements.notificationsSound.addEventListener("click", () => toggleNotificationSound());
elements.notificationsVolume.addEventListener("input", (event) => setNotificationVolume(event.target.value));
elements.notificationsVolume.addEventListener("change", (event) => setNotificationVolume(event.target.value, { preview: true }));
elements.formWatchStop.addEventListener("click", async () => {
  try { await stopFormWatcher(); }
  catch (error) { setFormWatchStatus(error.message, true); }
});
elements.formWatchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideNotice();
  try {
    await startFormWatcher();
    showNotice("Form Scanner armed. Waiting for a Google Form link in live chat.");
  } catch (error) {
    setFormWatchStatus(error.message, true);
    showNotice(error.message, true);
  } finally {
    elements.formWatchStart.disabled = false;
    elements.formWatchStart.textContent = "Start watching";
  }
});
elements.londonFormsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideNotice();
  try {
    await runLondonForms();
    showNotice("London Forms done.");
  } catch (error) {
    setLondonFormsStatus(error.message, true);
    showNotice(error.message, true);
  } finally {
    elements.londonFormsSubmit.disabled = false;
    elements.londonFormsSubmit.textContent = "Run";
  }
});
elements.mffOpen.addEventListener("click", openMff);
elements.mffClose.addEventListener("click", closeMff);
elements.adminRows.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-admin-action]");
  if (!button || !elements.adminRows.contains(button)) return;
  button.disabled = true;
  try {
    if (button.dataset.adminAction === "commit-entry") await commitAdminEntry(button.dataset.accountId);
    if (button.dataset.adminAction === "edit-record") editAdminRecord(button.dataset.accountId, button.dataset.recordId);
    if (button.dataset.adminAction === "finish-record-edit") await finishAdminRecordEdit(button.dataset.accountId, button.dataset.recordId, button.closest(".admin-record"));
    if (button.dataset.adminAction === "set-record-color") await setAdminRecordColor(button.dataset.accountId, button.dataset.recordId, button.dataset.color);
    if (button.dataset.adminAction === "move-record-up") await moveAdminRecord(button.dataset.accountId, button.dataset.recordId, -1, button.closest(".admin-record"));
    if (button.dataset.adminAction === "move-record-down") await moveAdminRecord(button.dataset.accountId, button.dataset.recordId, 1, button.closest(".admin-record"));
    if (button.dataset.adminAction === "toggle-record-pin") await toggleAdminRecordPin(button.dataset.accountId, button.dataset.recordId);
    if (button.dataset.adminAction === "toggle-record-status") await toggleAdminRecordStatus(button.dataset.accountId, button.dataset.recordId, button.dataset.status);
  } finally {
    button.disabled = false;
  }
});
elements.adminRows.addEventListener("input", (event) => {
  const input = event.target.closest("[data-record-field]");
  if (!input || !elements.adminRows.contains(input)) return;
  queueAdminAutosave(input.dataset.accountId, input.dataset.recordId, input.closest(".admin-record"));
});
elements.adminSearch.addEventListener("input", () => {
  syncVisibleAdminMetadata();
  cancelAnimationFrame(adminSearchFrame);
  adminSearchFrame = requestAnimationFrame(() => {
    adminSearchFrame = null;
    renderAdminView();
  });
});
elements.adminModal.addEventListener("click", (event) => {
  if (event.target === elements.adminModal) closeAdmin();
});
elements.mffRows.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-mff-action]");
  if (!button || !elements.mffRows.contains(button)) return;
  button.disabled = true;
  try {
    if (button.dataset.mffAction === "commit-entry") await commitMffEntry(button.dataset.mffEmail);
    if (button.dataset.mffAction === "edit-record") editMffRecord(button.dataset.mffEmail, button.dataset.recordId);
    if (button.dataset.mffAction === "finish-record-edit") await finishMffRecordEdit(button.dataset.mffEmail, button.dataset.recordId, button.closest(".mff-record"));
    if (button.dataset.mffAction === "set-record-color") await setMffRecordColor(button.dataset.mffEmail, button.dataset.recordId, button.dataset.color);
    if (button.dataset.mffAction === "move-record-up") await moveMffRecord(button.dataset.mffEmail, button.dataset.recordId, -1, button.closest(".mff-record"));
    if (button.dataset.mffAction === "move-record-down") await moveMffRecord(button.dataset.mffEmail, button.dataset.recordId, 1, button.closest(".mff-record"));
    if (button.dataset.mffAction === "toggle-record-pin") await toggleMffRecordPin(button.dataset.mffEmail, button.dataset.recordId);
  } finally {
    button.disabled = false;
  }
});
elements.mffRows.addEventListener("input", (event) => {
  const recordInput = event.target.closest("[data-mff-record-field]");
  if (recordInput && elements.mffRows.contains(recordInput)) {
    queueMffAutosave(recordInput.dataset.mffEmail, recordInput.dataset.recordId, recordInput.closest(".mff-record"));
    return;
  }
  const fieldInput = event.target.closest("[data-mff-field]");
  if (fieldInput && elements.mffRows.contains(fieldInput) && fieldInput.dataset.mffField === "nickname") {
    queueMffAutosave();
  }
});
elements.mffSearch.addEventListener("input", () => {
  syncVisibleMffMetadata();
  cancelAnimationFrame(mffSearchFrame);
  mffSearchFrame = requestAnimationFrame(() => {
    mffSearchFrame = null;
    renderMffView();
  });
});
elements.mffModal.addEventListener("click", (event) => {
  if (event.target === elements.mffModal) closeMff();
});
elements.formWatchModal.addEventListener("click", (event) => {
  if (event.target === elements.formWatchModal) closeFormWatcher();
});
elements.londonFormsModal.addEventListener("click", (event) => {
  if (event.target === elements.londonFormsModal) closeLondonForms();
});
elements.notificationsModal.addEventListener("click", (event) => {
  if (event.target === elements.notificationsModal) closeNotifications();
});
elements.jumpLatest.addEventListener("click", () => scrollChatToBottom(true));
elements.chatFeed.addEventListener("scroll", () => {
  if (chatScrollFrame) return;
  chatScrollFrame = requestAnimationFrame(() => {
    chatScrollFrame = null;
    if (isNearChatBottom()) elements.jumpLatest.hidden = true;
  });
}, { passive: true });

document.addEventListener("keydown", (event) => {
  const editing = ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName);
  if (event.key === "/" && !editing) {
    event.preventDefault();
    if (!elements.adminModal.hidden) elements.adminSearch.focus();
    else if (!elements.mffModal.hidden) elements.mffSearch.focus();
    else if (!elements.londonFormsModal.hidden) elements.londonFormsUrl.focus();
    else elements.search.focus();
  }
  if (event.altKey && event.key === "ArrowUp") {
    event.preventDefault();
    cycleAccount(-1);
  }
  if (event.altKey && event.key === "ArrowDown") {
    event.preventDefault();
    cycleAccount(1);
  }
  if (event.key === "Escape" && !elements.formWatchModal.hidden) {
    event.preventDefault();
    closeFormWatcher();
  } else if (event.key === "Escape" && !elements.reconnectModal.hidden) {
    event.preventDefault();
    closeReconnectPicker();
  } else if (event.key === "Escape" && !elements.londonFormsModal.hidden) {
    event.preventDefault();
    closeLondonForms();
  } else if (event.key === "Escape" && !elements.notificationsModal.hidden) {
    event.preventDefault();
    closeNotifications();
  } else if (event.key === "Escape" && !elements.mffModal.hidden) {
    event.preventDefault();
    closeMff();
  } else if (event.key === "Escape" && !elements.adminModal.hidden) {
    event.preventDefault();
    closeAdmin();
  }
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && activeStream) scheduleChat(0);
});

elements.streamUrl.addEventListener("input", () => {
  localStorage.setItem("account-control-stream", elements.streamUrl.value);
  if (!elements.formWatchUrl.value.trim()) elements.formWatchUrl.value = elements.streamUrl.value;
  if (activeStream && activeStream.streamUrl !== elements.streamUrl.value.trim()) {
    chatGeneration += 1;
    clearTimeout(chatTimer);
    activeStream = null;
    nextPageToken = "";
    elements.streamSummary.hidden = true;
    setChatState("", "Open the new livestream link");
  }
});

updateSubscribeLink();

elements.subscribeUrl.addEventListener("input", () => {
  localStorage.setItem(SUBSCRIBE_CHANNEL_KEY, elements.subscribeUrl.value.trim());
  updateSubscribeLink();
});

elements.openSubscribe.addEventListener("click", (event) => {
  hideNotice();
  try {
    prepareSubscribeChannel(event);
  } catch (error) {
    showNotice(error.message, true);
  }
});

elements.subscribeRows.addEventListener("click", (event) => {
  const action = event.target.closest("[data-subscribe-action]");
  const row = event.target.closest(".subscribe-row[data-account-id]");
  if (!action || !row || !elements.subscribeRows.contains(row)) return;
  const account = accounts.find((item) => item.id === row.dataset.accountId);
  if (account) selectAccount(account, false);
  if (action.dataset.subscribeAction === "open") {
    hideNotice();
    try {
      prepareSubscribeChannel(event);
    } catch (error) {
      showNotice(error.message, true);
    }
    return;
  }
  event.preventDefault();
  const current = loadSubscribeStatuses()[row.dataset.accountId] || "";
  if (action.dataset.subscribeAction === "done") setSubscribeStatus(row.dataset.accountId, current === "done" ? "" : "done");
  if (action.dataset.subscribeAction === "skip") setSubscribeStatus(row.dataset.accountId, current === "skip" ? "" : "skip");
});

elements.subscribeReset.addEventListener("click", () => {
  const key = subscribeStatusKey();
  if (key) localStorage.removeItem(key);
  renderSubscribeChecklist();
});

elements.subscribeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  hideNotice();
  try {
    window.location.assign(prepareSubscribeChannel(event));
  } catch (error) {
    showNotice(error.message, true);
  }
});

elements.streamForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideNotice();
  try {
    await openLiveStream();
  } catch (error) {
    setChatState("error", error.message);
    showNotice(error.message, true);
  } finally {
    elements.openStream.disabled = false;
    elements.openStream.textContent = "Connect";
  }
});

elements.message.addEventListener("input", () => {
  elements.characterCount.textContent = `${elements.message.value.length} / 200`;
});
elements.starterWord.addEventListener("input", () => {
  const previous = localStorage.getItem(STARTER_WORD_KEY) || "";
  const draft = cleanStarterDraft(elements.starterWord.value);
  if (elements.starterWord.value !== draft) elements.starterWord.value = draft;
  const word = currentStarterWord();
  localStorage.setItem(STARTER_WORD_KEY, word);
  const text = elements.message.value;
  const oldPrefix = previous && (text === previous || text.startsWith(`${previous} `));
  if (!word) {
    if (oldPrefix) setMessage(text.slice(previous.length).trimStart());
    return;
  }
  if (!text.trim()) setMessage(starterMessage(word));
  else if (oldPrefix) setMessage(`${word}${text.slice(previous.length)}`);
  else if (text.trim() === word || text.trim().startsWith(`${word} `)) elements.message.dispatchEvent(new Event("input"));
  else setMessage(`${word} ${text.trimStart()}`);
});
elements.message.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.key === "Enter") {
    event.preventDefault();
    elements.composer.requestSubmit();
  }
});
for (const input of elements.sendSize) {
  input.addEventListener("change", () => setSendBatchSize(input.value));
}
elements.clear.addEventListener("click", () => {
  setMessage(starterMessage(), true);
  hideNotice();
});

elements.composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selected) return;
  const senders = sendBatchAccounts();
  const message = messageForSend();
  const streamUrl = elements.streamUrl.value.trim();
  hideNotice();
  elements.stage.disabled = true;
  elements.stage.textContent = `Sending ${senders.length}…`;
  try {
    if (!senders.length) throw new Error("Choose a connected channel first");
    if (!activeStream || activeStream.streamUrl !== streamUrl) throw new Error("Open this livestream chat before sending a message");
    if (!message) throw new Error("Message cannot be empty");
    const sendResponse = await fetch("/api/send-batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        accountIds: senders.map((account) => account.id),
        message,
        streamUrl,
        confirmed: true
      })
    });
    const payload = await sendResponse.json();
    const results = payload.results || [];
    const sent = results.filter((result) => result.ok);
    const failed = results.filter((result) => !result.ok);
    const failedDetail = failed.length ? failed.slice(0, 2).map((result) => result.error).join("; ") : "";
    for (const result of failed.slice().reverse()) {
      if (result.code === "invalidGrant") markAccountDisconnected(result.accountId);
      prependActivity(
        result.code === "invalidGrant" ? "disconnected" : "failed",
        result.code === "invalidGrant"
          ? `Disconnected: ${result.handle || result.error}`
          : `Failed: ${result.error}`
      );
    }
    if (failed.some((result) => result.code === "invalidGrant")) {
      if (selected && disconnectedAccountIds.has(selected.id)) {
        const liveAccounts = connectedAccounts();
        if (liveAccounts.length) selectAccount(liveAccounts[0], true);
        else selected = null;
      }
      renderSetup();
      renderAccounts();
      renderSubscribeChecklist();
    }
    if (!sendResponse.ok || !payload.ok || !sent.length) throw new Error(failedDetail || payload.error || "YouTube did not accept the messages");
    renderQuota(payload.quota);
    if (messageForSend() === message) setMessage(starterMessage());
    appendChatMessages(sent.map((result) => {
      const sender = senders.find((account) => account.id === result.accountId) || accounts.find((account) => account.id === result.accountId) || result;
      return {
        id: result.messageId,
        type: "textMessageEvent",
        text: message,
        publishedAt: new Date().toISOString(),
        outgoing: true,
        author: { name: result.handle || accountName(sender), avatar: result.avatar || sender.avatar || "", owner: false, moderator: false, sponsor: false }
      };
    }));
    for (const result of sent.slice().reverse()) prependActivity("sent", `Sent from ${result.handle}`);
    const next = advanceAfterBatch(senders);
    const failedText = failedDetail ? ` Failed: ${failedDetail}.` : "";
    showNotice(next
      ? `${sent.length}/${senders.length} sent. Next: ${accountName(next)}.${failedText}`
      : `${sent.length}/${senders.length} sent.${failedText}`,
      Boolean(failed.length));
    if (!next) elements.message.focus();
    scheduleChat(250);
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    elements.stage.disabled = false;
    elements.stage.textContent = "Send message";
    scheduleAccountRefresh();
  }
});

renderNotifications();
loadEconomicCalendar();
setInterval(refreshNextEconomicEvent, 30_000);
setInterval(refreshAccountExpiryCountdowns, 60_000);
loadAccounts();
ensureStarterMessage();
