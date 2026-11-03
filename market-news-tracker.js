const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const MARKET_SOURCE_URL = "https://scanner.tradingview.com/futures/scan";
const MARKET_POLL_MS = 60_000;
const MARKET_PRICE_RETENTION_DAYS = 90;
const REACTION_HORIZONS = [5, 15, 30, 60];
const MARKET_INSTRUMENTS = [
  { id: "gold", label: "Gold", symbol: "COMEX:GC1!" },
  { id: "mnq", label: "MNQ", symbol: "CME_MINI:MNQ1!" },
  { id: "sp500", label: "S&P 500", symbol: "CME_MINI:ES1!" },
  { id: "crude", label: "Crude Oil", symbol: "NYMEX:CL1!" },
  { id: "dow", label: "Dow Jones", symbol: "CBOT_MINI:YM1!" }
];

const instrumentBySymbol = new Map(MARKET_INSTRUMENTS.map((instrument) => [instrument.symbol, instrument]));

function iso(value) {
  return new Date(value).toISOString();
}

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function percentChange(price, baseline) {
  if (!Number.isFinite(price) || !Number.isFinite(baseline) || baseline === 0) return null;
  return ((price - baseline) / baseline) * 100;
}

function delaySeconds(updateMode) {
  const match = String(updateMode || "").match(/delayed(?:_streaming)?_(\d+)/i);
  return match ? Number(match[1]) : 0;
}

class MarketNewsTracker {
  constructor({ databaseFile, fetchImpl = fetch, now = () => Date.now(), logger = console } = {}) {
    if (!databaseFile) throw new Error("Market database file is required");
    fs.mkdirSync(path.dirname(databaseFile), { recursive: true });
    this.databaseFile = databaseFile;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.logger = logger;
    this.database = new DatabaseSync(databaseFile);
    this.timer = null;
    this.running = false;
    this.lastUpdatedAt = "";
    this.lastError = "";
    this.initialize();
  }

  initialize() {
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS news_events (
        event_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        country TEXT NOT NULL,
        event_at TEXT NOT NULL,
        impact TEXT NOT NULL,
        actual TEXT NOT NULL DEFAULT '',
        forecast TEXT NOT NULL DEFAULT '',
        previous TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS news_events_at_idx ON news_events(event_at);
      CREATE TABLE IF NOT EXISTS market_prices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        instrument TEXT NOT NULL,
        symbol TEXT NOT NULL,
        price REAL NOT NULL,
        captured_at TEXT NOT NULL,
        effective_at TEXT NOT NULL,
        delay_seconds INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL,
        UNIQUE(instrument, effective_at)
      );
      CREATE INDEX IF NOT EXISTS market_prices_lookup_idx ON market_prices(instrument, effective_at);
      CREATE TABLE IF NOT EXISTS news_market_moves (
        event_id TEXT NOT NULL,
        instrument TEXT NOT NULL,
        baseline_price REAL,
        baseline_at TEXT,
        price_5m REAL,
        change_5m REAL,
        pct_5m REAL,
        price_15m REAL,
        change_15m REAL,
        pct_15m REAL,
        price_30m REAL,
        change_30m REAL,
        pct_30m REAL,
        price_60m REAL,
        change_60m REAL,
        pct_60m REAL,
        status TEXT NOT NULL DEFAULT 'pending',
        updated_at TEXT NOT NULL,
        PRIMARY KEY(event_id, instrument),
        FOREIGN KEY(event_id) REFERENCES news_events(event_id)
      );
    `);
    this.upsertEvent = this.database.prepare(`
      INSERT INTO news_events (event_id, title, country, event_at, impact, actual, forecast, previous, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(event_id) DO UPDATE SET
        title = excluded.title,
        country = excluded.country,
        event_at = excluded.event_at,
        impact = excluded.impact,
        actual = excluded.actual,
        forecast = excluded.forecast,
        previous = excluded.previous,
        updated_at = excluded.updated_at
    `);
    this.ensureMove = this.database.prepare(`
      INSERT INTO news_market_moves (event_id, instrument, status, updated_at)
      VALUES (?, ?, 'pending', ?)
      ON CONFLICT(event_id, instrument) DO NOTHING
    `);
    this.insertPrice = this.database.prepare(`
      INSERT OR IGNORE INTO market_prices
        (instrument, symbol, price, captured_at, effective_at, delay_seconds, source)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    this.nearestPrice = this.database.prepare(`
      SELECT price, effective_at
      FROM market_prices
      WHERE instrument = ? AND effective_at BETWEEN ? AND ?
      ORDER BY ABS(julianday(effective_at) - julianday(?))
      LIMIT 1
    `);
    this.updateMove = this.database.prepare(`
      UPDATE news_market_moves SET
        baseline_price = ?, baseline_at = ?,
        price_5m = ?, change_5m = ?, pct_5m = ?,
        price_15m = ?, change_15m = ?, pct_15m = ?,
        price_30m = ?, change_30m = ?, pct_30m = ?,
        price_60m = ?, change_60m = ?, pct_60m = ?,
        status = ?, updated_at = ?
      WHERE event_id = ? AND instrument = ?
    `);
    this.movesForEventStatement = this.database.prepare(`
      SELECT instrument, baseline_price, baseline_at,
        price_5m, change_5m, pct_5m,
        price_15m, change_15m, pct_15m,
        price_30m, change_30m, pct_30m,
        price_60m, change_60m, pct_60m,
        status, updated_at
      FROM news_market_moves
      WHERE event_id = ?
    `);
  }

  syncEvents(events = []) {
    const updatedAt = iso(this.now());
    this.database.exec("BEGIN");
    try {
      for (const event of events) {
        if (!event || !event.id || !event.date) continue;
        this.upsertEvent.run(
          String(event.id),
          String(event.title || ""),
          String(event.country || ""),
          iso(event.date),
          String(event.impact || "Low"),
          String(event.actual || ""),
          String(event.forecast || ""),
          String(event.previous || ""),
          updatedAt
        );
        for (const instrument of MARKET_INSTRUMENTS) this.ensureMove.run(String(event.id), instrument.id, updatedAt);
      }
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  async collectPrices() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await this.fetchImpl(MARKET_SOURCE_URL, {
        method: "POST",
        signal: controller.signal,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "user-agent": "Account-Control-Center/1.0"
        },
        body: JSON.stringify({
          symbols: { tickers: MARKET_INSTRUMENTS.map((instrument) => instrument.symbol), query: { types: [] } },
          columns: ["name", "description", "close", "change", "change_abs", "update_mode", "pricescale", "minmov", "update_time", "current_session"]
        })
      });
      if (!response.ok) throw new Error(`Market source returned ${response.status}`);
      const payload = await response.json();
      if (!payload || !Array.isArray(payload.data)) throw new Error("Market source returned invalid data");
      const capturedMs = this.now();
      const capturedAt = iso(capturedMs);
      let saved = 0;
      for (const row of payload.data) {
        const instrument = instrumentBySymbol.get(String(row && row.s || ""));
        const price = numberOrNull(row && row.d && row.d[2]);
        if (!instrument || price == null || price <= 0) continue;
        const delayedBy = delaySeconds(row.d[5]);
        const sourceUpdatedMs = Number(row.d[8]) * 1000;
        const quoteObservedMs = Number.isFinite(sourceUpdatedMs) && Math.abs(capturedMs - sourceUpdatedMs) < 30 * 60_000
          ? sourceUpdatedMs
          : capturedMs;
        this.insertPrice.run(
          instrument.id,
          instrument.symbol,
          price,
          capturedAt,
          iso(quoteObservedMs - delayedBy * 1000),
          delayedBy,
          "TradingView delayed scanner"
        );
        saved += 1;
      }
      if (!saved) throw new Error("Market source returned no usable prices");
      this.lastUpdatedAt = capturedAt;
      this.lastError = "";
      return saved;
    } finally {
      clearTimeout(timer);
    }
  }

  priceNear(instrument, targetMs, toleranceMs = 6 * 60_000) {
    const row = this.nearestPrice.get(
      instrument,
      iso(targetMs - toleranceMs),
      iso(targetMs + toleranceMs),
      iso(targetMs)
    );
    return row && Number.isFinite(row.price) ? row : null;
  }

  rebuildReactions() {
    const nowMs = this.now();
    const earliest = iso(nowMs - 8 * 24 * 60 * 60_000);
    const latest = iso(nowMs + 6 * 60_000);
    const events = this.database.prepare(`
      SELECT event_id, event_at FROM news_events
      WHERE event_at BETWEEN ? AND ?
      ORDER BY event_at
    `).all(earliest, latest);
    const updatedAt = iso(nowMs);
    this.database.exec("BEGIN");
    try {
      for (const event of events) {
        const eventMs = new Date(event.event_at).getTime();
        for (const instrument of MARKET_INSTRUMENTS) {
          const baseline = this.priceNear(instrument.id, eventMs);
          const values = [];
          let completed = 0;
          for (const minutes of REACTION_HORIZONS) {
            const sample = nowMs >= eventMs + minutes * 60_000
              ? this.priceNear(instrument.id, eventMs + minutes * 60_000)
              : null;
            if (sample) completed += 1;
            values.push(
              sample ? sample.price : null,
              sample && baseline ? sample.price - baseline.price : null,
              sample && baseline ? percentChange(sample.price, baseline.price) : null
            );
          }
          const status = nowMs < eventMs
            ? "pending"
            : completed === REACTION_HORIZONS.length
              ? "complete"
              : "tracking";
          this.updateMove.run(
            baseline ? baseline.price : null,
            baseline ? baseline.effective_at : null,
            ...values,
            status,
            updatedAt,
            event.event_id,
            instrument.id
          );
        }
      }
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  cleanup() {
    const cutoff = iso(this.now() - MARKET_PRICE_RETENTION_DAYS * 24 * 60 * 60_000);
    this.database.prepare("DELETE FROM market_prices WHERE effective_at < ?").run(cutoff);
  }

  reactionsForEvent(eventId) {
    const rows = this.movesForEventStatement.all(String(eventId || ""));
    const byInstrument = new Map(rows.map((row) => [row.instrument, row]));
    return MARKET_INSTRUMENTS.map((instrument) => {
      const row = byInstrument.get(instrument.id) || {};
      return {
        instrument: instrument.id,
        label: instrument.label,
        symbol: instrument.symbol,
        baseline: numberOrNull(row.baseline_price),
        baselineAt: row.baseline_at || "",
        status: row.status || "pending",
        updatedAt: row.updated_at || "",
        moves: Object.fromEntries(REACTION_HORIZONS.map((minutes) => [String(minutes), {
          price: numberOrNull(row[`price_${minutes}m`]),
          change: numberOrNull(row[`change_${minutes}m`]),
          percent: numberOrNull(row[`pct_${minutes}m`])
        }]))
      };
    });
  }

  addReactions(events = []) {
    return events.map((event) => ({ ...event, marketReactions: this.reactionsForEvent(event.id) }));
  }

  status() {
    const counts = this.database.prepare(`
      SELECT
        (SELECT COUNT(*) FROM market_prices) AS prices,
        (SELECT COUNT(*) FROM news_events) AS events,
        (SELECT COUNT(*) FROM news_market_moves WHERE status = 'complete') AS completeMoves
    `).get();
    return {
      source: "TradingView delayed scanner",
      delayed: true,
      pollSeconds: MARKET_POLL_MS / 1000,
      lastUpdatedAt: this.lastUpdatedAt,
      lastError: this.lastError,
      prices: Number(counts.prices || 0),
      events: Number(counts.events || 0),
      completeMoves: Number(counts.completeMoves || 0)
    };
  }

  async tick(eventsProvider) {
    if (this.running) return;
    this.running = true;
    try {
      const events = await eventsProvider();
      this.syncEvents(Array.isArray(events) ? events : []);
      await this.collectPrices();
      this.rebuildReactions();
      this.cleanup();
    } catch (error) {
      this.lastError = String(error && error.message || error);
      this.logger.warn(`Market tracker: ${this.lastError}`);
    } finally {
      this.running = false;
    }
  }

  start(eventsProvider) {
    if (this.timer) return;
    this.tick(eventsProvider);
    this.timer = setInterval(() => this.tick(eventsProvider), MARKET_POLL_MS);
    if (typeof this.timer.unref === "function") this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  close() {
    this.stop();
    this.database.close();
  }
}

module.exports = { MarketNewsTracker, MARKET_INSTRUMENTS, REACTION_HORIZONS, delaySeconds };
