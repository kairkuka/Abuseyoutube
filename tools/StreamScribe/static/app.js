const $ = (selector) => document.querySelector(selector);

const elements = {
  capture: $('#capture-button'),
  emptyStart: $('#empty-start'),
  clear: $('#clear-button'),
  exportButton: $('#export-button'),
  statusDot: $('#status-dot'),
  statusText: $('#status-text'),
  source: $('#session-source'),
  sessionTime: $('#session-time'),
  modelLabel: $('#model-label'),
  feed: $('#transcript-feed'),
  empty: $('#empty-state'),
  meter: $('#audio-meter'),
  audioValue: $('#audio-value'),
  queue: $('#queue-label'),
  watchStatus: $('#watch-status'),
  watchWord: $('#watch-word'),
  armedBadge: $('#armed-badge'),
  urlForm: $('#url-form'),
  youtubeUrl: $('#youtube-url'),
  urlButton: $('#url-button'),
  urlState: $('#url-state'),
  telegramState: $('#telegram-state'),
  telegramForm: $('#telegram-form'),
  telegramToken: $('#telegram-token'),
  telegramChat: $('#telegram-chat'),
  telegramConnected: $('#telegram-connected'),
  telegramConnectedLabel: $('#telegram-connected-label'),
  telegramChange: $('#telegram-change'),
  telegramTest: $('#telegram-test'),
  settingsForm: $('#settings-form'),
  triggerWords: $('#trigger-words'),
  language: $('#language'),
  cooldown: $('#cooldown'),
  model: $('#model'),
  detectionSummary: $('#detection-summary'),
  alertCount: $('#alert-count'),
  alertList: $('#alert-list'),
  toast: $('#toast'),
};

const capture = {
  stream: null,
  context: null,
  source: null,
  worklet: null,
  socket: null,
  chunks: [],
  sampleCount: 0,
  stopping: false,
};

let currentState = null;
let lastEntrySignature = '';
let lastAlertSignature = '';
let toastTimer = null;
const TARGET_RATE = 16000;
const CHUNK_SECONDS = 4;

function showToast(message, kind = 'info') {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.dataset.kind = kind;
  elements.toast.hidden = false;
  requestAnimationFrame(() => elements.toast.classList.add('is-visible'));
  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove('is-visible');
    window.setTimeout(() => { elements.toast.hidden = true; }, 180);
  }, 4200);
}

function formatTime(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds || 0));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightWords(text, words) {
  const cleaned = words.filter(Boolean).sort((a, b) => b.length - a.length);
  if (!cleaned.length) return escapeHtml(text);
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])(${cleaned.map(escapeRegExp).join('|')})(?=$|[^\\p{L}\\p{N}_])`, 'giu');
  let cursor = 0;
  let html = '';
  for (const match of text.matchAll(pattern)) {
    const wordStart = match.index + match[1].length;
    const wordEnd = wordStart + match[2].length;
    html += escapeHtml(text.slice(cursor, wordStart));
    html += `<mark>${escapeHtml(text.slice(wordStart, wordEnd))}</mark>`;
    cursor = wordEnd;
  }
  return html + escapeHtml(text.slice(cursor));
}

function renderEntries(entries, triggerWords, alerts) {
  const deliveryByEntry = new Map(alerts.map((alert) => [alert.entry_id, alert]));
  const signature = entries.map((entry) => {
    const alert = deliveryByEntry.get(entry.id);
    return `${entry.id}:${entry.trigger}:${alert ? alert.delivered : 'pending'}`;
  }).join('|');
  if (signature === lastEntrySignature) return;
  lastEntrySignature = signature;

  const nearBottom = elements.feed.scrollHeight - elements.feed.scrollTop - elements.feed.clientHeight < 120;
  elements.empty.hidden = entries.length > 0;
  elements.feed.querySelectorAll('.transcript-entry').forEach((node) => node.remove());

  const fragment = document.createDocumentFragment();
  entries.forEach((entry) => {
    const alert = deliveryByEntry.get(entry.id);
    let matchLabel = '';
    if (entry.trigger) {
      const label = !alert ? 'Sending…' : (alert.delivered ? 'Alert sent' : 'Delivery failed');
      matchLabel = `<span class="match-label${alert && !alert.delivered ? ' failed' : ''}">${label}</span>`;
    }
    const article = document.createElement('article');
    article.className = `transcript-entry${entry.trigger ? ' has-trigger' : ''}`;
    article.dataset.id = entry.id;
    article.innerHTML = `
      <time>${formatTime(entry.seconds)}</time>
      <p>${highlightWords(entry.text, triggerWords)}</p>
      ${matchLabel}
    `;
    fragment.appendChild(article);
  });
  elements.feed.appendChild(fragment);
  if (nearBottom || entries.length < 4) elements.feed.scrollTop = elements.feed.scrollHeight;
}

function renderAlerts(alerts) {
  const signature = alerts.map((alert) => `${alert.id}:${alert.delivered}`).join('|');
  if (signature === lastAlertSignature) return;
  lastAlertSignature = signature;
  elements.alertCount.textContent = alerts.length ? `${alerts.length} this session` : 'None yet';
  if (!alerts.length) {
    elements.alertList.innerHTML = '<p class="empty-alerts">Matches appear here after Telegram delivery.</p>';
    return;
  }
  elements.alertList.innerHTML = [...alerts].reverse().slice(0, 4).map((alert) => `
    <article class="alert-item ${alert.delivered ? '' : 'failed'}">
      <div><strong>${escapeHtml(alert.word)}</strong><time>${new Date(alert.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>
      <p>${escapeHtml(alert.delivered ? 'Delivered with recent context' : (alert.error || 'Delivery failed'))}</p>
    </article>
  `).join('');
}

function setSelectValue(select, value) {
  if ([...select.options].some((option) => option.value === String(value))) select.value = String(value);
}

function renderState(state) {
  currentState = state;
  const browserActive = Boolean(capture.stream);
  const directActive = Boolean(state.capture_active && state.capture_mode === 'url');
  const active = browserActive || directActive;
  document.body.classList.toggle('is-capturing', active);
  elements.capture.classList.toggle('is-active', active);
  elements.capture.querySelector('span').textContent = directActive ? 'Stop silent monitor' : (browserActive ? 'Stop listening' : 'Share YouTube tab');

  elements.statusText.textContent = state.error || state.status;
  elements.statusDot.dataset.state = state.error ? 'error' : (active ? 'active' : 'idle');
  elements.source.textContent = active ? state.source : 'No source active';
  elements.sessionTime.textContent = formatTime(state.elapsed_seconds);
  elements.modelLabel.textContent = `${state.model_status} · ${state.model} · ${state.language === 'auto' ? 'auto language' : state.language.toUpperCase()}`;

  const level = Math.round((state.audio_level || 0) * 100);
  elements.meter.style.setProperty('--level', level);
  elements.meter.setAttribute('aria-valuenow', level);
  elements.audioValue.textContent = level;
  elements.queue.textContent = state.queue_depth ? `${state.queue_depth} audio chunk${state.queue_depth === 1 ? '' : 's'} queued` : 'Queue clear';
  elements.youtubeUrl.disabled = directActive;
  if (directActive && state.source_url) elements.youtubeUrl.value = state.source_url;
  elements.urlButton.textContent = directActive ? 'Stop silent monitor' : 'Start silent monitor';
  elements.urlButton.classList.toggle('is-active', directActive);
  elements.urlState.textContent = directActive
    ? (state.error || `${state.status} · speakers silent`)
    : 'Direct audio · no playback';

  const words = state.trigger_words || ['giveaway'];
  elements.watchWord.textContent = words.join(' · ');
  const telegramDegraded = Boolean(state.telegram_error);
  elements.watchStatus.textContent = telegramDegraded ? 'Last Telegram delivery failed' : (state.telegram_ready ? 'Telegram armed' : 'Waiting for Telegram');
  elements.armedBadge.textContent = telegramDegraded ? 'Check' : (state.telegram_ready ? 'Armed' : 'Setup');
  elements.armedBadge.dataset.ready = state.telegram_ready;
  elements.telegramState.textContent = telegramDegraded ? 'Configured · delivery failed' : (state.telegram_ready ? 'Configured and armed' : 'Not configured');
  elements.telegramConnectedLabel.textContent = telegramDegraded ? 'Bot configured · check delivery' : 'Bot configured';
  elements.telegramForm.hidden = state.telegram_ready;
  elements.telegramConnected.hidden = !state.telegram_ready;
  elements.telegramTest.disabled = !state.telegram_ready;
  elements.triggerWords.value = words.join(', ');
  setSelectValue(elements.language, state.language);
  setSelectValue(elements.model, state.model);
  elements.detectionSummary.textContent = `${words.join(', ')} · ${state.language === 'auto' ? 'Auto' : state.language.toUpperCase()}`;

  renderEntries(state.entries || [], words, state.alerts || []);
  renderAlerts(state.alerts || []);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      message = body.detail || message;
    } catch {}
    throw new Error(message);
  }
  return response.json();
}

async function pollState() {
  try {
    renderState(await api('/api/state'));
  } catch (error) {
    elements.statusText.textContent = 'Local app disconnected';
    elements.statusDot.dataset.state = 'error';
  }
}

function resample(input, sourceRate, targetRate) {
  if (sourceRate === targetRate) return input;
  const outputLength = Math.round(input.length * targetRate / sourceRate);
  const output = new Float32Array(outputLength);
  const ratio = sourceRate / targetRate;
  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = index * ratio;
    const left = Math.floor(sourceIndex);
    const right = Math.min(left + 1, input.length - 1);
    const fraction = sourceIndex - left;
    output[index] = input[left] * (1 - fraction) + input[right] * fraction;
  }
  return output;
}

function consumeAudioChunk(chunk) {
  capture.chunks.push(chunk);
  capture.sampleCount += chunk.length;
  const needed = Math.round(capture.context.sampleRate * CHUNK_SECONDS);
  if (capture.sampleCount < needed) return;

  const merged = new Float32Array(capture.sampleCount);
  let offset = 0;
  capture.chunks.forEach((part) => {
    merged.set(part, offset);
    offset += part.length;
  });
  capture.chunks = [];
  capture.sampleCount = 0;
  const ready = resample(merged, capture.context.sampleRate, TARGET_RATE);
  if (capture.socket?.readyState === WebSocket.OPEN) capture.socket.send(ready.buffer);
}

async function startCapture() {
  if (capture.stream) return;
  if (!navigator.mediaDevices?.getDisplayMedia) {
    showToast('Tab audio capture needs current Chrome or Edge.', 'error');
    return;
  }

  elements.capture.disabled = true;
  try {
    const audioConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      suppressLocalAudioPlayback: true,
    };
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'browser' },
      audio: audioConstraints,
      preferCurrentTab: false,
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'include',
      systemAudio: 'include',
    });
    if (!stream.getAudioTracks().length) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error('No tab audio shared. Choose the YouTube tab and enable “Share tab audio”.');
    }

    capture.stream = stream;
    capture.socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/audio`);
    await new Promise((resolve, reject) => {
      capture.socket.addEventListener('open', resolve, { once: true });
      capture.socket.addEventListener('error', () => reject(new Error('Could not open local audio connection.')), { once: true });
    });

    const videoLabel = stream.getVideoTracks()[0]?.label || 'YouTube browser tab';
    capture.socket.send(videoLabel);
    capture.context = new AudioContext({ sampleRate: TARGET_RATE, latencyHint: 'interactive' });
    await capture.context.audioWorklet.addModule('/static/capture-worklet.js');
    capture.source = capture.context.createMediaStreamSource(stream);
    capture.worklet = new AudioWorkletNode(capture.context, 'capture-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    const silent = capture.context.createGain();
    silent.gain.value = 0;
    capture.worklet.port.onmessage = (event) => consumeAudioChunk(event.data);
    capture.source.connect(capture.worklet).connect(silent).connect(capture.context.destination);
    stream.getVideoTracks()[0].addEventListener('ended', stopCapture, { once: true });
    stream.getAudioTracks()[0].addEventListener('ended', stopCapture, { once: true });
    showToast('Listening to shared tab audio. First model load can take a minute.', 'success');
    await pollState();
  } catch (error) {
    await stopCapture();
    if (error.name !== 'NotAllowedError') showToast(error.message, 'error');
  } finally {
    elements.capture.disabled = false;
  }
}

async function stopCapture() {
  if (capture.stopping) return;
  capture.stopping = true;
  try {
    capture.stream?.getTracks().forEach((track) => track.stop());
    capture.worklet?.disconnect();
    capture.source?.disconnect();
    if (capture.context && capture.context.state !== 'closed') await capture.context.close();
    if (capture.socket?.readyState === WebSocket.OPEN) capture.socket.close(1000, 'Stopped by user');
  } finally {
    capture.stream = null;
    capture.context = null;
    capture.source = null;
    capture.worklet = null;
    capture.socket = null;
    capture.chunks = [];
    capture.sampleCount = 0;
    capture.stopping = false;
    await pollState();
  }
}

async function toggleCapture() {
  if (currentState?.capture_mode === 'url' && currentState.capture_active) await stopUrlCapture();
  else if (capture.stream) await stopCapture();
  else await startCapture();
}

async function stopUrlCapture() {
  elements.urlButton.disabled = true;
  try {
    await api('/api/url/stop', { method: 'POST' });
    await pollState();
    showToast('Silent monitor stopped.', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    elements.urlButton.disabled = false;
  }
}

elements.capture.addEventListener('click', toggleCapture);
elements.emptyStart.addEventListener('click', startCapture);
elements.urlForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (currentState?.capture_mode === 'url' && currentState.capture_active) {
    await stopUrlCapture();
    return;
  }
  elements.urlButton.disabled = true;
  elements.urlButton.textContent = 'Connecting…';
  try {
    if (capture.stream) await stopCapture();
    await api('/api/url/start', {
      method: 'POST',
      body: JSON.stringify({ url: elements.youtubeUrl.value.trim() }),
    });
    await pollState();
    showToast('Silent YouTube monitor started. Browser playback not needed.', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    elements.urlButton.disabled = false;
  }
});
elements.exportButton.addEventListener('click', () => { window.location.href = '/api/export'; });
elements.clear.addEventListener('click', async () => {
  await api('/api/session/clear', { method: 'POST' });
  lastEntrySignature = '';
  lastAlertSignature = '';
  await pollState();
  showToast('Transcript cleared. Saved session file stays on disk.', 'success');
});

elements.telegramForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  button.textContent = 'Connecting…';
  try {
    await api('/api/telegram/configure', {
      method: 'POST',
      body: JSON.stringify({ token: elements.telegramToken.value.trim(), chat_id: elements.telegramChat.value.trim() }),
    });
    elements.telegramToken.value = '';
    await pollState();
    showToast('Telegram connected. Test message sent.', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Connect and test';
  }
});

elements.telegramTest.addEventListener('click', async () => {
  elements.telegramTest.disabled = true;
  try {
    await api('/api/telegram/test', { method: 'POST' });
    showToast('Test message delivered.', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    elements.telegramTest.disabled = false;
  }
});

elements.telegramChange.addEventListener('click', () => {
  elements.telegramForm.hidden = false;
  elements.telegramConnected.hidden = true;
  elements.telegramToken.focus();
});

elements.settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const words = elements.triggerWords.value.split(',').map((word) => word.trim()).filter(Boolean);
  try {
    await api('/api/settings', {
      method: 'POST',
      body: JSON.stringify({
        trigger_words: words,
        cooldown_seconds: Number(elements.cooldown.value),
        language: elements.language.value,
        model: elements.model.value,
      }),
    });
    await pollState();
    showToast('Detection settings saved.', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
});

window.addEventListener('beforeunload', () => {
  capture.stream?.getTracks().forEach((track) => track.stop());
  capture.socket?.close();
});

pollState();
window.setInterval(pollState, 900);
