importScripts("route-parser.js");

const SERVER = "http://127.0.0.1:8790";
const HOT_LIMIT = 3;
const LITE_MARK = "account-control-lite";
const WORKER_MARK = "account-control-worker";
const CHAT_STYLE_VERSION = 2;
const probeCache = new Map();
let busy = false;
let accountCache = new Map();
let hotOrder = [];
let vaultWorkers = new Map();
let vaultWorkerRoutes = new Map();
let stagedWorkers = new Map();
let routeCatalog = [];
let lite = { enabled: false, phase: "off", videoId: "", total: 0, indexed: 0 };
const extensionStorage = chrome.storage?.local || null;

const stateReady = (extensionStorage
  ? extensionStorage.get(["lite", "hotOrder", "accountCache", "routeCatalog"])
  : Promise.resolve({})).then((stored) => {
  if (stored.lite && typeof stored.lite === "object") lite = { ...lite, ...stored.lite };
  if (Array.isArray(stored.hotOrder)) hotOrder = stored.hotOrder.map(Number).filter(Number.isFinite);
  if (stored.accountCache && typeof stored.accountCache === "object") {
    accountCache = new Map(Object.entries(stored.accountCache));
  }
  if (Array.isArray(stored.routeCatalog)) routeCatalog = stored.routeCatalog;
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chatUrl(videoId) {
  return `https://www.youtube.com/live_chat?is_popout=1&v=${encodeURIComponent(videoId)}#${LITE_MARK}`;
}

function workerUrl(videoId, sessionIndex, delegatedSessionId) {
  const query = new URLSearchParams({
    is_popout: "1",
    v: videoId,
    authuser: String(sessionIndex || 0),
    pageid: delegatedSessionId
  });
  return `https://www.youtube.com/live_chat?${query}#${WORKER_MARK}`;
}

function workerSwitchUrl(videoId, sessionIndex, delegatedSessionId) {
  const next = `/live_chat?is_popout=1&v=${encodeURIComponent(videoId)}#${WORKER_MARK}`;
  const query = new URLSearchParams({
    action_handle_signin: "true",
    authuser: String(sessionIndex || 0),
    pageid: delegatedSessionId,
    next,
    feature: "channel_switcher",
    skip_identity_prompt: "true"
  });
  return `https://www.youtube.com/signin?${query}`;
}

function parkedUrl(videoId) {
  return `https://www.youtube.com/robots.txt#${LITE_MARK}:${encodeURIComponent(videoId)}`;
}

function tabVideoId(tab) {
  try {
    const url = new URL(tab.url || "");
    if (url.hash.startsWith(`#${LITE_MARK}:`)) return decodeURIComponent(url.hash.slice(LITE_MARK.length + 2));
    return url.searchParams.get("v") || "";
  } catch {
    return "";
  }
}

function tabMode(tab) {
  try {
    const url = new URL(tab.url || "");
    if (!["youtube.com", "www.youtube.com"].includes(url.hostname)) return "";
    if (url.pathname === "/watch") return "full";
    if (url.pathname === "/live_chat" && url.hash === `#${LITE_MARK}`) return "hot";
    if (url.pathname === "/robots.txt" && url.hash.startsWith(`#${LITE_MARK}:`)) return "parked";
  } catch {}
  return "";
}

function isYouTubeSessionTab(tab) {
  try {
    const url = new URL(tab.url || "");
    return ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)
      && url.pathname !== "/robots.txt";
  } catch {}
  return false;
}

async function persistState() {
  if (!extensionStorage) return;
  await extensionStorage.set({
    lite,
    hotOrder,
    accountCache: Object.fromEntries(accountCache),
    routeCatalog
  });
}

async function waitForTab(tabId, timeoutMs = 10000, predicate = () => true) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete" && predicate(tab)) return tab;
    await sleep(150);
  }
  const tab = await chrome.tabs.get(tabId);
  if (!predicate(tab)) throw new Error("YouTube chat navigation timed out");
  return tab;
}

async function youtubeScriptTarget(tabId) {
  const frames = await chrome.webNavigation.getAllFrames({ tabId }).catch(() => []);
  const frameIds = (frames || []).filter((frame) => {
    try {
      const host = new URL(frame.url || "").hostname;
      return host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com";
    } catch { return false; }
  }).map((frame) => frame.frameId);
  if (!frameIds.length) throw new Error("YouTube chat document is not loaded yet");
  return { tabId, frameIds };
}

async function request(path, options = {}) {
  const response = await fetch(`${SERVER}${path}`, {
    cache: "no-store",
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) }
  });
  if (!response.ok) throw new Error(`Control center returned HTTP ${response.status}`);
  return response.json();
}

async function probeAccount(tabId) {
  const cached = probeCache.get(tabId);
  if (cached && Date.now() - cached.at < 60000) return cached.value;
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: async () => {
      const output = { loggedIn: false, handle: "", name: "", channelId: "" };
      const text = (value) => {
        if (!value || typeof value !== "object") return "";
        if (typeof value.simpleText === "string") return value.simpleText.trim();
        if (Array.isArray(value.runs)) return value.runs.map((run) => String(run.text || "")).join("").trim();
        return "";
      };
      try {
        const configuredLogin = window.ytcfg && window.ytcfg.get("LOGGED_IN");
        const avatar = document.querySelector(
          'button#avatar-btn, ytd-topbar-menu-button-renderer #avatar-btn, #avatar.yt-img-shadow'
        );
        const signIn = document.querySelector(
          'ytd-button-renderer#sign-in-button, a[href*="ServiceLogin"]'
        );
        output.loggedIn = configuredLogin === true || (Boolean(avatar) && !signIn);
        const key = window.ytcfg.get("INNERTUBE_API_KEY");
        const context = window.ytcfg.get("INNERTUBE_CONTEXT");
        output.delegatedSessionId = String(
          window.ytcfg.get("DELEGATED_SESSION_ID") ||
          context && context.user && context.user.onBehalfOfUser ||
          ""
        );
        output.sessionIndex = String(window.ytcfg.get("SESSION_INDEX") ?? "0");
        if (!key || !context) return output;
        const response = await fetch(`/youtubei/v1/account/account_menu?key=${encodeURIComponent(key)}`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ context })
        });
        const data = await response.json();
        const handles = [];
        const names = [];
        const channelIds = [];
        const selected = [];
        const walk = (value) => {
          if (!value || typeof value !== "object") return;
          if (value.isSelected === true || value.selected === true || value.activeAccountHeaderRenderer) selected.push(value.activeAccountHeaderRenderer || value);
          for (const [keyName, child] of Object.entries(value)) {
            const rendered = text(child);
            if (rendered && /^@[A-Za-z0-9._-]+$/.test(rendered)) handles.push(rendered);
            if (rendered && /accountName|channelName|displayName|accountTitle/i.test(keyName) && !rendered.includes("@")) names.push(rendered);
            if (typeof child === "string" && /^(?:UC)[A-Za-z0-9_-]{20,40}$/.test(child) && /browseId|channelId|externalChannelId/i.test(keyName)) channelIds.push(child);
            walk(child);
          }
        };
        walk(data);
        if (selected.length) {
          handles.length = 0;
          names.length = 0;
          channelIds.length = 0;
          walk(selected[0]);
        }
        output.handle = handles[0] || "";
        output.name = names[0] || "";
        output.channelId = channelIds[0] || "";
        if (output.handle || output.name) output.loggedIn = true;
      } catch (error) {
        output.error = String(error && error.message || error);
      }
      return output;
    }
  });
  const value = results[0] && results[0].result || { loggedIn: false, handle: "", name: "" };
  probeCache.set(tabId, { at: Date.now(), value });
  return value;
}

async function prepareChatPage(tabId) {
  const results = await chrome.scripting.executeScript({
    target: await youtubeScriptTarget(tabId),
    func: async () => {
      const roots = [document];
      for (let index = 0; index < roots.length; index += 1) {
        for (const element of roots[index].querySelectorAll("*")) {
          if (element.shadowRoot) roots.push(element.shadowRoot);
        }
      }
      const find = (selector) => roots.map((root) => root.querySelector(selector)).find(Boolean);
      if (!find("yt-live-chat-app, yt-live-chat-renderer")) return { isChat: false };
      const context = window.ytcfg && window.ytcfg.get("INNERTUBE_CONTEXT");
      const delegatedSessionId = String(
        window.ytcfg && window.ytcfg.get("DELEGATED_SESSION_ID") ||
        context && context.user && context.user.onBehalfOfUser ||
        ""
      );
      const sessionIndex = String((window.ytcfg && window.ytcfg.get("SESSION_INDEX")) ?? "0");
      let pageIdentity = { handle: "", name: "", channelId: "" };
      try {
        const key = window.ytcfg && window.ytcfg.get("INNERTUBE_API_KEY");
        const accountContext = window.ytcfg && window.ytcfg.get("INNERTUBE_CONTEXT");
        if (key && accountContext) {
          const response = await fetch(`/youtubei/v1/account/account_menu?key=${encodeURIComponent(key)}`, {
            method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ context: accountContext })
          });
          const data = await response.json();
          const selected = [];
          const findSelected = (value) => {
            if (!value || typeof value !== "object") return;
            if (value.isSelected === true || value.selected === true || value.activeAccountHeaderRenderer) selected.push(value.activeAccountHeaderRenderer || value);
            Object.values(value).forEach(findSelected);
          };
          findSelected(data);
          const strings = [];
          const ids = [];
          const collect = (value, keyName = "") => {
            if (!value || typeof value !== "object") return;
            if (typeof value.simpleText === "string") strings.push(value.simpleText.trim());
            if (Array.isArray(value.runs)) strings.push(value.runs.map((run) => String(run.text || "")).join("").trim());
            for (const [childKey, child] of Object.entries(value)) {
              if (typeof child === "string" && /^UC[A-Za-z0-9_-]{20,40}$/.test(child) && /browseId|channelId|externalChannelId/i.test(childKey)) ids.push(child);
              else collect(child, childKey);
            }
          };
          collect(selected[0] || data);
          pageIdentity.handle = strings.find((value) => /^@[A-Za-z0-9._-]+$/.test(value)) || "";
          pageIdentity.name = strings.find((value) => value && !value.startsWith("@") && value.length < 80) || "";
          pageIdentity.channelId = ids[0] || "";
        }
      } catch {}
      const styleId = "account-control-lite-style";
      let style = document.getElementById(styleId);
      if (!style) {
        style = document.createElement("style");
        style.id = styleId;
        document.documentElement.append(style);
      }
      style.textContent = `
          #ticker, yt-live-chat-header-renderer, yt-live-chat-banner-manager,
          yt-live-chat-viewer-engagement-message-renderer, yt-live-chat-action-panel-renderer {
            display: none !important;
          }
          #items.yt-live-chat-item-list-renderer, yt-live-chat-item-list-renderer #items {
            display: block !important;
            position: fixed !important;
            left: -10000px !important;
            top: 0 !important;
            width: 2px !important;
            height: 2px !important;
            overflow: hidden !important;
            opacity: .01 !important;
            pointer-events: none !important;
          }
          *, *::before, *::after {
            animation: none !important;
            transition: none !important;
            scroll-behavior: auto !important;
          }
          yt-live-chat-renderer, #contents, #chat, #content-pages {
            contain: layout paint style !important;
          }
      `;

      const items = find("#items.yt-live-chat-item-list-renderer, yt-live-chat-item-list-renderer #items");
      if (items && !items.dataset.accountControlTrimmed) {
        items.dataset.accountControlTrimmed = "true";
        while (items.childElementCount > 80) items.firstElementChild.remove();
        new MutationObserver(() => {
          while (items.childElementCount > 80) items.firstElementChild.remove();
        }).observe(items, { childList: true });
      }

      const input = find(
        '#input[contenteditable], yt-live-chat-text-input-field-renderer [contenteditable], [contenteditable][role="textbox"], textarea[aria-label]'
      );
      const avatar = find(
        'yt-live-chat-message-input-renderer #avatar img, #input-panel #avatar img, img#img.yt-img-shadow'
      );
      const inputPanel = find("yt-live-chat-message-input-renderer, #input-panel");
      const identityText = [
        input && input.getAttribute("aria-label"),
        input && input.getAttribute("placeholder"),
        avatar && avatar.getAttribute("alt"),
        inputPanel && inputPanel.getAttribute("aria-label"),
        inputPanel && inputPanel.innerText
      ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      const handle = identityText.match(/@[A-Za-z0-9._-]+/)?.[0] || "";
      const asName = identityText.match(/(?:chat publicly as|comment as)\s+([^|·\n]+)/i)?.[1]?.trim() || "";
      const avatarName = String(avatar && avatar.getAttribute("alt") || "").trim();
      const reason = input ? "" : String(document.body && document.body.innerText || "").replace(/\s+/g, " ").trim().slice(0, 180);
      return {
        isChat: true,
        ready: Boolean(input),
        loggedIn: Boolean(input),
        handle: handle || pageIdentity.handle,
        name: asName || avatarName || pageIdentity.name,
        channelId: pageIdentity.channelId,
        reason,
        delegatedSessionId,
        sessionIndex
      };
    }
  });
  const rows = results.map((item) => item && item.result).filter((item) => item && item.isChat);
  return rows.find((row) => row.ready) || rows[0] || { isChat: false, ready: false, loggedIn: false, handle: "", name: "", reason: "Chat frame is still loading" };
}

async function readChatIdentity(tabId, attempts = 12) {
  let result = { ready: false, loggedIn: false, handle: "", name: "", reason: "Chat frame is still loading" };
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    result = await prepareChatPage(tabId).catch((error) => ({
      ready: false,
      loggedIn: false,
      handle: "",
      name: "",
      reason: String(error && error.message || error)
    }));
    if (result.ready) return result;
    await sleep(350);
  }
  return result;
}

async function parkTab(tabId, videoId = lite.videoId) {
  await chrome.tabs.update(tabId, { url: parkedUrl(videoId), muted: true }).catch(() => {});
  await waitForTab(tabId, 5000).catch(() => {});
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab && !tab.active) await chrome.tabs.discard(tabId).catch(() => {});
}

async function parkOverflow(exceptTabId) {
  hotOrder = [...new Set(hotOrder.filter((tabId) => Number.isFinite(tabId)))];
  while (hotOrder.length > HOT_LIMIT) {
    const tabId = hotOrder.shift();
    if (tabId === exceptTabId) {
      hotOrder.push(tabId);
      continue;
    }
    const cached = accountCache.get(String(tabId));
    if (!cached) continue;
    await parkTab(tabId);
    accountCache.set(String(tabId), { ...cached, liteState: "parked", ready: true, videoId: lite.videoId });
  }
}

async function prepareLiteTab(tabId, activate = true) {
  await stateReady;
  if (!lite.enabled || !lite.videoId) throw new Error("Start Lite Mode first");
  let tab = await chrome.tabs.get(tabId);
  const cached = accountCache.get(String(tabId)) || {};
  if (activate) tab = await chrome.tabs.update(tabId, { active: true });
  if (tabMode(tab) !== "hot" || tabVideoId(tab) !== lite.videoId || !cached.ready) {
    await chrome.tabs.update(tabId, { url: chatUrl(lite.videoId), active: activate });
    await waitForTab(tabId, 12000, (candidate) => tabMode(candidate) === "hot" && tabVideoId(candidate) === lite.videoId);
  }
  let identity = await readChatIdentity(tabId);
  if (!identity.ready && /not loaded|cannot access|permission/i.test(identity.reason || "")) {
    await chrome.tabs.reload(tabId).catch(() => {});
    await waitForTab(tabId, 12000, (candidate) => tabMode(candidate) === "hot" && tabVideoId(candidate) === lite.videoId).catch(() => {});
    identity = await readChatIdentity(tabId);
  }
  const next = {
    ...cached,
    handle: identity.handle || cached.handle || "",
    name: identity.name || cached.name || "",
    channelId: identity.channelId || cached.channelId || "",
    loggedIn: Boolean(identity.loggedIn || cached.loggedIn),
    ready: Boolean(identity.ready),
    error: identity.ready ? "" : identity.reason,
    liteState: "hot",
    videoId: lite.videoId
  };
  next.delegatedSessionId = identity.delegatedSessionId || cached.delegatedSessionId || "";
  next.sessionIndex = identity.sessionIndex || cached.sessionIndex || "0";
  accountCache.set(String(tabId), next);
  hotOrder = hotOrder.filter((value) => value !== tabId);
  hotOrder.push(tabId);
  await parkOverflow(tabId);
  await persistState();
  await snapshot();
  if (!identity.ready) throw new Error(identity.reason || "Live-chat input is unavailable");
  return { ready: true, handle: next.handle, name: next.name, liteState: "hot" };
}

async function startLiteMode(videoId) {
  await stateReady;
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
  const candidates = [];
  let windowNumber = 0;
  for (const window of windows) {
    const tabs = (window.tabs || []).filter((tab) => Boolean(tabMode(tab)));
    if (!tabs.length) continue;
    windowNumber += 1;
    for (let index = 0; index < tabs.length; index += 1) {
      const tab = tabs[index];
      const cached = accountCache.get(String(tab.id)) || {};
      let identity = {};
      if (tabMode(tab) === "full") identity = await probeAccount(tab.id).catch(() => ({}));
      accountCache.set(String(tab.id), {
        ...cached,
        handle: identity.handle || cached.handle || "",
        name: identity.name || cached.name || "",
        channelId: identity.channelId || cached.channelId || "",
        loggedIn: Boolean(identity.loggedIn || cached.loggedIn),
        title: cached.title || tab.title || `Account ${candidates.length + 1}`,
        previousUrl: cached.previousUrl || tab.url,
        windowNumber,
        tabNumber: index + 1,
        videoId,
        liteState: "indexing",
        ready: false
      });
      candidates.push(tab);
    }
  }
  if (!candidates.length) throw new Error("No YouTube account tabs were found");

  lite = { enabled: true, phase: "indexing", videoId, total: candidates.length, indexed: 0 };
  hotOrder = [];
  await persistState();

  const hotIds = new Set();
  const representedWindows = new Set();
  for (const tab of candidates) {
    if (!representedWindows.has(tab.windowId) && hotIds.size < HOT_LIMIT) {
      representedWindows.add(tab.windowId);
      hotIds.add(tab.id);
    }
  }
  for (const tab of candidates) {
    if (hotIds.size >= HOT_LIMIT) break;
    hotIds.add(tab.id);
  }

  let cursor = 0;
  const worker = async () => {
    while (cursor < candidates.length) {
      const position = cursor++;
      const tab = candidates[position];
      await chrome.tabs.update(tab.id, { url: chatUrl(videoId), muted: true }).catch(() => {});
      await waitForTab(tab.id, 12000, (candidate) => tabMode(candidate) === "hot" && tabVideoId(candidate) === videoId).catch(() => {});
      const identity = await readChatIdentity(tab.id, 10);
      const cached = accountCache.get(String(tab.id)) || {};
      const keepHot = hotIds.has(tab.id);
      accountCache.set(String(tab.id), {
        ...cached,
        handle: identity.handle || cached.handle || "",
        name: identity.name || cached.name || "",
        loggedIn: Boolean(identity.loggedIn || cached.loggedIn),
        ready: Boolean(identity.ready),
        error: identity.ready ? "" : identity.reason,
        liteState: keepHot ? "hot" : "parked",
        videoId
      });
      const updated = accountCache.get(String(tab.id));
      updated.delegatedSessionId = identity.delegatedSessionId || cached.delegatedSessionId || "";
      updated.sessionIndex = identity.sessionIndex || cached.sessionIndex || "0";
      if (keepHot) hotOrder.push(tab.id);
      else await parkTab(tab.id, videoId);
      lite.indexed += 1;
    }
  };
  await Promise.all(Array.from({ length: Math.min(HOT_LIMIT, candidates.length) }, () => worker()));
  for (const tabId of hotOrder) await chrome.tabs.update(tabId, { active: true }).catch(() => {});
  for (const tab of candidates) {
    if (!hotIds.has(tab.id)) await chrome.tabs.discard(tab.id).catch(() => {});
  }
  lite.phase = "ready";
  await persistState();
  await snapshot();
  return { total: candidates.length, hot: hotOrder.length, parked: Math.max(0, candidates.length - hotOrder.length) };
}

async function stopLiteMode() {
  await stateReady;
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
  const tabs = windows.flatMap((window) => window.tabs || []).filter((tab) => ["hot", "parked"].includes(tabMode(tab)));
  for (const tab of tabs) {
    const cached = accountCache.get(String(tab.id)) || {};
    const url = cached.previousUrl && /youtube\.com\/watch/.test(cached.previousUrl)
      ? cached.previousUrl
      : `https://www.youtube.com/watch?v=${encodeURIComponent(lite.videoId)}`;
    await chrome.tabs.update(tab.id, { url }).catch(() => {});
    accountCache.set(String(tab.id), { ...cached, liteState: "full", ready: false });
  }
  lite = { enabled: false, phase: "off", videoId: "", total: tabs.length, indexed: 0 };
  hotOrder = [];
  await persistState();
  await sleep(500);
  await snapshot();
  return { restored: tabs.length };
}

async function captureVault() {
  await stateReady;
  if (!lite.enabled || !lite.videoId) throw new Error("Start Lite Mode first");
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
  const tabs = windows.flatMap((window) => window.tabs || []).filter((tab) => ["hot", "parked"].includes(tabMode(tab)));
  let cursor = 0;
  let captured = 0;
  const routes = new Set();
  const groups = new Set();
  const worker = async () => {
    while (cursor < tabs.length) {
      const tab = tabs[cursor++];
      const cached = accountCache.get(String(tab.id)) || {};
      const sourceUrl = cached.previousUrl && /youtube\.com\/watch/.test(cached.previousUrl)
        ? cached.previousUrl
        : `https://www.youtube.com/watch?v=${encodeURIComponent(lite.videoId)}`;
      await chrome.tabs.update(tab.id, { url: sourceUrl, muted: true }).catch(() => {});
      await waitForTab(tab.id, 10000).catch(() => {});
      probeCache.delete(tab.id);
      let identity = await probeAccount(tab.id).catch(() => ({}));
      for (let attempt = 0; attempt < 8; attempt += 1) {
        if (identity.delegatedSessionId) break;
        await sleep(350);
        probeCache.delete(tab.id);
        identity = await probeAccount(tab.id).catch(() => ({}));
      }
      const delegatedSessionId = identity.delegatedSessionId || cached.delegatedSessionId || "";
      const sessionIndex = identity.sessionIndex || cached.sessionIndex || "0";
      accountCache.set(String(tab.id), {
        ...cached,
        handle: identity.handle || cached.handle || "",
        name: identity.name || cached.name || "",
        delegatedSessionId,
        sessionIndex,
        liteState: "parked",
        ready: false,
        videoId: lite.videoId
      });
      if (delegatedSessionId) {
        captured += 1;
        routes.add(`${sessionIndex}:${delegatedSessionId}`);
        groups.add(sessionIndex);
      }
      await parkTab(tab.id);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, tabs.length) }, () => worker()));
  await persistState();
  await snapshot();
  return { total: tabs.length, captured, uniqueRoutes: routes.size, gmailGroups: groups.size };
}

async function ensureDiscoveryTab() {
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
  const tabs = windows.flatMap((window) => window.tabs || []);
  let tab = tabs.find((item) => tabMode(item) === "hot")
    || tabs.find((item) => tabMode(item) === "full")
    || tabs.find(isYouTubeSessionTab)
    || null;
  if (!tab) {
    tab = await chrome.tabs.create({ url: "https://www.youtube.com/", active: true });
    await waitForTab(tab.id, 12000, isYouTubeSessionTab).catch(() => {});
  } else if (tab.discarded) {
    tab = await chrome.tabs.update(tab.id, { active: true }).catch(() => tab);
    await waitForTab(tab.id, 12000, isYouTubeSessionTab).catch(() => {});
  }
  return tab;
}

async function setVaultStream(videoId) {
  await stateReady;
  lite = { enabled: true, phase: "ready", videoId, total: Math.max(routeCatalog.length, lite.total || 0), indexed: routeCatalog.length };
  hotOrder = [];
  await persistState();
  await snapshot();
  return { total: routeCatalog.length, hot: 0, parked: 0 };
}

async function testVaultWorker(targetId) {
  await stateReady;
  const sourceTabId = tabIdFromTarget(targetId);
  const route = accountCache.get(String(sourceTabId)) || {};
  if (!route.delegatedSessionId) throw new Error("This account route was not captured");
  const key = String(route.sessionIndex || "0");
  let workerTabId = vaultWorkers.get(key);
  let workerTab = workerTabId ? await chrome.tabs.get(workerTabId).catch(() => null) : null;
  if (!workerTab) {
    workerTab = await chrome.tabs.create({ url: "about:blank", active: true });
    workerTabId = workerTab.id;
    vaultWorkers.set(key, workerTabId);
  }
  await chrome.tabs.update(workerTabId, {
    active: true,
    muted: true,
    url: workerUrl(lite.videoId, route.sessionIndex, route.delegatedSessionId)
  });
  await waitForTab(workerTabId, 10000).catch(() => {});
  const identity = await readChatIdentity(workerTabId, 10);
  const matched = Boolean(identity.delegatedSessionId && identity.delegatedSessionId === route.delegatedSessionId);
  return {
    matched,
    ready: Boolean(identity.ready),
    handle: identity.handle || route.handle || "",
    name: identity.name || route.name || "",
    reason: identity.ready ? "" : identity.reason || "Chat input unavailable"
  };
}

async function debugAccountRoutes(targetId) {
  await stateReady;
  const sourceTabId = tabIdFromTarget(targetId);
  let workerTab = await chrome.tabs.get(sourceTabId).catch(() => null);
  if (!workerTab || tabMode(workerTab) !== "hot") {
    const windows = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
    workerTab = windows.flatMap((window) => window.tabs || []).find((tab) => tabMode(tab) === "hot") || null;
  }
  if (!workerTab) {
    workerTab = await chrome.tabs.create({ url: chatUrl(lite.videoId), active: true });
    await waitForTab(workerTab.id, 12000).catch(() => {});
  }
  const results = await chrome.scripting.executeScript({
    target: { tabId: workerTab.id },
    world: "MAIN",
    func: async () => {
      const key = window.ytcfg && window.ytcfg.get("INNERTUBE_API_KEY");
      const context = window.ytcfg && window.ytcfg.get("INNERTUBE_CONTEXT");
      if (!key || !context) return { paths: [], error: "YouTube session context unavailable" };
      const requestOptions = {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ context })
      };
      const menuResponse = await fetch(`/youtubei/v1/account/account_menu?key=${encodeURIComponent(key)}`, requestOptions);
      const listResponse = await fetch(`/youtubei/v1/account/accounts_list?key=${encodeURIComponent(key)}`, requestOptions);
      const menuData = await menuResponse.json().catch(() => ({}));
      const listData = await listResponse.json().catch(() => ({}));
      const paths = [];
      const seen = new Set();
      const walk = (value, path = []) => {
        if (paths.length >= 600 || value == null) return;
        if (typeof value === "string") {
          const keyPath = path.join(".");
          if (/trackingParams/i.test(keyPath)) return;
          const useful = /^@[A-Za-z0-9._-]+$/.test(value)
            || /^UC[A-Za-z0-9_-]{20,40}$/.test(value)
            || /(?:delegated|page.?id|channel.?id|browse.?id|account.?name|handle|selectactiveidentity|supportedtokens|signal|accountitemrenderer|compactlinkrenderer)/i.test(keyPath);
          if (useful && value.length <= 200) {
            const signature = `${keyPath}|${value}`;
            if (!seen.has(signature)) { seen.add(signature); paths.push({ path: keyPath, value }); }
          }
          return;
        }
        if (typeof value !== "object") return;
        if (Array.isArray(value)) value.forEach((child, index) => walk(child, [...path, String(index)]));
        else Object.entries(value).forEach(([name, child]) => walk(child, [...path, name]));
      };
      walk(listData, ["list"]);
      return { paths, menuStatus: menuResponse.status, listStatus: listResponse.status };
    }
  });
  return results.map((item) => item && item.result).find((item) => item && Array.isArray(item.paths)) || { paths: [], error: "Account menu unavailable" };
}

function normalizeHandle(value) {
  const clean = String(value || "").trim().toLowerCase();
  return clean && !clean.startsWith("@") ? `@${clean}` : clean;
}

async function discoverAccountRoutes(sourceTabId) {
  let tab = sourceTabId ? await chrome.tabs.get(sourceTabId).catch(() => null) : null;
  if (!tab || tabMode(tab) !== "hot") {
    const windows = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
    const tabs = windows.flatMap((window) => window.tabs || []);
    tab = tabs.find((item) => tabMode(item) === "hot")
      || tabs.find((item) => tabMode(item) === "full")
      || tabs.find(isYouTubeSessionTab)
      || null;
  }
  if (!tab) tab = await ensureDiscoveryTab();
  if (!tab) throw new Error("No signed-in YouTube session available for account discovery");
  if (tab.status !== "complete") {
    await waitForTab(tab.id, 12000, isYouTubeSessionTab).catch(() => {});
  }

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    files: ["route-parser.js"]
  });
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    func: async () => {
      const key = window.ytcfg && window.ytcfg.get("INNERTUBE_API_KEY");
      const baseContext = window.ytcfg && window.ytcfg.get("INNERTUBE_CONTEXT");
      const parser = window.AccountRouteParser;
      if (!key || !baseContext || !parser) return { routes: [], error: "YouTube account session unavailable" };
      const output = [];
      const errors = [];
      for (let index = 0; index < 5; index += 1) {
        try {
          const context = JSON.parse(JSON.stringify(baseContext));
          context.user = { ...(context.user || {}), sessionIndex: String(index) };
          const response = await fetch(
            `/youtubei/v1/account/accounts_list?key=${encodeURIComponent(key)}&authuser=${index}`,
            {
              method: "POST",
              credentials: "include",
              headers: { "content-type": "application/json", "x-goog-authuser": String(index) },
              body: JSON.stringify({
                context,
                nextUrl: "/",
                requestType: "ACCOUNTS_LIST_REQUEST_TYPE_CHANNEL_SWITCHER"
              })
            }
          );
          if (!response.ok) { errors.push(`authuser ${index}: HTTP ${response.status}`); continue; }
          for (const route of parser.extract(await response.json())) {
            output.push({ ...route, sessionIndex: route.sessionIndex || String(index) });
          }
        } catch (error) {
          errors.push(`authuser ${index}: ${String(error && error.message || error)}`);
        }
      }
      const seen = new Set();
      const routes = output.filter((route) => {
        const id = route.pageId || route.channelId || String(route.handle || "").toLowerCase();
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      return { routes, error: routes.length ? "" : errors.join("; ") || "No YouTube channel routes found" };
    }
  });
  const value = results.map((item) => item && item.result).find((item) => item && Array.isArray(item.routes));
  if (!value || !value.routes.length) throw new Error(value?.error || "No YouTube channel routes found");
  routeCatalog = value.routes;
  await persistState();
  return routeCatalog;
}

async function syncAccountRoutes() {
  const tab = await ensureDiscoveryTab();
  const routes = await discoverAccountRoutes(tab.id);
  await snapshot();
  return {
    total: routes.length,
    uniqueRoutes: routes.length,
    gmailGroups: new Set(routes.map((route) => String(route.sessionIndex || "0"))).size,
    routes
  };
}

function findAccountRoute(routes, channelId, handle) {
  const expectedHandle = normalizeHandle(handle);
  return routes.find((route) => channelId && route.channelId === channelId)
    || routes.find((route) => channelId && route.pageId === channelId)
    || routes.find((route) => expectedHandle && normalizeHandle(route.handle) === expectedHandle)
    || null;
}

async function resolveAccountRoute(sourceTabId, channelId, handle) {
  let route = findAccountRoute(routeCatalog, channelId, handle);
  if (route) return route;
  route = findAccountRoute(await discoverAccountRoutes(sourceTabId), channelId, handle);
  if (!route) throw new Error(`Selected account ${handle || channelId} was not found in signed-in YouTube channels`);
  if (!route.pageId) throw new Error(`Selected account ${handle || channelId} has no YouTube page route`);
  return route;
}

async function prepareVaultWorker(sourceTabId, requestedChannelId, requestedHandle = "") {
  return prepareVaultTarget(`chrome_tab_${sourceTabId}`, sourceTabId, requestedChannelId, requestedHandle);
}

async function prepareVaultTarget(sourceKey, sourceTabId, requestedChannelId, requestedHandle = "") {
  await stateReady;
  if (!lite.enabled || !lite.videoId) throw new Error("Start Lite Mode first");
  const cached = sourceTabId ? accountCache.get(String(sourceTabId)) || {} : accountCache.get(String(sourceKey)) || {};
  const channelId = String(requestedChannelId || cached.channelId || cached.delegatedSessionId || "");
  if (!/^UC[A-Za-z0-9_-]{20,40}$/.test(channelId)) throw new Error("Selected account has no valid YouTube channel route");
  const handle = normalizeHandle(requestedHandle || cached.handle);
  const discoveryTab = sourceTabId || (await ensureDiscoveryTab()).id;
  const route = await resolveAccountRoute(discoveryTab, channelId, handle);
  const pageId = String(route.pageId || "");

  const candidates = [...new Set([
    String(route.sessionIndex ?? ""), String(cached.sessionIndex ?? ""), "0", "1", "2", "3", "4"
  ].filter(Boolean))];
  let lastReason = "Selected account route did not load";
  for (const sessionIndex of candidates) {
    let workerTabId = vaultWorkers.get(sessionIndex);
    let workerTab = workerTabId ? await chrome.tabs.get(workerTabId).catch(() => null) : null;
    if (!workerTab) {
      workerTab = await chrome.tabs.create({ url: "about:blank", active: true });
      workerTabId = workerTab.id;
      vaultWorkers.set(sessionIndex, workerTabId);
    }
    const routeKey = `${sessionIndex}:${pageId}:${lite.videoId}`;
    const url = workerSwitchUrl(lite.videoId, sessionIndex, pageId);
    if (vaultWorkerRoutes.get(sessionIndex) !== routeKey || workerTab.status !== "complete") {
      await chrome.tabs.update(workerTabId, { active: true, muted: true, url });
      await waitForTab(workerTabId, 18000, (tab) => tab.status === "complete" && /youtube\.com\/live_chat/.test(tab.url || "") && tabVideoId(tab) === lite.videoId).catch(() => {});
      vaultWorkerRoutes.set(sessionIndex, routeKey);
    } else {
      await chrome.tabs.update(workerTabId, { active: true }).catch(() => {});
    }
    const identity = await readChatIdentity(workerTabId, 12);
    const actualChannelId = String(identity.channelId || identity.delegatedSessionId || "");
    const actualHandle = normalizeHandle(identity.handle);
    const matched = identity.delegatedSessionId === pageId
      || identity.channelId === channelId
      || Boolean(handle && actualHandle === handle);
    if (identity.ready && matched) {
      accountCache.set(String(sourceKey), {
        ...cached,
        channelId,
        handle: identity.handle || requestedHandle || cached.handle || route.handle || "",
        name: identity.name || cached.name || route.name || "",
        delegatedSessionId: pageId,
        sessionIndex,
        loggedIn: true,
        ready: true,
        error: ""
      });
      await persistState();
      return { tabId: workerTabId, channelId, pageId, sessionIndex, identity };
    }
    lastReason = identity.ready
      ? `YouTube opened ${actualChannelId || "another channel"}, not selected channel`
      : identity.reason || lastReason;
  }
  throw new Error(`Selected account could not be verified. ${lastReason}`);
}

async function snapshot() {
  await stateReady;
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
  const accounts = [];
  let windowNumber = 0;
  for (const window of windows) {
    const tabs = (window.tabs || []).filter((tab) => {
      const mode = tabMode(tab);
      return lite.enabled ? ["hot", "parked"].includes(mode) : mode === "full";
    });
    if (!tabs.length) continue;
    windowNumber += 1;
    const originalActive = (window.tabs || []).find((tab) => tab.active);
    for (let index = 0; index < tabs.length; index += 1) {
      const tab = tabs[index];
      const mode = tabMode(tab);
      if (lite.enabled && mode === "parked" && !tab.active && !tab.discarded) {
        await chrome.tabs.discard(tab.id).catch(() => {});
      }
      const cached = accountCache.get(String(tab.id)) || {};
      let account;
      if (lite.enabled) {
        account = {
          loggedIn: Boolean(cached.loggedIn || cached.ready),
          handle: cached.handle || "",
          name: cached.name || "",
          channelId: cached.channelId || "",
          error: cached.error || ""
        };
      } else try {
        account = await probeAccount(tab.id);
      } catch (error) {
        const message = String(error && error.message || error);
        if (/Cannot access contents|No frame with id|Frame with ID/i.test(message)) {
          await chrome.tabs.update(tab.id, { active: true }).catch(() => {});
          await sleep(700);
          probeCache.delete(tab.id);
          account = await probeAccount(tab.id).catch((retryError) => ({
            loggedIn: false,
            handle: "",
            name: "",
            error: String(retryError && retryError.message || retryError)
          }));
        } else {
          account = { loggedIn: false, handle: "", name: "", error: message };
        }
      }
      const url = new URL(tab.url);
      const videoId = lite.enabled ? lite.videoId : (url.searchParams.get("v") || "");
      accounts.push({
        targetId: `chrome_tab_${tab.id}`,
        windowId: window.id,
        windowNumber,
        title: cached.title || tab.title || "YouTube",
        url: lite.enabled ? `https://www.youtube.com/watch?v=${videoId}` : tab.url,
        videoId,
        loggedIn: Boolean(account.loggedIn),
        handle: String(account.handle || ""),
        name: String(account.name || ""),
        channelId: String(account.channelId || cached.channelId || ""),
        liteState: mode,
        ready: Boolean(cached.ready || mode === "full"),
        tabNumber: Number(cached.tabNumber || index + 1),
        accountError: String(account.error || "")
      });
    }
    if (originalActive) await chrome.tabs.update(originalActive.id, { active: true }).catch(() => {});
  }
  if (lite.enabled && routeCatalog.length) {
    const routeCount = Math.min(routeCatalog.length, accounts.length);
    for (let index = 0; index < routeCount; index += 1) {
      const route = routeCatalog[index];
      accounts[index] = {
        ...accounts[index],
        loggedIn: true,
        handle: String(route.handle || ""),
        name: String(route.name || ""),
        channelId: String(route.channelId || ""),
        ready: Boolean(route.pageId),
        accountError: route.pageId ? "" : "YouTube page route unavailable"
      };
    }
    accounts.splice(routeCount);
  }
  const hot = accounts.filter((account) => account.liteState === "hot").length;
  const parked = accounts.filter((account) => account.liteState === "parked").length;
  const preferredChatTarget = hotOrder.length ? `chrome_tab_${hotOrder[hotOrder.length - 1]}` : "";
  const chatTab = accounts.find((account) => account.targetId === preferredChatTarget && account.liteState === "hot")
    || accounts.find((account) => account.liteState === "hot");
  let chat = [];
  let chatDebug = { frames: 0, renderers: 0, messages: 0, reason: "No hot chat tab" };
  if (chatTab) {
    const chatTabId = tabIdFromTarget(chatTab.targetId);
    const chatCached = accountCache.get(String(chatTabId)) || {};
    if (chatCached.chatStyleVersion !== CHAT_STYLE_VERSION) {
      await prepareChatPage(chatTabId).catch(() => null);
      accountCache.set(String(chatTabId), { ...chatCached, chatStyleVersion: CHAT_STYLE_VERSION });
      await persistState();
    }
    const result = await chrome.scripting.executeScript({
      target: await youtubeScriptTarget(chatTabId),
      func: () => {
        const roots = [document];
        for (let index = 0; index < roots.length; index += 1) {
          for (const element of roots[index].querySelectorAll("*")) if (element.shadowRoot && !roots.includes(element.shadowRoot)) roots.push(element.shadowRoot);
        }
        const selector = "yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer, yt-live-chat-membership-item-renderer, yt-live-chat-paid-sticker-renderer";
        const renderers = [...new Set(roots.flatMap((root) => Array.from(root.querySelectorAll(selector))))];
        const read = (row, childSelector) => {
          const rowRoots = [row];
          if (row.shadowRoot) rowRoots.push(row.shadowRoot);
          return rowRoots.map((root) => root.querySelector(childSelector)).find(Boolean);
        };
        const rows = renderers.slice(-80).map((row, index) => {
          const authorNode = read(row, "#author-name, [id='author-name'], .author-name");
          const messageNode = read(row, "#message, [id='message'], #header-subtext, [id='header-subtext']");
          const timeNode = read(row, "#timestamp, [id='timestamp']");
          const avatarNode = read(row, "#img, img");
          return {
            id: row.id || row.getAttribute("data-id") || `${Date.now()}-${index}`,
            author: String(authorNode?.textContent || row.getAttribute("author-name") || "").replace(/\s+/g, " ").trim(),
            message: String(messageNode?.textContent || "").replace(/\s+/g, " ").trim(),
            timestamp: String(timeNode?.textContent || "").replace(/\s+/g, " ").trim(),
            avatar: String(avatarNode?.src || "")
          };
        }).filter((row) => row.message);
        const pageText = String(document.body?.innerText || "").replace(/\s+/g, " ").trim();
        return { rows, renderers: renderers.length, isChat: Boolean(document.querySelector("yt-live-chat-app, yt-live-chat-renderer")), reason: rows.length ? "" : pageText.slice(0, 160) };
      }
    }).catch(() => []);
    const frames = result.map((item) => item && item.result).filter(Boolean);
    chat = frames.flatMap((item) => Array.isArray(item.rows) ? item.rows : []).slice(-80);
    chatDebug = {
      frames: frames.filter((item) => item.isChat).length,
      renderers: frames.reduce((total, item) => total + Number(item.renderers || 0), 0),
      messages: chat.length,
      reason: frames.find((item) => item.reason)?.reason || ""
    };
  }
  await request("/agent/snapshot", {
    method: "POST",
    body: JSON.stringify({
      bridgeVersion: chrome.runtime.getManifest().version,
      accounts,
      chat,
      chatDebug,
      routeCatalog,
      lite: { ...lite, hot, parked, total: accounts.length || routeCatalog.length || lite.total || 0 }
    })
  });
}

function tabIdFromTarget(targetId) {
  const match = /^chrome_tab_(\d+)$/.exec(String(targetId || ""));
  if (!match) throw new Error("Invalid selected tab");
  return Number(match[1]);
}

function channelIdFromVaultTarget(targetId) {
  const match = /^vault_(UC[A-Za-z0-9_-]{20,40})$/.exec(String(targetId || ""));
  return match ? match[1] : "";
}

async function liveChatFrame(tabId) {
  const frames = await chrome.webNavigation.getAllFrames({ tabId });
  const frame = (frames || []).find((item) => /youtube\.com\/live_chat/.test(item.url || ""));
  if (!frame) throw new Error("Live-chat frame not found in selected tab");
  return frame.frameId;
}

async function stage(targetId, message, requestedChannelId = "", requestedHandle = "") {
  await stateReady;
  const targetKey = String(targetId || "");
  const vaultChannelId = channelIdFromVaultTarget(targetKey);
  const sourceTabId = vaultChannelId ? 0 : tabIdFromTarget(targetKey);
  let sendTabId = sourceTabId;
  let verifiedIdentity = null;
  if (lite.enabled || vaultChannelId) {
    const prepared = await prepareVaultTarget(targetKey, sourceTabId, requestedChannelId || vaultChannelId, requestedHandle);
    sendTabId = prepared.tabId;
    verifiedIdentity = prepared.identity;
  } else {
    await chrome.tabs.update(sourceTabId, { active: true });
    await chrome.scripting.executeScript({
      target: { tabId: sendTabId },
      func: () => {
        const button = document.querySelector(
          'ytd-live-chat-frame #show-hide-button button, ytd-live-chat-frame button[aria-label*="chat" i]'
        );
        if (button && button.getAttribute("aria-expanded") === "false") button.click();
      }
    }).catch(() => {});
  }

  let lastError = "Live-chat input is unavailable";
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const results = await chrome.scripting.executeScript({
      target: await youtubeScriptTarget(sendTabId),
      func: (value) => {
      if (!document.querySelector("yt-live-chat-app, yt-live-chat-renderer")) return { ok: false, skip: true };
      const roots = [document];
      for (let index = 0; index < roots.length; index += 1) {
        for (const element of roots[index].querySelectorAll("*")) {
          if (element.shadowRoot) roots.push(element.shadowRoot);
        }
      }
      const find = (selector) => roots.map((root) => root.querySelector(selector)).find(Boolean);
      const opener = find('#input-panel, yt-live-chat-text-input-field-renderer, [contenteditable][role="textbox"]');
      if (opener) opener.click();
      const input = find('#input[contenteditable], yt-live-chat-text-input-field-renderer [contenteditable], [contenteditable][role="textbox"], textarea[aria-label]');
      if (!input) {
        const reason = String(document.body && document.body.innerText || "").replace(/\s+/g, " ").trim().slice(0, 240);
        return { ok: false, error: reason ? `Live-chat input unavailable: ${reason}` : "Live-chat input is unavailable" };
      }
      input.focus();
      if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        document.execCommand("selectAll", false, null);
        document.execCommand("insertText", false, value);
        input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
      }
      return { ok: true };
      },
      args: [message]
    }).catch((error) => [{ result: { ok: false, error: String(error && error.message || error) } }]);
    const values = results.map((item) => item && item.result).filter(Boolean);
    const value = values.find((item) => item.ok);
    if (value) {
      stagedWorkers.set(targetKey, {
        tabId: sendTabId,
        channelId: String(requestedChannelId || verifiedIdentity?.channelId || verifiedIdentity?.delegatedSessionId || ""),
        at: Date.now()
      });
      return {
        ...value,
        channelId: String(verifiedIdentity?.channelId || verifiedIdentity?.delegatedSessionId || requestedChannelId || ""),
        handle: String(verifiedIdentity?.handle || ""),
        name: String(verifiedIdentity?.name || "")
      };
    }
    lastError = values.find((item) => item.error)?.error || lastError;
    await sleep(500);
  }
  throw new Error(lastError);
}

async function send(targetId, requestedChannelId = "") {
  const targetKey = String(targetId || "");
  const vaultChannelId = channelIdFromVaultTarget(targetKey);
  let sendTabId = vaultChannelId ? 0 : tabIdFromTarget(targetKey);
  if (lite.enabled || vaultChannelId) {
    const staged = stagedWorkers.get(targetKey);
    if (!staged || Date.now() - staged.at > 60000) throw new Error("Selected account message was not prepared");
    if (requestedChannelId && staged.channelId !== requestedChannelId) throw new Error("Selected account changed before send");
    sendTabId = staged.tabId;
  }
  const results = await chrome.scripting.executeScript({
    target: await youtubeScriptTarget(sendTabId),
    func: () => {
      if (!document.querySelector("yt-live-chat-app, yt-live-chat-renderer")) return { ok: false, skip: true };
      const roots = [document];
      for (let index = 0; index < roots.length; index += 1) {
        for (const element of roots[index].querySelectorAll("*")) {
          if (element.shadowRoot) roots.push(element.shadowRoot);
        }
      }
      const find = (selector) => roots.map((root) => root.querySelector(selector)).find(Boolean);
      const input = find('#input[contenteditable], yt-live-chat-text-input-field-renderer [contenteditable], [contenteditable][role="textbox"], textarea[aria-label]');
      if (!input) return { ok: false, error: "Live-chat input is unavailable" };
      const button = find('#send-button button, yt-live-chat-message-input-renderer #send-button button, button[aria-label*="Send" i]');
      if (!button) return { ok: false, error: "Send button is unavailable" };
      if (button.disabled || button.getAttribute("aria-disabled") === "true") return { ok: false, error: "Send button is disabled" };
      button.click();
      return { ok: true };
    }
  });
  const values = results.map((item) => item && item.result).filter(Boolean);
  const value = values.find((item) => item.ok);
  if (!value) throw new Error(values.find((item) => item.error)?.error || "Could not send message");
  stagedWorkers.delete(targetKey);
  return value;
}

async function pollCommands(wait = false) {
  const data = await request(`/agent/commands${wait ? "?wait=1" : ""}`);
  for (const command of data.commands || []) {
    try {
      let result;
      if (command.action === "lite-start") {
        const videoId = String(command.message || "");
        if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error("Invalid YouTube video ID");
        result = await startLiteMode(videoId);
      } else if (command.action === "vault-stream") {
        const videoId = String(command.message || "");
        if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error("Invalid YouTube video ID");
        result = await setVaultStream(videoId);
      } else if (command.action === "lite-stop") {
        result = await stopLiteMode();
      } else if (command.action === "vault-build") {
        result = await captureVault();
      } else if (command.action === "vault-test") {
        result = await testVaultWorker(command.targetId);
      } else if (command.action === "route-debug") {
        result = await debugAccountRoutes(command.targetId);
      } else if (command.action === "routes-sync") {
        result = await syncAccountRoutes();
      } else {
        const targetId = String(command.targetId || "");
        const vaultChannelId = channelIdFromVaultTarget(targetId);
        result = command.action === "stage"
          ? await stage(targetId, String(command.message || ""), String(command.channelId || ""), String(command.handle || ""))
          : command.action === "send"
            ? await send(targetId, String(command.channelId || ""))
            : command.action === "prepare"
              ? (lite.enabled || vaultChannelId
                ? await prepareVaultTarget(targetId, vaultChannelId ? 0 : tabIdFromTarget(targetId), String(command.channelId || ""), String(command.handle || ""))
                : await prepareLiteTab(tabIdFromTarget(targetId), true))
              : (() => { throw new Error("Unknown command"); })();
      }
      await request("/agent/result", { method: "POST", body: JSON.stringify({ commandId: command.commandId, ok: true, result }) });
    } catch (error) {
      await request("/agent/result", { method: "POST", body: JSON.stringify({ commandId: command.commandId, ok: false, error: String(error && error.message || error) }) }).catch(() => {});
    }
  }
}

async function tick() {
  if (busy) return;
  busy = true;
  try {
    await Promise.all([snapshot(), pollCommands()]);
  } catch (_) {
    // The control center may be restarting. Retry silently.
  } finally {
    busy = false;
  }
}

async function commandLoop() {
  while (true) {
    try {
      await pollCommands(true);
    } catch (_) {
      await sleep(1000);
    }
  }
}

chrome.alarms.create("bridge-tick", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(tick);
setInterval(tick, 2000);
chrome.tabs.onCreated.addListener(() => setTimeout(tick, 500));
chrome.tabs.onRemoved.addListener((tabId) => { probeCache.delete(tabId); setTimeout(tick, 250); });
chrome.tabs.onUpdated.addListener((tabId, change) => { if (change.url || change.status === "complete") { probeCache.delete(tabId); setTimeout(tick, 500); } });
tick();
commandLoop();
