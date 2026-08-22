/**
 * Test Harness Helpers
 *
 * Shared utilities for all node:test suites in this project.
 *
 * Exports:
 *   makeFakePool(rows, opts)  – builds a minimal pg-Pool double
 *   buildTestApp(router, mountPath)  – wraps a router in a minimal Express
 *                                      app that mirrors the production middleware
 *                                      stack (cookie-parser, JSON body, CSRF cookie)
 *   makeAuthToken(extra)      – signs a short-lived JWT for a test user
 *   makeMfaToken()            – signs a JWT for a user with MFA enabled
 *   csrfPair()                – returns { token, headers } ready to attach to requests
 *
 * Design goals:
 *   • No real database connection — all pool interactions use in-memory fakes.
 *   • No network calls — every dependency is mocked at the module boundary.
 *   • Works with node --test and supertest without any extra configuration.
 */

"use strict";

// Ensure required env vars are set before any module that reads them is loaded.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-harness-jwt-secret";
process.env.CSRF_SECRET = process.env.CSRF_SECRET || "test-harness-csrf-secret";
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://inex:inex@localhost:5432/inex_ledger_test";
process.env.FIELD_ENCRYPTION_KEY =
  process.env.FIELD_ENCRYPTION_KEY ||
  "0000000000000000000000000000000000000000000000000000000000000000";

const express = require("express");
const cookieParser = require("cookie-parser");

const { signToken } = require("../../middleware/auth.middleware.js");
const { ACCESS_TOKEN_COOKIE } = require("../../utils/authUtils.js");
const {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  generateCsrfToken,
  ensureCsrfCookie,
} = require("../../middleware/csrf.middleware.js");

// ---------------------------------------------------------------------------
// Fake pool factory
// ---------------------------------------------------------------------------

/**
 * Creates a minimal pg-Pool double.
 *
 * @param {Array<object>|Function} rowsOrFn
 *   - Array: every `pool.query()` call returns `{ rows: rowsOrFn, rowCount: rowsOrFn.length }`.
 *   - Function: called with (sql, params) and must return `{ rows, rowCount }` (or a Promise).
 *   - Omit / pass null: every call returns `{ rows: [], rowCount: 0 }`.
 *
 * @param {object} [opts]
 * @param {Function} [opts.onQuery]  Optional spy called before each query.
 *
 * @returns {{ query: Function, capturedQueries: Array }}
 *   The fake pool and a `capturedQueries` array of `{ sql, params }` for
 *   asserting what was called.
 */
function makeFakePool(rowsOrFn = null, opts = {}) {
  const capturedQueries = [];

  async function query(sql, params) {
    capturedQueries.push({ sql, params });
    if (opts.onQuery) opts.onQuery(sql, params);

    if (typeof rowsOrFn === "function") {
      return rowsOrFn(sql, params);
    }
    const rows = Array.isArray(rowsOrFn) ? rowsOrFn : [];
    return { rows, rowCount: rows.length };
  }

  return { query, capturedQueries };
}

/**
 * Creates a sequence-aware fake pool that returns different row sets
 * for successive calls.
 *
 * @param {Array<Array<object>>} sequence  Each element is the `rows` array
 *   returned by the nth call.  Calls beyond the sequence length return `[]`.
 */
function makeFakePoolSequence(sequence) {
  let callIndex = 0;
  const capturedQueries = [];

  async function query(sql, params) {
    capturedQueries.push({ sql, params });
    const rows = sequence[callIndex] ?? [];
    callIndex += 1;
    return { rows, rowCount: rows.length };
  }

  return { query, capturedQueries };
}

// ---------------------------------------------------------------------------
// Test app factory
// ---------------------------------------------------------------------------

/**
 * Wraps a router in a minimal Express app that mirrors the production
 * middleware stack used in server.js, without requiring a database or Redis.
 *
 * @param {import('express').Router} router
 * @param {string} [mountPath="/api/test"]
 * @returns {import('express').Application}
 */
function buildTestApp(router, mountPath = "/api/test") {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use(ensureCsrfCookie);
  app.use(mountPath, router);
  return app;
}

/**
 * Attaches a stand-in for server.js's real final Express error handler:
 * status from err.status/err.statusCode (default 500), the error's own
 * message for <500 responses, a generic "Internal server error" for 500s,
 * and an optional logError(...) call so tests can assert on it.
 *
 * Route files using utils/apiError.js's asyncRoute rely on next(err)
 * reaching a handler shaped like this one -- tests that mount such a route
 * standalone (without importing all of server.js) need to attach this,
 * the same way server.js does for the real app.
 *
 * @param {import('express').Application} app
 * @param {{ logError?: Function }} [opts] Pass a spy to assert on log calls.
 */
function attachCentralErrorHandler(app, { logError } = {}) {
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (logError) {
      logError("Unhandled error", {
        status,
        method: req.method,
        path: req.path,
        message: err.message,
        ...(err.code && { code: err.code }),
        ...(err.constraint && { constraint: err.constraint }),
        ...(req.user?.id && { userId: req.user.id }),
        ...(err.routeParams && { params: err.routeParams })
      });
    }
    const message = status < 500 || err.expose ? err.message : "Internal server error";
    const responseFields =
      status < 500 && err.responseFields && typeof err.responseFields === "object"
        ? err.responseFields
        : {};
    res.status(status).json({ error: message, ...responseFields });
  });
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

/**
 * Signs a short-lived JWT for a test user.
 *
 * @param {object} [extra]  Additional claims merged into the token payload.
 * @returns {string} Signed JWT.
 */
function makeAuthToken(extra = {}) {
  return signToken({
    id: "00000000-0000-4000-8000-000000000141",
    email: "test@inexledger.local",
    mfa_enabled: false,
    ...extra,
  });
}

/**
 * Signs a JWT for a user that has MFA enabled.
 * Routes protected by `requireMfa` will reject requests without this token.
 */
function makeMfaToken(extra = {}) {
  return signToken({
    id: "00000000-0000-4000-8000-000000000142",
    email: "mfa@inexledger.local",
    mfa_enabled: true,
    mfa_authenticated: true,
    ...extra,
  });
}

// ---------------------------------------------------------------------------
// CSRF helpers
// ---------------------------------------------------------------------------

/**
 * Generates a CSRF token and returns both the token value and the
 * headers/cookies object ready to attach to supertest requests.
 *
 * @returns {{ token: string, headers: object }}
 */
function csrfPair() {
  const token = generateCsrfToken();
  return {
    token,
    headers: {
      [CSRF_HEADER_NAME]: token,
      Cookie: `${CSRF_COOKIE_NAME}=${token}`,
    },
  };
}

/**
 * Returns the Cookie header value for cookie-backed auth.
 *
 * @param {string} jwt
 * @returns {string} e.g. "access_token=eyJ..."
 */
function authCookie(jwt) {
  return `${ACCESS_TOKEN_COOKIE}=${jwt}`;
}

// ---------------------------------------------------------------------------
// Fixture data builders
// ---------------------------------------------------------------------------

/**
 * Returns a minimal user row matching the shape returned by the database.
 */
function makeUserRow(overrides = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000151",
    email: "fixture@inexledger.local",
    password_hash: "$2b$12$placeholder",
    mfa_enabled: false,
    created_at: new Date("2026-01-01T00:00:00Z").toISOString(),
    ...overrides,
  };
}

/**
 * Returns a minimal business row.
 */
function makeBusinessRow(overrides = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000251",
    user_id: "00000000-0000-4000-8000-000000000151",
    name: "Fixture Business LLC",
    region: "US",
    language: "en",
    created_at: new Date("2026-01-01T00:00:00Z").toISOString(),
    ...overrides,
  };
}

/**
 * Returns a minimal transaction row.
 */
function makeTransactionRow(overrides = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000351",
    business_id: "00000000-0000-4000-8000-000000000251",
    account_id: "00000000-0000-4000-8000-000000000451",
    category_id: "00000000-0000-4000-8000-000000000551",
    type: "expense",
    amount: "49.99",
    date: "2026-03-15",
    description: "Office Supplies",
    cleared: false,
    deleted_at: null,
    is_void: false,
    is_adjustment: false,
    created_at: new Date("2026-03-15T10:00:00Z").toISOString(),
    ...overrides,
  };
}

/**
 * Returns a minimal account row.
 */
function makeAccountRow(overrides = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000451",
    business_id: "00000000-0000-4000-8000-000000000251",
    name: "Checking",
    type: "asset",
    created_at: new Date("2026-01-01T00:00:00Z").toISOString(),
    ...overrides,
  };
}

/**
 * Returns a minimal category row.
 */
function makeCategoryRow(overrides = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000551",
    business_id: "00000000-0000-4000-8000-000000000251",
    name: "Office Supplies",
    kind: "expense",
    color: "blue",
    tax_map_us: "office_expense",
    tax_map_ca: null,
    is_default: true,
    created_at: new Date("2026-01-01T00:00:00Z").toISOString(),
    ...overrides,
  };
}

module.exports = {
  makeFakePool,
  makeFakePoolSequence,
  buildTestApp,
  attachCentralErrorHandler,
  makeAuthToken,
  makeMfaToken,
  csrfPair,
  authCookie,
  makeUserRow,
  makeBusinessRow,
  makeTransactionRow,
  makeAccountRow,
  makeCategoryRow,
};
