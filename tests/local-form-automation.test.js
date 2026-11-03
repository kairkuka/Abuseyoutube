const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  discoverChromeProfiles,
  sanitizeConfig,
  mergeDiscoveredProfiles,
  normalizeUrl,
  extractResponseText,
  isDuplicateAiValue,
  enforceAiSentenceLimit,
  aiSentenceLimit,
  buildAiInstruction,
  createProfileSnapshot
} = require("../local-form-automation");

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "acc-local-form-test-"));
  const userData = path.join(temp, "User Data");
  fs.mkdirSync(path.join(userData, "Default", "Cache"), { recursive: true });
  fs.mkdirSync(path.join(userData, "Profile 2"), { recursive: true });
  fs.writeFileSync(path.join(userData, "Local State"), JSON.stringify({
    profile: { info_cache: {
      Default: { name: "Primary", user_name: "primary@example.com" },
      "Profile 2": { name: "Second", user_name: "second@example.com" }
    }}
  }));
  fs.writeFileSync(path.join(userData, "Default", "Preferences"), JSON.stringify({ profile: { name: "Primary" } }));
  fs.writeFileSync(path.join(userData, "Profile 2", "Preferences"), JSON.stringify({ account_info: [{ email: "second@example.com" }] }));
  fs.writeFileSync(path.join(userData, "Default", "Cookies"), "session-data");
  fs.writeFileSync(path.join(userData, "Default", "Cache", "skip.tmp"), "cache");

  const discovery = discoverChromeProfiles(userData);
  assert.strictEqual(discovery.profiles.length, 2);
  assert.strictEqual(discovery.profiles[0].profileDir, "Default");
  assert.strictEqual(discovery.profiles[0].email, "primary@example.com");
  assert.strictEqual(discovery.profiles[1].email, "second@example.com");

  const config = sanitizeConfig({
    targetUrl: "https://example.com/form",
    selectors: { email: "", ai: "", nickname: "" },
    aiPrompt: "Generate one value",
    aiMaxChars: 150,
    profiles: { Default: { enabled: true, accountId: "UCabcdefghijklmnopqrstuv", email: "primary@example.com", field1: "VALUE-1", field3: "NICK-1" } }
  });
  assert.strictEqual(config.targetUrl, "https://example.com/form");
  assert.strictEqual(config.profiles.Default.enabled, true);
  assert.strictEqual(config.profiles.Default.field1, "VALUE-1");
  assert.strictEqual(config.profiles.Default.field3, "NICK-1");

  const connectedAccounts = [{
    id: "UCabcdefghijklmnopqrstuv",
    email: "primary@example.com",
    name: "Primary Channel",
    handle: "@primary",
    metadata: { field1: "DEFAULT-1", field3: "DEFAULT-3" }
  }];
  const merged = mergeDiscoveredProfiles(config, discovery, connectedAccounts);
  assert.strictEqual(merged[0].connected, true);
  assert.strictEqual(merged[0].accountId, connectedAccounts[0].id);
  assert.strictEqual(merged[0].field1, "VALUE-1");
  assert.strictEqual(merged[0].field3, "NICK-1");
  assert.strictEqual(merged[1].connected, false);

  assert.throws(() => normalizeUrl("javascript:alert(1)"), /Only http/);
  assert.strictEqual(extractResponseText({ output_text: " hello " }), "hello");
  assert.strictEqual(extractResponseText({ output: [{ content: [{ text: "world" }] }] }), "world");
  assert.strictEqual(isDuplicateAiValue("Hello, world!", ["hello world"]), true);
  assert.strictEqual(isDuplicateAiValue("Different answer", ["hello world"]), false);
  assert.strictEqual(enforceAiSentenceLimit("One. Two! Three?"), "One. Two!");
  assert.strictEqual(enforceAiSentenceLimit("One. Two! Three?", 3), "One. Two! Three?");
  assert.ok([2, 3].includes(aiSentenceLimit(merged[0])));

  const instruction = buildAiInstruction(merged[0], config, ["Already used answer."], 2);
  assert.match(instruction, /My Funded Futures/);
  assert.match(instruction, /ENGLISH ONLY/);
  assert.match(instruction, /Sentence limit for this account: [23]/);
  assert.match(instruction, /Already used answer/);
  assert.match(instruction, /retry 2/);
  assert.match(instruction, /Primary Channel/);

  const snapshot = await createProfileSnapshot(userData, "Default");
  assert.ok(fs.existsSync(path.join(snapshot, "Local State")));
  assert.ok(fs.existsSync(path.join(snapshot, "Default", "Cookies")));
  assert.ok(!fs.existsSync(path.join(snapshot, "Default", "Cache", "skip.tmp")));

  fs.rmSync(temp, { recursive: true, force: true });
  fs.rmSync(snapshot, { recursive: true, force: true });
  console.log("local-form-automation tests: PASS");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
