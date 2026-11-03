#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync, spawn } = require("child_process");
const http = require("http");
const https = require("https");
const WebSocket = require("ws");

const DEFAULT_CONFIG = "nicknames.json";
const DEFAULT_BROWSER_APP = "Brave Browser";
const CDP_ENDPOINT = process.env.BRAVE_CDP || "http://127.0.0.1:9222";
const BRAVE_BINARY = [
  path.join(process.env.ProgramFiles || "", "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
  path.join(process.env["ProgramFiles(x86)"] || "", "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
  path.join(process.env.LOCALAPPDATA || "", "BraveSoftware", "Brave-Browser", "Application", "brave.exe")
].find((candidate) => candidate && fs.existsSync(candidate));
const BRAVE_HELPER_PROFILE = path.join(os.tmpdir(), "brave-form-helper-profile");

function usage() {
  console.log(`Usage:
  node form-fill.js list
  node form-fill.js mark
  node form-fill.js init [--force]
  node form-fill.js <google-form-url> [--config nicknames.json] [--field "Name"]
  node form-fill.js run <google-form-url> [--config nicknames.json] [--field "Name"]

Notes:
  - Browser: Brave Browser
  - Brave needs to be running with --remote-debugging-port=9222
  - Default run opens one Brave window with one tab per username.
  - Each form is verified, submitted once, and checked for confirmation.
`);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      out._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (["force", "reuse-active", "by-window"].includes(key)) {
      out[key] = true;
      continue;
    }
    const value = argv[++i];
    if (!value) throw new Error(`Missing value for --${key}`);
    out[key] = value;
  }
  return out;
}

function extractGoogleFormUrl(value) {
  const text = String(value || "");
  const match = text.match(/https:\/\/docs\.google\.com\/forms\/[^\]\)\s"]+/);
  return match ? match[0] : text;
}

function runJxa(source, payload = {}) {
  const stdout = execFileSync(
    "osascript",
    ["-l", "JavaScript", "-e", source, "--", JSON.stringify(payload)],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 8 }
  ).trim();

  if (!stdout) return null;
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`Bad osascript JSON output: ${stdout}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestJson(url, { method = "GET", timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const transport = url.startsWith("https:") ? https : http;
    const request = transport.request(url, { method }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`HTTP ${response.statusCode}: ${body.slice(0, 200)}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error(`Invalid JSON from Brave: ${body.slice(0, 200)}`));
        }
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error("Brave request timed out")));
    request.on("error", reject);
    request.end();
  });
}

class CdpClient {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.ws = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("CDP WebSocket connect timeout")), 5000);
      this.ws = new WebSocket(this.webSocketUrl);
      this.ws.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      });
      this.ws.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("CDP WebSocket error"));
      });
      this.ws.addEventListener("message", (event) => {
        let message;
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (!message.id || !this.pending.has(message.id)) return;
        const { resolve: ok, reject: fail } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) fail(new Error(message.error.message || JSON.stringify(message.error)));
        else ok(message.result || {});
      });
    });
  }

  call(method, params = {}, timeoutMs = 5000) {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timeout`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        }
      });
      this.ws.send(payload);
    });
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function ensureCdp() {
  async function fetchVersion() {
    return requestJson(`${CDP_ENDPOINT}/json/version`, { timeoutMs: 2000 });
  }

  let response;
  try {
    return await fetchVersion();
  } catch {
    startBraveWithCdp();
  }

  for (let attempt = 0; attempt < 20; attempt++) {
    await sleep(250);
    try {
      return await fetchVersion();
    } catch {
      // Keep waiting for the helper Brave to expose DevTools.
    }
  }

  throw new Error("Brave CDP not available on 127.0.0.1:9222");
}

function startBraveWithCdp() {
  if (!BRAVE_BINARY) {
    throw new Error("Brave binary not found. Install Brave Browser first.");
  }

  spawn(BRAVE_BINARY, [
    "--remote-debugging-port=9222",
    `--user-data-dir=${BRAVE_HELPER_PROFILE}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-extensions",
    "--disk-cache-size=1",
    "--media-cache-size=1",
    "about:blank"
  ], {
    detached: true,
    stdio: "ignore"
  }).unref();
}

async function cdpNewTab(url) {
  return requestJson(`${CDP_ENDPOINT}/json/new?${encodeURIComponent(url)}`, {
    method: "PUT",
    timeoutMs: 5000
  });
}

function makeFillExpression(youtubeUsername, fieldLabel, radioLabel) {
  return `(() => {
    const youtubeUsername = ${JSON.stringify(youtubeUsername)};
    const fieldLabel = ${JSON.stringify(fieldLabel || "")};
    const radioLabel = ${JSON.stringify(radioLabel || "")};
    function norm(s) {
      return String(s || "").replace(/\\s+/g, " ").trim().toLowerCase();
    }
    function visible(el) {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none";
    }
    function setValue(el, value) {
      const proto = Object.getPrototypeOf(el);
      const desc = Object.getOwnPropertyDescriptor(proto, "value");
      if (desc && desc.set) desc.set.call(el, value);
      else el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    function text(el) {
      return norm(el ? el.innerText || el.textContent || "" : "");
    }
    function selectRadio(label) {
      const radios = Array.from(document.querySelectorAll('[role="radio"], input[type="radio"]'))
        .filter((el) => visible(el) || visible(el.closest("[role=listitem],.Qr7Oae,.Od2TWd,.docssharedWizToggleLabeledContainer") || el));
      if (!radios.length) return { selected: false, reason: "No radio inputs found", count: 0 };

      const wanted = norm(label);
      let radioTarget = null;
      if (wanted) {
        for (const radio of radios) {
          const attrs = norm([
            radio.getAttribute("aria-label"),
            radio.getAttribute("data-value"),
            radio.value,
            radio.name,
            radio.id
          ].join(" "));
          const box = radio.closest("[role=listitem],.Qr7Oae,.Od2TWd,.docssharedWizToggleLabeledContainer") || radio.parentElement;
          if (attrs.includes(wanted) || (box && text(box).includes(wanted))) {
            radioTarget = radio;
            break;
          }
        }
      }
      if (!radioTarget && radios.length === 1) radioTarget = radios[0];
      if (!radioTarget) return { selected: false, reason: "Radio label not found", count: radios.length };

      radioTarget.scrollIntoView({ block: "center", inline: "nearest" });
      const checked = radioTarget.checked || radioTarget.getAttribute("aria-checked") === "true";
      if (!checked) radioTarget.click();
      radioTarget.dispatchEvent(new Event("input", { bubbles: true }));
      radioTarget.dispatchEvent(new Event("change", { bubbles: true }));
      const selected = radioTarget.checked || radioTarget.getAttribute("aria-checked") === "true";
      return { selected, count: radios.length };
    }
    const inputs = Array.from(document.querySelectorAll("input[type=text],input[type=email],input:not([type]),textarea"))
      .filter((el) => visible(el) && !el.disabled && !el.readOnly);
    let target = null;
    if (fieldLabel) {
      const wanted = norm(fieldLabel);
      for (const input of inputs) {
        const attrs = norm([
          input.getAttribute("aria-label"),
          input.getAttribute("placeholder"),
          input.name,
          input.id
        ].join(" "));
        if (attrs.includes(wanted)) {
          target = input;
          break;
        }
        const box = input.closest("[role=listitem],.Qr7Oae,.geS5n,.freebirdFormviewerComponentsQuestionBaseRoot");
        if (box && text(box).includes(wanted)) {
          target = input;
          break;
        }
      }
    }
    if (!target && inputs.length) target = inputs[0];
    if (!target) {
      return {
        ok: false,
        error: "No visible text input found",
        inputCount: inputs.length,
        title: document.title,
        url: location.href
      };
    }
    target.scrollIntoView({ block: "center", inline: "nearest" });
    target.focus();
    setValue(target, youtubeUsername);
    target.blur();
    const radio = radioLabel ? selectRadio(radioLabel) : { selected: false, reason: "No radioLabel configured", count: 0 };
    const verified = String(target.value || "") === youtubeUsername;
    return {
      ok: verified,
      verified,
      youtubeUsername,
      radio,
      inputCount: inputs.length,
      title: document.title,
      url: location.href
    };
  })()`;
}

function makeSubmitExpression() {
  return `(() => {
    function norm(value) {
      return String(value || "").replace(/\\s+/g, " ").trim().toLowerCase();
    }
    function visible(element) {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    }
    const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"]'))
      .filter((element) => visible(element) && !element.disabled && element.getAttribute("aria-disabled") !== "true");
    const submit = buttons.find((element) => {
      const label = norm(element.innerText || element.textContent || element.value || element.getAttribute("aria-label"));
      return ["submit", "submit form", "отправить", "отправить форму", "жіберу", "форманы жіберу"].includes(label);
    });
    if (!submit) return { clicked: false, error: "Visible Submit button not found" };
    submit.scrollIntoView({ block: "center", inline: "nearest" });
    submit.click();
    return { clicked: true };
  })()`;
}

function makeConfirmationExpression() {
  return `(() => {
    const text = String(document.body ? document.body.innerText : "").replace(/\\s+/g, " ").toLowerCase();
    const url = location.href;
    return {
      confirmed: url.includes("/formResponse") || text.includes("your response has been recorded") || text.includes("response has been submitted"),
      title: document.title,
      url
    };
  })()`;
}

function makeReadyExpression(radioLabel) {
  return `(() => {
    const radioLabel = ${JSON.stringify(radioLabel || "")};
    function visible(element) {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    }
    const inputReady = Array.from(document.querySelectorAll("input[type=text],input[type=email],input:not([type]),textarea"))
      .some((element) => visible(element) && !element.disabled && !element.readOnly);
    const radioReady = !radioLabel || Array.from(document.querySelectorAll('[role="radio"],input[type="radio"]'))
      .some((element) => visible(element) || visible(element.closest("[role=listitem],.Qr7Oae,.Od2TWd,.docssharedWizToggleLabeledContainer")));
    const submitReady = Array.from(document.querySelectorAll('button,input[type="submit"],[role="button"]'))
      .some((element) => visible(element) && !element.disabled);
    return { ready: inputReady && radioReady && submitReady, inputReady, radioReady, submitReady, title: document.title };
  })()`;
}

async function warmForm(url, radioLabel) {
  const tab = await cdpNewTab(url);
  const cdp = new CdpClient(tab.webSocketDebuggerUrl);
  await cdp.connect();
  let last = null;
  try {
    await cdp.call("Runtime.enable", {}, 3000);
    for (let attempt = 0; attempt < 60; attempt++) {
      await sleep(250);
      const result = await cdp.call("Runtime.evaluate", {
        expression: makeReadyExpression(radioLabel),
        returnByValue: true
      }, 2500);
      last = result.result && result.result.value;
      if (last && last.ready) return;
    }
    throw new Error(`Form did not become ready: ${JSON.stringify(last)}`);
  } finally {
    try {
      await cdp.call("Page.close", {}, 3000);
    } catch {
      // The warm-up tab may already be closing.
    }
    cdp.close();
  }
}

async function mapLimit(items, limit, task) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await task(items[index], index);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function fillCdpTab(tab, youtubeUsername, fieldLabel, radioLabel, autoSubmit) {
  const cdp = new CdpClient(tab.webSocketDebuggerUrl);
  await cdp.connect();
  try {
    await cdp.call("Page.enable", {}, 3000);
    await cdp.call("Runtime.enable", {}, 3000);
    await cdp.call("Page.bringToFront", {}, 3000);

    let last = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      await sleep(attempt === 0 ? 400 : 250);
      const result = await cdp.call("Runtime.evaluate", {
        expression: makeFillExpression(youtubeUsername, fieldLabel, radioLabel),
        returnByValue: true,
        awaitPromise: true
      }, 2500);
      if (result.exceptionDetails) {
        last = { ok: false, error: result.exceptionDetails.text || "Runtime exception" };
        continue;
      }
      last = result.result && result.result.value;
      if (last && last.ok && (!radioLabel || (last.radio && last.radio.selected))) break;
    }

    if (!last || !last.ok) {
      return last || { ok: false, error: "Timed out waiting for form input" };
    }
    if (radioLabel && (!last.radio || !last.radio.selected)) {
      return { ...last, ok: false, error: `Radio option not verified: ${radioLabel}` };
    }
    if (!autoSubmit) return last;

    const submitResult = await cdp.call("Runtime.evaluate", {
      expression: makeSubmitExpression(),
      returnByValue: true,
      awaitPromise: true
    }, 3000);
    const submit = submitResult.result && submitResult.result.value;
    if (!submit || !submit.clicked) {
      return { ...last, ok: false, submit, error: submit && submit.error ? submit.error : "Submit click failed" };
    }

    for (let attempt = 0; attempt < 50; attempt++) {
      await sleep(200);
      const confirmationResult = await cdp.call("Runtime.evaluate", {
        expression: makeConfirmationExpression(),
        returnByValue: true,
        awaitPromise: true
      }, 2500);
      const confirmation = confirmationResult.result && confirmationResult.result.value;
      if (confirmation && confirmation.confirmed) {
        return { ...last, ok: true, submit: { ...submit, ...confirmation } };
      }
    }

    return {
      ...last,
      ok: false,
      submit,
      error: "Submit clicked once, but confirmation page was not detected; not retrying to avoid duplicates"
    };
  } finally {
    cdp.close();
  }
}

async function runFillCdp({ url, fieldLabel, radioLabel, targets, autoSubmit = false, concurrency = 4 }) {
  await ensureCdp();
  await warmForm(url, radioLabel);
  const work = targets.map((target, index) => ({ target, tabNumber: index + 1 }));
  return mapLimit(work, Math.max(1, Math.min(8, Number(concurrency) || 4)), async (item) => {
    try {
      const tab = await cdpNewTab(url);
      const result = await fillCdpTab(tab, item.target.youtubeUsername, fieldLabel, radioLabel, autoSubmit);
      return {
        ok: !!(result && result.ok),
        tabIndex: item.tabNumber,
        youtubeUsername: item.target.youtubeUsername,
        result
      };
    } catch (error) {
      return {
        ok: false,
        tabIndex: item.tabNumber,
        youtubeUsername: item.target.youtubeUsername,
        result: { error: error.message }
      };
    }
  });
}

const LIST_JXA = String.raw`
function run(argv) {
  var payload = JSON.parse(argv[0] || "{}");
  var Browser = Application(payload.browserApp || "Brave Browser");
  var windows = Browser.windows();
  var rows = [];
  for (var i = 0; i < windows.length; i++) {
    var w = windows[i];
    var tab = null;
    try { tab = w.activeTab(); } catch (e) {}
    rows.push({
      index: i + 1,
      id: String(w.id()),
      title: tab ? String(tab.title()) : "",
      url: tab ? String(tab.url()) : ""
    });
  }
  return JSON.stringify(rows);
}
`;

const MARK_JXA = String.raw`
function run(argv) {
  var payload = JSON.parse(argv[0] || "{}");
  var Browser = Application(payload.browserApp || "Brave Browser");
  var windows = Browser.windows();
  var rows = [];

  function htmlFor(index, id, title, url) {
    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, function (ch) {
        return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
      });
    }

    var safeTitle = escapeHtml(title);
    var safeUrl = escapeHtml(url);

    return "<!doctype html><html><head><meta charset='utf-8'>" +
      "<title>Brave window " + index + " / " + id + "</title>" +
      "<style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#111;color:#fff;display:grid;place-items:center;height:100vh}.box{text-align:center}.n{font-size:72px;font-weight:800}.id{font-size:40px;margin-top:18px}.small{font-size:18px;color:#bbb;max-width:900px;margin-top:24px;overflow-wrap:anywhere}</style>" +
      "</head><body><div class='box'><div class='n'>Brave window " + index + "</div><div class='id'>windowId: " + id + "</div><div class='small'>" + safeTitle + "</div><div class='small'>" + safeUrl + "</div></div></body></html>";
  }

  for (var i = 0; i < windows.length; i++) {
    var w = windows[i];
    var tab = null;
    try { tab = w.activeTab(); } catch (e) {}
    var index = i + 1;
    var id = String(w.id());
    var title = tab ? String(tab.title()) : "";
    var url = tab ? String(tab.url()) : "";
    var markerUrl = "data:text/html;charset=utf-8," + encodeURIComponent(htmlFor(index, id, title, url));
    var before = w.tabs().length;
    w.tabs.push(Browser.Tab({ url: markerUrl }));
    w.activeTabIndex = before + 1;
    rows.push({ index: index, id: id, title: title, url: url });
  }

  return JSON.stringify(rows);
}
`;

const RUN_JXA = String.raw`
function run(argv) {
  var payload = JSON.parse(argv[0]);
  var Browser = Application(payload.browserApp || "Brave Browser");
  var results = [];
  var opened = [];

  function findWindow(id) {
    var needle = String(id);
    var currentWindows = Browser.windows();
    for (var i = 0; i < currentWindows.length; i++) {
      if (String(currentWindows[i].id()) === needle) return currentWindows[i];
    }
    return null;
  }

  function firstWindow() {
    var currentWindows = Browser.windows();
    if (currentWindows.length) return currentWindows[0];
    Browser.activate();
    delay(0.5);
    currentWindows = Browser.windows();
    if (currentWindows.length) return currentWindows[0];
    return null;
  }

  function safeString(value) {
    if (value === null || value === undefined) return "";
    return String(value);
  }

  function makeFillScript(youtubeUsername, fieldLabel) {
    return "(function() {" +
      "var youtubeUsername = " + JSON.stringify(safeString(youtubeUsername)) + ";" +
      "var fieldLabel = " + JSON.stringify(safeString(fieldLabel)) + ";" +
      "function norm(s){return String(s||'').replace(/\\s+/g,' ').trim().toLowerCase();}" +
      "function visible(el){var r=el.getBoundingClientRect();var st=getComputedStyle(el);return r.width>0&&r.height>0&&st.visibility!=='hidden'&&st.display!=='none';}" +
      "function setValue(el,value){var proto=Object.getPrototypeOf(el);var desc=Object.getOwnPropertyDescriptor(proto,'value');if(desc&&desc.set){desc.set.call(el,value);}else{el.value=value;}el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}" +
      "function text(el){return norm(el ? el.innerText || el.textContent || '' : '');}" +
      "var inputs=[].slice.call(document.querySelectorAll('input[type=text],input[type=email],input:not([type]),textarea')).filter(function(el){return visible(el)&&!el.disabled&&!el.readOnly;});" +
      "var target=null;" +
      "if(fieldLabel){var wanted=norm(fieldLabel);for(var i=0;i<inputs.length;i++){var input=inputs[i];var attrs=norm([input.getAttribute('aria-label'),input.getAttribute('placeholder'),input.name,input.id].join(' '));if(attrs.indexOf(wanted)!==-1){target=input;break;}var box=input.closest('[role=listitem],.Qr7Oae,.geS5n,.freebirdFormviewerComponentsQuestionBaseRoot');if(box&&text(box).indexOf(wanted)!==-1){target=input;break;}}}" +
      "if(!target&&inputs.length){target=inputs[0];}" +
      "if(!target){return JSON.stringify({ok:false,error:'No visible text input found',inputCount:inputs.length,title:document.title,url:location.href});}" +
      "target.scrollIntoView({block:'center',inline:'nearest'});" +
      "target.focus();" +
      "setValue(target,youtubeUsername);" +
      "target.blur();" +
      "return JSON.stringify({ok:true,youtubeUsername:youtubeUsername,inputCount:inputs.length,title:document.title,url:location.href});" +
    "})();";
  }

  function wait(seconds) {
    delay(seconds);
  }

  function appleEventsJsDisabled(errorText) {
    return /AppleScript|Apple Events|событий Apple|отключено/.test(String(errorText || ""));
  }

  if (payload.sameWindow) {
    var mainWindow = firstWindow();
    if (!mainWindow) {
      for (var noWin = 0; noWin < payload.targets.length; noWin++) {
        results.push({
          ok: false,
          windowId: "",
          youtubeUsername: safeString(payload.targets[noWin].youtubeUsername),
          error: "Brave window not found"
        });
      }
      return JSON.stringify(results);
    }

    var mainWindowId = String(mainWindow.id());
    for (var sw = 0; sw < payload.targets.length; sw++) {
      var sameWindowTarget = payload.targets[sw];
      var tabIndex = mainWindow.tabs().length + 1;
      mainWindow.tabs.push(Browser.Tab({ url: payload.url }));
      mainWindow.activeTabIndex = tabIndex;
      opened.push({
        windowId: mainWindowId,
        tabIndex: tabIndex,
        config: sameWindowTarget
      });
      wait(payload.openDelaySeconds || 0.2);
    }
  } else {
    for (var t = 0; t < payload.targets.length; t++) {
    var targetConfig = payload.targets[t];
    var win = findWindow(targetConfig.windowId);
    if (!win) {
      results.push({
        ok: false,
        windowId: String(targetConfig.windowId),
        youtubeUsername: safeString(targetConfig.youtubeUsername),
        error: "Browser window not found"
      });
      continue;
    }

    if (payload.reuseActive) {
      win.activeTab().url = payload.url;
    } else {
      var before = win.tabs().length;
      win.tabs.push(Browser.Tab({ url: payload.url }));
      win.activeTabIndex = before + 1;
    }

    opened.push({ windowId: String(targetConfig.windowId), config: targetConfig });
    wait(payload.openDelaySeconds || 0.2);
    }
  }

  for (var i = 0; i < opened.length; i++) {
    var item = opened[i];
    var cfg = item.config;
    var last = null;

    for (var attempt = 0; attempt < (payload.maxAttempts || 30); attempt++) {
      wait(payload.retryDelaySeconds || 0.35);
      try {
        var winForFill = findWindow(item.windowId);
        if (!winForFill) {
          last = { ok: false, error: "Browser window not found" };
          break;
        }
        if (item.tabIndex) winForFill.activeTabIndex = item.tabIndex;
        var tab = winForFill.activeTab();
        var raw = tab.execute({
          javascript: makeFillScript(cfg.youtubeUsername, payload.fieldLabel)
        });
        last = JSON.parse(raw);
        if (last.ok) break;
      } catch (e) {
        last = { ok: false, error: String(e) };
        if (appleEventsJsDisabled(last.error)) break;
      }
    }

    results.push({
      ok: !!(last && last.ok),
      windowId: item.windowId || String(cfg.windowId),
      tabIndex: item.tabIndex || null,
      youtubeUsername: safeString(cfg.youtubeUsername),
      result: last
    });
  }

  return JSON.stringify(results);
}
`;

function readConfig(configPath) {
  const absolute = path.resolve(configPath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Config not found: ${absolute}. Run: node form-fill.js init`);
  }
  const parsed = JSON.parse(fs.readFileSync(absolute, "utf8"));
  if (!Array.isArray(parsed.targets)) {
    throw new Error("Config must contain targets array");
  }
  return parsed;
}

function printWindows(windows) {
  if (!windows.length) {
    console.log("No Brave windows found.");
    return;
  }
  for (const w of windows) {
    console.log(`${w.index}. id=${w.id}`);
    console.log(`   title: ${w.title}`);
    console.log(`   url:   ${w.url}`);
  }
}

async function getBraveWindows() {
  await ensureCdp();
  const targets = await requestJson(`${CDP_ENDPOINT}/json/list`, { timeoutMs: 5000 });
  const pages = targets.filter((target) => target.type === "page" && target.webSocketDebuggerUrl);
  const windows = new Map();

  for (const page of pages) {
    const cdp = new CdpClient(page.webSocketDebuggerUrl);
    try {
      await cdp.connect();
      const result = await cdp.call("Browser.getWindowForTarget", { targetId: page.id }, 3000);
      if (!windows.has(result.windowId)) {
        windows.set(result.windowId, {
          id: String(result.windowId),
          title: page.title || "",
          url: page.url || "",
          target: page
        });
      }
    } finally {
      cdp.close();
    }
  }

  return Array.from(windows.values()).map((window, index) => ({
    ...window,
    index: index + 1
  }));
}

async function initConfig(force) {
  const configPath = path.resolve(DEFAULT_CONFIG);
  if (fs.existsSync(configPath) && !force) {
    throw new Error(`${DEFAULT_CONFIG} already exists. Use --force to overwrite.`);
  }

  const windows = await getBraveWindows();
  const config = {
    fieldLabel: "",
    targets: windows.map((w) => ({
      windowId: w.id,
      youtubeUsername: "",
      note: w.title
    }))
  };
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`Created ${configPath}`);
  console.log("Fill youtubeUsername values, then run:");
  console.log(`node form-fill.js run "GOOGLE_FORM_URL"`);
}

async function markWindows() {
  const windows = await getBraveWindows();
  for (const window of windows) {
    const html = `<!doctype html><meta charset="utf-8"><title>Brave window ${window.index}</title><style>body{margin:0;background:#111;color:#fff;font-family:Segoe UI,sans-serif;display:grid;place-items:center;height:100vh}.number{font-size:72px;font-weight:800}.id{font-size:32px;text-align:center}</style><div><div class="number">Brave window ${window.index}</div><div class="id">windowId: ${window.id}</div></div>`;
    const markerUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    const cdp = new CdpClient(window.target.webSocketDebuggerUrl);
    try {
      await cdp.connect();
      await cdp.call("Target.createTarget", { url: markerUrl, windowId: Number(window.id) }, 5000);
    } finally {
      cdp.close();
    }
  }
  console.log("Opened marker tab in each Brave window:");
  printWindows(windows);
}

async function runFill(args) {
  const url = extractGoogleFormUrl(args._[1]);
  if (!url) throw new Error("Missing Google Form URL");
  if (!/^https:\/\/docs\.google\.com\/forms\//.test(url)) {
    throw new Error("URL must start with https://docs.google.com/forms/");
  }

  const configPath = args.config || DEFAULT_CONFIG;
  const config = readConfig(configPath);
  const targets = config.targets
    .map((t) => ({
      windowId: t.windowId === undefined ? "" : String(t.windowId),
      youtubeUsername: String(t.youtubeUsername || "")
    }))
    .filter((t) => t.youtubeUsername.trim());

  if (!targets.length) throw new Error("No targets with youtubeUsername found in config.");

  console.log(`Targets: ${targets.length}`);
  const concurrency = Math.max(1, Math.min(8, Number(args.concurrency || config.concurrency || 4) || 4));
  if (args["by-window"]) {
    console.log(`Opening forms by saved windowId in Brave...`);
  } else {
    console.log(`Opening and processing ${targets.length} form tabs with concurrency=${concurrency}...`);
  }

  const results = await runFillCdp({
    browserApp: DEFAULT_BROWSER_APP,
    url,
    fieldLabel: args.field || config.fieldLabel || "",
    radioLabel: config.radioLabel || "",
    targets,
    autoSubmit: true,
    concurrency
  });

  let okCount = 0;
  for (const row of results) {
    if (row.ok) {
      okCount++;
      const place = row.tabIndex ? `tab=${row.tabIndex}` : `window=${row.windowId}`;
      const radio = row.result && row.result.radio && row.result.radio.selected ? " radio=ok" : "";
      const submit = row.result && row.result.submit && row.result.submit.confirmed ? " submit=confirmed" : "";
      console.log(`OK   ${place} youtubeUsername="${row.youtubeUsername}"${radio}${submit}`);
    } else {
      const place = row.tabIndex ? `tab=${row.tabIndex}` : `window=${row.windowId}`;
      console.log(`FAIL ${place} youtubeUsername="${row.youtubeUsername}"`);
      const error = row.result ? row.result.error : row.error;
      console.log(`     ${error}`);
    }
  }
  console.log(`Done: ${okCount}/${results.length} filled and submitted.`);
}

async function runSelfTest() {
  const html = `<!doctype html><title>Form Helper self-test</title><label>Name<input aria-label="Name" type="text"></label><label>Tradeify<input aria-label="Tradeify" value="Tradeify" type="radio"></label><button type="button" onclick="document.body.insertAdjacentText('beforeend', ' Your response has been recorded')">Submit</button>`;
  const url = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

  try {
    const results = await runFillCdp({
      url,
      fieldLabel: "Name",
      radioLabel: "Tradeify",
      targets: Array.from({ length: 13 }, (_, index) => ({ youtubeUsername: `@form-helper-test-${index + 1}` })),
      autoSubmit: true,
      concurrency: 4
    });
    const failed = results.find((result) => !result.ok || !result.result.radio || !result.result.radio.selected || !result.result.submit || !result.result.submit.confirmed);
    if (failed) {
      throw new Error(`Self-test failed: ${JSON.stringify(failed)}`);
    }
    console.log("Self-test passed: 13 tabs filled, verified, submitted, and confirmed with concurrency=4.");
  } finally {
    const targets = await requestJson(`${CDP_ENDPOINT}/json/list`, { timeoutMs: 5000 });
    const testTabs = targets.filter((target) => target.title === "Form Helper self-test" && target.webSocketDebuggerUrl);
    for (const testTab of testTabs) {
      const cdp = new CdpClient(testTab.webSocketDebuggerUrl);
      try {
        await cdp.connect();
        await cdp.call("Page.close", {}, 3000);
      } finally {
        cdp.close();
      }
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let command = extractGoogleFormUrl(args._[0]);

  if (command && /^https:\/\/docs\.google\.com\/forms\//.test(command)) {
    args._[0] = command;
    args._.unshift("run");
    command = "run";
  }

  if (!command || ["help", "-h", "--help"].includes(command)) {
    usage();
    return;
  }

  if (command === "list") {
    printWindows(await getBraveWindows());
    return;
  }

  if (command === "mark") {
    await markWindows();
    return;
  }

  if (command === "init") {
    await initConfig(!!args.force);
    return;
  }

  if (command === "run") {
    await runFill(args);
    return;
  }

  if (command === "self-test") {
    await runSelfTest();
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
