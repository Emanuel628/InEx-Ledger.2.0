/**
 * Test Harness Self-Tests
 *
 * Verifies that the shared helpers in tests/helpers/testPool.js work
 * correctly. These tests run entirely in-memory (no database, no network).
 *
 * Run:  node --test tests/testHarness.test.js
 */

"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const request = require("supertest");
const express = require("express");

const {
  makeFakePool,
  makeFakePoolSequence,
  buildTestApp,
  makeAuthToken,
  makeMfaToken,
  csrfPair,
  bearerHeader,
  makeUserRow,
  makeBusinessRow,
  makeTransactionRow,
  makeAccountRow,
  makeCategoryRow,
} = require("./helpers/testPool.js");

const { requireAuth } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");

// ---------------------------------------------------------------------------
// makeFakePool
// ---------------------------------------------------------------------------

test("makeFakePool: returns empty rows by default", async () => {
  const pool = makeFakePool();
  const result = await pool.query("SELECT 1");
  assert.deepEqual(result.rows, []);
  assert.equal(result.rowCount, 0);
});

test("makeFakePool: returns provided rows array", async () => {
  const rows = [{ id: "a" }, { id: "b" }];
  const pool = makeFakePool(rows);
  const result = await pool.query("SELECT id FROM users");
  assert.deepEqual(result.rows, rows);
  assert.equal(result.rowCount, 2);
});

test("makeFakePool: calls custom function with sql and params", async () => {
  let calledWith = null;
  const pool = makeFakePool((sql, params) => {
    calledWith = { sql, params };
    return { rows: [{ ok: true }], rowCount: 1 };
  });

  const result = await pool.query("SELECT $1", ["hello"]);
  assert.equal(result.rows[0].ok, true);
  assert.deepEqual(calledWith, { sql: "SELECT $1", params: ["hello"] });
});

test("makeFakePool: captures query history in capturedQueries", async () => {
  const pool = makeFakePool([{ id: "x" }]);
  await pool.query("SELECT 1");
  await pool.query("SELECT 2", [42]);
  assert.equal(pool.capturedQueries.length, 2);
  assert.equal(pool.capturedQueries[0].sql, "SELECT 1");
  assert.deepEqual(pool.capturedQueries[1].params, [42]);
});

test("makeFakePool: onQuery spy is called for each query", async () => {
  const calls = [];
  const pool = makeFakePool(null, {
    onQuery: (sql) => calls.push(sql),
  });
  await pool.query("SELECT A");
  await pool.query("SELECT B");
  assert.deepEqual(calls, ["SELECT A", "SELECT B"]);
});

// ---------------------------------------------------------------------------
// makeFakePoolSequence
// ---------------------------------------------------------------------------

test("makeFakePoolSequence: returns rows in sequence order", async () => {
  const pool = makeFakePoolSequence([
    [{ id: "first" }],
    [{ id: "second" }, { id: "third" }],
    [],
  ]);

  const r1 = await pool.query("Q1");
  const r2 = await pool.query("Q2");
  const r3 = await pool.query("Q3");
  const r4 = await pool.query("Q4"); // beyond sequence length

  assert.equal(r1.rows[0].id, "first");
  assert.equal(r2.rowCount, 2);
  assert.equal(r3.rowCount, 0);
  assert.equal(r4.rowCount, 0); // falls back to []
});

// ---------------------------------------------------------------------------
// makeAuthToken / makeMfaToken
// ---------------------------------------------------------------------------

test("makeAuthToken: returns a valid JWT accepted by requireAuth", async () => {
  const router = express.Router();
  router.use(requireAuth);
  router.get("/ping", (_req, res) => res.json({ ok: true }));

  const app = buildTestApp(router);
  const token = makeAuthToken();

  const res = await request(app)
    .get("/api/test/ping")
    .set("Authorization", bearerHeader(token));

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test("makeAuthToken: extra claims are embedded in the token", async () => {
  const { verifyToken } = require("../middleware/auth.middleware.js");
  const token = makeAuthToken({ role: "admin", custom: 42 });
  const payload = verifyToken(token);
  assert.equal(payload.role, "admin");
  assert.equal(payload.custom, 42);
});

test("makeMfaToken: sets mfa_enabled=true", async () => {
  const { verifyToken } = require("../middleware/auth.middleware.js");
  const token = makeMfaToken();
  const payload = verifyToken(token);
  assert.equal(payload.mfa_enabled, true);
});

test("requireAuth: rejects request with no token", async () => {
  const router = express.Router();
  router.use(requireAuth);
  router.get("/ping", (_req, res) => res.json({ ok: true }));

  const app = buildTestApp(router);
  const res = await request(app).get("/api/test/ping");
  assert.equal(res.status, 401);
});

// ---------------------------------------------------------------------------
// csrfPair
// ---------------------------------------------------------------------------

test("csrfPair: token passes requireCsrfProtection", async () => {
  const router = express.Router();
  router.use(requireCsrfProtection);
  router.post("/action", (_req, res) => res.json({ ok: true }));

  const app = buildTestApp(router);
  const { headers } = csrfPair();

  const res = await request(app)
    .post("/api/test/action")
    .set(headers);

  assert.equal(res.status, 200);
});

test("csrfPair: missing CSRF header causes 403", async () => {
  const router = express.Router();
  router.use(requireCsrfProtection);
  router.post("/action", (_req, res) => res.json({ ok: true }));

  const app = buildTestApp(router);

  const res = await request(app).post("/api/test/action");
  assert.equal(res.status, 403);
});

// ---------------------------------------------------------------------------
// Fixture row builders
// ---------------------------------------------------------------------------

test("makeUserRow: returns a valid user-shaped object", () => {
  const row = makeUserRow();
  assert.ok(row.id);
  assert.ok(row.email.includes("@"));
  assert.equal(typeof row.mfa_enabled, "boolean");
});

test("makeUserRow: overrides are applied", () => {
  const row = makeUserRow({ email: "custom@test.com", mfa_enabled: true });
  assert.equal(row.email, "custom@test.com");
  assert.equal(row.mfa_enabled, true);
});

test("makeBusinessRow: returns a valid business-shaped object", () => {
  const row = makeBusinessRow();
  assert.ok(["US", "CA"].includes(row.region));
  assert.ok(["en", "es", "fr"].includes(row.language));
});

test("makeTransactionRow: amount is a string (matches DB text/numeric)", () => {
  const row = makeTransactionRow();
  assert.equal(typeof row.amount, "string");
  assert.ok(Number.parseFloat(row.amount) > 0);
});

test("makeTransactionRow: overrides work for type and amount", () => {
  const row = makeTransactionRow({ type: "income", amount: "1500.00" });
  assert.equal(row.type, "income");
  assert.equal(row.amount, "1500.00");
});

test("makeAccountRow: has expected type field", () => {
  const row = makeAccountRow();
  assert.ok(["asset", "liability"].includes(row.type));
});

test("makeCategoryRow: has expected kind field", () => {
  const row = makeCategoryRow();
  assert.ok(["income", "expense"].includes(row.kind));
});

// ---------------------------------------------------------------------------
// buildTestApp
// ---------------------------------------------------------------------------

test("buildTestApp: mounts router at custom path", async () => {
  const router = express.Router();
  router.get("/hello", (_req, res) => res.json({ hello: "world" }));
  const app = buildTestApp(router, "/api/v2");

  const res = await request(app).get("/api/v2/hello");
  assert.equal(res.status, 200);
  assert.equal(res.body.hello, "world");
});

test("buildTestApp: returns 404 for wrong path", async () => {
  const router = express.Router();
  router.get("/hello", (_req, res) => res.json({ ok: true }));
  const app = buildTestApp(router, "/api/test");

  const res = await request(app).get("/wrong/path");
  assert.equal(res.status, 404);
});
