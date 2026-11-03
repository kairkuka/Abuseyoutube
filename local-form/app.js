const $ = (id) => document.getElementById(id);
let state = null;
let previewId = "";

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

function message(text, type = "success") {
  const el = $("message");
  el.textContent = text;
  el.className = `message ${type}`;
  clearTimeout(message.timer);
  message.timer = setTimeout(() => el.classList.add("hidden"), 5500);
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
}

function accountOptions(selectedId) {
  const accounts = state && state.connectedAccounts || [];
  return [`<option value="">Не связан</option>`, ...accounts.map((account) => {
    const label = `${account.email || "Google account"} · ${account.channelName || account.handle || account.id}`;
    return `<option value="${escapeHtml(account.id)}" ${account.id === selectedId ? "selected" : ""}>${escapeHtml(label)}</option>`;
  })].join("");
}

function accountById(id) {
  return (state && state.connectedAccounts || []).find((account) => account.id === id) || null;
}

function wireAccountSelects() {
  document.querySelectorAll("#profiles tr[data-profile]").forEach((tr) => {
    const select = tr.querySelector(".account-id");
    select.addEventListener("change", () => {
      const account = accountById(select.value);
      if (!account) return;
      const field1 = tr.querySelector(".field1");
      const field3 = tr.querySelector(".field3");
      if (!field1.value.trim()) field1.value = account.field1 || account.email || "";
      if (!field3.value.trim()) field3.value = account.field3 || account.channelName || account.handle || "";
      tr.querySelector(".account-meta").textContent = account.email || "Google account";
    });
  });
}

function renderStatus(data) {
  state = data;
  $("oauthAccounts").textContent = `${(data.connectedAccounts || []).length} аккаунт(ов)`;
  $("chromeStatus").textContent = data.chromeFound ? "Найден" : "Не найден";
  $("aiStatus").textContent = data.aiConfigured ? `Готов (${data.aiModel})` : "OPENAI_API_KEY не задан";
  $("openBrowsers").textContent = String(data.openBrowsers || 0);
  $("targetUrl").value = data.config.targetUrl || "";
  $("selectorEmail").value = data.config.selectors.email || "";
  $("selectorAi").value = data.config.selectors.ai || "";
  $("selectorNickname").value = data.config.selectors.nickname || "";
  $("aiPrompt").value = data.config.aiPrompt || "";
  $("aiMaxChars").value = data.config.aiMaxChars || 180;

  $("profiles").innerHTML = data.profiles.map((row) => {
    const linked = row.connected ? `${row.email || ""}${row.channelName ? ` · ${row.channelName}` : ""}` : (row.detectedEmail ? `${row.detectedEmail} · OAuth не подключён` : "OAuth не связан");
    return `<tr data-profile="${escapeHtml(row.profileDir)}">
      <td><input class="enabled" type="checkbox" ${row.enabled ? "checked" : ""} ${!row.connected ? "disabled" : ""}></td>
      <td class="profile-name"><strong>${escapeHtml(row.name)}</strong><span>${escapeHtml(row.profileDir)}</span><span>${escapeHtml(row.detectedEmail || "email не определён")}</span></td>
      <td><select class="account-id">${accountOptions(row.accountId)}</select><small class="account-meta">${escapeHtml(linked)}</small></td>
      <td><input class="field1" value="${escapeHtml(row.field1)}" placeholder="Значение поля 1"></td>
      <td><input class="field3" value="${escapeHtml(row.field3)}" placeholder="Значение поля 3"></td>
    </tr>`;
  }).join("") || `<tr><td colspan="5">Chrome-профили не найдены.</td></tr>`;
  wireAccountSelects();
}

function collectConfig() {
  const profiles = {};
  document.querySelectorAll("#profiles tr[data-profile]").forEach((tr) => {
    const account = accountById(tr.querySelector(".account-id").value);
    profiles[tr.dataset.profile] = {
      enabled: tr.querySelector(".enabled").checked,
      accountId: tr.querySelector(".account-id").value,
      email: account && account.email || "",
      field1: tr.querySelector(".field1").value.trim(),
      field3: tr.querySelector(".field3").value.trim()
    };
  });
  return {
    targetUrl: $("targetUrl").value.trim(),
    selectors: {
      email: $("selectorEmail").value.trim(),
      ai: $("selectorAi").value.trim(),
      nickname: $("selectorNickname").value.trim()
    },
    aiPrompt: $("aiPrompt").value.trim(),
    aiMaxChars: Number($("aiMaxChars").value),
    profiles
  };
}

async function load() {
  renderStatus(await request("/api/local-form/status"));
}

async function save(silent = false) {
  const payload = await request("/api/local-form/config", { method: "POST", body: JSON.stringify({ config: collectConfig() }) });
  renderStatus(payload);
  if (!silent) message("Настройки сохранены");
}

$("refresh").addEventListener("click", async () => {
  try { await save(true); await load(); message("OAuth и Chrome-профили пересканированы"); } catch (e) { message(e.message, "error"); }
});

$("save").addEventListener("click", async () => {
  try { await save(); } catch (e) { message(e.message, "error"); }
});

$("preview").addEventListener("click", async () => {
  const button = $("preview");
  button.disabled = true;
  try {
    await save(true);
    const result = await request("/api/local-form/preview", { method: "POST", body: JSON.stringify({}) });
    previewId = result.previewId;
    $("previewRows").innerHTML = result.rows.map((row) => `<tr>
      <td><strong>${escapeHtml(row.email)}</strong><br><small>${escapeHtml(row.channelName || row.handle || "")}</small><br><small>${escapeHtml(row.profileName)} · ${escapeHtml(row.profileDir)}</small></td>
      <td>${escapeHtml(row.field1)}</td>
      <td class="ai-value">${escapeHtml(row.ai)}</td>
      <td>${escapeHtml(row.field3)}</td>
    </tr>`).join("");
    $("previewCard").classList.remove("hidden");
    message(`Предпросмотр готов: ${result.rows.length} аккаунт(ов)`);
  } catch (e) { message(e.message, "error"); }
  finally { button.disabled = false; }
});

$("run").addEventListener("click", async () => {
  if (!previewId) return message("Сначала создайте предпросмотр", "error");
  const button = $("run");
  button.disabled = true;
  try {
    const result = await request("/api/local-form/run", { method: "POST", body: JSON.stringify({ previewId, confirmed: true }) });
    await load();
    const failed = (result.results || []).filter((row) => !row.ok);
    if (failed.length) message(`Открыто: ${result.opened}. Ошибок: ${result.failed}. ${failed[0].error || ""}`, "error");
    else message(`Открыто и заполнено аккаунтов: ${result.opened}. Формы оставлены без автоматической отправки.`);
  } catch (e) { message(e.message, "error"); }
  finally { button.disabled = false; }
});

$("close").addEventListener("click", async () => {
  try {
    const result = await request("/api/local-form/close", { method: "POST", body: "{}" });
    await load();
    message(`Закрыто окон: ${result.closed}`);
  } catch (e) { message(e.message, "error"); }
});

load().catch((e) => message(e.message, "error"));
