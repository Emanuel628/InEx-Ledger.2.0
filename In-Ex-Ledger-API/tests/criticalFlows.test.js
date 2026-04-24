/**
 * Critical Flows Tests
 *
 * Route-level integration tests (using supertest) for the highest-impact paths
 * in the application. All tests mount the actual route files but rely only on
 * the auth/CSRF/MFA middleware to produce 401/403 responses — no real database
 * connection is required for the negative-path assertions.
 *
 * Service-layer business logic that accepts an injectable pool is tested via
 * direct function calls with a fake pool double (same pattern as
 * accountingControls.test.js).
 *
 * Areas covered:
 *   1.  Session management routes — auth + CSRF guards
 *   2.  Privacy / GDPR routes — auth + CSRF + MFA guards
 *   3.  Password change / logout / email-change — auth + CSRF + MFA guards
 *   4.  Billing routes — auth + CSRF + MFA guards
 *   5.  Settings (me) routes — auth + CSRF guards
 *   6.  Transaction routes — auth + CSRF guards
 *   7.  Business routes — auth + CSRF + MFA guards
 *   8.  Categories routes — auth + CSRF guards
 *   9.  Accounts routes — auth + CSRF guards
 *   10. Recurring transactions routes — auth + CSRF guards
 *   11. Mileage routes — auth + CSRF guards
 *   12. Exports routes — auth + CSRF guards
 *   13. Analytics routes — auth + CSRF guards
 *   14. Receipts routes — auth + CSRF guards
 *   15. CPA Access routes — auth + CSRF + MFA guards
 *   16. Accounting lock — loadAccountingLockState, saveAccountingLockState
 *   17. assertDateUnlocked lock boundary validation (exact date, multi-date, no-lock edge cases)
 *       + archiveTransaction null/whitespace handling (tested via fake pool)
 */

"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const express = require("express");
const cookieParser = require("cookie-parser");
const request = require("supertest");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-critical-flows";
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://local:test@localhost:5432/inex_ledger_test";

const {
  signToken
} = require("../middleware/auth.middleware.js");
const {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  generateCsrfToken,
  ensureCsrfCookie,
  requireCsrfProtection
} = require("../middleware/csrf.middleware.js");
const {
  AccountingPeriodLockedError,
  assertDateUnlocked,
  loadAccountingLockState,
  saveAccountingLockState
} = require("../services/accountingLockService.js");
const { archiveTransaction } = require("../services/transactionAuditService.js");

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

function makeToken(extra = {}) {
  return signToken({ id: "user-test", email: "test@example.com", mfa_enabled: false, ...extra });
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
    Cookie: `${CSRF_COOKIE_NAME}=${token}`
  };
}

// ---------------------------------------------------------------------------
// Minimal test app factory (mirrors the production middleware stack for a
// single protected route, without any real DB connection).
// ---------------------------------------------------------------------------

function buildApp(router, mountPath = "/api/test") {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use(ensureCsrfCookie);
  app.use(mountPath, router);
  return app;
}

// ---------------------------------------------------------------------------
// 1. Session Management Routes
// ---------------------------------------------------------------------------

test("sessions: DELETE /api/sessions/:id rejects unauthenticated requests (401)", async () => {
  const sessionsRouter = require("../routes/sessions.routes.js");
  const app = buildApp(sessionsRouter, "/api/sessions");

  const res = await request(app).delete("/api/sessions/some-session-id");
  assert.equal(res.status, 401);
});

test("sessions: DELETE /api/sessions/:id rejects missing CSRF token (403)", async () => {
  const sessionsRouter = require("../routes/sessions.routes.js");
  const app = buildApp(sessionsRouter, "/api/sessions");
  const authToken = makeToken();

  const res = await request(app)
    .delete("/api/sessions/some-session-id")
    .set("Authorization", `Bearer ${authToken}`);
  // no CSRF cookie/header
  assert.equal(res.status, 403);
});

test("sessions: DELETE /api/sessions (all) rejects unauthenticated requests (401)", async () => {
  const sessionsRouter = require("../routes/sessions.routes.js");
  const app = buildApp(sessionsRouter, "/api/sessions");

  const res = await request(app).delete("/api/sessions");
  assert.equal(res.status, 401);
});

test("sessions: DELETE /api/sessions (all) rejects missing CSRF token (403)", async () => {
  const sessionsRouter = require("../routes/sessions.routes.js");
  const app = buildApp(sessionsRouter, "/api/sessions");
  const authToken = makeToken();

  const res = await request(app)
    .delete("/api/sessions")
    .set("Authorization", `Bearer ${authToken}`);
  assert.equal(res.status, 403);
});

test("sessions: GET /api/sessions rejects unauthenticated requests (401)", async () => {
  const sessionsRouter = require("../routes/sessions.routes.js");
  const app = buildApp(sessionsRouter, "/api/sessions");

  const res = await request(app).get("/api/sessions");
  assert.equal(res.status, 401);
});

// ---------------------------------------------------------------------------
// 2. Privacy / GDPR Routes
// ---------------------------------------------------------------------------

test("privacy: POST /erase rejects unauthenticated requests (401)", async () => {
  const privacyRouter = require("../routes/privacy.routes.js");
  const app = buildApp(privacyRouter, "/api/privacy");

  const res = await request(app).post("/api/privacy/erase");
  assert.equal(res.status, 401);
});

test("privacy: POST /erase rejects missing CSRF token (403)", async () => {
  const privacyRouter = require("../routes/privacy.routes.js");
  const app = buildApp(privacyRouter, "/api/privacy");
  const authToken = makeToken();

  const res = await request(app)
    .post("/api/privacy/erase")
    .set("Authorization", `Bearer ${authToken}`);
  assert.equal(res.status, 403);
});

test("privacy: POST /erase requires MFA (403 mfa_required) when MFA is not enabled", async () => {
  const privacyRouter = require("../routes/privacy.routes.js");
  const app = buildApp(privacyRouter, "/api/privacy");
  const authToken = makeToken({ mfa_enabled: false });
  const csrf = generateCsrfToken();

  const res = await request(app)
    .post("/api/privacy/erase")
    .set("Authorization", `Bearer ${authToken}`)
    .set(CSRF_HEADER_NAME, csrf)
    .set("Cookie", `${CSRF_COOKIE_NAME}=${csrf}`)
    .send({});
  assert.equal(res.status, 403);
  assert.equal(res.body?.mfa_required, true);
});

test("privacy: POST /delete rejects unauthenticated requests (401)", async () => {
  const privacyRouter = require("../routes/privacy.routes.js");
  const app = buildApp(privacyRouter, "/api/privacy");

  const res = await request(app).post("/api/privacy/delete");
  assert.equal(res.status, 401);
});

test("privacy: POST /delete rejects missing CSRF token (403)", async () => {
  const privacyRouter = require("../routes/privacy.routes.js");
  const app = buildApp(privacyRouter, "/api/privacy");
  const authToken = makeToken();

  const res = await request(app)
    .post("/api/privacy/delete")
    .set("Authorization", `Bearer ${authToken}`);
  assert.equal(res.status, 403);
});

test("privacy: POST /delete requires MFA (403 mfa_required) when MFA is not enabled", async () => {
  const privacyRouter = require("../routes/privacy.routes.js");
  const app = buildApp(privacyRouter, "/api/privacy");
  const authToken = makeToken({ mfa_enabled: false });
  const csrf = generateCsrfToken();

  const res = await request(app)
    .post("/api/privacy/delete")
    .set("Authorization", `Bearer ${authToken}`)
    .set(CSRF_HEADER_NAME, csrf)
    .set("Cookie", `${CSRF_COOKIE_NAME}=${csrf}`)
    .send({ password: "example-password" });
  assert.equal(res.status, 403);
  assert.equal(res.body?.mfa_required, true);
});

test("privacy: POST /delete requires password even when MFA-authenticated", async () => {
  const privacyRouter = require("../routes/privacy.routes.js");
  const app = buildApp(privacyRouter, "/api/privacy");
  const authToken = makeMfaToken();
  const csrf = generateCsrfToken();

  const res = await request(app)
    .post("/api/privacy/delete")
    .set("Authorization", `Bearer ${authToken}`)
    .set(CSRF_HEADER_NAME, csrf)
    .set("Cookie", `${CSRF_COOKIE_NAME}=${csrf}`)
    .send({});
  assert.equal(res.status, 400);
});

// ---------------------------------------------------------------------------
// 3. Password Change (auth.routes.js POST /change-password)
// ---------------------------------------------------------------------------

test("auth: POST /change-password rejects unauthenticated requests (401)", async () => {
  const authRouter = require("../routes/auth.routes.js");
  const app = buildApp(authRouter, "/api/auth");

  const res = await request(app)
    .post("/api/auth/change-password")
    .send({ currentPassword: "old", newPassword: "new123!" });
  assert.equal(res.status, 401);
});

test("auth: POST /change-password rejects missing CSRF token (403)", async () => {
  const authRouter = require("../routes/auth.routes.js");
  const app = buildApp(authRouter, "/api/auth");
  const authToken = makeToken();

  const res = await request(app)
    .post("/api/auth/change-password")
    .set("Authorization", `Bearer ${authToken}`)
    .send({ currentPassword: "old", newPassword: "new123!" });
  assert.equal(res.status, 403);
});

test("auth: POST /change-password requires MFA (403 mfa_required) when MFA is not enabled", async () => {
  const authRouter = require("../routes/auth.routes.js");
  const app = buildApp(authRouter, "/api/auth");
  const authToken = makeToken({ mfa_enabled: false });
  const csrf = generateCsrfToken();

  const res = await request(app)
    .post("/api/auth/change-password")
    .set("Authorization", `Bearer ${authToken}`)
    .set(CSRF_HEADER_NAME, csrf)
    .set("Cookie", `${CSRF_COOKIE_NAME}=${csrf}`)
    .send({ currentPassword: "old", newPassword: "new123!" });
  assert.equal(res.status, 403);
  assert.equal(res.body?.mfa_required, true);
});

test("auth: POST /logout rejects unauthenticated requests (401)", async () => {
  const authRouter = require("../routes/auth.routes.js");
  const app = buildApp(authRouter, "/api/auth");

  const res = await request(app).post("/api/auth/logout");
  assert.equal(res.status, 401);
});

test("auth: POST /logout rejects missing CSRF token (403)", async () => {
  const authRouter = require("../routes/auth.routes.js");
  const app = buildApp(authRouter, "/api/auth");
  const authToken = makeToken();

  const res = await request(app)
    .post("/api/auth/logout")
    .set("Authorization", `Bearer ${authToken}`);
  assert.equal(res.status, 403);
});

test("auth: POST /request-email-change rejects unauthenticated requests (401)", async () => {
  const authRouter = require("../routes/auth.routes.js");
  const app = buildApp(authRouter, "/api/auth");

  const res = await request(app)
    .post("/api/auth/request-email-change")
    .send({ newEmail: "new@example.com", currentPassword: "pass" });
  assert.equal(res.status, 401);
});

test("auth: POST /request-email-change rejects missing CSRF token (403)", async () => {
  const authRouter = require("../routes/auth.routes.js");
  const app = buildApp(authRouter, "/api/auth");
  const authToken = makeToken();

  const res = await request(app)
    .post("/api/auth/request-email-change")
    .set("Authorization", `Bearer ${authToken}`)
    .send({ newEmail: "new@example.com", currentPassword: "pass" });
  assert.equal(res.status, 403);
});

// ---------------------------------------------------------------------------
// 4. Billing Routes
// ---------------------------------------------------------------------------

test("billing: POST /cancel rejects unauthenticated requests (401)", async () => {
  const billingRouter = require("../routes/billing.routes.js");
  const app = buildApp(billingRouter, "/api/billing");

  const res = await request(app).post("/api/billing/cancel");
  assert.equal(res.status, 401);
});

test("billing: POST /cancel rejects missing CSRF token (403)", async () => {
  const billingRouter = require("../routes/billing.routes.js");
  const app = buildApp(billingRouter, "/api/billing");
  const authToken = makeToken();

  const res = await request(app)
    .post("/api/billing/cancel")
    .set("Authorization", `Bearer ${authToken}`);
  assert.equal(res.status, 403);
});

test("billing: POST /checkout-session rejects unauthenticated requests (401)", async () => {
  const billingRouter = require("../routes/billing.routes.js");
  const app = buildApp(billingRouter, "/api/billing");

  const res = await request(app).post("/api/billing/checkout-session");
  assert.equal(res.status, 401);
});

test("billing: POST /checkout-session rejects missing CSRF token (403)", async () => {
  const billingRouter = require("../routes/billing.routes.js");
  const app = buildApp(billingRouter, "/api/billing");
  const authToken = makeToken();

  const res = await request(app)
    .post("/api/billing/checkout-session")
    .set("Authorization", `Bearer ${authToken}`);
  assert.equal(res.status, 403);
});

test("billing: POST /checkout-session requires MFA (403 mfa_required) when MFA is not enabled", async () => {
  const billingRouter = require("../routes/billing.routes.js");
  const app = buildApp(billingRouter, "/api/billing");
  const authToken = makeToken({ mfa_enabled: false });
  const csrf = generateCsrfToken();

  const res = await request(app)
    .post("/api/billing/checkout-session")
    .set("Authorization", `Bearer ${authToken}`)
    .set(CSRF_HEADER_NAME, csrf)
    .set("Cookie", `${CSRF_COOKIE_NAME}=${csrf}`)
    .send({});
  assert.equal(res.status, 403);
  assert.equal(res.body?.mfa_required, true);
});

// ---------------------------------------------------------------------------
// 5. Settings (me) Routes
// ---------------------------------------------------------------------------

test("me: PUT / (settings update) rejects unauthenticated requests (401)", async () => {
  const meRouter = require("../routes/me.routes.js");
  const app = buildApp(meRouter, "/api/me");

  const res = await request(app).put("/api/me/").send({ full_name: "Alice" });
  assert.equal(res.status, 401);
});

test("me: PUT / (settings update) rejects missing CSRF token (403)", async () => {
  const meRouter = require("../routes/me.routes.js");
  const app = buildApp(meRouter, "/api/me");
  const authToken = makeToken();

  const res = await request(app)
    .put("/api/me/")
    .set("Authorization", `Bearer ${authToken}`)
    .send({ full_name: "Alice" });
  assert.equal(res.status, 403);
});

test("me: PUT /preferences rejects unauthenticated requests (401)", async () => {
  const meRouter = require("../routes/me.routes.js");
  const app = buildApp(meRouter, "/api/me");

  const res = await request(app)
    .put("/api/me/preferences")
    .send({ dynamic_sidebar_favorites: ["transactions"] });
  assert.equal(res.status, 401);
});

test("me: PUT /preferences rejects missing CSRF token (403)", async () => {
  const meRouter = require("../routes/me.routes.js");
  const app = buildApp(meRouter, "/api/me");
  const authToken = makeToken();

  const res = await request(app)
    .put("/api/me/preferences")
    .set("Authorization", `Bearer ${authToken}`)
    .send({ dynamic_sidebar_favorites: ["transactions"] });
  assert.equal(res.status, 403);
});

test("me: DELETE / (account deletion) rejects unauthenticated requests (401)", async () => {
  const meRouter = require("../routes/me.routes.js");
  const app = buildApp(meRouter, "/api/me");

  const res = await request(app).delete("/api/me/").send({ password: "secret" });
  assert.equal(res.status, 401);
});

test("me: DELETE / (account deletion) rejects missing CSRF token (403)", async () => {
  const meRouter = require("../routes/me.routes.js");
  const app = buildApp(meRouter, "/api/me");
  const authToken = makeToken();

  const res = await request(app)
    .delete("/api/me/")
    .set("Authorization", `Bearer ${authToken}`)
    .send({ password: "secret" });
  assert.equal(res.status, 403);
});

// ---------------------------------------------------------------------------
// 6. Transaction Routes
// ---------------------------------------------------------------------------

test("transactions: POST / rejects unauthenticated requests (401)", async () => {
  const txRouter = require("../routes/transactions.routes.js");
  const app = buildApp(txRouter, "/api/transactions");

  const res = await request(app)
    .post("/api/transactions")
    .send({ amount: 100, type: "expense" });
  assert.equal(res.status, 401);
});

test("transactions: POST / rejects missing CSRF token (403)", async () => {
  const txRouter = require("../routes/transactions.routes.js");
  const app = buildApp(txRouter, "/api/transactions");
  const authToken = makeToken();

  const res = await request(app)
    .post("/api/transactions")
    .set("Authorization", `Bearer ${authToken}`)
    .send({ amount: 100, type: "expense" });
  assert.equal(res.status, 403);
});

test("transactions: DELETE /:id rejects unauthenticated requests (401)", async () => {
  const txRouter = require("../routes/transactions.routes.js");
  const app = buildApp(txRouter, "/api/transactions");

  const res = await request(app).delete("/api/transactions/some-tx-id");
  assert.equal(res.status, 401);
});

test("transactions: DELETE /:id rejects missing CSRF token (403)", async () => {
  const txRouter = require("../routes/transactions.routes.js");
  const app = buildApp(txRouter, "/api/transactions");
  const authToken = makeToken();

  const res = await request(app)
    .delete("/api/transactions/some-tx-id")
    .set("Authorization", `Bearer ${authToken}`);
  assert.equal(res.status, 403);
});

test("transactions: PUT /:id rejects unauthenticated requests (401)", async () => {
  const txRouter = require("../routes/transactions.routes.js");
  const app = buildApp(txRouter, "/api/transactions");

  const res = await request(app)
    .put("/api/transactions/some-tx-id")
    .send({ amount: 200, type: "income" });
  assert.equal(res.status, 401);
});

test("transactions: PUT /:id rejects missing CSRF token (403)", async () => {
  const txRouter = require("../routes/transactions.routes.js");
  const app = buildApp(txRouter, "/api/transactions");
  const authToken = makeToken();

  const res = await request(app)
    .put("/api/transactions/some-tx-id")
    .set("Authorization", `Bearer ${authToken}`)
    .send({ amount: 200, type: "income" });
  assert.equal(res.status, 403);
});

test("transactions: PATCH /:id/cleared rejects unauthenticated requests (401)", async () => {
  const txRouter = require("../routes/transactions.routes.js");
  const app = buildApp(txRouter, "/api/transactions");

  const res = await request(app).patch("/api/transactions/some-tx-id/cleared");
  assert.equal(res.status, 401);
});

test("transactions: PATCH /:id/cleared rejects missing CSRF token (403)", async () => {
  const txRouter = require("../routes/transactions.routes.js");
  const app = buildApp(txRouter, "/api/transactions");
  const authToken = makeToken();

  const res = await request(app)
    .patch("/api/transactions/some-tx-id/cleared")
    .set("Authorization", `Bearer ${authToken}`);
  assert.equal(res.status, 403);
});

// ---------------------------------------------------------------------------
// 7. Businesses Routes
// ---------------------------------------------------------------------------

test("businesses: POST / (create business) rejects unauthenticated requests (401)", async () => {
  const bizRouter = require("../routes/businesses.routes.js");
  const app = buildApp(bizRouter, "/api/businesses");

  const res = await request(app).post("/api/businesses").send({ name: "Acme", region: "US" });
  assert.equal(res.status, 401);
});

test("businesses: POST / (create business) rejects missing CSRF token (403)", async () => {
  const bizRouter = require("../routes/businesses.routes.js");
  const app = buildApp(bizRouter, "/api/businesses");
  const authToken = makeToken();

  const res = await request(app)
    .post("/api/businesses")
    .set("Authorization", `Bearer ${authToken}`)
    .send({ name: "Acme", region: "US" });
  assert.equal(res.status, 403);
});

test("businesses: POST /:id/activate rejects unauthenticated requests (401)", async () => {
  const bizRouter = require("../routes/businesses.routes.js");
  const app = buildApp(bizRouter, "/api/businesses");

  const res = await request(app).post("/api/businesses/some-biz-id/activate");
  assert.equal(res.status, 401);
});

test("businesses: POST /:id/activate rejects missing CSRF token (403)", async () => {
  const bizRouter = require("../routes/businesses.routes.js");
  const app = buildApp(bizRouter, "/api/businesses");
  const authToken = makeToken();

  const res = await request(app)
    .post("/api/businesses/some-biz-id/activate")
    .set("Authorization", `Bearer ${authToken}`);
  assert.equal(res.status, 403);
});

test("businesses: DELETE /:id rejects unauthenticated requests (401)", async () => {
  const bizRouter = require("../routes/businesses.routes.js");
  const app = buildApp(bizRouter, "/api/businesses");

  const res = await request(app)
    .delete("/api/businesses/some-biz-id")
    .send({ password: "secret" });
  assert.equal(res.status, 401);
});

test("businesses: DELETE /:id rejects missing CSRF token (403)", async () => {
  const bizRouter = require("../routes/businesses.routes.js");
  const app = buildApp(bizRouter, "/api/businesses");
  const authToken = makeToken();

  const res = await request(app)
    .delete("/api/businesses/some-biz-id")
    .set("Authorization", `Bearer ${authToken}`)
    .send({ password: "secret" });
  assert.equal(res.status, 403);
});

test("businesses: DELETE /:id requires MFA (403 mfa_required) when MFA is not enabled", async () => {
  const bizRouter = require("../routes/businesses.routes.js");
  const app = buildApp(bizRouter, "/api/businesses");
  const authToken = makeToken({ mfa_enabled: false });
  const csrf = generateCsrfToken();

  const res = await request(app)
    .delete("/api/businesses/some-biz-id")
    .set("Authorization", `Bearer ${authToken}`)
    .set(CSRF_HEADER_NAME, csrf)
    .set("Cookie", `${CSRF_COOKIE_NAME}=${csrf}`)
    .send({ password: "secret" });
  assert.equal(res.status, 403);
  assert.equal(res.body?.mfa_required, true);
});

// ---------------------------------------------------------------------------
// 8. Categories Routes
// ---------------------------------------------------------------------------

test("categories: POST / rejects unauthenticated requests (401)", async () => {
  const catRouter = require("../routes/categories.routes.js");
  const app = buildApp(catRouter, "/api/categories");

  const res = await request(app)
    .post("/api/categories")
    .send({ name: "Utilities", kind: "expense" });
  assert.equal(res.status, 401);
});

test("categories: POST / rejects missing CSRF token (403)", async () => {
  const catRouter = require("../routes/categories.routes.js");
  const app = buildApp(catRouter, "/api/categories");
  const authToken = makeToken();

  const res = await request(app)
    .post("/api/categories")
    .set("Authorization", `Bearer ${authToken}`)
    .send({ name: "Utilities", kind: "expense" });
  assert.equal(res.status, 403);
});

test("categories: PUT /:id rejects unauthenticated requests (401)", async () => {
  const catRouter = require("../routes/categories.routes.js");
  const app = buildApp(catRouter, "/api/categories");

  const res = await request(app)
    .put("/api/categories/some-cat-id")
    .send({ name: "Utilities" });
  assert.equal(res.status, 401);
});

test("categories: PUT /:id rejects missing CSRF token (403)", async () => {
  const catRouter = require("../routes/categories.routes.js");
  const app = buildApp(catRouter, "/api/categories");
  const authToken = makeToken();

  const res = await request(app)
    .put("/api/categories/some-cat-id")
    .set("Authorization", `Bearer ${authToken}`)
    .send({ name: "Utilities" });
  assert.equal(res.status, 403);
});

test("categories: DELETE /:id rejects unauthenticated requests (401)", async () => {
  const catRouter = require("../routes/categories.routes.js");
  const app = buildApp(catRouter, "/api/categories");

  const res = await request(app).delete("/api/categories/some-cat-id");
  assert.equal(res.status, 401);
});

test("categories: DELETE /:id rejects missing CSRF token (403)", async () => {
  const catRouter = require("../routes/categories.routes.js");
  const app = buildApp(catRouter, "/api/categories");
  const authToken = makeToken();

  const res = await request(app)
    .delete("/api/categories/some-cat-id")
    .set("Authorization", `Bearer ${authToken}`);
  assert.equal(res.status, 403);
});

// ---------------------------------------------------------------------------
// 9. Accounts Routes
// ---------------------------------------------------------------------------

test("accounts: POST / rejects unauthenticated requests (401)", async () => {
  const accRouter = require("../routes/accounts.routes.js");
  const app = buildApp(accRouter, "/api/accounts");

  const res = await request(app).post("/api/accounts").send({ name: "Cash", kind: "checking" });
  assert.equal(res.status, 401);
});

test("accounts: POST / rejects missing CSRF token (403)", async () => {
  const accRouter = require("../routes/accounts.routes.js");
  const app = buildApp(accRouter, "/api/accounts");
  const authToken = makeToken();

  const res = await request(app)
    .post("/api/accounts")
    .set("Authorization", `Bearer ${authToken}`)
    .send({ name: "Cash", kind: "checking" });
  assert.equal(res.status, 403);
});

test("accounts: PUT /:id rejects unauthenticated requests (401)", async () => {
  const accRouter = require("../routes/accounts.routes.js");
  const app = buildApp(accRouter, "/api/accounts");

  const res = await request(app)
    .put("/api/accounts/some-acc-id")
    .send({ name: "Savings" });
  assert.equal(res.status, 401);
});

test("accounts: PUT /:id rejects missing CSRF token (403)", async () => {
  const accRouter = require("../routes/accounts.routes.js");
  const app = buildApp(accRouter, "/api/accounts");
  const authToken = makeToken();

  const res = await request(app)
    .put("/api/accounts/some-acc-id")
    .set("Authorization", `Bearer ${authToken}`)
    .send({ name: "Savings" });
  assert.equal(res.status, 403);
});

test("accounts: DELETE /:id rejects unauthenticated requests (401)", async () => {
  const accRouter = require("../routes/accounts.routes.js");
  const app = buildApp(accRouter, "/api/accounts");

  const res = await request(app).delete("/api/accounts/some-acc-id");
  assert.equal(res.status, 401);
});

test("accounts: DELETE /:id rejects missing CSRF token (403)", async () => {
  const accRouter = require("../routes/accounts.routes.js");
  const app = buildApp(accRouter, "/api/accounts");
  const authToken = makeToken();

  const res = await request(app)
    .delete("/api/accounts/some-acc-id")
    .set("Authorization", `Bearer ${authToken}`);
  assert.equal(res.status, 403);
});

// ---------------------------------------------------------------------------
// 10. Recurring Transactions Routes
// ---------------------------------------------------------------------------

test("recurring: POST / rejects unauthenticated requests (401)", async () => {
  const recRouter = require("../routes/recurring.routes.js");
  const app = buildApp(recRouter, "/api/recurring");

  const res = await request(app).post("/api/recurring").send({ name: "Rent" });
  assert.equal(res.status, 401);
});

test("recurring: POST / rejects missing CSRF token (403)", async () => {
  const recRouter = require("../routes/recurring.routes.js");
  const app = buildApp(recRouter, "/api/recurring");
  const authToken = makeToken();

  const res = await request(app)
    .post("/api/recurring")
    .set("Authorization", `Bearer ${authToken}`)
    .send({ name: "Rent" });
  assert.equal(res.status, 403);
});

test("recurring: PUT /:id rejects unauthenticated requests (401)", async () => {
  const recRouter = require("../routes/recurring.routes.js");
  const app = buildApp(recRouter, "/api/recurring");

  const res = await request(app)
    .put("/api/recurring/some-rec-id")
    .send({ name: "Rent Updated" });
  assert.equal(res.status, 401);
});

test("recurring: PUT /:id rejects missing CSRF token (403)", async () => {
  const recRouter = require("../routes/recurring.routes.js");
  const app = buildApp(recRouter, "/api/recurring");
  const authToken = makeToken();

  const res = await request(app)
    .put("/api/recurring/some-rec-id")
    .set("Authorization", `Bearer ${authToken}`)
    .send({ name: "Rent Updated" });
  assert.equal(res.status, 403);
});

test("recurring: DELETE /:id rejects unauthenticated requests (401)", async () => {
  const recRouter = require("../routes/recurring.routes.js");
  const app = buildApp(recRouter, "/api/recurring");

  const res = await request(app).delete("/api/recurring/some-rec-id");
  assert.equal(res.status, 401);
});

test("recurring: DELETE /:id rejects missing CSRF token (403)", async () => {
  const recRouter = require("../routes/recurring.routes.js");
  const app = buildApp(recRouter, "/api/recurring");
  const authToken = makeToken();

  const res = await request(app)
    .delete("/api/recurring/some-rec-id")
    .set("Authorization", `Bearer ${authToken}`);
  assert.equal(res.status, 403);
});

// ---------------------------------------------------------------------------
// 11. Mileage Routes
// ---------------------------------------------------------------------------

test("mileage: POST / rejects unauthenticated requests (401)", async () => {
  const milRouter = require("../routes/mileage.routes.js");
  const app = buildApp(milRouter, "/api/mileage");

  const res = await request(app).post("/api/mileage").send({ distance: 10 });
  assert.equal(res.status, 401);
});

test("mileage: POST / rejects missing CSRF token (403)", async () => {
  const milRouter = require("../routes/mileage.routes.js");
  const app = buildApp(milRouter, "/api/mileage");
  const authToken = makeToken();

  const res = await request(app)
    .post("/api/mileage")
    .set("Authorization", `Bearer ${authToken}`)
    .send({ distance: 10 });
  assert.equal(res.status, 403);
});

test("mileage: PUT /:id rejects unauthenticated requests (401)", async () => {
  const milRouter = require("../routes/mileage.routes.js");
  const app = buildApp(milRouter, "/api/mileage");

  const res = await request(app)
    .put("/api/mileage/some-mil-id")
    .send({ distance: 20 });
  assert.equal(res.status, 401);
});

test("mileage: PUT /:id rejects missing CSRF token (403)", async () => {
  const milRouter = require("../routes/mileage.routes.js");
  const app = buildApp(milRouter, "/api/mileage");
  const authToken = makeToken();

  const res = await request(app)
    .put("/api/mileage/some-mil-id")
    .set("Authorization", `Bearer ${authToken}`)
    .send({ distance: 20 });
  assert.equal(res.status, 403);
});

test("mileage: DELETE /:id rejects unauthenticated requests (401)", async () => {
  const milRouter = require("../routes/mileage.routes.js");
  const app = buildApp(milRouter, "/api/mileage");

  const res = await request(app).delete("/api/mileage/some-mil-id");
  assert.equal(res.status, 401);
});

test("mileage: DELETE /:id rejects missing CSRF token (403)", async () => {
  const milRouter = require("../routes/mileage.routes.js");
  const app = buildApp(milRouter, "/api/mileage");
  const authToken = makeToken();

  const res = await request(app)
    .delete("/api/mileage/some-mil-id")
    .set("Authorization", `Bearer ${authToken}`);
  assert.equal(res.status, 403);
});

test("mileage: POST /costs rejects unauthenticated requests (401)", async () => {
  const milRouter = require("../routes/mileage.routes.js");
  const app = buildApp(milRouter, "/api/mileage");

  const res = await request(app).post("/api/mileage/costs").send({ amount: 10 });
  assert.equal(res.status, 401);
});

test("mileage: POST /costs rejects missing CSRF token (403)", async () => {
  const milRouter = require("../routes/mileage.routes.js");
  const app = buildApp(milRouter, "/api/mileage");
  const authToken = makeToken();

  const res = await request(app)
    .post("/api/mileage/costs")
    .set("Authorization", `Bearer ${authToken}`)
    .send({ amount: 10 });
  assert.equal(res.status, 403);
});

test("mileage: DELETE /costs/:id rejects unauthenticated requests (401)", async () => {
  const milRouter = require("../routes/mileage.routes.js");
  const app = buildApp(milRouter, "/api/mileage");

  const res = await request(app).delete("/api/mileage/costs/some-cost-id");
  assert.equal(res.status, 401);
});

test("mileage: DELETE /costs/:id rejects missing CSRF token (403)", async () => {
  const milRouter = require("../routes/mileage.routes.js");
  const app = buildApp(milRouter, "/api/mileage");
  const authToken = makeToken();

  const res = await request(app)
    .delete("/api/mileage/costs/some-cost-id")
    .set("Authorization", `Bearer ${authToken}`);
  assert.equal(res.status, 403);
});

// ---------------------------------------------------------------------------
// 12. Exports Routes
// ---------------------------------------------------------------------------

test("exports: POST /request-grant rejects unauthenticated requests (401)", async () => {
  const expRouter = require("../routes/exports.routes.js");
  const app = buildApp(expRouter, "/api/exports");

  const res = await request(app).post("/api/exports/request-grant").send({});
  assert.equal(res.status, 401);
});

test("exports: POST /request-grant rejects missing CSRF token (403)", async () => {
  const expRouter = require("../routes/exports.routes.js");
  const app = buildApp(expRouter, "/api/exports");
  const authToken = makeToken();

  const res = await request(app)
    .post("/api/exports/request-grant")
    .set("Authorization", `Bearer ${authToken}`)
    .send({});
  assert.equal(res.status, 403);
});

test("exports: POST /secure-export rejects unauthenticated requests (401)", async () => {
  const expRouter = require("../routes/exports.routes.js");
  const app = buildApp(expRouter, "/api/exports");

  const res = await request(app).post("/api/exports/secure-export").send({});
  assert.equal(res.status, 401);
});

test("exports: POST /secure-export rejects missing CSRF token (403)", async () => {
  const expRouter = require("../routes/exports.routes.js");
  const app = buildApp(expRouter, "/api/exports");
  const authToken = makeToken();

  const res = await request(app)
    .post("/api/exports/secure-export")
    .set("Authorization", `Bearer ${authToken}`)
    .send({});
  assert.equal(res.status, 403);
});

// ---------------------------------------------------------------------------
// 13. Analytics Routes
// ---------------------------------------------------------------------------

test("analytics: POST /whatif rejects unauthenticated requests (401)", async () => {
  const analyticsRouter = require("../routes/analytics.routes.js");
  const app = buildApp(analyticsRouter, "/api/analytics");

  const res = await request(app).post("/api/analytics/whatif").send({});
  assert.equal(res.status, 401);
});

test("analytics: POST /whatif rejects missing CSRF token (403)", async () => {
  const analyticsRouter = require("../routes/analytics.routes.js");
  const app = buildApp(analyticsRouter, "/api/analytics");
  const authToken = makeToken();

  const res = await request(app)
    .post("/api/analytics/whatif")
    .set("Authorization", `Bearer ${authToken}`)
    .send({});
  assert.equal(res.status, 403);
});

// ---------------------------------------------------------------------------
// 14. Receipts Routes
// ---------------------------------------------------------------------------

test("receipts: DELETE /:id rejects unauthenticated requests (401)", async () => {
  const receiptsRouter = require("../routes/receipts.routes.js");
  const app = buildApp(receiptsRouter, "/api/receipts");

  const res = await request(app).delete("/api/receipts/some-receipt-id");
  assert.equal(res.status, 401);
});

test("receipts: DELETE /:id rejects missing CSRF token (403)", async () => {
  const receiptsRouter = require("../routes/receipts.routes.js");
  const app = buildApp(receiptsRouter, "/api/receipts");
  const authToken = makeToken();

  const res = await request(app)
    .delete("/api/receipts/some-receipt-id")
    .set("Authorization", `Bearer ${authToken}`);
  assert.equal(res.status, 403);
});

test("receipts: PATCH /:id/attach rejects unauthenticated requests (401)", async () => {
  const receiptsRouter = require("../routes/receipts.routes.js");
  const app = buildApp(receiptsRouter, "/api/receipts");

  const res = await request(app)
    .patch("/api/receipts/some-receipt-id/attach")
    .send({ transaction_id: "tx-1" });
  assert.equal(res.status, 401);
});

test("receipts: PATCH /:id/attach rejects missing CSRF token (403)", async () => {
  const receiptsRouter = require("../routes/receipts.routes.js");
  const app = buildApp(receiptsRouter, "/api/receipts");
  const authToken = makeToken();

  const res = await request(app)
    .patch("/api/receipts/some-receipt-id/attach")
    .set("Authorization", `Bearer ${authToken}`)
    .send({ transaction_id: "tx-1" });
  assert.equal(res.status, 403);
});

// ---------------------------------------------------------------------------
// 15. CPA Access Routes — MFA-gated
// ---------------------------------------------------------------------------

test("cpa-access: GET /grants/owned rejects unauthenticated requests (401)", async () => {
  const cpaRouter = require("../routes/cpa-access.routes.js");
  const app = buildApp(cpaRouter, "/api/cpa-access");

  const res = await request(app).get("/api/cpa-access/grants/owned");
  assert.equal(res.status, 401);
});

test("cpa-access: GET /grants/owned requires MFA (403 mfa_required) when MFA is not enabled", async () => {
  const cpaRouter = require("../routes/cpa-access.routes.js");
  const app = buildApp(cpaRouter, "/api/cpa-access");
  const authToken = makeToken({ mfa_enabled: false });
  const csrf = generateCsrfToken();

  const res = await request(app)
    .get("/api/cpa-access/grants/owned")
    .set("Authorization", `Bearer ${authToken}`)
    .set(CSRF_HEADER_NAME, csrf)
    .set("Cookie", `${CSRF_COOKIE_NAME}=${csrf}`);
  assert.equal(res.status, 403);
  assert.equal(res.body?.mfa_required, true);
});

test("cpa-access: GET /portfolio/:ownerId rejects unauthenticated requests (401)", async () => {
  const cpaRouter = require("../routes/cpa-access.routes.js");
  const app = buildApp(cpaRouter, "/api/cpa-access");

  const res = await request(app).get("/api/cpa-access/portfolio/some-owner-id");
  assert.equal(res.status, 401);
});

test("cpa-access: GET /portfolio/:ownerId requires MFA (403 mfa_required) when MFA is not enabled", async () => {
  const cpaRouter = require("../routes/cpa-access.routes.js");
  const app = buildApp(cpaRouter, "/api/cpa-access");
  const authToken = makeToken({ mfa_enabled: false });
  const csrf = generateCsrfToken();

  const res = await request(app)
    .get("/api/cpa-access/portfolio/some-owner-id")
    .set("Authorization", `Bearer ${authToken}`)
    .set(CSRF_HEADER_NAME, csrf)
    .set("Cookie", `${CSRF_COOKIE_NAME}=${csrf}`);
  assert.equal(res.status, 403);
  assert.equal(res.body?.mfa_required, true);
});

// ---------------------------------------------------------------------------
// 16. Accounting Lock — service layer with fake pool
// ---------------------------------------------------------------------------

test("loadAccountingLockState returns unlocked state when no row exists", async () => {
  const fakePool = {
    async query() {
      return { rows: [] };
    }
  };

  const state = await loadAccountingLockState(fakePool, "biz-999");
  assert.equal(state.isLocked, false);
  assert.equal(state.lockedThroughDate, null);
});

test("loadAccountingLockState returns locked state from database row", async () => {
  const fakePool = {
    async query() {
      return {
        rows: [
          {
            locked_through_date: "2026-03-31",
            locked_period_note: "Q1 closed",
            locked_period_updated_at: "2026-04-01T00:00:00Z",
            locked_period_updated_by: "user_admin"
          }
        ]
      };
    }
  };

  const state = await loadAccountingLockState(fakePool, "biz-001");
  assert.equal(state.isLocked, true);
  assert.equal(state.lockedThroughDate, "2026-03-31");
  assert.equal(state.note, "Q1 closed");
  assert.equal(state.updatedById, "user_admin");
});

test("saveAccountingLockState persists the lock date and returns the normalized state", async () => {
  let capturedSql = "";
  let capturedParams = null;

  const fakePool = {
    async query(sql, params) {
      capturedSql = sql;
      capturedParams = params;
      return {
        rows: [
          {
            locked_through_date: "2026-06-30",
            locked_period_note: "H1 close",
            locked_period_updated_at: "2026-07-01T00:00:00Z",
            locked_period_updated_by: "user_finance"
          }
        ]
      };
    }
  };

  const state = await saveAccountingLockState(fakePool, "biz-002", "user_finance", {
    lockedThroughDate: "2026-06-30",
    note: "H1 close"
  });

  assert.match(capturedSql, /UPDATE businesses/i);
  assert.equal(capturedParams[0], "2026-06-30");
  assert.equal(capturedParams[1], "H1 close");
  assert.equal(capturedParams[2], "user_finance");
  assert.equal(capturedParams[3], "biz-002");

  assert.equal(state.isLocked, true);
  assert.equal(state.lockedThroughDate, "2026-06-30");
  assert.equal(state.note, "H1 close");
});

test("saveAccountingLockState clears the lock when lockedThroughDate is null", async () => {
  let capturedParams = null;

  const fakePool = {
    async query(_sql, params) {
      capturedParams = params;
      return {
        rows: [
          {
            locked_through_date: null,
            locked_period_note: null,
            locked_period_updated_at: "2026-07-01T00:00:00Z",
            locked_period_updated_by: "user_finance"
          }
        ]
      };
    }
  };

  const state = await saveAccountingLockState(fakePool, "biz-003", "user_finance", {
    lockedThroughDate: null,
    note: null
  });

  assert.equal(capturedParams[0], null, "locked_through_date must be null to clear the lock");
  assert.equal(state.isLocked, false);
});

// ---------------------------------------------------------------------------
// 17. assertDateUnlocked + archiveTransaction interaction
// ---------------------------------------------------------------------------

test("assertDateUnlocked does not throw when lock state has no date (no lock active)", () => {
  assert.doesNotThrow(() =>
    assertDateUnlocked({ lockedThroughDate: null }, "2026-04-01")
  );
});

test("assertDateUnlocked does not throw for a transaction date after the lock period", () => {
  assert.doesNotThrow(() =>
    assertDateUnlocked({ lockedThroughDate: "2026-03-31" }, "2026-04-01")
  );
});

test("assertDateUnlocked throws AccountingPeriodLockedError for a date inside the locked period", () => {
  assert.throws(
    () => assertDateUnlocked({ lockedThroughDate: "2026-03-31" }, "2026-03-15"),
    (err) => {
      assert.ok(err instanceof AccountingPeriodLockedError);
      assert.equal(err.status, 409);
      assert.equal(err.code, "accounting_period_locked");
      return true;
    }
  );
});

test("assertDateUnlocked throws when the transaction date equals the lock date (exact boundary)", () => {
  assert.throws(
    () => assertDateUnlocked({ lockedThroughDate: "2026-03-31" }, "2026-03-31"),
    (err) => {
      assert.ok(err instanceof AccountingPeriodLockedError);
      assert.equal(err.lockedThroughDate, "2026-03-31");
      assert.equal(err.transactionDate, "2026-03-31");
      return true;
    }
  );
});

test("multi-date lock check: date after lock passes, date inside lock throws (mimics PUT original+new date check)", () => {
  const lockState = { lockedThroughDate: "2026-03-31" };

  // First date (after lock) should pass
  assert.doesNotThrow(() => assertDateUnlocked(lockState, "2026-04-01"));

  // Second date (in lock period) should throw
  assert.throws(
    () => assertDateUnlocked(lockState, "2026-03-15"),
    (err) => {
      assert.ok(err instanceof AccountingPeriodLockedError);
      return true;
    }
  );
});

test("multi-date lock check: both dates in locked period — first checked date throws immediately", () => {
  const lockState = { lockedThroughDate: "2026-03-31" };

  assert.throws(
    () => assertDateUnlocked(lockState, "2026-03-01"),
    (err) => {
      assert.ok(err instanceof AccountingPeriodLockedError);
      assert.equal(err.transactionDate, "2026-03-01");
      return true;
    }
  );
});

test("archiveTransaction returns null when no matching transaction is found", async () => {
  const fakePool = {
    async query() {
      return { rows: [] };
    }
  };

  const result = await archiveTransaction({
    pool: fakePool,
    businessId: "biz_x",
    transactionId: "tx_missing",
    userId: "user_x",
    reason: "duplicate"
  });

  assert.equal(result, null);
});

test("archiveTransaction trims whitespace from the reason before storing", async () => {
  let capturedParams = null;
  const fakePool = {
    async query(_sql, params) {
      capturedParams = params;
      return {
        rows: [
          {
            id: "tx_1",
            deleted_at: new Date().toISOString(),
            deleted_by_id: "user_1",
            deleted_reason: "duplicate"
          }
        ]
      };
    }
  };

  await archiveTransaction({
    pool: fakePool,
    businessId: "biz_1",
    transactionId: "tx_1",
    userId: "user_1",
    reason: "  duplicate  "
  });

  // capturedParams[3] is the reason
  assert.equal(capturedParams[3], "duplicate", "whitespace must be trimmed from reason");
});
