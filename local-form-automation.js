const fs = require("fs");
const fsp = fs.promises;
const os = require("os");
const path = require("path");
const net = require("net");
const { spawn } = require("child_process");
const crypto = require("crypto");

const RUNTIME_BASE_DIR = path.join(os.tmpdir(), "account-control-center-chrome");
const MFF_DEFAULT_PROMPT = [
  "You generate short, natural-sounding comments about My Funded Futures (MFF).",
  "",
  "LANGUAGE REQUIREMENT:",
  "ALWAYS write in English.",
  "NEVER use any other language.",
  "",
  "Your task is to create a NEW and noticeably different comment every time.",
  "",
  "Rules:",
  "- 90% of the time, write 1-2 short sentences.",
  "- Around 10% of the time, write 3 sentences.",
  "- Keep comments concise and natural.",
  "- Never repeat previous comments verbatim.",
  "- Avoid repeating the same sentence structures, openings, phrases, or wording.",
  "- Vary the topic, tone, vocabulary, and sentence structure every time.",
  "- Do not start comments the same way repeatedly.",
  "- Do not make every comment overly positive or promotional.",
  "- Write like a normal person/trader online, not like an advertisement or corporate copy.",
  "- Sometimes be casual, sometimes straightforward, sometimes slightly enthusiastic.",
  "- Vary between very short comments and slightly more detailed ones.",
  "- Do not use bullet points or lists.",
  "- Avoid overusing generic phrases such as game changer, best prop firm ever, highly recommend, amazing company, etc.",
  "- Do not constantly start with MFF, My Funded Futures, I love, I've been, or This is.",
  "- Do not invent personal experiences, payouts, profits, account results, or specific facts that were not provided.",
  "- Do not make unsupported claims.",
  "",
  "Possible angles to rotate between:",
  "rules, platform experience, account options, simplicity, trading conditions, transparency, usability, support, overall approach, dashboard, trader-friendly features, or general impressions.",
  "",
  "DIVERSITY IS CRITICAL:",
  "Before generating a comment, consider the previous comments supplied below.",
  "If the new comment is too similar in meaning, wording, opening, structure, or overall idea, generate a different one.",
  "Try to use a different angle and phrasing each time.",
  "",
  "OUTPUT RULE:",
  "Return ONLY the final comment.",
  "No explanations.",
  "No quotation marks.",
  "No numbering.",
  "No headings.",
  "ENGLISH ONLY."
].join("\n");

const DEFAULT_CONFIG = {
  targetUrl: "",
  selectors: { email: "", ai: "", nickname: "" },
  aiPrompt: MFF_DEFAULT_PROMPT,
  aiMaxChars: 180,
  profiles: {}
};
const FORM_AI_INSTRUCTIONS = [
  "Hard requirement for Form Scanner Field 2:",
  "Generate one short natural comment about My Funded Futures (MFF).",
  "Always write in English only.",
  "Most comments must be 1-2 short sentences; only when the requested sentence limit is 3 may you write 3 sentences.",
  "Each selected account must receive a noticeably different comment. Never reuse the same wording, opening, structure, phrase, or idea from another account.",
  "Use account data and uniqueness seeds only as hidden variation signals. Do not mention Gmail, Chrome profile, YouTube channel, private account data, or the seed.",
  "Do not invent personal experiences, payouts, profits, account results, or specific facts that were not provided.",
  "Do not use labels, bullets, lists, markdown, quotes, numbering, headings, or explanations.",
  "Return only the final comment for Field 2."
].join("\n");
const AI_GENERATION_ATTEMPTS = 4;

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(temp, file);
}

function cleanText(value, limit = 300) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

function cleanEmail(value) {
  const email = cleanText(value, 180).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function normalizeUrl(value) {
  const input = String(value || "").trim();
  let parsed;
  try { parsed = new URL(input); } catch { throw new Error("Enter a valid http(s) form URL"); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error("Only http(s) form URLs are allowed");
  return parsed.toString();
}

function defaultChromeUserDataDir(platform = process.platform, env = process.env, homedir = os.homedir()) {
  if (env.CHROME_USER_DATA_DIR) return path.resolve(env.CHROME_USER_DATA_DIR);
  if (platform === "darwin") return path.join(homedir, "Library", "Application Support", "Google", "Chrome");
  if (platform === "win32") return path.join(env.LOCALAPPDATA || path.join(homedir, "AppData", "Local"), "Google", "Chrome", "User Data");
  return path.join(homedir, ".config", "google-chrome");
}

function chromeExecutableCandidates(platform = process.platform, env = process.env, homedir = os.homedir()) {
  if (env.CHROME_EXECUTABLE_PATH) return [path.resolve(env.CHROME_EXECUTABLE_PATH)];
  if (platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      path.join(homedir, "Applications", "Google Chrome.app", "Contents", "MacOS", "Google Chrome")
    ];
  }
  if (platform === "win32") {
    return [
      path.join(env.PROGRAMFILES || "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
      path.join(env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
      path.join(env.LOCALAPPDATA || path.join(homedir, "AppData", "Local"), "Google", "Chrome", "Application", "chrome.exe")
    ];
  }
  return ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
}

function findChromeExecutable() {
  return chromeExecutableCandidates().find((candidate) => fs.existsSync(candidate)) || "";
}

function profileInfoFromPreferences(profileDir, prefs, localStateInfo = {}) {
  const candidates = [
    localStateInfo.user_name,
    localStateInfo.email,
    prefs && prefs.profile && prefs.profile.user_name,
    ...(Array.isArray(prefs && prefs.account_info) ? prefs.account_info.map((row) => row && row.email) : [])
  ];
  const email = candidates.map(cleanEmail).find(Boolean) || "";
  const name = cleanText(localStateInfo.name || (prefs && prefs.profile && prefs.profile.name) || profileDir, 120) || profileDir;
  return { profileDir, name, email };
}

function discoverChromeProfiles(userDataDir = defaultChromeUserDataDir()) {
  const root = path.resolve(userDataDir);
  if (!fs.existsSync(root)) return { userDataDir: root, profiles: [], chromeFound: Boolean(findChromeExecutable()) };
  const localState = readJson(path.join(root, "Local State"), {});
  const infoCache = localState && localState.profile && localState.profile.info_cache && typeof localState.profile.info_cache === "object"
    ? localState.profile.info_cache
    : {};
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const profiles = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const profileDir = entry.name;
    const preferencesFile = path.join(root, profileDir, "Preferences");
    if (!fs.existsSync(preferencesFile)) continue;
    const prefs = readJson(preferencesFile, {});
    const info = profileInfoFromPreferences(profileDir, prefs, infoCache[profileDir] || {});
    profiles.push(info);
  }
  profiles.sort((a, b) => {
    if (a.profileDir === "Default") return -1;
    if (b.profileDir === "Default") return 1;
    return a.profileDir.localeCompare(b.profileDir, undefined, { numeric: true });
  });
  return { userDataDir: root, profiles, chromeFound: Boolean(findChromeExecutable()) };
}

function sanitizeProfileSettings(value = {}) {
  return {
    enabled: Boolean(value.enabled),
    accountId: cleanText(value.accountId, 80),
    email: cleanEmail(value.email),
    field1: cleanText(value.field1 || value.email, 300),
    field3: cleanText(value.field3 || value.nickname, 300)
  };
}

function accountEmail(account) {
  return cleanEmail(account && (account.metadata && account.metadata.email || account.email));
}

function publicAccount(account) {
  const metadata = account && account.metadata || {};
  return {
    id: cleanText(account && account.id, 80),
    email: accountEmail(account),
    channelName: cleanText(account && account.name, 160),
    handle: cleanText(account && account.handle, 160),
    field1: cleanText(metadata.field1 || accountEmail(account), 300),
    field3: cleanText(metadata.field3 || account && account.name || account && account.handle, 300)
  };
}

function sanitizeConfig(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const selectors = source.selectors && typeof source.selectors === "object" ? source.selectors : {};
  const profiles = {};
  if (source.profiles && typeof source.profiles === "object" && !Array.isArray(source.profiles)) {
    for (const [profileDir, row] of Object.entries(source.profiles)) {
      if (!profileDir || profileDir.length > 180 || profileDir.includes("/") || profileDir.includes("\\")) continue;
      profiles[profileDir] = sanitizeProfileSettings(row);
    }
  }
  return {
    targetUrl: source.targetUrl ? normalizeUrl(source.targetUrl) : "",
    selectors: {
      email: cleanText(selectors.email, 300),
      ai: cleanText(selectors.ai, 300),
      nickname: cleanText(selectors.nickname, 300)
    },
    aiPrompt: cleanText(source.aiPrompt || DEFAULT_CONFIG.aiPrompt, 6000) || DEFAULT_CONFIG.aiPrompt,
    aiMaxChars: Math.min(1000, Math.max(10, Number(source.aiMaxChars) || DEFAULT_CONFIG.aiMaxChars)),
    profiles
  };
}

function mergeDiscoveredProfiles(config, discovery, connectedAccounts = []) {
  const accounts = connectedAccounts.map(publicAccount).filter((account) => account.id);
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const byEmail = new Map(accounts.filter((account) => account.email).map((account) => [account.email, account]));
  return discovery.profiles.map((profile) => {
    const saved = sanitizeProfileSettings(config.profiles[profile.profileDir] || {});
    const email = saved.email || profile.email;
    const account = byId.get(saved.accountId) || byEmail.get(cleanEmail(email)) || null;
    return {
      ...profile,
      enabled: Boolean(saved.enabled && account),
      accountId: account && account.id || saved.accountId || "",
      email: account && account.email || email,
      detectedEmail: profile.email,
      connected: Boolean(account),
      channelName: account && account.channelName || "",
      handle: account && account.handle || "",
      field1: saved.field1 || account && account.field1 || "",
      field3: saved.field3 || account && account.field3 || ""
    };
  });
}

function validateSelectors(selectors) {
  const values = ["email", "ai", "nickname"].map((key) => String(selectors && selectors[key] || "").trim());
  const configured = values.filter(Boolean).length;
  if (configured !== 0 && configured !== 3) throw new Error("Either leave all field selectors empty for automatic scanning, or configure all three selectors");
  return configured === 3 ? "selectors" : "auto";
}

function selectedProfiles(config, discovery, connectedAccounts = [], requestedProfileDirs = null) {
  const all = mergeDiscoveredProfiles(config, discovery, connectedAccounts);
  const requested = Array.isArray(requestedProfileDirs) ? new Set(requestedProfileDirs.map(String)) : null;
  const selected = all.filter((row) => row.enabled && (!requested || requested.has(row.profileDir)));
  if (!selected.length) throw new Error("Enable at least one Chrome profile linked to a connected Google OAuth account");
  for (const row of selected) {
    if (!row.connected || !row.accountId) throw new Error(`${row.profileDir} is not linked to a connected Google account`);
    if (!row.email) throw new Error(`Email was not detected for ${row.profileDir}`);
    if (!row.field1) throw new Error(`Field 1 value is required for ${row.email}`);
    if (!row.field3) throw new Error(`Field 3 value is required for ${row.email}`);
  }
  return selected;
}

function extractResponseText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  if (Array.isArray(payload.output)) {
    for (const item of payload.output) {
      if (!Array.isArray(item && item.content)) continue;
      for (const content of item.content) {
        if (content && typeof content.text === "string" && content.text.trim()) return content.text.trim();
      }
    }
  }
  return "";
}

function normalizeAiComparable(value) {
  return cleanText(value, 1000).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function isDuplicateAiValue(value, previousValues = []) {
  const normalized = normalizeAiComparable(value);
  return Boolean(normalized && previousValues.some((item) => normalizeAiComparable(item) === normalized));
}

function enforceAiSentenceLimit(value, maxSentences = 2) {
  const text = cleanText(value, 1000);
  const parts = text.match(/[^.!?。！？]+[.!?。！？]*/g);
  if (!parts || parts.length <= maxSentences) return text;
  return cleanText(parts.slice(0, maxSentences).join(" "), 1000);
}

function aiUniquenessSeed(profile, attempt) {
  return crypto.createHash("sha256").update([
    profile.accountId || "",
    profile.email || "",
    profile.channelName || "",
    profile.handle || "",
    profile.field1 || "",
    profile.field3 || "",
    profile.profileDir || "",
    String(attempt)
  ].join("|")).digest("hex").slice(0, 16);
}

function aiSentenceLimit(profile) {
  const bucket = Number.parseInt(aiUniquenessSeed(profile, 1).slice(0, 8), 16) % 10;
  return bucket === 0 ? 3 : 2;
}

function seededChoice(seed, salt, values) {
  const hash = crypto.createHash("sha256").update(`${seed}|${salt}`).digest("hex");
  return values[Number.parseInt(hash.slice(0, 8), 16) % values.length];
}

function buildLocalMffComment(seed, sentenceLimit) {
  const rules = seededChoice(seed, "rules", ["Clear rules", "Straightforward rules", "Simple guidelines", "Easy-to-read conditions", "Transparent expectations"]);
  const platform = seededChoice(seed, "platform", ["a cleaner platform flow", "a direct dashboard", "simple account options", "less clutter in the process", "an easy setup"]);
  const focus = seededChoice(seed, "focus", ["execution", "risk decisions", "trade planning", "consistency", "the actual setup"]);
  const closer = seededChoice(seed, "closer", [
    "That is usually what matters most.",
    "No need to overcomplicate it.",
    "Small details add up there.",
    "That is a fair thing to notice.",
    "Simple is not a bad thing here."
  ]);
  const tone = Number.parseInt(seed.slice(0, 8), 16) % 9;
  const comments = [
    `${rules} matter more than loud claims. MFF feels more useful when the focus stays on ${focus}.`,
    `${platform[0].toUpperCase()}${platform.slice(1)} makes a difference when you want to stay focused. That is the kind of thing traders notice with MFF.`,
    `Not everything has to sound flashy. A funded futures setup is easier to judge when the rules and conditions are plain.`,
    `For futures traders, the small usability details matter. MFF seems to keep the experience fairly direct.`,
    `The appeal is not hype for me; it is whether the setup is easy to understand. MFF fits that conversation well.`,
    `Simple structure goes a long way in prop trading. MFF keeps the main idea pretty easy to follow.`,
    `A dashboard should help you check what matters without digging around. That kind of clarity is a plus for MFF.`,
    `The rules side is what I would look at first. If that part is clear, the rest of the platform is easier to evaluate.`,
    `MFF comes across better when people talk about practical things like conditions, usability, and transparency. That feels more useful than empty hype.`
  ];
  let comment = comments[tone];
  if (sentenceLimit === 3) comment += ` ${closer}`;
  return comment;
}

function generateLocalAiValue(profile, config, previousValues = []) {
  for (let attempt = 1; attempt <= 80; attempt += 1) {
    const seed = aiUniquenessSeed(profile, attempt + previousValues.length);
    const text = cleanText(enforceAiSentenceLimit(buildLocalMffComment(seed, aiSentenceLimit(profile)), aiSentenceLimit(profile)), config.aiMaxChars);
    if (text && !isDuplicateAiValue(text, previousValues)) return text;
  }
  throw new Error(`Could not create a unique local Field 2 value for ${profile.email || profile.profileDir}`);
}

function buildAiInstruction(profile, config, previousValues = [], attempt = 1) {
  const previous = previousValues.map((value, index) => `${index + 1}. ${value}`).join("\n") || "None yet.";
  const customPrompt = cleanText(config.aiPrompt, 4000) === cleanText(MFF_DEFAULT_PROMPT, 4000) ? "" : config.aiPrompt;
  const sentenceLimit = aiSentenceLimit(profile);
  const lines = [
    FORM_AI_INSTRUCTIONS,
    "",
    "MFF comment prompt:",
    MFF_DEFAULT_PROMPT,
  ];
  if (customPrompt) lines.push("", "Additional saved form prompt:", customPrompt);
  return [
    ...lines,
    "",
    `Google account: ${profile.email}`,
    `YouTube channel: ${profile.channelName || profile.handle || "unknown"}`,
    `Field 1 value: ${profile.field1}`,
    `Field 3 value: ${profile.field3}`,
    `Chrome profile: ${profile.name}`,
    `Maximum length: ${config.aiMaxChars} characters.`,
    `Sentence limit for this account: ${sentenceLimit}.`,
    `Uniqueness seed: ${aiUniquenessSeed(profile, attempt)}. Use it only to vary the answer; do not output it.`,
    "",
    "Already generated Field 2 values to avoid:",
    previous,
    attempt > 1 ? `This is retry ${attempt}; produce a substantially different answer from all listed values.` : ""
  ].filter(Boolean).join("\n");
}

async function generateAiValue(profile, config, previousValues = []) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) return generateLocalAiValue(profile, config, previousValues);
  const model = String(process.env.OPENAI_MODEL || "gpt-5.6-luna").trim();
  let lastText = "";
  for (let attempt = 1; attempt <= AI_GENERATION_ATTEMPTS; attempt += 1) {
    const result = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: buildAiInstruction(profile, config, previousValues, attempt),
        max_output_tokens: Math.max(32, Math.min(500, Math.ceil(config.aiMaxChars / 2)))
      })
    });
    const payload = await result.json().catch(() => ({}));
    if (!result.ok) {
      const message = payload && payload.error && payload.error.message ? payload.error.message : `OpenAI API returned ${result.status}`;
      throw new Error(message);
    }
    const text = cleanText(enforceAiSentenceLimit(extractResponseText(payload), aiSentenceLimit(profile)), config.aiMaxChars);
    if (!text) throw new Error("AI returned an empty value");
    lastText = text;
    if (!isDuplicateAiValue(text, previousValues)) return text;
  }
  throw new Error(`AI repeated a Field 2 value for ${profile.email || profile.profileDir}: ${lastText}`);
}

function shouldSkipSnapshotPath(source) {
  const base = path.basename(source).toLowerCase();
  const skipNames = new Set(["cache", "code cache", "gpucache", "dawncache", "grshadercache", "shadercache", "crashpad"]);
  if (skipNames.has(base)) return true;
  const normalized = source.replace(/\\/g, "/").toLowerCase();
  if (normalized.includes("/service worker/cachestorage")) return true;
  return false;
}

async function createProfileSnapshot(userDataDir, profileDir) {
  const id = crypto.randomUUID();
  const runtimeRoot = path.join(RUNTIME_BASE_DIR, id);
  await fsp.mkdir(runtimeRoot, { recursive: true });
  const localStateSource = path.join(userDataDir, "Local State");
  if (fs.existsSync(localStateSource)) await fsp.copyFile(localStateSource, path.join(runtimeRoot, "Local State"));
  const sourceProfile = path.join(userDataDir, profileDir);
  const destProfile = path.join(runtimeRoot, profileDir);
  if (!fs.existsSync(sourceProfile)) throw new Error(`Chrome profile not found: ${profileDir}`);
  await fsp.cp(sourceProfile, destProfile, {
    recursive: true,
    force: true,
    filter: (source) => !shouldSkipSnapshotPath(source)
  });
  return runtimeRoot;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function debug(...args) { if (process.env.DEBUG_LOCAL_FORM === "1") console.error("[local-form]", ...args); }

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function waitForJson(url, timeoutMs = 20000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch (error) { lastError = error; }
    await sleep(250);
  }
  throw new Error(`Chrome DevTools did not become ready${lastError ? `: ${lastError.message}` : ""}`);
}

class CdpSocket {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
  }
  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      const timer = setTimeout(() => reject(new Error("Timed out connecting to Chrome DevTools")), 10000);
      ws.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
      ws.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Could not connect to Chrome DevTools")); }, { once: true });
      ws.addEventListener("message", (event) => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (!message.id) return;
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message || "Chrome DevTools error"));
        else pending.resolve(message.result || {});
      });
      ws.addEventListener("close", () => {
        for (const pending of this.pending.values()) pending.reject(new Error("Chrome DevTools connection closed"));
        this.pending.clear();
      });
    });
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { try { this.ws && this.ws.close(); } catch {} }
}

async function waitForSelectors(cdp, selectors, timeoutMs = 30000) {
  const mode = validateSelectors(selectors);
  const started = Date.now();
  const serialized = JSON.stringify(selectors);
  const autoExpression = `(() => {
    const visible = (el) => { const r=el.getBoundingClientRect(); const s=getComputedStyle(el); return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none' && !el.disabled && !el.readOnly; };
    const fields=[...document.querySelectorAll('input:not([type]), input[type="text"], input[type="email"], input[type="search"], input[type="url"], input[type="tel"], textarea, [contenteditable="true"]')].filter(visible);
    return fields.length;
  })()`;
  while (Date.now() - started < timeoutMs) {
    if (mode === "selectors") {
      const result = await cdp.send("Runtime.evaluate", {
        expression: `(() => { const s=${serialized}; return Object.fromEntries(Object.entries(s).map(([k,v]) => [k, Boolean(document.querySelector(v))])); })()`,
        returnByValue: true
      });
      const found = result && result.result && result.result.value || {};
      debug("selectors:probe", found);
      if (Object.values(found).length === 3 && Object.values(found).every(Boolean)) return mode;
    } else {
      const result = await cdp.send("Runtime.evaluate", { expression: autoExpression, returnByValue: true });
      const count = Number(result && result.result && result.result.value || 0);
      debug("auto-fields:probe", count);
      if (count >= 3) return mode;
    }
    await sleep(300);
  }
  throw new Error(mode === "selectors" ? "Could not find all three configured form fields within 30 seconds" : "Could not automatically find three visible editable fields within 30 seconds");
}

async function fillFields(cdp, selectors, values) {
  const mode = validateSelectors(selectors);
  const payload = JSON.stringify({ selectors, values, mode });
  const expression = `(() => {
    const data = ${payload};
    const visible = (el) => { const r=el.getBoundingClientRect(); const s=getComputedStyle(el); return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none' && !el.disabled && !el.readOnly; };
    const autoFields = () => [...document.querySelectorAll('input:not([type]), input[type="text"], input[type="email"], input[type="search"], input[type="url"], input[type="tel"], textarea, [contenteditable="true"]')].filter(visible);
    function setValue(el, value) {
      if (!el) throw new Error('Form field not found');
      el.focus();
      if (el.isContentEditable) {
        el.textContent = value;
      } else {
        let proto = el;
        let setter = null;
        while (proto && !setter) {
          const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
          if (descriptor && descriptor.set) setter = descriptor.set;
          proto = Object.getPrototypeOf(proto);
        }
        if (setter) setter.call(el, value); else el.value = value;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
    }
    const elements = data.mode === 'selectors'
      ? [document.querySelector(data.selectors.email), document.querySelector(data.selectors.ai), document.querySelector(data.selectors.nickname)]
      : autoFields().slice(0, 3);
    if (elements.length < 3 || elements.some((el) => !el)) throw new Error('Three editable form fields were not found');
    setValue(elements[0], data.values.field1);
    setValue(elements[1], data.values.ai);
    setValue(elements[2], data.values.field3);
    return { mode: data.mode, count: elements.length };
  })()`;
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result && result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Could not fill form fields");
  return result && result.result && result.result.value || { mode };
}

function removeRuntimeRoot(runtimeRoot) {
  if (!runtimeRoot) return;
  try { fs.rmSync(runtimeRoot, { recursive: true, force: true }); } catch {}
}

function cleanupOldRuntimeRoots(maxAgeMs = 24 * 60 * 60 * 1000) {
  try {
    if (!fs.existsSync(RUNTIME_BASE_DIR)) return;
    const now = Date.now();
    for (const entry of fs.readdirSync(RUNTIME_BASE_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = path.join(RUNTIME_BASE_DIR, entry.name);
      try {
        const stat = fs.statSync(full);
        if (now - stat.mtimeMs > maxAgeMs) removeRuntimeRoot(full);
      } catch {}
    }
  } catch {}
}

async function launchAndFill({ chromeExecutable, userDataDir, profile, config, values }) {
  debug("snapshot:start", profile.profileDir);
  const runtimeRoot = await createProfileSnapshot(userDataDir, profile.profileDir);
  let child = null;
  try {
    debug("snapshot:done", runtimeRoot);
    const port = await getFreePort();
    debug("port", port);
    const args = [
      `--user-data-dir=${runtimeRoot}`,
      `--profile-directory=${profile.profileDir}`,
      `--remote-debugging-port=${port}`,
      "--remote-debugging-address=127.0.0.1",
      "--remote-allow-origins=*",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-mode"
    ];
    if (process.env.CHROME_AUTOMATION_HEADLESS === "1") args.push("--headless=new");
    if (process.env.CHROME_NO_SANDBOX === "1") args.push("--no-sandbox");
    args.push("--new-window", config.targetUrl);
    child = spawn(chromeExecutable, args, { stdio: "ignore", detached: false });
    debug("spawn", child.pid, chromeExecutable);
    child.on("error", () => {});
    const targets = await waitForJson(`http://127.0.0.1:${port}/json/list`);
    debug("targets", Array.isArray(targets) ? targets.map((x) => ({ type: x.type, url: x.url })) : targets);
    const target = (Array.isArray(targets) ? targets : []).find((row) => row.type === "page" && row.webSocketDebuggerUrl)
      || (Array.isArray(targets) ? targets : []).find((row) => row.webSocketDebuggerUrl);
    if (!target) throw new Error("Chrome opened, but no controllable page was found");
    const cdp = new CdpSocket(target.webSocketDebuggerUrl);
    debug("cdp:connect", target.webSocketDebuggerUrl);
    await cdp.connect();
    debug("cdp:connected");
    try {
      await cdp.send("Page.enable");
      await cdp.send("Runtime.enable");
      if (!String(target.url || "").startsWith(config.targetUrl)) {
        await cdp.send("Page.navigate", { url: config.targetUrl });
      }
      debug("selectors:wait", config.selectors);
      await waitForSelectors(cdp, config.selectors);
      debug("selectors:found");
      await fillFields(cdp, config.selectors, values);
      debug("fill:done");
    } finally {
      cdp.close();
    }
    return { child, runtimeRoot, port };
  } catch (error) {
    try { if (child && !child.killed) child.kill(); } catch {}
    removeRuntimeRoot(runtimeRoot);
    throw error;
  }
}

class LocalFormAutomation {
  constructor({ configFile, accountsProvider = () => [] }) {
    this.configFile = configFile;
    this.accountsProvider = accountsProvider;
    this.previews = new Map();
    this.sessions = new Map();
    this.aiHistory = [];
    cleanupOldRuntimeRoots();
  }

  loadConfig() {
    const raw = readJson(this.configFile, DEFAULT_CONFIG);
    try { return sanitizeConfig({ ...DEFAULT_CONFIG, ...raw }); }
    catch { return { ...DEFAULT_CONFIG, profiles: raw && raw.profiles && typeof raw.profiles === "object" ? raw.profiles : {} }; }
  }

  saveConfig(incoming) {
    const config = sanitizeConfig(incoming);
    writeJson(this.configFile, config);
    return config;
  }

  status() {
    const config = this.loadConfig();
    const discovery = discoverChromeProfiles();
    const connectedAccounts = this.accountsProvider();
    return {
      config,
      userDataDir: discovery.userDataDir,
      chromeExecutable: findChromeExecutable(),
      chromeFound: discovery.chromeFound,
      connectedAccounts: connectedAccounts.map(publicAccount),
      profiles: mergeDiscoveredProfiles(config, discovery, connectedAccounts),
      aiConfigured: Boolean(String(process.env.OPENAI_API_KEY || "").trim()),
      aiModel: String(process.env.OPENAI_MODEL || "gpt-5.6-luna"),
      openBrowsers: this.sessions.size
    };
  }

  async preview(requestedProfileDirs = null) {
    const config = this.loadConfig();
    if (!config.targetUrl) throw new Error("Form URL is required");
    validateSelectors(config.selectors);
    const discovery = discoverChromeProfiles();
    const connectedAccounts = this.accountsProvider();
    const profiles = selectedProfiles(config, discovery, connectedAccounts, requestedProfileDirs);
    const rows = [];
    const usedAiValues = this.aiHistory.slice(-100);
    for (const profile of profiles) {
      const ai = await generateAiValue(profile, config, usedAiValues);
      usedAiValues.push(ai);
      rows.push({
        profileDir: profile.profileDir,
        profileName: profile.name,
        accountId: profile.accountId,
        email: profile.email,
        channelName: profile.channelName,
        handle: profile.handle,
        field1: profile.field1,
        ai,
        field3: profile.field3
      });
    }
    this.aiHistory.push(...rows.map((row) => row.ai));
    if (this.aiHistory.length > 300) this.aiHistory.splice(0, this.aiHistory.length - 300);
    const previewId = crypto.randomUUID();
    this.previews.set(previewId, { createdAt: Date.now(), config, rows });
    for (const [id, item] of this.previews.entries()) {
      if (Date.now() - item.createdAt > 10 * 60 * 1000) this.previews.delete(id);
    }
    return { previewId, rows };
  }

  async run(previewId, requestedProfileDirs = null) {
    const preview = this.previews.get(String(previewId || ""));
    if (!preview || Date.now() - preview.createdAt > 10 * 60 * 1000) throw new Error("Preview expired; generate it again");
    const discovery = discoverChromeProfiles();
    const config = preview.config;
    const connectedAccounts = this.accountsProvider();
    const current = new Map(mergeDiscoveredProfiles(config, discovery, connectedAccounts).map((row) => [row.profileDir, row]));
    const requested = Array.isArray(requestedProfileDirs) ? new Set(requestedProfileDirs.map(String)) : null;
    const rows = preview.rows.filter((row) => !requested || requested.has(row.profileDir));
    if (!rows.length) throw new Error("Select at least one previewed Chrome profile");
    const chromeExecutable = findChromeExecutable();
    if (!chromeExecutable) throw new Error("Google Chrome executable was not found. Set CHROME_EXECUTABLE_PATH if Chrome is installed in a custom location.");
    const results = [];
    for (const row of rows) {
      const profile = current.get(row.profileDir);
      if (!profile) {
        results.push({ profileDir: row.profileDir, ok: false, error: "Chrome profile no longer exists" });
        continue;
      }
      try {
        const session = await launchAndFill({
          chromeExecutable,
          userDataDir: discovery.userDataDir,
          profile,
          config,
          values: { field1: row.field1, ai: row.ai, field3: row.field3 }
        });
        const sessionId = crypto.randomUUID();
        this.sessions.set(sessionId, { ...session, profileDir: row.profileDir, startedAt: Date.now() });
        session.child.once("exit", () => {
          this.sessions.delete(sessionId);
          removeRuntimeRoot(session.runtimeRoot);
        });
        results.push({ profileDir: row.profileDir, accountId: row.accountId, email: row.email, channelName: row.channelName, field1: row.field1, field3: row.field3, ok: true, sessionId });
      } catch (error) {
        results.push({ profileDir: row.profileDir, accountId: row.accountId, email: row.email, channelName: row.channelName, field1: row.field1, field3: row.field3, ok: false, error: error.message });
      }
    }
    return { results, opened: results.filter((row) => row.ok).length, failed: results.filter((row) => !row.ok).length };
  }

  closeAll() {
    let closed = 0;
    for (const [id, session] of this.sessions.entries()) {
      try {
        session.child.kill();
        closed += 1;
      } catch {}
      removeRuntimeRoot(session.runtimeRoot);
      this.sessions.delete(id);
    }
    return { closed };
  }
}

module.exports = {
  LocalFormAutomation,
  DEFAULT_CONFIG,
  defaultChromeUserDataDir,
  chromeExecutableCandidates,
  findChromeExecutable,
  discoverChromeProfiles,
  sanitizeConfig,
  sanitizeProfileSettings,
  publicAccount,
  mergeDiscoveredProfiles,
  normalizeUrl,
  extractResponseText,
  normalizeAiComparable,
  isDuplicateAiValue,
  enforceAiSentenceLimit,
  aiSentenceLimit,
  buildAiInstruction,
  generateAiValue,
  CdpSocket,
  waitForSelectors,
  fillFields,
  createProfileSnapshot,
  removeRuntimeRoot,
  cleanupOldRuntimeRoots
};
