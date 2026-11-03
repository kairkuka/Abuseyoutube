function cleanText(value, limit = 500) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

function extractGoogleFormUrl(value) {
  const text = String(value || "").replace(/\\_/g, "_").trim();
  const match = text.match(/https:\/\/(?:forms\.gle|docs\.google\.com\/forms)\/[^\]\)\s"<>]+/);
  return match ? match[0] : text;
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractHidden(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`<input[^>]+name=["']${escaped}["'][^>]+value=["']([^"']*)`, "i"));
  return match ? decodeHtml(match[1]) : "";
}

function parseGoogleForm(html, finalUrl) {
  const formId = new URL(finalUrl).pathname.match(/\/forms\/d\/e\/([^/]+)\//)?.[1];
  if (!formId) throw new Error("Unsupported Google Form URL");
  const marker = "FB_PUBLIC_LOAD_DATA_ = ";
  const start = html.indexOf(marker);
  if (start < 0) throw new Error("Google form metadata was not found");
  const end = html.indexOf(";</script>", start);
  if (end < 0) throw new Error("Google form metadata was incomplete");
  const data = JSON.parse(html.slice(start + marker.length, end));
  const rawQuestions = data && data[1] && data[1][1];
  if (!Array.isArray(rawQuestions)) throw new Error("Google form questions were not found");

  const questions = [];
  for (const question of rawQuestions) {
    if (!Array.isArray(question) || !Array.isArray(question[4]) || !question[4][0]) continue;
    const type = question[3];
    const entryId = cleanText(question[4][0][0], 80);
    if (!entryId) continue;
    questions.push({
      title: cleanText(question[1], 300),
      type,
      entryId,
      required: question[4][0][2] === 1
    });
  }

  return {
    formId,
    responsePath: `/forms/d/e/${formId}/formResponse`,
    questions,
    fbzx: extractHidden(html, "fbzx"),
    partialResponse: extractHidden(html, "partialResponse")
  };
}

function textQuestions(form) {
  return form.questions.filter((question) => question.type === 0 || question.type === 1);
}

function resolveFields(form, fields, sampleRow) {
  const questions = textQuestions(form);
  if (!questions.length) throw new Error("No text fields were found in the form");
  const specs = Array.isArray(fields) && fields.length
    ? fields
    : Object.keys(sampleRow || {}).map((key, index) => ({ key, index }));
  if (!specs.length) throw new Error("No row fields were provided");

  return specs.map((spec, index) => {
    const key = cleanText(spec && spec.key, 80);
    if (!key) throw new Error("Every field mapping needs a key");
    let question = null;
    if (spec.entryId) question = questions.find((item) => item.entryId === String(spec.entryId));
    if (!question && spec.label) {
      const label = String(spec.label).trim().toLowerCase();
      question = questions.find((item) => item.title.toLowerCase() === label)
        || questions.find((item) => item.title.toLowerCase().includes(label));
    }
    if (!question && Number.isInteger(spec.index)) question = questions[spec.index];
    if (!question) question = questions[index];
    if (!question) throw new Error(`Could not map field: ${key}`);
    return { key, entryId: question.entryId, title: question.title };
  });
}

function validateRows(rows, mappings) {
  if (!Array.isArray(rows) || !rows.length) throw new Error("Rows are required");
  return rows.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error(`Row ${index + 1} must be an object`);
    const clean = {};
    for (const mapping of mappings) {
      const value = cleanText(row[mapping.key], 1000);
      if (!value) throw new Error(`Row ${index + 1} missing value for ${mapping.key}`);
      clean[mapping.key] = value;
    }
    return clean;
  });
}

function makeBody(form, mappings, row) {
  const body = new URLSearchParams();
  for (const mapping of mappings) body.set(`entry.${mapping.entryId}`, row[mapping.key]);
  body.set("fvv", "1");
  if (form.partialResponse) body.set("partialResponse", form.partialResponse);
  body.set("pageHistory", "0");
  if (form.fbzx) body.set("fbzx", form.fbzx);
  body.set("submissionTimestamp", "-1");
  return body.toString();
}

function confirmed(status, text) {
  const lower = String(text || "").toLowerCase();
  return status === 200 && (
    lower.includes("your response has been recorded")
    || lower.includes("response has been submitted")
    || lower.includes("ваш ответ записан")
    || lower.includes("ответ записан")
  );
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function submitGoogleFormRows({ formUrl, fields, rows, concurrency = 8 }) {
  const url = extractGoogleFormUrl(formUrl);
  if (!url || !/^https:\/\//.test(url)) throw new Error("Valid Google Form URL is required");
  const page = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "Mozilla/5.0",
      "accept-language": "en-US,en;q=0.9"
    }
  });
  if (!page.ok) throw new Error(`Form load returned HTTP ${page.status}`);
  const finalUrl = page.url;
  const html = await page.text();
  const form = parseGoogleForm(html, finalUrl);
  const mappings = resolveFields(form, fields, Array.isArray(rows) ? rows[0] : null);
  const cleanRows = validateRows(rows, mappings);
  const postUrl = `https://docs.google.com${form.responsePath}`;
  const startedAt = Date.now();

  const results = await runPool(cleanRows, Math.max(1, Math.min(20, Number(concurrency) || 8)), async (row, index) => {
    const body = makeBody(form, mappings, row);
    try {
      const response = await fetch(postUrl, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "origin": "https://docs.google.com",
          "referer": finalUrl,
          "user-agent": "Mozilla/5.0",
          "accept-language": "en-US,en;q=0.9"
        },
        body
      });
      const text = await response.text();
      return { index, ok: confirmed(response.status, text), status: response.status, row };
    } catch (error) {
      return { index, ok: false, status: 0, row, error: error.message };
    }
  });

  return {
    formUrl: finalUrl,
    formId: form.formId,
    fields: mappings,
    total: results.length,
    ok: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    elapsedMs: Date.now() - startedAt,
    results
  };
}

module.exports = {
  submitGoogleFormRows,
  parseGoogleForm,
  resolveFields
};
