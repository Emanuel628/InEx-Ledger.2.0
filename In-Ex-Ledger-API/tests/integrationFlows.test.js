/**
 * Integration Flow Tests
 *
 * Route-level tests that prove application flows work end-to-end from the
 * perspective of an HTTP client.  Tests are intentionally structured so
 * that they pass without a real database connection by exercising:
 *
 *   1. Auth/CSRF guard layers (401 / 403 responses returned by middleware
 *      before any DB call is made).
 *   2. Request validation paths that return 400 before the handler calls
 *      the database (register, login, onboarding, categories, accounts,
 *      businesses).
 *
 * Every test mounts the actual production route file — the same code that
 * runs in production — so this is not mock-only testing.  It mirrors the
 * structure already established in criticalFlows.test.js and extends it with
 * positive-validation and user-flow scenarios.
 *
 * Run:  node --test tests/integrationFlows.test.js
 *
 * When DATABASE_URL points to the seeded dev database the handlers that reach
 * the DB will also succeed, giving you full happy-path coverage.
 */

"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const express = require("express");
const cookieParser = require("cookie-parser");
const request = require("supertest");

// Ensure required env vars are present before any module that reads them loads.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-integration-flows-secret";
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://inex:inex@localhost:5432/inex_ledger_test";
process.env.FIELD_ENCRYPTION_KEY =
  process.env.FIELD_ENCRYPTION_KEY ||
  "0000000000000000000000000000000000000000000000000000000000000000";

const { signToken } = require("../middleware/auth.middleware.js");
const {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  generateCsrfToken,
  ensureCsrfCookie,
} = require("../middleware/csrf.middleware.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeToken(extra = {}) {
  return signToken({
    id: "user-integration-test",
    email: "integration@example.com",
    mfa_enabled: false,
    ...extra,
  });
}

function makeMfaToken() {
  return signToken({
    id: "user-mfa",
    email: "mfa@example.com",
    mfa_enabled: true,
    mfa_authenticated: true
  });
}

function csrfHeaders(token) {
  return {
    [CSRF_HEADER_NAME]: token,
    Cookie: `${CSRF_COOKIE_NAME}=${token}`,
  };
}

/**
 * Builds a minimal Express app that mirrors the production middleware stack
 * for a single route file.
 */
function buildApp(router, mountPath = "/api/test") {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use(ensureCsrfCookie);
  app.use(mountPath, router);
  return app;
}

// ---------------------------------------------------------------------------
// 1. Auth flow — registration validation (no DB needed for these paths)
// ---------------------------------------------------------------------------

test("register: missing email and password returns 400", async () => {
  const authRouter = require("../routes/auth.routes.js");
  const app = buildApp(authRouter, "/api/auth");

  const res = await request(app)
    .post("/api/auth/register")
    .send({});

  assert.equal(res.status, 400);
  assert.ok(res.body.error, "error field present");
});

test("register: missing password returns 400", async () => {
  const authRouter = require("../routes/auth.routes.js");
  const app = buildApp(authRouter, "/api/auth");

  const res = await request(app)
    .post("/api/auth/register")
    .send({ email: "test@example.com" });

  assert.equal(res.status, 400);
});

test("register: missing email returns 400", async () => {
  const authRouter = require("../routes/auth.routes.js");
  const app = buildApp(authRouter, "/api/auth");

  const res = await request(app)
    .post("/api/auth/register")
    .send({ password: "SomePass1!" });

  assert.equal(res.status, 400);
});

test("register: weak password (too short) returns 400", async () => {
  const authRouter = require("../routes/auth.routes.js");
  const app = buildApp(authRouter, "/api/auth");

  const res = await request(app)
    .post("/api/auth/register")
    .send({ email: "user@example.com", password: "abc" });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /[Pp]assword/);
});

test("register: password with no uppercase returns 400", async () => {
  const authRouter = require("../routes/auth.routes.js");
  const app = buildApp(authRouter, "/api/auth");

  const res = await request(app)
    .post("/api/auth/register")
    .send({ email: "user@example.com", password: "password1!" });

  assert.equal(res.status, 400);
});

test("register: password with no symbol returns 400", async () => {
  const authRouter = require("../routes/auth.routes.js");
  const app = buildApp(authRouter, "/api/auth");

  const res = await request(app)
    .post("/api/auth/register")
    .send({ email: "user@example.com", password: "Password1" });

  assert.equal(res.status, 400);
});

// ---------------------------------------------------------------------------
// 2. Auth flow — login validation (no DB needed for these paths)
// ---------------------------------------------------------------------------

test("login: missing email and password returns 400", async () => {
  const authRouter = require("../routes/auth.routes.js");
  const app = buildApp(authRouter, "/api/auth");

  const res = await request(app)
    .post("/api/auth/login")
    .send({});

  assert.equal(res.status, 400);
});

test("login: missing password returns 400", async () => {
  const authRouter = require("../routes/auth.routes.js");
  const app = buildApp(authRouter, "/api/auth");

  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: "user@example.com" });

  assert.equal(res.status, 400);
});

test("login: missing email returns 400", async () => {
  const authRouter = require("../routes/auth.routes.js");
  const app = buildApp(authRouter, "/api/auth");

  const res = await request(app)
    .post("/api/auth/login")
    .send({ password: "SomePassword1!" });

  assert.equal(res.status, 400);
});

// ---------------------------------------------------------------------------
// 3. Auth guard — all major route groups return 401 without a token
// ---------------------------------------------------------------------------

test("transactions: GET without auth returns 401", async () => {
  const router = require("../routes/transactions.routes.js");
  const app = buildApp(router, "/api/transactions");

  const res = await request(app).get("/api/transactions");
  assert.equal(res.status, 401);
});

test("businesses: GET without auth returns 401", async () => {
  const router = require("../routes/businesses.routes.js");
  const app = buildApp(router, "/api/businesses");

  const res = await request(app).get("/api/businesses");
  assert.equal(res.status, 401);
});

test("me: GET without auth returns 401", async () => {
  const router = require("../routes/me.routes.js");
  const app = buildApp(router, "/api/me");

  const res = await request(app).get("/api/me");
  assert.equal(res.status, 401);
});

test("categories: GET without auth returns 401", async () => {
  const router = require("../routes/categories.routes.js");
  const app = buildApp(router, "/api/categories");

  const res = await request(app).get("/api/categories");
  assert.equal(res.status, 401);
});

test("accounts: GET without auth returns 401", async () => {
  const router = require("../routes/accounts.routes.js");
  const app = buildApp(router, "/api/accounts");

  const res = await request(app).get("/api/accounts");
  assert.equal(res.status, 401);
});

test("mileage: GET without auth returns 401", async () => {
  const router = require("../routes/mileage.routes.js");
  const app = buildApp(router, "/api/mileage");

  const res = await request(app).get("/api/mileage");
  assert.equal(res.status, 401);
});

test("receipts: GET without auth returns 401", async () => {
  const router = require("../routes/receipts.routes.js");
  const app = buildApp(router, "/api/receipts");

  const res = await request(app).get("/api/receipts");
  assert.equal(res.status, 401);
});

test("exports: POST /request-grant without auth returns 401", async () => {
  const router = require("../routes/exports.routes.js");
  const app = buildApp(router, "/api/exports");

  const res = await request(app).post("/api/exports/request-grant");
  assert.equal(res.status, 401);
});

test("recurring: GET without auth returns 401", async () => {
  const router = require("../routes/recurring.routes.js");
  const app = buildApp(router, "/api/recurring");

  const res = await request(app).get("/api/recurring");
  assert.equal(res.status, 401);
});

test("analytics: GET without auth returns 401", async () => {
  const router = require("../routes/analytics.routes.js");
  const app = buildApp(router, "/api/analytics");

  const res = await request(app).get("/api/analytics");
  assert.equal(res.status, 401);
});

// ---------------------------------------------------------------------------
// 4. CSRF guard — mutation routes return 403 without CSRF token
// ---------------------------------------------------------------------------

test("transactions: POST with auth but no CSRF returns 403", async () => {
  const router = require("../routes/transactions.routes.js");
  const app = buildApp(router, "/api/transactions");
  const token = makeToken();

  const res = await request(app)
    .post("/api/transactions")
    .set("Authorization", `Bearer ${token}`)
    .send({ type: "expense", amount: 10, date: "2026-01-01" });

  assert.equal(res.status, 403);
});

test("businesses: POST with auth but no CSRF returns 403", async () => {
  const router = require("../routes/businesses.routes.js");
  const app = buildApp(router, "/api/businesses");
  const token = makeToken();

  const res = await request(app)
    .post("/api/businesses")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "My Business" });

  assert.equal(res.status, 403);
});

test("me/onboarding: PUT with auth but no CSRF returns 403", async () => {
  const router = require("../routes/me.routes.js");
  const app = buildApp(router, "/api/me");
  const token = makeToken();

  const res = await request(app)
    .put("/api/me/onboarding")
    .set("Authorization", `Bearer ${token}`)
    .send({ business_name: "Test Business" });

  assert.equal(res.status, 403);
});

test("categories: POST with auth but no CSRF returns 403", async () => {
  const router = require("../routes/categories.routes.js");
  const app = buildApp(router, "/api/categories");
  const token = makeToken();

  const res = await request(app)
    .post("/api/categories")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Meals", kind: "expense" });

  assert.equal(res.status, 403);
});

test("accounts: POST with auth but no CSRF returns 403", async () => {
  const router = require("../routes/accounts.routes.js");
  const app = buildApp(router, "/api/accounts");
  const token = makeToken();

  const res = await request(app)
    .post("/api/accounts")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Checking", type: "checking" });

  assert.equal(res.status, 403);
});

test("mileage: POST with auth but no CSRF returns 403", async () => {
  const router = require("../routes/mileage.routes.js");
  const app = buildApp(router, "/api/mileage");
  const token = makeToken();

  const res = await request(app)
    .post("/api/mileage")
    .set("Authorization", `Bearer ${token}`)
    .send({ trip_date: "2026-01-01", purpose: "Client visit", miles: 10 });

  assert.equal(res.status, 403);
});

// ---------------------------------------------------------------------------
// 5. Onboarding validation (400 before DB hit — validation runs first)
// ---------------------------------------------------------------------------

test("onboarding: PUT with missing business_name returns 400", async () => {
  const router = require("../routes/me.routes.js");
  const app = buildApp(router, "/api/me");
  const token = makeToken();
  const csrf = generateCsrfToken();

  const res = await request(app)
    .put("/api/me/onboarding")
    .set("Authorization", `Bearer ${token}`)
    .set(CSRF_HEADER_NAME, csrf)
    .set("Cookie", `${CSRF_COOKIE_NAME}=${csrf}`)
    .send({
      business_type: "sole_proprietor",
      region: "US",
      language: "en",
      starter_account_type: "checking",
      starter_account_name: "Checking",
      start_focus: "transactions",
    });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /[Bb]usiness name/);
});

test("onboarding: PUT with invalid region returns 400", async () => {
  const router = require("../routes/me.routes.js");
  const app = buildApp(router, "/api/me");
  const token = makeToken();
  const csrf = generateCsrfToken();

  const res = await request(app)
    .put("/api/me/onboarding")
    .set("Authorization", `Bearer ${token}`)
    .set(CSRF_HEADER_NAME, csrf)
    .set("Cookie", `${CSRF_COOKIE_NAME}=${csrf}`)
    .send({
      business_name: "Test Co",
      business_type: "sole_proprietor",
      region: "XX",
      language: "en",
      starter_account_type: "checking",
      starter_account_name: "Checking",
      start_focus: "transactions",
    });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /[Rr]egion/);
});

test("onboarding: PUT with invalid language returns 400", async () => {
  const router = require("../routes/me.routes.js");
  const app = buildApp(router, "/api/me");
  const token = makeToken();
  const csrf = generateCsrfToken();

  const res = await request(app)
    .put("/api/me/onboarding")
    .set("Authorization", `Bearer ${token}`)
    .set(CSRF_HEADER_NAME, csrf)
    .set("Cookie", `${CSRF_COOKIE_NAME}=${csrf}`)
    .send({
      business_name: "Test Co",
      business_type: "sole_proprietor",
      region: "US",
      language: "xx",
      starter_account_type: "checking",
      starter_account_name: "Checking",
      start_focus: "transactions",
    });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /[Ll]anguage/);
});

test("onboarding: PUT CA region without province returns 400", async () => {
  const router = require("../routes/me.routes.js");
  const app = buildApp(router, "/api/me");
  const token = makeToken();
  const csrf = generateCsrfToken();

  const res = await request(app)
    .put("/api/me/onboarding")
    .set("Authorization", `Bearer ${token}`)
    .set(CSRF_HEADER_NAME, csrf)
    .set("Cookie", `${CSRF_COOKIE_NAME}=${csrf}`)
    .send({
      business_name: "Conseil Tremblay",
      business_type: "sole_proprietor",
      region: "CA",
      language: "fr",
      starter_account_type: "checking",
      starter_account_name: "Chequing",
      start_focus: "transactions",
      // province intentionally omitted
    });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /[Pp]rovince/);
});

test("onboarding: PUT with invalid business type returns 400", async () => {
  const router = require("../routes/me.routes.js");
  const app = buildApp(router, "/api/me");
  const token = makeToken();
  const csrf = generateCsrfToken();

  const res = await request(app)
    .put("/api/me/onboarding")
    .set("Authorization", `Bearer ${token}`)
    .set(CSRF_HEADER_NAME, csrf)
    .set("Cookie", `${CSRF_COOKIE_NAME}=${csrf}`)
    .send({
      business_name: "Test Co",
      business_type: "invalid_type",
      region: "US",
      language: "en",
      starter_account_type: "checking",
      starter_account_name: "Checking",
      start_focus: "transactions",
    });

  assert.equal(res.status, 400);
});

// ---------------------------------------------------------------------------
// 6. Category validation (400 before DB hit)
// ---------------------------------------------------------------------------

test("categories: POST with missing name returns 400", async () => {
  const router = require("../routes/categories.routes.js");
  const app = buildApp(router, "/api/categories");
  const token = makeToken();
  const csrf = generateCsrfToken();

  const res = await request(app)
    .post("/api/categories")
    .set("Authorization", `Bearer ${token}`)
    .set(CSRF_HEADER_NAME, csrf)
    .set("Cookie", `${CSRF_COOKIE_NAME}=${csrf}`)
    .send({ kind: "expense" });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /name/);
});

test("categories: POST with invalid kind returns 400", async () => {
  const router = require("../routes/categories.routes.js");
  const app = buildApp(router, "/api/categories");
  const token = makeToken();
  const csrf = generateCsrfToken();

  const res = await request(app)
    .post("/api/categories")
    .set("Authorization", `Bearer ${token}`)
    .set(CSRF_HEADER_NAME, csrf)
    .set("Cookie", `${CSRF_COOKIE_NAME}=${csrf}`)
    .send({ name: "My Category", kind: "invalid" });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /kind/);
});

test("categories: POST with invalid color returns 400", async () => {
  const router = require("../routes/categories.routes.js");
  const app = buildApp(router, "/api/categories");
  const token = makeToken();
  const csrf = generateCsrfToken();

  const res = await request(app)
    .post("/api/categories")
    .set("Authorization", `Bearer ${token}`)
    .set(CSRF_HEADER_NAME, csrf)
    .set("Cookie", `${CSRF_COOKIE_NAME}=${csrf}`)
    .send({ name: "My Category", kind: "expense", color: "fuchsia" });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /color/);
});

// ---------------------------------------------------------------------------
// 7. Account validation (400 before DB hit)
// ---------------------------------------------------------------------------

test("accounts: POST with missing name and type returns 400", async () => {
  const router = require("../routes/accounts.routes.js");
  const app = buildApp(router, "/api/accounts");
  const token = makeToken();
  const csrf = generateCsrfToken();

  const res = await request(app)
    .post("/api/accounts")
    .set("Authorization", `Bearer ${token}`)
    .set(CSRF_HEADER_NAME, csrf)
    .set("Cookie", `${CSRF_COOKIE_NAME}=${csrf}`)
    .send({});

  assert.equal(res.status, 400);
});

test("accounts: POST with invalid type returns 400", async () => {
  const router = require("../routes/accounts.routes.js");
  const app = buildApp(router, "/api/accounts");
  const token = makeToken();
  const csrf = generateCsrfToken();

  const res = await request(app)
    .post("/api/accounts")
    .set("Authorization", `Bearer ${token}`)
    .set(CSRF_HEADER_NAME, csrf)
    .set("Cookie", `${CSRF_COOKIE_NAME}=${csrf}`)
    .send({ name: "Main Account", type: "piggybank" });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /type/);
});

// ---------------------------------------------------------------------------
// 8. Business validation (400 before DB hit)
// ---------------------------------------------------------------------------

test("businesses: POST with missing name returns 400", async () => {
  const router = require("../routes/businesses.routes.js");
  const app = buildApp(router, "/api/businesses");
  const token = makeToken();
  const csrf = generateCsrfToken();

  const res = await request(app)
    .post("/api/businesses")
    .set("Authorization", `Bearer ${token}`)
    .set(CSRF_HEADER_NAME, csrf)
    .set("Cookie", `${CSRF_COOKIE_NAME}=${csrf}`)
    .send({ region: "US", language: "en" });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /[Bb]usiness name/);
});

test("businesses: POST with invalid region returns 400", async () => {
  const router = require("../routes/businesses.routes.js");
  const app = buildApp(router, "/api/businesses");
  const token = makeToken();
  const csrf = generateCsrfToken();

  const res = await request(app)
    .post("/api/businesses")
    .set("Authorization", `Bearer ${token}`)
    .set(CSRF_HEADER_NAME, csrf)
    .set("Cookie", `${CSRF_COOKIE_NAME}=${csrf}`)
    .send({ name: "Test Corp", region: "EU", language: "en" });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /[Rr]egion/);
});

test("businesses: POST with invalid language returns 400", async () => {
  const router = require("../routes/businesses.routes.js");
  const app = buildApp(router, "/api/businesses");
  const token = makeToken();
  const csrf = generateCsrfToken();

  const res = await request(app)
    .post("/api/businesses")
    .set("Authorization", `Bearer ${token}`)
    .set(CSRF_HEADER_NAME, csrf)
    .set("Cookie", `${CSRF_COOKIE_NAME}=${csrf}`)
    .send({ name: "Test Corp", region: "US", language: "klingon" });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /[Ll]anguage/);
});

// ---------------------------------------------------------------------------
// 9. MFA guard — routes that require MFA return 403 + mfa_required
// ---------------------------------------------------------------------------

test("businesses: DELETE requires MFA — 403 with mfa_required when MFA not enabled", async () => {
  const router = require("../routes/businesses.routes.js");
  const app = buildApp(router, "/api/businesses");
  const token = makeToken({ mfa_enabled: false });
  const csrf = generateCsrfToken();

  const res = await request(app)
    .delete("/api/businesses/00000000-0000-4000-8000-000000000001")
    .set("Authorization", `Bearer ${token}`)
    .set(CSRF_HEADER_NAME, csrf)
    .set("Cookie", `${CSRF_COOKIE_NAME}=${csrf}`)
    .send({ password: "SomePass1!" });

  assert.equal(res.status, 403);
  assert.equal(res.body?.mfa_required, true);
});

// ---------------------------------------------------------------------------
// 10. Export flow — auth guard + CSRF guard
// ---------------------------------------------------------------------------

test("exports: POST /generate without auth returns 401", async () => {
  const router = require("../routes/exports.routes.js");
  const app = buildApp(router, "/api/exports");

  const res = await request(app).post("/api/exports/generate");
  assert.equal(res.status, 401);
});

test("exports: POST /generate with auth but no CSRF returns 403", async () => {
  const router = require("../routes/exports.routes.js");
  const app = buildApp(router, "/api/exports");
  const token = makeToken();

  const res = await request(app)
    .post("/api/exports/generate")
    .set("Authorization", `Bearer ${token}`)
    .send({});

  assert.equal(res.status, 403);
});

// ---------------------------------------------------------------------------
// 11. Receipt flow — auth guard
// ---------------------------------------------------------------------------

test("receipts: POST (upload) without auth returns 401", async () => {
  const router = require("../routes/receipts.routes.js");
  const app = buildApp(router, "/api/receipts");

  const res = await request(app).post("/api/receipts");
  assert.equal(res.status, 401);
});

test("receipts: PATCH /:id/attach without auth returns 401", async () => {
  const router = require("../routes/receipts.routes.js");
  const app = buildApp(router, "/api/receipts");

  const res = await request(app)
    .patch("/api/receipts/00000000-0000-4000-8000-000000000001/attach");
  assert.equal(res.status, 401);
});
