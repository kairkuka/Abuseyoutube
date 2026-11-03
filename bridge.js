class ExtensionBridge {
  constructor() {
    this.accounts = [];
    this.chat = [];
    this.chatDebug = { frames: 0, renderers: 0, messages: 0, reason: "" };
    this.routes = [];
    this.version = "";
    this.lite = { enabled: false, phase: "off", videoId: "", hot: 0, parked: 0, total: 0 };
    this.lastSeen = 0;
    this.commands = [];
    this.pending = new Map();
    this.waiters = [];
    this.nextCommand = 1;
  }

  updateSnapshot(payload) {
    this.version = String(payload.bridgeVersion || this.version || "");
    const rows = Array.isArray(payload.accounts) ? payload.accounts : [];
    this.accounts = rows
      .filter((row) => row && typeof row.targetId === "string")
      .map((row) => ({
        targetId: row.targetId,
        windowId: Number(row.windowId || 0),
        windowNumber: Number(row.windowNumber || 0),
        tabNumber: Number(row.tabNumber || 0),
        title: String(row.title || "YouTube"),
        url: String(row.url || ""),
        videoId: String(row.videoId || ""),
        loggedIn: Boolean(row.loggedIn),
        handle: String(row.handle || ""),
        name: String(row.name || ""),
        liteState: String(row.liteState || "full"),
        ready: Boolean(row.ready),
        accountError: String(row.accountError || ""),
        channelId: String(row.channelId || "")
      }));
    this.chat = Array.isArray(payload.chat) ? payload.chat.slice(-100).map((row) => ({
      id: String(row.id || ""),
      author: String(row.author || ""),
      message: String(row.message || ""),
      timestamp: String(row.timestamp || ""),
      avatar: String(row.avatar || "")
    })).filter((row) => row.message) : this.chat;
    if (payload.chatDebug && typeof payload.chatDebug === "object") {
      this.chatDebug = {
        frames: Number(payload.chatDebug.frames || 0),
        renderers: Number(payload.chatDebug.renderers || 0),
        messages: Number(payload.chatDebug.messages || 0),
        reason: String(payload.chatDebug.reason || "")
      };
    }
    const lite = payload && payload.lite || {};
    this.routes = Array.isArray(payload.routeCatalog) ? payload.routeCatalog.map((row) => ({
      handle: String(row.handle || ""),
      name: String(row.name || ""),
      channelId: String(row.channelId || ""),
      pageId: String(row.pageId || ""),
      sessionIndex: String(row.sessionIndex || "")
    })).filter((row) => row.channelId || row.pageId || row.handle) : this.routes;
    this.lite = {
      enabled: Boolean(lite.enabled),
      phase: String(lite.phase || (lite.enabled ? "ready" : "off")),
      videoId: String(lite.videoId || ""),
      hot: Number(lite.hot || 0),
      parked: Number(lite.parked || 0),
      total: Number(lite.total || this.accounts.length)
    };
    this.lastSeen = Date.now();
  }

  listAccounts() {
    if (Date.now() - this.lastSeen > 45000) {
      throw new Error("Chrome bridge is offline. Keep Chrome open with Account Control Bridge enabled.");
    }
    return this.accounts;
  }

  listChat() {
    return this.chat;
  }

  chatStatus() {
    return { ...this.chatDebug };
  }

  listRoutes() {
    return this.routes.slice();
  }

  status() {
    return { ...this.lite, version: this.version };
  }

  takeCommands() {
    return this.commands.splice(0, 10);
  }

  waitCommands(timeoutMs = 20000) {
    const ready = this.takeCommands();
    if (ready.length) return Promise.resolve(ready);
    return new Promise((resolve) => {
      const waiter = { resolve, timer: null };
      waiter.timer = setTimeout(() => {
        this.waiters = this.waiters.filter((item) => item !== waiter);
        resolve([]);
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  wakeWaiter() {
    const waiter = this.waiters.shift();
    if (!waiter) return;
    clearTimeout(waiter.timer);
    waiter.resolve(this.takeCommands());
  }

  complete(payload) {
    const id = String(payload.commandId || "");
    const pending = this.pending.get(id);
    if (!pending) return false;
    this.pending.delete(id);
    clearTimeout(pending.timer);
    if (payload.ok) pending.resolve(payload.result || { ok: true });
    else pending.reject(new Error(String(payload.error || "Chrome command failed")));
    return true;
  }

  command(action, targetId, message = "", timeoutMs = 12000, metadata = {}) {
    const commandId = `cmd_${Date.now()}_${this.nextCommand++}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(commandId);
        this.commands = this.commands.filter((item) => item.commandId !== commandId);
        reject(new Error("Chrome bridge command timed out"));
      }, timeoutMs);
      this.pending.set(commandId, { resolve, reject, timer });
      this.commands.push({ commandId, action, targetId, message, ...metadata });
      this.wakeWaiter();
    });
  }

  stage(targetId, message, channelId = "", handle = "") {
    return this.command("stage", targetId, message, 30000, { channelId, handle });
  }

  sendStaged(targetId, channelId = "") {
    return this.command("send", targetId, "", 12000, { channelId });
  }

  prepare(targetId, channelId = "", handle = "") {
    return this.command("prepare", targetId, "", 30000, { channelId, handle });
  }

  startLite(videoId) {
    return this.command("lite-start", "", videoId, 120000);
  }

  useVaultStream(videoId) {
    return this.command("vault-stream", "", videoId, 60000);
  }

  stopLite() {
    return this.command("lite-stop", "", "", 60000);
  }

  buildVault() {
    return this.command("vault-build", "", "", 240000);
  }

  testVault(targetId) {
    return this.command("vault-test", targetId, "", 30000);
  }

  debugRoutes(targetId) {
    return this.command("route-debug", targetId, "", 30000);
  }

  syncRoutes() {
    return this.command("routes-sync", "", "", 60000);
  }
}

module.exports = { ExtensionBridge };
