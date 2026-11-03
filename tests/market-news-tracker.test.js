const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { MarketNewsTracker, MARKET_INSTRUMENTS, delaySeconds } = require("../market-news-tracker");

async function run() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "market-news-tracker-"));
  let now = Date.parse("2026-10-14T12:10:00.000Z");
  let step = 0;
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      data: MARKET_INSTRUMENTS.map((instrument, index) => ({
        s: instrument.symbol,
        d: [instrument.symbol, instrument.label, 100 + index * 10 + step, 0, 0, "delayed_streaming_600", 100, 1]
      }))
    })
  });
  const tracker = new MarketNewsTracker({
    databaseFile: path.join(directory, "market.sqlite"),
    fetchImpl,
    now: () => now,
    logger: { warn() {} }
  });
  try {
    const event = {
      id: "0123456789abcdef",
      title: "US CPI",
      country: "USD",
      date: "2026-10-14T12:00:00.000Z",
      impact: "High",
      actual: "3.6%",
      forecast: "3.4%",
      previous: "3.3%"
    };
    tracker.syncEvents([event]);
    for (const [minutes, nextStep] of [[10, 0], [15, 1], [25, 3], [40, 5], [70, 8]]) {
      now = Date.parse("2026-10-14T12:00:00.000Z") + minutes * 60_000;
      step = nextStep;
      await tracker.collectPrices();
    }
    tracker.rebuildReactions();
    const [gold] = tracker.reactionsForEvent(event.id);
    assert.equal(gold.baseline, 100);
    assert.equal(gold.moves["5"].price, 101);
    assert.equal(gold.moves["15"].price, 103);
    assert.equal(gold.moves["30"].price, 105);
    assert.equal(gold.moves["60"].price, 108);
    assert.equal(gold.status, "complete");
    assert.equal(tracker.status().prices, 25);
    assert.equal(delaySeconds("delayed_streaming_600"), 600);
    console.log("market-news-tracker tests passed");
  } finally {
    tracker.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
