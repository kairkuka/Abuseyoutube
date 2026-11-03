#!/usr/bin/env node

const fs = require("fs");
const dns = require("dns").promises;
const http2 = require("http2");
const path = require("path");

const LOG_DIR = path.join(__dirname, "logs");
const LOG_FILE = path.join(LOG_DIR, "form-submit.log");

function log(message) {
  const line = `${new Date().toISOString()} ${message}`;
  console.log(message);
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, `${line}\n`, "utf8");
  } catch {}
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      args._.push(value);
    } else if (value === "--execute") {
      args.execute = true;
    } else {
      const key = value.slice(2);
      args[key] = argv[++index];
    }
  }
  return args;
}

function extractGoogleFormUrl(value) {
  const text = String(value || "").replace(/\\_/g, "_");
  const match = text.match(/https:\/\/docs\.google\.com\/forms\/[^\]\)\s"<>]+/);
  return match ? match[0] : text.trim();
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function readTelegramConfig() {
  const envPath = path.join(__dirname, "..", "stream-stt", ".env");
  const values = {};
  let content = "";
  try {
    content = fs.readFileSync(envPath, "utf8");
  } catch {
    return { token: "", chatId: "" };
  }
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1].trim()] = value;
  }
  return {
    token: values.TELEGRAM_BOT_TOKEN || "",
    chatId: values.TELEGRAM_CHAT_ID || ""
  };
}

function sendTelegram(text) {
  const { token, chatId } = readTelegramConfig();
  if (!token || !chatId) return Promise.reject(new Error("Telegram bot configuration is missing."));
  const body = JSON.stringify({ chat_id: chatId, text });
  return new Promise((resolve, reject) => {
    const request = require("https").request({
      hostname: "api.telegram.org",
      path: `/bot${token}/sendMessage`,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body)
      }
    }, (response) => {
      const chunks = [];
      response.setEncoding("utf8");
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        let payload = {};
        try { payload = JSON.parse(chunks.join("")); } catch {}
        if (response.statusCode === 200 && payload.ok) resolve();
        else reject(new Error(`Telegram notification failed with HTTP ${response.statusCode || 0}.`));
      });
    });
    request.setTimeout(10000, () => request.destroy(new Error("Telegram notification timed out.")));
    request.on("error", reject);
    request.end(body);
  });
}

async function connectGoogle() {
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await dns.lookup("docs.google.com");
      const session = http2.connect("https://docs.google.com");
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          session.destroy();
          reject(new Error("Google Forms connection timed out."));
        }, 10000);
        session.once("connect", () => {
          clearTimeout(timer);
          session.on("error", () => {
            // Active request streams report the actionable connection error.
          });
          resolve(session);
        });
        session.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
      });
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(250 * (attempt + 1));
    }
  }
  const detail = lastError && lastError.code === "ENOTFOUND"
    ? "DNS could not resolve docs.google.com. Check internet or DNS and paste the link again."
    : `Could not connect to Google Forms: ${lastError ? lastError.message : "unknown error"}`;
  throw new Error(detail);
}

function extractHidden(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`<input[^>]+name=["']${escaped}["'][^>]+value=["']([^"']*)`, "i"));
  return match ? decodeHtml(match[1]) : "";
}

function parseForm(html, url, radioLabel, fieldLabel) {
  const formIdMatch = new URL(url).pathname.match(/\/forms\/d\/e\/([^/]+)\//);
  if (!formIdMatch) throw new Error("Unsupported Google Form URL.");
  const marker = "FB_PUBLIC_LOAD_DATA_ = ";
  const start = html.indexOf(marker);
  if (start < 0) throw new Error("Google form metadata was not found.");
  const end = html.indexOf(";</script>", start);
  if (end < 0) throw new Error("Google form metadata was incomplete.");
  const data = JSON.parse(html.slice(start + marker.length, end));
  const questions = data && data[1] && data[1][1];
  if (!Array.isArray(questions)) throw new Error("Google form questions were not found.");

  const normalizedField = String(fieldLabel || "").trim().toLowerCase();
  const normalizedRadio = String(radioLabel || "").trim().toLowerCase();
  const textQuestions = [];
  const radioQuestions = [];
  for (const question of questions) {
    if (!Array.isArray(question) || !Array.isArray(question[4]) || !question[4][0]) continue;
    const title = String(question[1] || "");
    const entryId = String(question[4][0][0] || "");
    if (!entryId) continue;
    if (question[3] === 0) textQuestions.push({ title, entryId });
    if (question[3] === 2) {
      const choices = Array.isArray(question[4][0][1])
        ? question[4][0][1].map((choice) => String(choice && choice[0] || ""))
        : [];
      radioQuestions.push({ title, entryId, choices });
    }
  }

  const text = textQuestions.find((question) => normalizedField && question.title.toLowerCase().includes(normalizedField))
    || textQuestions.find((question) => /user|name|handle/i.test(question.title))
    || textQuestions[0];
  const radio = radioQuestions.find((question) => question.choices.some((choice) => choice.toLowerCase() === normalizedRadio));
  if (!text) throw new Error("Username text field was not found.");
  if (!radio) throw new Error(`Radio option not found: ${radioLabel}`);
  const radioValue = radio.choices.find((choice) => choice.toLowerCase() === normalizedRadio);
  return {
    formId: formIdMatch[1],
    responsePath: `/forms/d/e/${formIdMatch[1]}/formResponse`,
    text,
    radio,
    radioValue,
    fbzx: extractHidden(html, "fbzx"),
    partialResponse: extractHidden(html, "partialResponse")
  };
}

function h2Request(session, headers, body = "") {
  return new Promise((resolve, reject) => {
    const request = session.request(headers);
    const chunks = [];
    let responseHeaders = {};
    request.setEncoding("utf8");
    request.on("response", (value) => { responseHeaders = value; });
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve({ headers: responseHeaders, body: chunks.join("") }));
    request.on("error", reject);
    if (body) request.end(body);
    else request.end();
  });
}

function makeBody(form, username) {
  const body = new URLSearchParams();
  body.set(`entry.${form.radio.entryId}`, form.radioValue);
  body.set(`entry.${form.text.entryId}`, username);
  body.set("fvv", "1");
  if (form.partialResponse) body.set("partialResponse", form.partialResponse);
  body.set("pageHistory", "0");
  if (form.fbzx) body.set("fbzx", form.fbzx);
  body.set("submissionTimestamp", "-1");
  return body.toString();
}

function confirmed(response) {
  const status = Number(response.headers[":status"] || 0);
  const text = response.body.toLowerCase();
  const marker = text.includes("your response has been recorded")
    || text.includes("response has been submitted")
    || text.includes("ваш ответ записан")
    || text.includes("ответ записан");
  return status === 200 && marker;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = extractGoogleFormUrl(args._[0]);
  if (!url) throw new Error("Usage: node fast-form-submit.js <google-form-url> [--execute]");
  const config = JSON.parse(fs.readFileSync(path.resolve(args.config || "nicknames.json"), "utf8"));
  const usernames = config.targets.map((target) => String(target.youtubeUsername || "").trim()).filter(Boolean);
  if (!usernames.length || usernames.some((name) => !/^@[A-Za-z0-9._-]+$/.test(name))) {
    throw new Error("Config contains missing or invalid usernames.");
  }

  const started = process.hrtime.bigint();
  const session = await connectGoogle();
  session.setTimeout(12000, () => session.destroy(new Error("Google Forms connection timed out.")));
  try {
    const target = new URL(url);
    const page = await h2Request(session, {
      ":method": "GET",
      ":path": `${target.pathname}${target.search}`,
      "user-agent": "Mozilla/5.0",
      "accept-language": "en-US,en;q=0.9"
    });
    if (Number(page.headers[":status"]) !== 200) throw new Error(`Form load returned HTTP ${page.headers[":status"]}.`);
    const form = parseForm(page.body, url, config.radioLabel || "", config.fieldLabel || "");
    log(`Ready: username=entry.${form.text.entryId} radio=entry.${form.radio.entryId}:${form.radioValue}`);
    if (!args.execute) {
      log(`Dry run only. ${usernames.length} responses prepared; nothing submitted.`);
      return;
    }

    const requests = usernames.map(async (username) => {
      const body = makeBody(form, username);
      const response = await h2Request(session, {
        ":method": "POST",
        ":path": form.responsePath,
        "content-type": "application/x-www-form-urlencoded",
        "content-length": Buffer.byteLength(body),
        "origin": "https://docs.google.com",
        "referer": url,
        "user-agent": "Mozilla/5.0",
        "accept-language": "en-US,en;q=0.9"
      }, body);
      const confirmedMs = Number(process.hrtime.bigint() - started) / 1e6;
      return {
        username,
        ok: confirmed(response),
        status: Number(response.headers[":status"] || 0),
        confirmedMs
      };
    });
    const dispatchedMs = Number(process.hrtime.bigint() - started) / 1e6;
    log(`Dispatched ${requests.length} POST requests in ${(dispatchedMs / 1000).toFixed(3)} seconds.`);
    const results = await Promise.all(requests);
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    for (const result of results) {
      log(`${result.ok ? "OK  " : "FAIL"} ${result.username} HTTP ${result.status} at ${(result.confirmedMs / 1000).toFixed(3)}s`);
    }
    const successful = results.filter((result) => result.ok).length;
    const underFive = results.filter((result) => result.ok && result.confirmedMs < 5000).length;
    log(`Confirmed under 5 seconds: ${underFive}/${results.length}.`);
    log(`Done: ${successful}/${results.length} confirmed in ${(elapsedMs / 1000).toFixed(3)} seconds.`);
    if (successful === results.length) {
      try {
        await sendTelegram([
          `✅ Google Form filled: ${successful}/${results.length} accounts confirmed`,
          `Time: ${(elapsedMs / 1000).toFixed(3)} seconds`,
          `Under 5 seconds: ${underFive}/${results.length}`,
          "",
          ...results.map((result) => result.username)
        ].join("\n"));
        log("Telegram completion message sent.");
      } catch (error) {
        log(`Telegram completion message skipped: ${error.message}`);
      }
    } else {
      process.exitCode = 2;
    }
  } finally {
    session.close();
  }
}

main().catch((error) => {
  log(`Error: ${error.message}`);
  process.exitCode = 1;
});
