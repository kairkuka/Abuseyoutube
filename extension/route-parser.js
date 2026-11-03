(function attachAccountRouteParser(root) {
  function cookie(name) {
    if (typeof document === "undefined") return "";
    const prefix = `${name}=`;
    const part = String(document.cookie || "").split("; ").find((value) => value.startsWith(prefix));
    return part ? decodeURIComponent(part.slice(prefix.length)) : "";
  }

  async function sha1(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-1", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function installAuthenticatedFetch() {
    if (typeof window === "undefined" || window.__accountControlAuthenticatedFetch) return;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (url.origin !== location.origin || !/\/youtubei\/v1\/account\/(?:accounts_list|account_menu)$/.test(url.pathname)) {
        return originalFetch(input, init);
      }
      const secret = cookie("SAPISID") || cookie("__Secure-3PAPISID");
      if (!secret) return originalFetch(input, init);
      const timestamp = Math.floor(Date.now() / 1000);
      const authorization = `SAPISIDHASH ${timestamp}_${await sha1(`${timestamp} ${secret} ${location.origin}`)}`;
      const headers = new Headers(input instanceof Request ? input.headers : undefined);
      new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value));
      headers.set("authorization", authorization);
      headers.set("x-origin", location.origin);
      const clientName = window.ytcfg && window.ytcfg.get("INNERTUBE_CONTEXT_CLIENT_NAME");
      const clientVersion = window.ytcfg && window.ytcfg.get("INNERTUBE_CONTEXT_CLIENT_VERSION");
      const visitorId = window.ytcfg && window.ytcfg.get("VISITOR_DATA");
      if (clientName != null) headers.set("x-youtube-client-name", String(clientName));
      if (clientVersion) headers.set("x-youtube-client-version", String(clientVersion));
      if (visitorId) headers.set("x-goog-visitor-id", String(visitorId));
      return originalFetch(input, { ...init, headers });
    };
    window.__accountControlAuthenticatedFetch = true;
  }

  function text(value) {
    if (!value || typeof value !== "object") return "";
    if (typeof value.simpleText === "string") return value.simpleText.trim();
    if (Array.isArray(value.runs)) return value.runs.map((run) => String(run && run.text || "")).join("").trim();
    return "";
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
  }

  function collectCandidateRenderers(value, output = [], seen = new Set()) {
    if (!value || typeof value !== "object" || seen.has(value)) return output;
    seen.add(value);
    if (!Array.isArray(value)) {
      for (const [key, child] of Object.entries(value)) {
        if (/accountItemRenderer$/i.test(key) && child && typeof child === "object") output.push(child);
      }
      if (Object.keys(value).some((key) => /pageIdToken|delegatedSessionId|selectActiveIdentityEndpoint/i.test(key))) output.push(value);
    }
    Object.values(value).forEach((child) => collectCandidateRenderers(child, output, seen));
    return output;
  }

  function parseRenderer(renderer) {
    const handles = [];
    const channelIds = [];
    const pageIds = [];
    const sessionIndexes = [];
    const names = [];
    const seen = new Set();
    const walk = (value, key = "") => {
      if (value == null) return;
      if (typeof value === "string" || typeof value === "number") {
        const clean = String(value).trim();
        if (/^@[A-Za-z0-9._-]+$/.test(clean)) handles.push(clean);
        if (/^UC[A-Za-z0-9_-]{20,40}$/.test(clean)) channelIds.push(clean);
        if (/clientCacheKey$/i.test(key) && /^[A-Za-z0-9_-]{20,40}$/.test(clean)) channelIds.push(`UC${clean}`);
        if (/(?:pageId|delegatedSessionId|onBehalfOfUser|obfuscatedGaiaId)$/i.test(key) && clean.length <= 120) pageIds.push(clean);
        if (/(?:sessionIndex|authuser|accountIndex)$/i.test(key) && /^\d{1,2}$/.test(clean)) sessionIndexes.push(clean);
        if (/^(?:https?:\/\/|\/signin\?)/i.test(clean)) {
          try {
            const url = new URL(clean, "https://www.youtube.com");
            if (url.searchParams.get("pageid")) pageIds.push(url.searchParams.get("pageid"));
            if (url.searchParams.get("authuser")) sessionIndexes.push(url.searchParams.get("authuser"));
          } catch {}
        }
        return;
      }
      if (typeof value !== "object" || seen.has(value)) return;
      seen.add(value);
      const rendered = text(value);
      if (rendered && rendered.length <= 100) names.push(rendered);
      Object.entries(value).forEach(([childKey, child]) => walk(child, childKey));
    };
    walk(renderer);
    const cleanNames = unique(names).filter((value) => !value.startsWith("@") && !/^UC[A-Za-z0-9_-]+$/.test(value));
    const directName = text(renderer.accountName) || text(renderer.channelName) || text(renderer.channelTitle) || text(renderer.title);
    const ids = unique(channelIds);
    const pages = unique(pageIds);
    return {
      handle: unique(handles)[0] || "",
      name: directName || cleanNames[0] || "",
      channelId: ids[0] || pages.find((value) => /^UC[A-Za-z0-9_-]{20,40}$/.test(value)) || "",
      pageId: pages[0] || ids[0] || "",
      sessionIndex: unique(sessionIndexes)[0] || "",
      selected: renderer.isSelected === true || renderer.selected === true
    };
  }

  function extract(data) {
    const rows = collectCandidateRenderers(data).map(parseRenderer).filter((row) => row.pageId || row.channelId || row.handle);
    const output = [];
    const positions = new Map();
    for (const row of rows) {
      const key = row.pageId || row.channelId || row.handle.toLowerCase();
      const position = positions.get(key);
      if (position == null) {
        positions.set(key, output.length);
        output.push(row);
        continue;
      }
      const current = output[position];
      output[position] = {
        handle: current.handle || row.handle,
        name: current.name || row.name,
        channelId: current.channelId || row.channelId,
        pageId: current.pageId || row.pageId,
        sessionIndex: current.sessionIndex || row.sessionIndex,
        selected: current.selected || row.selected
      };
    }
    return output;
  }

  const api = { extract };
  root.AccountRouteParser = api;
  installAuthenticatedFetch();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
