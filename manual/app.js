const $ = (selector) => document.querySelector(selector);
const elements = {
  status: $("#bridgeStatus"), count: $("#accountCount"), refresh: $("#refresh"), search: $("#search"), list: $("#accountList"), empty: $("#emptyState"), composer: $("#composer"),
  savedPicker: $("#savedPicker"), addSaved: $("#addSaved"), addAllSaved: $("#addAllSaved"), syncRoutes: $("#syncRoutes"),
  selectedAvatar: $("#selectedAvatar"), selectedName: $("#selectedName"), selectedMeta: $("#selectedMeta"), identitySelect: $("#identitySelect"), identityHelp: $("#identityHelp"),
  message: $("#message"), counter: $("#counter"), notice: $("#notice"), clear: $("#clear"), send: $("#send"), sentCount: $("#sentCount"), activity: $("#activity"),
  liteForm: $("#liteForm"), streamUrl: $("#streamUrl"), liteStart: $("#liteStart"), liteStop: $("#liteStop"), liteSummary: $("#liteSummary"), chatFeed: $("#chatFeed"),
  chatStatus: $("#chatStatus"), streamTitle: $("#streamTitle"), streamMeta: $("#streamMeta")
};
let accounts = [], catalog = [], savedAccountIds = [], routes = [], chat = [], activity = [], chatDebug = {};
let lite = { enabled: false, phase: "off", videoId: "", hot: 0, parked: 0, total: 0 };
let selectedId = "", loading = false, preparing = false, loadInFlight = false, bridgeOnline = false, bridgeVersion = "", sentThisSession = 0, lastSignature = "";
const fallbackName = (account) => `Account ${account.windowNumber || 1}.${account.tabNumber || 1}`;
const displayName = (account) => account.handle || account.name || fallbackName(account);
const initials = (value) => String(value || "YT").replace(/^@/, "").split(/[^A-Za-z0-9]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "YT";
const selected = () => accounts.find((account) => account.targetId === selectedId) || null;
const isSaved = (account) => account?.source === "saved" || String(account?.targetId || "").startsWith("vault_");
const needsBridgeReload = () => savedAccountIds.length > 0 && bridgeVersion && bridgeVersion !== "1.2.1";
async function api(path, options = {}) {
  const response = await fetch(path, { cache: "no-store", ...options, headers: { "content-type": "application/json", ...(options.headers || {}) } });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || "Request failed");
  return data;
}
function setStatus(mode, text) { elements.status.className = `bridge ${mode}`; elements.status.querySelector("strong").textContent = text; }
function showNotice(text, error = false) { elements.notice.hidden = false; elements.notice.className = `notice${error ? " error" : ""}`; elements.notice.textContent = text; }
function hideNotice() { elements.notice.hidden = true; }
function accountState(account) {
  if (needsBridgeReload()) return "Reload bridge extension";
  if (isSaved(account)) return account.accountError || "Saved · opens on send";
  if (!account.handle && !account.name) return "Assign username";
  if (!lite.enabled) return account.loggedIn ? (account.name || "Ready") : "Signed out";
  if (account.liteState === "hot") return account.ready ? (account.name || "Hot · instant") : "Loading";
  if (account.liteState === "parked") return account.name || "Parked · low memory";
  return account.name || "Lite";
}
function fillAvatar(container, account) {
  container.replaceChildren();
  if (account.thumbnail) { const image = document.createElement("img"); image.src = account.thumbnail; image.alt = ""; container.append(image); }
  else container.textContent = initials(displayName(account));
}
function renderAccounts() {
  const query = elements.search.value.trim().toLowerCase();
  const visible = accounts.filter((account) => `${displayName(account)} ${account.name} ${account.title} ${account.windowNumber} ${account.tabNumber}`.toLowerCase().includes(query));
  elements.list.replaceChildren();
  if (!visible.length) { const row = document.createElement("p"); row.className = "no-results"; row.textContent = accounts.length ? "No matching channel" : "Add saved channels or open one YouTube tab"; elements.list.append(row); return; }
  const groups = new Map();
  for (const account of visible) { const key = isSaved(account) ? "Saved accounts" : `Window ${account.windowNumber || 1}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(account); }
  for (const [group, rows] of groups) {
    const heading = document.createElement("div"); heading.className = "window-group"; heading.textContent = group; elements.list.append(heading);
    for (const account of rows) {
      const button = document.createElement("button"); button.type = "button"; button.className = "account-row"; button.setAttribute("role", "option"); button.setAttribute("aria-selected", String(account.targetId === selectedId));
      const picture = document.createElement("span"); picture.className = "avatar"; fillAvatar(picture, account);
      const info = document.createElement("span"); info.className = "account-info"; const strong = document.createElement("strong"); strong.textContent = displayName(account); const small = document.createElement("small"); small.textContent = accountState(account); info.append(strong, small);
      const dot = document.createElement("span"); dot.className = `account-dot${isSaved(account) ? " saved" : account.liteState === "parked" ? " parked" : account.ready ? "" : account.loggedIn ? " loading" : " offline"}`;
      button.append(picture, info, dot); button.addEventListener("click", () => selectAccount(account.targetId)); elements.list.append(button);
    }
  }
}
function renderSavedPicker() {
  const saved = new Set(savedAccountIds);
  const choices = catalog.filter((account) => !saved.has(account.id)).sort((a, b) => (a.handle || a.name).localeCompare(b.handle || b.name));
  elements.savedPicker.replaceChildren();
  if (!choices.length) elements.savedPicker.add(new Option(saved.size ? "All channels added" : "No connected channels", ""));
  for (const account of choices) elements.savedPicker.add(new Option(`${account.handle || account.name}${account.name && account.handle ? ` - ${account.name}` : ""}`, account.id));
  elements.addSaved.disabled = !choices.length || loading;
  elements.addAllSaved.disabled = !catalog.length || loading;
  elements.syncRoutes.disabled = !bridgeOnline || loading || needsBridgeReload();
}
function renderIdentitySelect(account) {
  const current = account.channelId || "";
  elements.identitySelect.replaceChildren(new Option("Assign correct username…", ""));
  for (const identity of [...catalog].sort((a, b) => (a.handle || a.name).localeCompare(b.handle || b.name))) elements.identitySelect.add(new Option(`${identity.handle || identity.name}${identity.name && identity.handle ? ` — ${identity.name}` : ""}`, identity.id));
  elements.identitySelect.value = current;
  elements.identitySelect.disabled = isSaved(account);
  elements.identityHelp.textContent = isSaved(account) ? "Saved locally. Worker tab opens only when sending." : account.identitySource === "detected" ? "Detected from this signed-in YouTube session." : account.identitySource === "saved" ? "Saved mapping. Account login is unchanged." : account.identitySource === "order" ? "Matched from the saved connected-channel order. Change here if needed." : "Choose once; this mapping is saved locally.";
}
function renderSelected() {
  const account = selected();
  if (!account) { elements.empty.hidden = false; elements.composer.hidden = true; renderAccounts(); return; }
  elements.empty.hidden = true; elements.composer.hidden = false; elements.selectedName.textContent = displayName(account); elements.selectedMeta.textContent = isSaved(account) ? `Saved · ${accountState(account)}` : `Window ${account.windowNumber || 1} · ${accountState(account)}`; fillAvatar(elements.selectedAvatar, account); renderIdentitySelect(account);
  elements.send.disabled = (isSaved(account) ? (!bridgeOnline || needsBridgeReload()) : (lite.enabled ? !account.ready : !account.loggedIn)) || loading || preparing; renderAccounts();
}
function renderChat() {
  const nearBottom = elements.chatFeed.scrollHeight - elements.chatFeed.scrollTop - elements.chatFeed.clientHeight < 90;
  elements.chatFeed.replaceChildren();
  if (!chat.length) { const empty = document.createElement("div"); empty.className = "chat-empty"; const icon = document.createElement("span"); icon.textContent = "▢"; const title = document.createElement("h2"); title.textContent = "Waiting for live chat"; const copy = document.createElement("p"); copy.textContent = "Messages appear here from the lightweight browser session."; empty.append(icon, title, copy); elements.chatFeed.append(empty); return; }
  for (const item of chat) {
    const row = document.createElement("div"); row.className = "chat-row"; const picture = document.createElement("div"); picture.className = "chat-avatar";
    if (item.avatar) { const image = document.createElement("img"); image.src = item.avatar; image.alt = ""; picture.append(image); } else picture.textContent = initials(item.author);
    const copy = document.createElement("div"); copy.className = "chat-copy"; const head = document.createElement("div"); head.className = "chat-author"; const name = document.createElement("strong"); name.textContent = item.author || "YouTube user"; const time = document.createElement("time"); time.textContent = item.timestamp; head.append(name, time); const message = document.createElement("p"); message.textContent = item.message; copy.append(head, message); row.append(picture, copy); elements.chatFeed.append(row);
  }
  if (nearBottom) elements.chatFeed.scrollTop = elements.chatFeed.scrollHeight;
}
function renderActivity() {
  elements.activity.replaceChildren();
  for (const item of activity.slice(0, 10)) { const row = document.createElement("div"); row.className = "activity-item"; const text = document.createElement("span"); text.textContent = item.text; const time = document.createElement("time"); time.textContent = new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); row.append(text, time); elements.activity.append(row); }
}
function renderLite() {
  const indexing = lite.enabled && lite.phase === "indexing"; elements.liteStart.disabled = loading || indexing; elements.liteStop.disabled = loading || indexing; elements.streamUrl.disabled = loading || indexing; elements.liteStop.hidden = !lite.enabled;
  elements.liteStart.textContent = loading ? "Loading…" : lite.enabled ? "Update chat" : "Open chat"; elements.liteSummary.textContent = lite.enabled ? `${lite.hot || 0} hot · ${lite.parked || 0} parked` : "Full pages"; elements.chatStatus.textContent = indexing ? "Building lightweight account pool…" : lite.enabled && chat.length ? "Live chat updating from browser" : lite.enabled && chatDebug.frames ? "Chat connected · waiting for messages" : lite.enabled ? "Connecting to live chat…" : "Start Lite Mode for low memory";
}
async function loadAccounts(silent = false) {
  if (loadInFlight) return; loadInFlight = true;
  try {
    const data = await api("/api/manual/accounts"); accounts = data.accounts || []; catalog = data.catalog || []; savedAccountIds = data.savedAccountIds || []; routes = data.routes || []; chat = data.chat || []; chatDebug = data.chatDebug || {}; activity = data.activity || []; lite = data.lite || lite; bridgeOnline = data.bridgeOnline !== false; bridgeVersion = lite.version || "";
    if (selectedId && !accounts.some((account) => account.targetId === selectedId)) selectedId = "";
    if (!elements.streamUrl.value && (lite.videoId || accounts[0]?.videoId)) elements.streamUrl.value = `https://www.youtube.com/watch?v=${lite.videoId || accounts[0].videoId}`;
    const current = selected() || accounts[0]; if (current?.title) elements.streamTitle.textContent = current.title.replace(/#account-control-lite.*$/, "");
    elements.streamMeta.textContent = lite.enabled ? `${accounts.length} channels · zero API quota` : "Browser-fed chat · no API credits";
    elements.count.textContent = `${accounts.length} channels · ${savedAccountIds.length} saved`;
    setStatus(!bridgeOnline || needsBridgeReload() ? "error" : "online", !bridgeOnline ? "Bridge offline" : needsBridgeReload() ? "Reload bridge 1.2.1" : `${accounts.length} channels ready`); renderLite(); renderSavedPicker();
    const active = selected();
    if (active?.ready && elements.notice.classList.contains("error") && /permission|cannot access contents|not loaded/i.test(elements.notice.textContent || "")) hideNotice();
    const signature = JSON.stringify({ accounts, catalog, savedAccountIds, routes, chat, chatDebug, activity, lite, bridgeOnline, bridgeVersion }); if (signature !== lastSignature) { lastSignature = signature; renderAccounts(); renderSelected(); renderChat(); renderActivity(); renderSavedPicker(); }
  } catch (error) { setStatus("error", "AWS Chrome bridge offline"); elements.count.textContent = "Reconnect AWS desktop"; if (!silent && !elements.composer.hidden) showNotice(error.message, true); }
  finally { loadInFlight = false; }
}
async function prepareAccount(targetId) {
  if (!lite.enabled) return; preparing = true; renderSelected(); showNotice("Waking lightweight chat…");
  try { const data = await api("/api/manual/prepare", { method: "POST", body: JSON.stringify({ targetId, streamUrl: elements.streamUrl.value.trim() }) }); const account = accounts.find((row) => row.targetId === targetId); if (account) Object.assign(account, data, { loggedIn: true, ready: true, liteState: isSaved(account) ? "saved" : "hot" }); showNotice("Chat ready"); await loadAccounts(true); }
  catch (error) { showNotice(error.message, true); } finally { preparing = false; renderSelected(); elements.message.focus(); }
}
async function selectAccount(targetId) { selectedId = targetId; hideNotice(); renderSelected(); if (lite.enabled) await prepareAccount(targetId); else elements.message.focus(); }
async function saveIdentity() {
  const account = selected(); if (!account) return;
  if (isSaved(account)) return;
  try { await api("/api/manual/label", { method: "POST", body: JSON.stringify({ targetId: account.targetId, channelId: elements.identitySelect.value }) }); await loadAccounts(true); showNotice(elements.identitySelect.value ? "Username saved" : "Username mapping cleared"); }
  catch (error) { showNotice(error.message, true); }
}
async function sendMessage() {
  const account = selected(), message = elements.message.value.trim(); if (!account) return showNotice("Select one channel first", true); if (!account.handle && !account.name) return showNotice("Assign the correct username before sending", true); if (!message) return showNotice("Write a message first", true);
  if (isSaved(account) && !elements.streamUrl.value.trim()) return showNotice("Paste YouTube livestream link first", true);
  loading = true; elements.send.disabled = true; elements.send.textContent = "Sending…"; hideNotice();
  try { const data = await api("/api/manual/send", { method: "POST", body: JSON.stringify({ targetId: account.targetId, streamUrl: elements.streamUrl.value.trim(), message, confirmed: true }) }); sentThisSession += 1; elements.sentCount.textContent = String(sentThisSession); elements.message.value = ""; elements.counter.textContent = "0 / 200"; showNotice(`Message sent as ${data.handle}`); await loadAccounts(true); }
  catch (error) { showNotice(error.message, true); } finally { loading = false; elements.send.textContent = "Send message"; renderSelected(); }
}
async function startLiteMode(event) {
  event.preventDefault(); loading = true; renderLite(); setStatus("waiting", "Building lightweight tabs");
  try { const endpoint = savedAccountIds.length ? "/api/manual/vault/start" : "/api/manual/lite/start"; const data = await api(endpoint, { method: "POST", body: JSON.stringify({ streamUrl: elements.streamUrl.value.trim() }) }); if (!elements.composer.hidden) showNotice(savedAccountIds.length ? `Saved-account stream ready · ${data.total || savedAccountIds.length} routes` : `${data.hot} hot · ${data.parked} parked`); await loadAccounts(true); }
  catch (error) { setStatus("error", error.message); if (!elements.composer.hidden) showNotice(error.message, true); } finally { loading = false; renderLite(); renderSelected(); }
}
async function stopLiteMode() { loading = true; renderLite(); try { await api("/api/manual/lite/stop", { method: "POST", body: "{}" }); await loadAccounts(true); } catch (error) { if (!elements.composer.hidden) showNotice(error.message, true); } finally { loading = false; renderLite(); renderSelected(); } }
async function addSavedAccount() {
  const channelId = elements.savedPicker.value; if (!channelId) return;
  loading = true; renderSavedPicker();
  try { await api("/api/manual/accounts/add", { method: "POST", body: JSON.stringify({ channelId }) }); await loadAccounts(true); showNotice("Saved account added"); }
  catch (error) { showNotice(error.message, true); } finally { loading = false; renderSavedPicker(); }
}
async function addAllSavedAccounts() {
  loading = true; renderSavedPicker();
  try { await api("/api/manual/accounts/add-all", { method: "POST", body: "{}" }); await loadAccounts(true); showNotice("All connected channels added"); }
  catch (error) { showNotice(error.message, true); } finally { loading = false; renderSavedPicker(); }
}
async function syncRoutes() {
  loading = true; elements.syncRoutes.disabled = true; showNotice("Syncing YouTube channels…");
  try { const data = await api("/api/manual/routes/sync", { method: "POST", body: "{}" }); await loadAccounts(true); showNotice(`Synced ${data.total || 0} YouTube channels`); }
  catch (error) { showNotice(error.message, true); } finally { loading = false; renderSavedPicker(); }
}
elements.refresh.addEventListener("click", () => loadAccounts()); elements.search.addEventListener("input", renderAccounts); elements.identitySelect.addEventListener("change", saveIdentity);
elements.addSaved.addEventListener("click", addSavedAccount); elements.addAllSaved.addEventListener("click", addAllSavedAccounts); elements.syncRoutes.addEventListener("click", syncRoutes);
elements.message.addEventListener("input", () => { elements.counter.textContent = `${elements.message.value.length} / 200`; }); elements.clear.addEventListener("click", () => { elements.message.value = ""; elements.counter.textContent = "0 / 200"; hideNotice(); elements.message.focus(); });
elements.send.addEventListener("click", sendMessage); elements.liteForm.addEventListener("submit", startLiteMode); elements.liteStop.addEventListener("click", stopLiteMode); document.addEventListener("keydown", (event) => { if (event.ctrlKey && event.key === "Enter") { event.preventDefault(); sendMessage(); } });
loadAccounts(); setInterval(() => loadAccounts(true), 3000);
