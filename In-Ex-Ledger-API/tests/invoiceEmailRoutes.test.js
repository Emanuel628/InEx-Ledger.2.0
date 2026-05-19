"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const request = require("supertest");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-invoice-email";
process.env.CSRF_SECRET =
  process.env.CSRF_SECRET || "test-csrf-secret-invoice-email";
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://local:test@localhost:5432/inex_ledger_test";

const { signToken } = require("../middleware/auth.middleware.js");
const {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  ensureCsrfCookie,
  generateCsrfToken
} = require("../middleware/csrf.middleware.js");

const TEST_USER_ID = "00000000-0000-4000-8000-000000000811";
const TEST_INVOICE_ID = "11111111-1111-4111-8111-111111111111";
const INBOUND_SECRET = "test-inbound-secret";

function makeToken() {
  return signToken({ id: TEST_USER_ID, email: "owner@example.com", mfa_enabled: false });
}

function csrfHeaders(token) {
  return {
    [CSRF_HEADER_NAME]: token,
    Cookie: `${CSRF_COOKIE_NAME}=${token}`
  };
}

function buildApp(router, mountPath = "/api/invoices-v1") {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use(ensureCsrfCookie);
  app.use(mountPath, router);
  return app;
}

// Inbound webhook tests need raw body parsing for HMAC verification, so the
// raw parser must run BEFORE any global JSON parser — mirroring server.js.
function buildInboundApp() {
  delete require.cache[require.resolve("../routes/email.routes.js")];
  const router = require("../routes/email.routes.js");
  const app = express();
  app.use(cookieParser());
  app.use("/api/email/inbound", express.raw({ type: "*/*", limit: "256kb" }));
  app.use(express.json());
  app.use(ensureCsrfCookie);
  app.use("/api/email", router);
  return app;
}

function signInboundPayload(secret, bodyObject, { timestampSeconds = Math.floor(Date.now() / 1000) } = {}) {
  const rawBody = JSON.stringify(bodyObject ?? {});
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${timestampSeconds}.${rawBody}`)
    .digest("hex");
  return { rawBody, signature, timestampSeconds };
}

function sendSignedInbound(app, bodyObject, options = {}) {
  const { rawBody, signature, timestampSeconds } = signInboundPayload(
    options.secret || INBOUND_SECRET,
    bodyObject,
    { timestampSeconds: options.timestampSeconds }
  );
  return request(app)
    .post("/api/email/inbound")
    .set("Content-Type", "application/json")
    .set("x-inbound-timestamp", String(options.sendTimestamp ?? timestampSeconds))
    .set("x-inbound-signature", options.sendSignature ?? signature)
    .send(rawBody);
}

test("POST /api/invoices-v1/:id/send rejects unauthenticated requests (401)", async () => {
  const router = require("../routes/invoices-v1.routes.js");
  const app = buildApp(router);
  const res = await request(app)
    .post(`/api/invoices-v1/${TEST_INVOICE_ID}/send`)
    .send({});
  assert.equal(res.status, 401);
});

test("POST /api/invoices-v1/:id/send rejects missing CSRF (403)", async () => {
  const router = require("../routes/invoices-v1.routes.js");
  const app = buildApp(router);
  const res = await request(app)
    .post(`/api/invoices-v1/${TEST_INVOICE_ID}/send`)
    .set("Authorization", `Bearer ${makeToken()}`)
    .send({});
  assert.equal(res.status, 403);
});

test("POST /api/invoices-v1/:id/send rejects invalid UUID (400)", async () => {
  const router = require("../routes/invoices-v1.routes.js");
  const app = buildApp(router);
  const csrf = generateCsrfToken();
  const res = await request(app)
    .post(`/api/invoices-v1/not-a-uuid/send`)
    .set("Authorization", `Bearer ${makeToken()}`)
    .set(csrfHeaders(csrf))
    .send({});
  assert.equal(res.status, 400);
});

test("POST /api/email/inbound returns 503 when webhook secret is not configured", async () => {
  const before = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
  delete process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
  try {
    const app = buildInboundApp();
    const res = await sendSignedInbound(app, { from: { email: "client@example.com" }, subject: "hi", text: "yo" });
    assert.equal(res.status, 503);
  } finally {
    if (before === undefined) delete process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
    else process.env.INBOUND_EMAIL_WEBHOOK_SECRET = before;
  }
});

test("POST /api/email/inbound rejects when both signature headers are missing", async () => {
  const before = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
  const beforeNodeEnv = process.env.NODE_ENV;
  process.env.INBOUND_EMAIL_WEBHOOK_SECRET = INBOUND_SECRET;
  process.env.NODE_ENV = "production";
  try {
    const app = buildInboundApp();
    const res = await request(app)
      .post("/api/email/inbound")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ to: [{ email: "invoices+abc@inex.app" }] }));
    assert.equal(res.status, 401);
    assert.match(String(res.body.error || ""), /missing/i);
  } finally {
    if (before === undefined) delete process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
    else process.env.INBOUND_EMAIL_WEBHOOK_SECRET = before;
    if (beforeNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = beforeNodeEnv;
  }
});

test("POST /api/email/inbound rejects when only one signature header is provided (malformed)", async () => {
  const before = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
  process.env.INBOUND_EMAIL_WEBHOOK_SECRET = INBOUND_SECRET;
  try {
    const app = buildInboundApp();
    const res = await request(app)
      .post("/api/email/inbound")
      .set("Content-Type", "application/json")
      .set("x-inbound-timestamp", String(Math.floor(Date.now() / 1000)))
      .send(JSON.stringify({}));
    assert.equal(res.status, 400);
    assert.match(String(res.body.error || ""), /signature headers/i);
  } finally {
    if (before === undefined) delete process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
    else process.env.INBOUND_EMAIL_WEBHOOK_SECRET = before;
  }
});

test("POST /api/email/inbound rejects an invalid signature", async () => {
  const before = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
  process.env.INBOUND_EMAIL_WEBHOOK_SECRET = INBOUND_SECRET;
  try {
    const app = buildInboundApp();
    const res = await sendSignedInbound(app, { to: [{ email: "invoices+abc@inex.app" }] }, {
      sendSignature: "0".repeat(64)
    });
    assert.equal(res.status, 401);
    assert.match(String(res.body.error || ""), /invalid webhook signature/i);
  } finally {
    if (before === undefined) delete process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
    else process.env.INBOUND_EMAIL_WEBHOOK_SECRET = before;
  }
});

test("POST /api/email/inbound rejects a stale timestamp outside the tolerance window", async () => {
  const before = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
  process.env.INBOUND_EMAIL_WEBHOOK_SECRET = INBOUND_SECRET;
  try {
    const app = buildInboundApp();
    const stale = Math.floor(Date.now() / 1000) - 60 * 60;
    const res = await sendSignedInbound(app, { to: [{ email: "invoices+abc@inex.app" }] }, {
      timestampSeconds: stale
    });
    assert.equal(res.status, 401);
    assert.match(String(res.body.error || ""), /tolerance window/i);
  } finally {
    if (before === undefined) delete process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
    else process.env.INBOUND_EMAIL_WEBHOOK_SECRET = before;
  }
});

test("POST /api/email/inbound rejects malformed timestamp values", async () => {
  const before = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
  process.env.INBOUND_EMAIL_WEBHOOK_SECRET = INBOUND_SECRET;
  try {
    const app = buildInboundApp();
    const res = await sendSignedInbound(app, {}, { sendTimestamp: "not-a-number" });
    assert.equal(res.status, 400);
    assert.match(String(res.body.error || ""), /malformed webhook timestamp/i);
  } finally {
    if (before === undefined) delete process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
    else process.env.INBOUND_EMAIL_WEBHOOK_SECRET = before;
  }
});

test("POST /api/email/inbound accepts a valid signed request and ignores payloads with no recipients", async () => {
  const before = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
  process.env.INBOUND_EMAIL_WEBHOOK_SECRET = INBOUND_SECRET;
  try {
    const app = buildInboundApp();
    const res = await sendSignedInbound(app, {
      from: { email: "client@example.com" },
      subject: "hi",
      text: "yo"
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.ignored, "no_recipients");
  } finally {
    if (before === undefined) delete process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
    else process.env.INBOUND_EMAIL_WEBHOOK_SECRET = before;
  }
});

test("POST /api/email/inbound 200s with ignored=no_matching_invoice when recipient has no plus token", async () => {
  const before = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
  process.env.INBOUND_EMAIL_WEBHOOK_SECRET = INBOUND_SECRET;
  try {
    const app = buildInboundApp();
    const res = await sendSignedInbound(app, {
      from: { email: "client@example.com", name: "Client Co" },
      to: [{ email: "invoices@inex.app" }],
      subject: "Re: Invoice",
      text: "Looks great"
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.ignored, "no_matching_invoice");
  } finally {
    if (before === undefined) delete process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
    else process.env.INBOUND_EMAIL_WEBHOOK_SECRET = before;
  }
});

test("POST /api/email/inbound rejects a replayed signature within the TTL window", async () => {
  const before = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
  process.env.INBOUND_EMAIL_WEBHOOK_SECRET = INBOUND_SECRET;
  try {
    const app = buildInboundApp();
    const timestampSeconds = Math.floor(Date.now() / 1000);
    const payload = { from: { email: "client@example.com" }, subject: "hi", text: "yo" };

    const first = await sendSignedInbound(app, payload, { timestampSeconds });
    assert.equal(first.status, 200);

    const replay = await sendSignedInbound(app, payload, { timestampSeconds });
    assert.equal(replay.status, 409);
    assert.match(String(replay.body.error || ""), /replayed/i);
  } finally {
    if (before === undefined) delete process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
    else process.env.INBOUND_EMAIL_WEBHOOK_SECRET = before;
  }
});

test("POST /api/email/inbound rejects malformed JSON bodies", async () => {
  const before = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
  process.env.INBOUND_EMAIL_WEBHOOK_SECRET = INBOUND_SECRET;
  try {
    const app = buildInboundApp();
    const timestampSeconds = Math.floor(Date.now() / 1000);
    const rawBody = "{not-json";
    const signature = crypto
      .createHmac("sha256", INBOUND_SECRET)
      .update(`${timestampSeconds}.${rawBody}`)
      .digest("hex");

    const res = await request(app)
      .post("/api/email/inbound")
      .set("Content-Type", "application/json")
      .set("x-inbound-timestamp", String(timestampSeconds))
      .set("x-inbound-signature", signature)
      .send(rawBody);
    assert.equal(res.status, 400);
    assert.match(String(res.body.error || ""), /not valid json/i);
  } finally {
    if (before === undefined) delete process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
    else process.env.INBOUND_EMAIL_WEBHOOK_SECRET = before;
  }
});

test("POST /api/email/inbound legacy x-inbound-secret fallback is rejected in production", async () => {
  const before = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
  const beforeNodeEnv = process.env.NODE_ENV;
  process.env.INBOUND_EMAIL_WEBHOOK_SECRET = INBOUND_SECRET;
  process.env.NODE_ENV = "production";
  try {
    const app = buildInboundApp();
    const res = await request(app)
      .post("/api/email/inbound")
      .set("Content-Type", "application/json")
      .set("x-inbound-secret", INBOUND_SECRET)
      .send(JSON.stringify({ from: { email: "x@y.z" } }));
    assert.equal(res.status, 401);
  } finally {
    if (before === undefined) delete process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
    else process.env.INBOUND_EMAIL_WEBHOOK_SECRET = before;
    if (beforeNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = beforeNodeEnv;
  }
});

test("POST /api/email/inbound legacy x-inbound-secret fallback is accepted outside production", async () => {
  const before = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
  const beforeNodeEnv = process.env.NODE_ENV;
  process.env.INBOUND_EMAIL_WEBHOOK_SECRET = INBOUND_SECRET;
  process.env.NODE_ENV = "development";
  try {
    const app = buildInboundApp();
    const res = await request(app)
      .post("/api/email/inbound")
      .set("Content-Type", "application/json")
      .set("x-inbound-secret", INBOUND_SECRET)
      .send(JSON.stringify({ from: { email: "client@example.com" }, text: "ping" }));
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.ignored, "no_recipients");
  } finally {
    if (before === undefined) delete process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
    else process.env.INBOUND_EMAIL_WEBHOOK_SECRET = before;
    if (beforeNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = beforeNodeEnv;
  }
});
