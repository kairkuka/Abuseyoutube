const assert = require("node:assert/strict");

const { formLinksFromRuns, normalizeFormUrl } = require("./fast-chat-handler");

const fullForm = "https://docs.google.com/forms/d/e/1FAIpQLSdDlK5Cc1soaew-aH92CzhIvxjdJRoY_cMKJyCuoT1AyZDVJQ/viewform?usp=header";
const redirect = `https://www.youtube.com/redirect?event=live_chat&q=${encodeURIComponent(fullForm)}`;

function test(name, callback) {
  callback();
  console.log(`PASS ${name}`);
}

test("extracts full clickable URL instead of truncated visible text", () => {
  const links = formLinksFromRuns([{
    text: "https://docs.google.com/forms/d/e/1FA...",
    navigationEndpoint: {
      commandMetadata: { webCommandMetadata: { url: redirect } }
    }
  }]);
  assert.deepEqual(links, [fullForm]);
});

test("rejects truncated Google Form display URL", () => {
  assert.equal(normalizeFormUrl("https://docs.google.com/forms/d/e/1FA..."), "");
});

test("canonicalizes YouTube live-chat redirect", () => {
  assert.equal(normalizeFormUrl(redirect), fullForm);
});
