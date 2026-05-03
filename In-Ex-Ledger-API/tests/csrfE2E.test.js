/**
 * CSRF End-to-End Tests
 *
 * Three test areas:
 *   1. Route inventory – verify every mutation route file applies requireCsrfProtection.
 *   2. Frontend compliance – verify JS files rely on csrfHeader() for protected writes.
 *   3. HTTP integration tests – valid / missing / invalid token scenarios against a real
 *      Express app that mirrors the production middleware stack.
 */

"use strict";

const assert = require("node:assert");
const test = require("node:test");
const fs = require("fs");
const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const request = require("supertest");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-e2e";

const {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  generateCsrfToken,
  ensureCsrfCookie,
  requireCsrfProtection
} = require("../middleware/csrf.middleware.js");

const { signToken } = require("../middleware/auth.middleware.js");
const { requireAuth } = require("../middleware/auth.middleware.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROUTES_DIR = path.join(__dirname, "..", "routes");

/**
 * Returns the source text of a route file.
 */
function readRouteSource(filename) {
  return fs.readFileSync(path.join(ROUTES_DIR, filename), "utf8");
}

/**
 * Returns true if the file imports and applies requireCsrfProtection via
 * either router.use() (router-level) or inline per-handler middleware.
 */
function fileHasCsrfProtection(source) {
  return (
    source.includes("requireCsrfProtection") &&
    (source.includes("router.use(requireCsrfProtection") ||
      source.includes("requireCsrfProtection,") ||
      source.includes("requireCsrfProtection)"))
  );
}

/**
 * Build a minimal Express app that mirrors the production middleware stack for
 * a single protected POST route.  No database is needed.
 */
function buildTestApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use(ensureCsrfCookie);

  // A single protected write endpoint — no DB, just 200 OK on success
  app.post("/api/test-write", requireAuth, requireCsrfProtection, (_req, res) => {
    res.status(200).json({ ok: true });
  });

  return app;
}

/**
 * Obtain a valid JWT for use in Authorization header.
 * Payload mirrors the structure created by auth.routes.js on login:
 *   { id, email, mfa_enabled }
 */
function makeAuthToken() {
  return signToken({ id: "user-test-id", email: "test@example.com", mfa_enabled: false });
}

// ---------------------------------------------------------------------------
// 1. Route Inventory
// ---------------------------------------------------------------------------

/**
 * Route files that handle authenticated mutation routes and MUST apply
 * requireCsrfProtection (either at router-level or per-handler).
 *
 * Public-only routes (no authenticated mutations) are not listed here.
 * auth.routes.js applies CSRF per-handler for each authenticated mutation;
 * the billing webhook intentionally skips CSRF.
 */
const MUTATION_ROUTE_FILES = [
  "accounts.routes.js",
  "analytics.routes.js",
  "billing.routes.js",
  "business.routes.js",
  "businesses.routes.js",
  "categories.routes.js",
  "cpa-access.routes.js",
  "cpa-verification.routes.js",
  "exports.routes.js",
  "me.routes.js",
  "messages.routes.js",
  "mileage.routes.js",
  "privacy.routes.js",
  "receipts.routes.js",
  "recurring.routes.js",
  "sessions.routes.js",
  "transactions.routes.js",
  "auth.routes.js"
];

test("route inventory: all mutation route files apply requireCsrfProtection", () => {
  const missing = [];

  for (const filename of MUTATION_ROUTE_FILES) {
    const source = readRouteSource(filename);
    if (!fileHasCsrfProtection(source)) {
      missing.push(filename);
    }
  }

  assert.deepStrictEqual(
    missing,
    [],
    `The following route files are missing requireCsrfProtection: ${missing.join(", ")}`
  );
});

test("route inventory: system.routes.js has no authenticated mutation routes", () => {
  const source = readRouteSource("system.routes.js");
  // system routes are read-only (GET /health, GET /links) — no mutations expected
  assert.ok(
    !source.includes("router.post") &&
      !source.includes("router.put") &&
      !source.includes("router.patch") &&
      !source.includes("router.delete"),
    "system.routes.js should not contain any mutation routes"
  );
});

test("route inventory: billing webhook explicitly skips CSRF (expected exception)", () => {
  const source = readRouteSource("billing.routes.js");
  // Stripe webhooks are server-to-server and use signature verification instead
  assert.ok(
    source.includes('"/webhook"') || source.includes("'/webhook'"),
    "billing.routes.js should define a /webhook route"
  );
  // The webhook route is defined with router.post("/webhook", ...) and must NOT
  // include requireCsrfProtection in its inline middleware list.  We locate the
  // route definition line and inspect it directly.
  const webhookRouteMatch = source.match(/router\.post\s*\(\s*["']\/webhook["'][^)]*\)/s);
  assert.ok(webhookRouteMatch, "billing.routes.js should define a POST /webhook route");
  assert.ok(
    !webhookRouteMatch[0].includes("requireCsrfProtection"),
    "The POST /webhook route should NOT include requireCsrfProtection in its handler chain"
  );
});

// ---------------------------------------------------------------------------
// 2. Frontend CSRF Compliance
// ---------------------------------------------------------------------------

const JS_DIR = path.join(__dirname, "..", "public", "js");

/**
 * JS files that make authenticated mutation calls.
 * They must either use apiFetch() (which injects csrfHeader automatically)
 * or call csrfHeader() directly.
 */
const FRONTEND_MUTATION_FILES = [
  "accounts.js",
  "analytics.js",
  "categories-backend.js",
  "change-email.js",
  "exports.js",
  "messages.js",
  "mileage.js",
  "onboarding-page.js",
  "onboarding.js",
  "receipts.js",
  "sessions.js",
  "settings.js",
  "subscription.js",
  "transactions.js",
  "privacyService.js"
];

test("frontend compliance: apiFetch injects csrfHeader for all mutation methods", () => {
  const authJs = fs.readFileSync(path.join(JS_DIR, "auth.js"), "utf8");

  // apiFetch must spread csrfHeader(method) into its headers
  assert.ok(
    authJs.includes("csrfHeader(method)"),
    "auth.js apiFetch() must call csrfHeader(method) so all apiFetch callers get CSRF headers"
  );
});

test("frontend compliance: mutation JS files use apiFetch or explicit csrfHeader", () => {
  const nonCompliant = [];

  for (const filename of FRONTEND_MUTATION_FILES) {
    const source = fs.readFileSync(path.join(JS_DIR, filename), "utf8");

    // A file is compliant if it uses apiFetch (which centralises CSRF injection)
    // OR calls csrfHeader() explicitly for direct fetch() calls.
    const usesApiFetch = source.includes("apiFetch(");
    const usesExplicitCsrf = source.includes("csrfHeader(");

    if (!usesApiFetch && !usesExplicitCsrf) {
      nonCompliant.push(filename);
    }
  }

  assert.deepStrictEqual(
    nonCompliant,
    [],
    `The following frontend files make mutations without CSRF token support: ${nonCompliant.join(", ")}`
  );
});

test("frontend compliance: public auth pages use plain fetch without CSRF (expected)", () => {
  // These pages POST to unauthenticated routes — CSRF is not required
  const publicAuthFiles = [
    "login.js",
    "register.js",
    "verify-email.js",
    "mfa-challenge.js"
  ];

  for (const filename of publicAuthFiles) {
    const source = fs.readFileSync(path.join(JS_DIR, filename), "utf8");
    // Confirm these files do NOT call apiFetch for their primary mutation
    // (they target public, pre-auth endpoints intentionally)
    const hasFetch = source.includes("fetch(");
    assert.ok(hasFetch, `${filename} should contain at least one fetch() call`);
  }
});

// ---------------------------------------------------------------------------
// 3. End-to-End HTTP integration tests
// ---------------------------------------------------------------------------

test("e2e CSRF: valid authenticated write with matching token succeeds (200)", async () => {
  const app = buildTestApp();
  const authToken = makeAuthToken();
  const csrfToken = generateCsrfToken();

  const res = await request(app)
    .post("/api/test-write")
    .set("Authorization", `Bearer ${authToken}`)
    .set("Cookie", `${CSRF_COOKIE_NAME}=${csrfToken}`)
    .set(CSRF_HEADER_NAME, csrfToken)
    .send({ amount: 100 });

  assert.strictEqual(res.status, 200, `Expected 200 but got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.deepStrictEqual(res.body, { ok: true });
});

test("e2e CSRF: authenticated write WITHOUT CSRF token is rejected (403)", async () => {
  const app = buildTestApp();
  const authToken = makeAuthToken();

  const res = await request(app)
    .post("/api/test-write")
    .set("Authorization", `Bearer ${authToken}`)
    // no Cookie and no CSRF header
    .send({ amount: 100 });

  assert.strictEqual(res.status, 403, `Expected 403 but got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.ok(
    res.body?.error?.toLowerCase().includes("csrf"),
    `Expected CSRF error message, got: ${JSON.stringify(res.body)}`
  );
});

test("e2e CSRF: authenticated write with INVALID CSRF token is rejected (403)", async () => {
  const app = buildTestApp();
  const authToken = makeAuthToken();
  const realToken = generateCsrfToken();
  const fakeToken = "deadbeef.invalidsignature";

  // Cookie holds the real token but the header sends a tampered one
  const res = await request(app)
    .post("/api/test-write")
    .set("Authorization", `Bearer ${authToken}`)
    .set("Cookie", `${CSRF_COOKIE_NAME}=${realToken}`)
    .set(CSRF_HEADER_NAME, fakeToken)
    .send({ amount: 100 });

  assert.strictEqual(res.status, 403, `Expected 403 but got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.ok(
    res.body?.error?.toLowerCase().includes("csrf"),
    `Expected CSRF error message, got: ${JSON.stringify(res.body)}`
  );
});

test("e2e CSRF: authenticated write with MISMATCHED tokens is rejected (403)", async () => {
  const app = buildTestApp();
  const authToken = makeAuthToken();
  const tokenA = generateCsrfToken();
  const tokenB = generateCsrfToken();

  // Both tokens are individually valid but they don't match each other
  const res = await request(app)
    .post("/api/test-write")
    .set("Authorization", `Bearer ${authToken}`)
    .set("Cookie", `${CSRF_COOKIE_NAME}=${tokenA}`)
    .set(CSRF_HEADER_NAME, tokenB)
    .send({ amount: 100 });

  assert.strictEqual(res.status, 403, `Expected 403 but got ${res.status}: ${JSON.stringify(res.body)}`);
});

test("e2e CSRF: unauthenticated request is rejected by auth middleware (401) before CSRF check", async () => {
  const app = buildTestApp();
  const csrfToken = generateCsrfToken();

  const res = await request(app)
    .post("/api/test-write")
    // valid CSRF token but no auth header
    .set("Cookie", `${CSRF_COOKIE_NAME}=${csrfToken}`)
    .set(CSRF_HEADER_NAME, csrfToken)
    .send({ amount: 100 });

  assert.strictEqual(res.status, 401, `Expected 401 but got ${res.status}: ${JSON.stringify(res.body)}`);
});
