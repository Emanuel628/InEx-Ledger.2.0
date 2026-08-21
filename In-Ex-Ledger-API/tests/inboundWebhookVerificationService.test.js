"use strict";

/**
 * Direct unit tests for services/inboundWebhookVerificationService.js — the
 * shared inbound-webhook signature verification / parsing module extracted
 * out of routes/email.routes.js and routes/supportEmail.routes.js.
 *
 * Also includes route-level checks (through both routers) proving the two
 * routes now share the same multi-secret rotation behaviour.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const express = require("express");
const request = require("supertest");

const {
  timingSafeStringEqual,
  timingSafeHexEqual,
  timingSafeB64Equal,
  computeInboundSignature,
  verifySvixSignature,
  maskEmailLike,
  maskRecipientList,
  pickRecipientList,
  pickFromAddress,
  pickBody,
  cleanInboundReplyBody,
  describeInboundCaller,
  resolveWebhookSecrets,
  createInboundWebhookVerifier
} = require("../services/inboundWebhookVerificationService.js");

async function withEnv(overrides, fn) {
  const before = {};
  for (const key of Object.keys(overrides)) {
    before[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(before)) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  }
}

function makeReq({ headers = {}, body = "", ip = "127.0.0.1" } = {}) {
  const lower = {};
  for (const [key, value] of Object.entries(headers)) {
    lower[key.toLowerCase()] = value;
  }
  return {
    body,
    ip,
    get(name) {
      return lower[String(name).toLowerCase()];
    }
  };
}

function signLegacy(secret, rawBody, timestampSeconds = Math.floor(Date.now() / 1000)) {
  const signature = computeInboundSignature(secret, String(timestampSeconds), rawBody);
  return { timestampSeconds, signature };
}

function signSvix(secret, rawBody, id = "msg_test_unit", timestamp = String(Math.floor(Date.now() / 1000))) {
  const keyMaterial = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  const keyBytes = Buffer.from(keyMaterial, "base64");
  const signature = crypto
    .createHmac("sha256", keyBytes)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");
  return { id, timestamp, signature: `v1,${signature}` };
}

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

test("timingSafeStringEqual matches equal strings and rejects unequal / different-length ones", () => {
  assert.equal(timingSafeStringEqual("secret-value", "secret-value"), true);
  assert.equal(timingSafeStringEqual("secret-value", "other-value!"), false);
  assert.equal(timingSafeStringEqual("short", "much-longer-string"), false);
  assert.equal(timingSafeStringEqual("", ""), true);
});

test("timingSafeHexEqual matches equal hex digests and rejects mismatches / garbage", () => {
  const hex = crypto.createHash("sha256").update("payload").digest("hex");
  assert.equal(timingSafeHexEqual(hex, hex), true);
  assert.equal(timingSafeHexEqual(hex, "0".repeat(64)), false);
  assert.equal(timingSafeHexEqual("not-hex!!", "also-not-hex"), false);
  assert.equal(timingSafeHexEqual("", ""), false);
});

test("timingSafeB64Equal matches equal base64 digests and rejects mismatches / garbage", () => {
  const b64 = crypto.createHash("sha256").update("payload").digest("base64");
  assert.equal(timingSafeB64Equal(b64, b64), true);
  assert.equal(timingSafeB64Equal(b64, Buffer.alloc(32, 1).toString("base64")), false);
  assert.equal(timingSafeB64Equal("", ""), false);
});

test("computeInboundSignature is a deterministic HMAC-SHA256 hex digest of `${timestamp}.${body}`", () => {
  const expected = crypto
    .createHmac("sha256", "my-secret")
    .update("1700000000.{\"a\":1}")
    .digest("hex");
  assert.equal(computeInboundSignature("my-secret", "1700000000", "{\"a\":1}"), expected);
});

test("verifySvixSignature accepts a valid whsec_-prefixed signature and rejects a bad one", () => {
  const secret = "whsec_" + crypto.randomBytes(24).toString("base64");
  const rawBody = JSON.stringify({ hello: "world" });
  const { id, timestamp, signature } = signSvix(secret, rawBody);

  assert.equal(verifySvixSignature(secret, id, timestamp, signature, rawBody), true);
  assert.equal(verifySvixSignature(secret, id, timestamp, "v1,bm90LXZhbGlk", rawBody), false);
  assert.equal(verifySvixSignature("whsec_" + crypto.randomBytes(24).toString("base64"), id, timestamp, signature, rawBody), false);
});

test("maskEmailLike masks the local part and domain name, keeping the TLD", () => {
  assert.equal(maskEmailLike("client@example.com"), "cl***@ex***.com");
  assert.equal(maskEmailLike("Name <a@b.co>"), "a*@b*.co");
  assert.equal(maskEmailLike(""), "");
  assert.equal(maskEmailLike("not-an-email"), "not***");
});

test("maskRecipientList masks every recipient and drops empties", () => {
  assert.deepEqual(
    maskRecipientList(["client@example.com", "", "invoices+abc@inex.app"]),
    ["cl***@ex***.com", "in***@in***.app"]
  );
});

test("pickRecipientList collects recipients from many nested payload shapes", () => {
  const payload = {
    to: [{ email: "a@x.com" }, "b@x.com"],
    data: { envelope: { rcpt_to: ["c@x.com"] } },
    headers: { To: "d@x.com" }
  };
  const recipients = pickRecipientList(payload);
  assert.deepEqual(new Set(recipients), new Set(["a@x.com", "b@x.com", "c@x.com", "d@x.com"]));
});

test("pickFromAddress reads string, array and object 'from' shapes", () => {
  assert.deepEqual(pickFromAddress({ from: "a@x.com" }), { email: "a@x.com", name: null });
  assert.deepEqual(pickFromAddress({ from: { email: "a@x.com", name: "A" } }), { email: "a@x.com", name: "A" });
  assert.deepEqual(pickFromAddress({ from: [{ email: "a@x.com", name: "A" }] }), { email: "a@x.com", name: "A" });
  assert.deepEqual(pickFromAddress({}), { email: null, name: null });
});

test("pickBody prefers text, falls back to plain/body, then html", () => {
  assert.equal(pickBody({ text: "hi" }), "hi");
  assert.equal(pickBody({ plain: "hi-plain" }), "hi-plain");
  assert.equal(pickBody({ body: "hi-body" }), "hi-body");
  assert.equal(pickBody({ html: "<p>hi</p>" }), "<p>hi</p>");
  assert.equal(pickBody({}), "");
});

test("cleanInboundReplyBody strips quoted history and trailing signatures markers", () => {
  const raw = "Sounds good, thanks!\n\nOn Mon, Jan 1 wrote:\n> original message\n> more quoted text";
  assert.equal(cleanInboundReplyBody(raw), "Sounds good, thanks!");
});

test("resolveWebhookSecrets pools comma-separated secrets across multiple env vars and dedupes", async () => {
  await withEnv({ TEST_SECRET_A: "one,two", TEST_SECRET_B: "two,three" }, () => {
    const secrets = resolveWebhookSecrets(["TEST_SECRET_A", "TEST_SECRET_B"]);
    assert.deepEqual(new Set(secrets), new Set(["one", "two", "three"]));
  });
});

test("resolveWebhookSecrets returns an empty array when no env vars are set", async () => {
  await withEnv({ TEST_SECRET_A: undefined, TEST_SECRET_B: undefined }, () => {
    assert.deepEqual(resolveWebhookSecrets(["TEST_SECRET_A", "TEST_SECRET_B"]), []);
  });
});

test("describeInboundCaller reports header families present without leaking values", () => {
  const req = makeReq({ headers: { "svix-id": "msg_1", "user-agent": "test-agent", "x-forwarded-for": "1.1.1.1, 2.2.2.2" } });
  const description = describeInboundCaller(req);
  assert.equal(description.userAgent, "test-agent");
  assert.equal(description.hasSvixHeaders, true);
  assert.equal(description.hasCustomHeaders, false);
  assert.equal(description.hasForwardedFor, true);
  assert.equal(description.forwardedForHopCount, 2);
});

// ---------------------------------------------------------------------------
// createInboundWebhookVerifier
// ---------------------------------------------------------------------------

test("createInboundWebhookVerifier: 503 when no secret env vars are configured", async () => {
  await withEnv({ TEST_UNIT_SECRET: undefined }, () => {
    const verifier = createInboundWebhookVerifier({ envVarNames: ["TEST_UNIT_SECRET"] });
    const result = verifier.verify(makeReq({ body: "{}" }));
    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
  });
});

test("createInboundWebhookVerifier: accepts a validly signed legacy-header request and parses the JSON payload", async () => {
  await withEnv({ TEST_UNIT_SECRET: "unit-secret" }, () => {
    const verifier = createInboundWebhookVerifier({ envVarNames: ["TEST_UNIT_SECRET"] });
    const rawBody = JSON.stringify({ hello: "world" });
    const { timestampSeconds, signature } = signLegacy("unit-secret", rawBody);

    const result = verifier.verify(makeReq({
      headers: { "x-inbound-timestamp": String(timestampSeconds), "x-inbound-signature": signature },
      body: rawBody
    }));

    assert.equal(result.ok, true);
    assert.deepEqual(result.payload, { hello: "world" });
  });
});

test("createInboundWebhookVerifier: rejects an invalid signature", async () => {
  await withEnv({ TEST_UNIT_SECRET: "unit-secret" }, () => {
    const verifier = createInboundWebhookVerifier({ envVarNames: ["TEST_UNIT_SECRET"] });
    const rawBody = JSON.stringify({ hello: "world" });
    const { timestampSeconds } = signLegacy("unit-secret", rawBody);

    const result = verifier.verify(makeReq({
      headers: { "x-inbound-timestamp": String(timestampSeconds), "x-inbound-signature": "0".repeat(64) },
      body: rawBody
    }));

    assert.equal(result.ok, false);
    assert.equal(result.status, 401);
    assert.match(result.error, /invalid webhook signature/i);
  });
});

test("createInboundWebhookVerifier: applies custom message overrides", async () => {
  await withEnv({ TEST_UNIT_SECRET: "unit-secret" }, () => {
    const verifier = createInboundWebhookVerifier({
      envVarNames: ["TEST_UNIT_SECRET"],
      messages: { invalidSignature: "Invalid support webhook signature." }
    });
    const rawBody = "{}";
    const { timestampSeconds } = signLegacy("unit-secret", rawBody);

    const result = verifier.verify(makeReq({
      headers: { "x-inbound-timestamp": String(timestampSeconds), "x-inbound-signature": "0".repeat(64) },
      body: rawBody
    }));

    assert.equal(result.error, "Invalid support webhook signature.");
  });
});

test("createInboundWebhookVerifier: multi-secret rotation accepts a request signed with the second of two configured secrets", async () => {
  await withEnv({ TEST_UNIT_SECRET: "old-secret,new-secret" }, () => {
    const verifier = createInboundWebhookVerifier({ envVarNames: ["TEST_UNIT_SECRET"] });
    const rawBody = JSON.stringify({ rotated: true });
    const { timestampSeconds, signature } = signLegacy("new-secret", rawBody);

    const result = verifier.verify(makeReq({
      headers: { "x-inbound-timestamp": String(timestampSeconds), "x-inbound-signature": signature },
      body: rawBody
    }));

    assert.equal(result.ok, true);
    assert.deepEqual(result.payload, { rotated: true });
  });
});

test("createInboundWebhookVerifier: multi-secret rotation pools secrets across multiple env vars", async () => {
  await withEnv({ TEST_UNIT_SECRET_A: "secret-a", TEST_UNIT_SECRET_B: "secret-b" }, () => {
    const verifier = createInboundWebhookVerifier({ envVarNames: ["TEST_UNIT_SECRET_A", "TEST_UNIT_SECRET_B"] });
    const rawBody = JSON.stringify({ fromB: true });
    const { timestampSeconds, signature } = signLegacy("secret-b", rawBody);

    const result = verifier.verify(makeReq({
      headers: { "x-inbound-timestamp": String(timestampSeconds), "x-inbound-signature": signature },
      body: rawBody
    }));

    assert.equal(result.ok, true);
  });
});

test("createInboundWebhookVerifier: accepts a Svix-signed request and rejects a replay of the same svix-id", async () => {
  await withEnv({ TEST_UNIT_SECRET: "whsec_" + crypto.randomBytes(24).toString("base64") }, () => {
    const secret = process.env.TEST_UNIT_SECRET;
    const verifier = createInboundWebhookVerifier({ envVarNames: ["TEST_UNIT_SECRET"] });
    const rawBody = JSON.stringify({ hello: "svix" });
    const { id, timestamp, signature } = signSvix(secret, rawBody);
    const req = makeReq({
      headers: { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": signature },
      body: rawBody
    });

    const first = verifier.verify(req);
    assert.equal(first.ok, true);

    const replay = verifier.verify(req);
    assert.equal(replay.ok, false);
    assert.equal(replay.status, 409);
  });
});

test("createInboundWebhookVerifier: rejects a stale timestamp and a malformed timestamp", async () => {
  await withEnv({ TEST_UNIT_SECRET: "unit-secret" }, () => {
    const verifier = createInboundWebhookVerifier({ envVarNames: ["TEST_UNIT_SECRET"] });
    const rawBody = "{}";

    const stale = signLegacy("unit-secret", rawBody, Math.floor(Date.now() / 1000) - 3600);
    const staleResult = verifier.verify(makeReq({
      headers: { "x-inbound-timestamp": String(stale.timestampSeconds), "x-inbound-signature": stale.signature },
      body: rawBody
    }));
    assert.equal(staleResult.status, 401);
    assert.match(staleResult.error, /tolerance window/i);

    const malformedResult = verifier.verify(makeReq({
      headers: { "x-inbound-timestamp": "not-a-number", "x-inbound-signature": "abc123" },
      body: rawBody
    }));
    assert.equal(malformedResult.status, 400);
    assert.match(malformedResult.error, /malformed/i);
  });
});

test("createInboundWebhookVerifier: legacy secret header fallback is honoured outside production and rejected in it", async () => {
  await withEnv({ TEST_UNIT_SECRET: "unit-secret", NODE_ENV: "development" }, () => {
    const verifier = createInboundWebhookVerifier({ envVarNames: ["TEST_UNIT_SECRET"] });
    const accepted = verifier.verify(makeReq({ headers: { "x-inbound-secret": "unit-secret" }, body: "{}" }));
    assert.equal(accepted.ok, true);
  });

  await withEnv({ TEST_UNIT_SECRET: "unit-secret", NODE_ENV: "production" }, () => {
    const verifier = createInboundWebhookVerifier({ envVarNames: ["TEST_UNIT_SECRET"] });
    const rejected = verifier.verify(makeReq({ headers: { "x-inbound-secret": "unit-secret" }, body: "{}" }));
    assert.equal(rejected.ok, false);
    assert.equal(rejected.status, 401);
  });
});

test("createInboundWebhookVerifier: rejects malformed JSON and non-object payloads", async () => {
  await withEnv({ TEST_UNIT_SECRET: "unit-secret" }, () => {
    const verifier = createInboundWebhookVerifier({ envVarNames: ["TEST_UNIT_SECRET"] });

    const badJsonBody = "{not-json";
    const badJsonSig = signLegacy("unit-secret", badJsonBody);
    const badJsonResult = verifier.verify(makeReq({
      headers: { "x-inbound-timestamp": String(badJsonSig.timestampSeconds), "x-inbound-signature": badJsonSig.signature },
      body: badJsonBody
    }));
    assert.equal(badJsonResult.status, 400);
    assert.match(badJsonResult.error, /not valid json/i);

    const arrayBody = "[1,2,3]";
    const arraySig = signLegacy("unit-secret", arrayBody);
    const arrayResult = verifier.verify(makeReq({
      headers: { "x-inbound-timestamp": String(arraySig.timestampSeconds), "x-inbound-signature": arraySig.signature },
      body: arrayBody
    }));
    assert.equal(arrayResult.status, 400);
    assert.match(arrayResult.error, /must be a json object/i);
  });
});

// ---------------------------------------------------------------------------
// Route-level: both routes now share multi-secret rotation via the module
// ---------------------------------------------------------------------------

function buildRawApp(router, mountPath) {
  const app = express();
  app.use(mountPath, express.raw({ type: "*/*", limit: "256kb" }));
  app.use(mountPath, router);
  return app;
}

function loadRouter(routePath) {
  const resolved = require.resolve(routePath);
  delete require.cache[resolved];
  return require(routePath);
}

test("email.routes.js: rejects an invalid signature at the HTTP layer", async () => {
  await withEnv({ INBOUND_EMAIL_WEBHOOK_SECRET: "route-secret", SUPPORT_INBOUND_WEBHOOK_SECRET: undefined }, async () => {
    const router = loadRouter("../routes/email.routes.js");
    const app = buildRawApp(router, "/api/email");
    const res = await request(app)
      .post("/api/email/inbound")
      .set("Content-Type", "application/json")
      .set("x-inbound-timestamp", String(Math.floor(Date.now() / 1000)))
      .set("x-inbound-signature", "0".repeat(64))
      .send(JSON.stringify({}));
    assert.equal(res.status, 401);
    assert.match(String(res.body.error || ""), /invalid webhook signature/i);
  });
});

test("email.routes.js: accepts a request signed with the second of two rotated secrets", async () => {
  await withEnv({ INBOUND_EMAIL_WEBHOOK_SECRET: "old-secret,new-secret", SUPPORT_INBOUND_WEBHOOK_SECRET: undefined }, async () => {
    const router = loadRouter("../routes/email.routes.js");
    const app = buildRawApp(router, "/api/email");
    const rawBody = JSON.stringify({ from: { email: "client@example.com" }, subject: "hi", text: "yo" });
    const { timestampSeconds, signature } = signLegacy("new-secret", rawBody);

    const res = await request(app)
      .post("/api/email/inbound")
      .set("Content-Type", "application/json")
      .set("x-inbound-timestamp", String(timestampSeconds))
      .set("x-inbound-signature", signature)
      .send(rawBody);

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.ignored, "no_recipients");
  });
});

test("supportEmail.routes.js: rejects an invalid signature at the HTTP layer", async () => {
  await withEnv({ SUPPORT_INBOUND_WEBHOOK_SECRET: "route-secret", INBOUND_EMAIL_WEBHOOK_SECRET: undefined }, async () => {
    const router = loadRouter("../routes/supportEmail.routes.js");
    const app = buildRawApp(router, "/api/support-email");
    const res = await request(app)
      .post("/api/support-email/inbound")
      .set("Content-Type", "application/json")
      .set("x-inbound-timestamp", String(Math.floor(Date.now() / 1000)))
      .set("x-inbound-signature", "0".repeat(64))
      .send(JSON.stringify({}));
    assert.equal(res.status, 401);
    assert.match(String(res.body.error || ""), /invalid support webhook signature/i);
  });
});

test("supportEmail.routes.js: multi-secret rotation now accepts a request signed with the second of two configured secrets (previously unsupported)", async () => {
  await withEnv({ SUPPORT_INBOUND_WEBHOOK_SECRET: "old-secret,new-secret", INBOUND_EMAIL_WEBHOOK_SECRET: undefined }, async () => {
    const router = loadRouter("../routes/supportEmail.routes.js");
    const app = buildRawApp(router, "/api/support-email");
    const rawBody = JSON.stringify({ from: { email: "client@example.com" }, subject: "hi", text: "yo" });
    const { timestampSeconds, signature } = signLegacy("new-secret", rawBody);

    const res = await request(app)
      .post("/api/support-email/inbound")
      .set("Content-Type", "application/json")
      .set("x-inbound-timestamp", String(timestampSeconds))
      .set("x-inbound-signature", signature)
      .send(rawBody);

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.ignored, "no_recipients");
  });
});

test("supportEmail.routes.js: accepts a valid signature signed with its own single secret", async () => {
  await withEnv({ SUPPORT_INBOUND_WEBHOOK_SECRET: "route-secret", INBOUND_EMAIL_WEBHOOK_SECRET: undefined }, async () => {
    const router = loadRouter("../routes/supportEmail.routes.js");
    const app = buildRawApp(router, "/api/support-email");
    const rawBody = JSON.stringify({ from: { email: "client@example.com" }, subject: "hi", text: "yo" });
    const { timestampSeconds, signature } = signLegacy("route-secret", rawBody);

    const res = await request(app)
      .post("/api/support-email/inbound")
      .set("Content-Type", "application/json")
      .set("x-inbound-timestamp", String(timestampSeconds))
      .set("x-inbound-signature", signature)
      .send(rawBody);

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.ignored, "no_recipients");
  });
});
