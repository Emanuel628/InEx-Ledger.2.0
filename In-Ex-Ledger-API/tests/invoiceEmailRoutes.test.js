"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const cookieParser = require("cookie-parser");
const request = require("supertest");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-invoice-email";
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

test("POST /api/email/inbound is public and ignores payloads with no recipients (200 ok)", async () => {
  const router = require("../routes/email.routes.js");
  const app = buildApp(router, "/api/email");
  const res = await request(app)
    .post("/api/email/inbound")
    .send({ from: { email: "client@example.com" }, subject: "hi", text: "yo" });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.ignored, "no_recipients");
});

test("POST /api/email/inbound rejects unauthorized when INBOUND_EMAIL_WEBHOOK_SECRET is set", async () => {
  const before = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
  process.env.INBOUND_EMAIL_WEBHOOK_SECRET = "test-inbound-secret";
  try {
    const router = require("../routes/email.routes.js");
    const app = buildApp(router, "/api/email");
    const res = await request(app)
      .post("/api/email/inbound")
      .send({ to: [{ email: "invoices+abc@inex.app" }] });
    assert.equal(res.status, 401);

    const ok = await request(app)
      .post("/api/email/inbound")
      .set("x-inbound-secret", "test-inbound-secret")
      .send({ to: [{ email: "invoices+abc@inex.app" }] });
    // The header passes; payload still has no matching invoice, but request
    // is authorized — should not 401.
    assert.notEqual(ok.status, 401);
  } finally {
    if (before === undefined) delete process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
    else process.env.INBOUND_EMAIL_WEBHOOK_SECRET = before;
  }
});

test("POST /api/email/inbound 200s with ignored=no_matching_invoice when recipient has no plus token", async () => {
  const router = require("../routes/email.routes.js");
  const app = buildApp(router, "/api/email");
  const res = await request(app)
    .post("/api/email/inbound")
    .send({
      from: { email: "client@example.com", name: "Client Co" },
      to: [{ email: "invoices@inex.app" }],
      subject: "Re: Invoice",
      text: "Looks great"
    });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.ignored, "no_matching_invoice");
});
