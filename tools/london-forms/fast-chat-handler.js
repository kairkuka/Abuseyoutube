#!/usr/bin/env node

const fs = require("fs");
const https = require("https");
const path = require("path");
const { spawn } = require("child_process");

const YOUTUBE_KEY = String(process.env.YOUTUBE_INNERTUBE_API_KEY || "").trim();
const YOUTUBE_CLIENT_VERSION = "2.20260820.01.00";
const POLL_DELAY_MS = 350;
const youtubeAgent = new https.Agent({ keepAlive: true, maxSockets: 2 });
const LOG_DIR = path.join(__dirname, "logs");
const LOG_FILE = path.join(LOG_DIR, "chat-handler.log");
const STATE_FILE = path.join(LOG_DIR, "chat-handler-state.json");

function log(message) {
  const line = `${new Date().toISOString()} ${message}`;
  console.log(message);
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, `${line}\n`, "utf8");
  } catch {}
}

function saveState(state) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const temporary = `${STATE_FILE}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ updatedAt: new Date().toISOString(), ...state }, null, 2), "utf8");
    fs.renameSync(temporary, STATE_FILE);
  } catch {}
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function request(options, body = "") {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (response) => {
      const chunks = [];
      response.setEncoding("utf8");
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode || 0,
        headers: response.headers,
        body: chunks.join("")
      }));
    });
    req.setTimeout(15000, () => req.destroy(new Error("Request timed out")));
    req.on("error", reject);
    req.end(body);
  });
}

function youtubeContext() {
  return {
    client: {
      clientName: "WEB",
      clientVersion: YOUTUBE_CLIENT_VERSION,
      hl: "en",
      gl: "US"
    }
  };
}

async function youtubePost(endpoint, payload) {
  if (!YOUTUBE_KEY) {
    throw new Error("Set YOUTUBE_INNERTUBE_API_KEY before starting the chat watcher.");
  }
  const body = JSON.stringify(payload);
  const response = await request({
    hostname: "www.youtube.com",
    path: `/youtubei/v1/${endpoint}?key=${YOUTUBE_KEY}`,
    method: "POST",
    agent: youtubeAgent,
    headers: {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
      "origin": "https://www.youtube.com",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/139 Safari/537.36"
    }
  }, body);
  if (response.status !== 200) throw new Error(`YouTube chat returned HTTP ${response.status}`);
  return JSON.parse(response.body);
}

function youtubeVideoId(url) {
  const parsed = new URL(extractYouTubeUrl(url));
  const candidate = parsed.hostname === "youtu.be" ? parsed.pathname.split("/").filter(Boolean)[0] : parsed.searchParams.get("v");
  const match = String(candidate || "").match(/^([A-Za-z0-9_-]{11})/);
  if (!match) throw new Error("Configured YouTube URL is invalid.");
  return match[1];
}

function extractYouTubeUrl(value) {
  const text = String(value || "").trim().replace(/\\_/g, "_");
  const markdown = text.match(/\((https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[^)]+)\)/);
  if (markdown) return markdown[1];
  const match = text.match(/https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[^\s)]+/);
  return match ? match[0] : text;
}

function continuationFrom(container) {
  for (const item of container || []) {
    if (!item || typeof item !== "object") continue;
    const data = Object.values(item)[0];
    if (data && data.continuation) return String(data.continuation);
  }
  return "";
}

async function bootstrap(videoId) {
  const data = await youtubePost("next", { context: youtubeContext(), videoId });
  const chat = data.contents
    && data.contents.twoColumnWatchNextResults
    && data.contents.twoColumnWatchNextResults.conversationBar
    && data.contents.twoColumnWatchNextResults.conversationBar.liveChatRenderer;
  const continuation = chat && continuationFrom(chat.continuations);
  if (!continuation) throw new Error("Live chat is unavailable for the configured stream.");
  return continuation;
}

function normalizeFormUrl(value) {
  let text = String(value || "").trim().replace(/&amp;/g, "&").replace(/[.,);\]>"']+$/, "");
  if (!text) return "";
  if (!/^https?:\/\//i.test(text)) text = `https://${text}`;
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return "";
  }
  if (["youtube.com", "www.youtube.com"].includes(parsed.hostname) && parsed.pathname === "/redirect") {
    return normalizeFormUrl(parsed.searchParams.get("q") || "");
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "forms.gle" && parsed.pathname.length > 1) return parsed.toString();
  if (host === "docs.google.com"
      && /^\/forms\/d\/e\/[^/]+\/viewform\/?$/i.test(parsed.pathname)) {
    return parsed.toString();
  }
  return "";
}

function formLinksFromRuns(runs) {
  const candidates = [];
  // Prefer the full clickable destination. YouTube shortens visible links with
  // an ellipsis, so visible text can look like docs.google.com/forms/d/e/1FA...
  for (const run of runs) {
    for (const endpoint of [run.navigationEndpoint, run.endpoint]) {
      if (!endpoint) continue;
      const url = endpoint.urlEndpoint && endpoint.urlEndpoint.url
        || endpoint.commandMetadata && endpoint.commandMetadata.webCommandMetadata && endpoint.commandMetadata.webCommandMetadata.url;
      if (url) candidates.push(url);
    }
  }
  const text = runs.map((run) => String(run.text || "")).join("");
  const pattern = /(?:https?:\/\/)?(?:docs\.google\.com\/forms\/[^\s<>"']+|forms\.gle\/[A-Za-z0-9_-]+(?:\?[^\s<>"']*)?)/gi;
  for (const match of text.matchAll(pattern)) candidates.push(match[0]);
  return [...new Set(candidates.map(normalizeFormUrl).filter(Boolean))];
}

function parseMessages(live) {
  const messages = [];
  for (const action of live.actions || []) {
    const item = action.addChatItemAction && action.addChatItemAction.item
      || action.addLiveChatTickerItemAction && action.addLiveChatTickerItemAction.item
      || action.replaceChatItemAction && action.replaceChatItemAction.replacementItem;
    if (!item) continue;
    for (const renderer of Object.values(item)) {
      if (!renderer || !renderer.message || !Array.isArray(renderer.message.runs)) continue;
      const runs = renderer.message.runs;
      messages.push({
        id: String(renderer.id || ""),
        author: String(renderer.authorName && renderer.authorName.simpleText || "Unknown"),
        text: runs.map((run) => String(run.text || "")).join("").replace(/\s+/g, " ").trim(),
        timestampUsec: Number(renderer.timestampUsec || 0),
        links: formLinksFromRuns(runs)
      });
    }
  }
  return messages;
}

async function poll(continuation) {
  const data = await youtubePost("live_chat/get_live_chat", {
    context: youtubeContext(),
    continuation
  });
  const live = data.continuationContents && data.continuationContents.liveChatContinuation;
  if (!live) throw new Error("YouTube returned an invalid live-chat update.");
  const next = continuationFrom(live.continuations);
  if (!next) throw new Error("YouTube chat continuation ended.");
  return { continuation: next, messages: parseMessages(live) };
}

async function resolveFormUrl(url, redirects = 0, method = "HEAD") {
  if (redirects > 5) throw new Error("Google Form short link redirected too many times.");
  const parsed = new URL(url);
  if (parsed.hostname === "docs.google.com") return parsed.toString();
  const response = await request({
    hostname: parsed.hostname,
    path: `${parsed.pathname}${parsed.search}`,
    method,
    headers: { "user-agent": "Mozilla/5.0" }
  });
  if (response.status >= 300 && response.status < 400 && response.headers.location) {
    return resolveFormUrl(new URL(response.headers.location, parsed).toString(), redirects + 1, "HEAD");
  }
  if (method === "HEAD") return resolveFormUrl(url, redirects, "GET");
  throw new Error(`Could not resolve Google Form short link: HTTP ${response.status}`);
}

async function resolveFormUrlWithRetry(url) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await resolveFormUrl(url);
    } catch (error) {
      lastError = error;
      if (attempt < 2) await sleep(250 * (attempt + 1));
    }
  }
  throw lastError;
}

function runSubmitter(url) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, "fast-form-submit.js"), url, "--execute"], {
      cwd: __dirname,
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Submitter exited with code ${code}`)));
  });
}

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const includeRecent = args.includes("--include-recent");
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "nicknames.json"), "utf8"));
  const streamUrl = extractYouTubeUrl(positional[0] || config.youtubeUrl || "");
  if (!streamUrl) throw new Error("Usage: node fast-chat-handler.js <youtube-live-url> [--include-recent] [--check]");
  const allowedAuthors = new Set((config.chatAuthors || []).map((value) => String(value).toLowerCase()));
  const videoId = youtubeVideoId(streamUrl);
  const armedUsec = includeRecent ? 0 : (Date.now() - 5000) * 1000;
  saveState({ status: "connecting", videoId, streamUrl });
  let continuation = await bootstrap(videoId);
  if (checkOnly) {
    const update = await poll(continuation);
    log(`Live chat connected: ${update.messages.length} recent messages; no submission triggered.`);
    saveState({ status: "checked", videoId, streamUrl, recentMessages: update.messages.length });
    return;
  }

  log(`ARMED: waiting for first new Google Form link on ${videoId}`);
  if (allowedAuthors.size) log(`Allowed author: ${[...allowedAuthors].join(", ")}`);
  else log("Allowed author: any live-chat author");
  saveState({ status: "armed", videoId, streamUrl, allowedAuthors: [...allowedAuthors] });
  const seen = new Set();
  let polls = 0;
  let lastHeartbeat = Date.now();
  while (true) {
    let update;
    try {
      update = await poll(continuation);
      continuation = update.continuation;
    } catch (error) {
      log(`Chat reconnecting: ${error.message}`);
      saveState({ status: "reconnecting", videoId, streamUrl, error: error.message });
      await sleep(1000);
      continuation = await bootstrap(videoId);
      continue;
    }
    polls++;
    const messages = includeRecent ? [...update.messages].reverse() : update.messages;
    for (const message of messages) {
      if (message.id && seen.has(message.id)) continue;
      if (message.id) seen.add(message.id);
      if (message.timestampUsec && message.timestampUsec < armedUsec) continue;
      if (allowedAuthors.size && !allowedAuthors.has(message.author.toLowerCase())) continue;
      if (!message.links.length) continue;
      const detectedAt = process.hrtime.bigint();
      // Lock immediately to the first complete form URL. Submission errors must
      // exit instead of treating repeated copies as new forms.
      const formUrl = await resolveFormUrlWithRetry(message.links[0]);
      log(`DETECTED: ${message.author}: ${message.text}`);
      log(`FIRST LINK: ${formUrl}`);
      log("DISARMED: repeated links will be ignored.");
      saveState({ status: "submitting", videoId, streamUrl, author: message.author, formUrl });
      await runSubmitter(formUrl);
      const elapsedMs = Number(process.hrtime.bigint() - detectedAt) / 1e6;
      log(`One-shot handler finished in ${(elapsedMs / 1000).toFixed(3)} seconds from detection.`);
      saveState({ status: "complete", videoId, streamUrl, author: message.author, formUrl, elapsedSeconds: Number((elapsedMs / 1000).toFixed(3)) });
      return;
    }
    if (seen.size > 5000) seen.clear();
    if (Date.now() - lastHeartbeat >= 30000) {
      log(`HEALTHY: armed; polls=${polls}; seen_messages=${seen.size}`);
      saveState({ status: "armed", videoId, streamUrl, polls, seenMessages: seen.size });
      lastHeartbeat = Date.now();
    }
    await sleep(POLL_DELAY_MS);
  }
}

if (require.main === module) {
  main().catch((error) => {
    log(`Error: ${error.message}`);
    saveState({ status: "error", error: error.message });
    process.exitCode = 1;
  }).finally(() => youtubeAgent.destroy());
}

module.exports = { formLinksFromRuns, normalizeFormUrl };
