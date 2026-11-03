const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { YouTubeOAuth } = require("../youtube-oauth");

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "acc-oauth-test-"));
  const youtube = new YouTubeOAuth({ dataDir: temp, redirectUri: "http://127.0.0.1:8790/oauth/callback" });
  youtube.importClient({ installed: {
    client_id: "test-client.apps.googleusercontent.com",
    client_secret: "test-secret",
    auth_uri: "https://accounts.google.com/o/oauth2/v2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    project_id: "test-project"
  }});

  const genericAuthorization = new URL(youtube.beginAuthorization());
  const scope = genericAuthorization.searchParams.get("scope") || "";
  assert.ok(scope.includes("openid"));
  assert.ok(scope.includes("email"));
  assert.ok(scope.includes("https://www.googleapis.com/auth/youtube.force-ssl"));
  assert.strictEqual(genericAuthorization.searchParams.get("access_type"), "offline");
  assert.ok((genericAuthorization.searchParams.get("prompt") || "").includes("select_account"));
  assert.strictEqual(genericAuthorization.searchParams.get("login_hint"), null);

  const targetChannelId = "UCabcdefghijklmnopqrstuv";
  const authorization = new URL(youtube.beginAuthorization({ target: {
    email: "student@example.com",
    accountId: targetChannelId,
    label: "Diploma Channel"
  }, completionMode: "migration" }));
  assert.ok((authorization.searchParams.get("prompt") || "").includes("consent"));
  assert.ok((authorization.searchParams.get("prompt") || "").includes("select_account"));
  assert.strictEqual(authorization.searchParams.get("login_hint"), "student@example.com");

  const originalFetch = global.fetch;
  let requestNumber = 0;
  let authorizedEmail = "student@example.com";
  let authorizedChannelId = targetChannelId;
  let grantedScope = "";
  global.fetch = async (url) => {
    requestNumber += 1;
    if (requestNumber === 1) return new Response(JSON.stringify({
      access_token: "access-1",
      refresh_token: "refresh-1",
      refresh_token_expires_in: 7 * 24 * 60 * 60,
      expires_in: 3600,
      scope: grantedScope
    }), { status: 200, headers: { "content-type": "application/json" } });
    if (requestNumber === 2) return new Response(JSON.stringify({ sub: "google-sub-1", email: authorizedEmail, email_verified: true, name: "Student User", picture: "https://example.com/avatar.png" }), { status: 200, headers: { "content-type": "application/json" } });
    if (requestNumber === 3) return new Response(JSON.stringify({ items: [{ id: authorizedChannelId, snippet: { title: "Diploma Channel", customUrl: "@diploma", thumbnails: { default: { url: "https://example.com/channel.png" } } } }] }), { status: 200, headers: { "content-type": "application/json" } });
    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    const account = await youtube.finishAuthorization(new URLSearchParams({ code: "code-1", state: authorization.searchParams.get("state") }));
    assert.strictEqual(account.email, "student@example.com");
    assert.strictEqual(account.googleSub, "google-sub-1");
    assert.strictEqual(account.name, "Diploma Channel");
    assert.strictEqual(account.handle, "@diploma");
    assert.strictEqual(account.authorizationCompletionMode, "migration");
    const listed = youtube.listAccounts();
    assert.strictEqual(listed.length, 1);
    assert.strictEqual(listed[0].email, "student@example.com");
    assert.strictEqual(listed[0].googleSub, "google-sub-1");
    assert.ok(Date.parse(listed[0].refreshTokenExpiresAt) > Date.now() + 6 * 24 * 60 * 60 * 1000);

    requestNumber = 0;
    const wrongChannelAuthorization = new URL(youtube.beginAuthorization({ target: {
      email: "student@example.com",
      accountId: "UCzzzzzzzzzzzzzzzzzzzzzz",
      label: "Wrong channel"
    }, completionMode: "migration" }));
    await assert.rejects(
      () => youtube.finishAuthorization(new URLSearchParams({ code: "code-2", state: wrongChannelAuthorization.searchParams.get("state") })),
      (error) => error
        && error.code === "targetChannelMismatch"
        && error.authorizationCompletionMode === "migration"
        && error.authorizationTargetAccountId === "UCzzzzzzzzzzzzzzzzzzzzzz"
        && /Google authorized @diploma/.test(error.message)
        && /reconnect expects Wrong channel/.test(error.message)
    );
    assert.strictEqual(youtube.listAccounts().length, 1);

    requestNumber = 0;
    authorizedEmail = "diploma-brand@pages.plusgoogle.com";
    const brandAccountAuthorization = new URL(youtube.beginAuthorization({ target: {
      email: "student@example.com",
      accountId: targetChannelId,
      label: "Diploma Channel"
    }}));
    const brandAccount = await youtube.finishAuthorization(new URLSearchParams({ code: "code-3", state: brandAccountAuthorization.searchParams.get("state") }));
    assert.strictEqual(brandAccount.email, "diploma-brand@pages.plusgoogle.com");
    assert.strictEqual(youtube.listAccounts().length, 1);

    requestNumber = 0;
    authorizedEmail = "other@example.com";
    const emailOnlyAuthorization = new URL(youtube.beginAuthorization({ target: {
      email: "student@example.com",
      label: "Email-only target"
    }}));
    await assert.rejects(
      () => youtube.finishAuthorization(new URLSearchParams({ code: "code-4", state: emailOnlyAuthorization.searchParams.get("state") })),
      (error) => error && error.code === "targetEmailMismatch" && /Wrong Google account/.test(error.message)
    );
    assert.strictEqual(youtube.listAccounts().length, 1);

    requestNumber = 0;
    authorizedEmail = "student@example.com";
    grantedScope = "openid email profile";
    const missingScopeAuthorization = new URL(youtube.beginAuthorization({ target: {
      email: "student@example.com",
      accountId: targetChannelId,
      label: "Diploma Channel"
    }}));
    await assert.rejects(
      () => youtube.finishAuthorization(new URLSearchParams({ code: "code-5", state: missingScopeAuthorization.searchParams.get("state") })),
      (error) => error && error.code === "insufficientScopes" && /approve the YouTube permission checkbox/.test(error.message)
    );
    assert.strictEqual(youtube.listAccounts().length, 1);
  } finally {
    global.fetch = originalFetch;
    fs.rmSync(temp, { recursive: true, force: true });
  }

  console.log("oauth-identity tests: PASS");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
