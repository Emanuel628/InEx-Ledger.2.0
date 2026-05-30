"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const cookieParser = require("cookie-parser");
const request = require("supertest");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-tx-filters";
process.env.CSRF_SECRET = process.env.CSRF_SECRET || "test-csrf-secret-tx-filters";
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://local:test@localhost:5432/inex_ledger_test";

const { signToken } = require("../middleware/auth.middleware.js");
const {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  ensureCsrfCookie
} = require("../middleware/csrf.middleware.js");

const TEST_USER_ID = "00000000-0000-4000-8000-000000000311";
const VALID_ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";
const VALID_BUSINESS_ID = "22222222-2222-4222-8222-222222222222";

function makeToken() {
  return signToken({ id: TEST_USER_ID, email: "filters@example.com", mfa_enabled: false });
}

function csrfHeaders(token) {
  return {
    [CSRF_HEADER_NAME]: token,
    Cookie: `${CSRF_COOKIE_NAME}=${token}`
  };
}

function buildApp(router) {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use(ensureCsrfCookie);
  app.use("/api/transactions", router);
  return app;
}

// Stub the pool so we can inspect the SQL + params the route builds.
function makeStubbedPool() {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      // First call: main SELECT — return one fake row.
      // Second call: count.
      if (/SELECT t\.id/.test(sql)) {
        return {
          rows: [{
            id: "tx-1",
            business_id: VALID_BUSINESS_ID,
            account_id: VALID_ACCOUNT_ID,
            type: "expense",
            amount: 10,
            date: "2026-05-01",
            description: "test",
            currency: "USD"
          }],
          rowCount: 1
        };
      }
      if (/transaction_count/i.test(sql)) {
        return {
          rows: [{
            transaction_count: 1,
            income_total: "0",
            expense_total: "10",
            current_month_count: 1,
            current_year_income: "0",
            current_year_expenses: "10",
            previous_year_income: "0",
            previous_year_expenses: "0"
          }],
          rowCount: 1
        };
      }
      return { rows: [], rowCount: 0 };
    }
  };
}

// Mount the route module with the pool / auth helpers stubbed via Module._load.
function loadTransactionsRouterWithStubs() {
  const Module = require("node:module");
  const originalLoad = Module._load.bind(Module);
  const stubbedPool = makeStubbedPool();

  Module._load = function (request, parent, isMain) {
    if (/db\.js$/.test(request)) {
      return { pool: stubbedPool };
    }
    if (/encryptionService\.js$/.test(request)) {
      return {
        encrypt: (v) => v,
        decrypt: (v) => v,
        isEncrypted: () => false
      };
    }
    if (/resolveBusinessIdForUser\.js$/.test(request)) {
      return {
        resolveBusinessIdForUser: async () => VALID_BUSINESS_ID,
        getBusinessScopeForUser: async () => ({ businessIds: [VALID_BUSINESS_ID] })
      };
    }
    return originalLoad(request, parent, isMain);
  };

  try {
    delete require.cache[require.resolve("../routes/transactions.routes.js")];
    const router = require("../routes/transactions.routes.js");
    return { router, stubbedPool };
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../routes/transactions.routes.js")];
  }
}

test("GET /api/transactions returns 400 when account_id is not a valid UUID", async () => {
  const { router } = loadTransactionsRouterWithStubs();
  const app = buildApp(router);
  const csrf = "csrf-bad-acct";
  const auth = makeToken();
  const res = await request(app)
    .get("/api/transactions?account_id=not-a-uuid")
    .set("Authorization", `Bearer ${auth}`)
    .set(csrfHeaders(csrf));
  assert.equal(res.status, 400);
  assert.match(res.body.error || "", /account_id/i);
});

test("GET /api/transactions accepts valid account_id and threads it into the SQL", async () => {
  const { router, stubbedPool } = loadTransactionsRouterWithStubs();
  const app = buildApp(router);
  const csrf = "csrf-good-acct";
  const auth = makeToken();
  const res = await request(app)
    .get(`/api/transactions?account_id=${VALID_ACCOUNT_ID}`)
    .set("Authorization", `Bearer ${auth}`)
    .set(csrfHeaders(csrf));
  assert.equal(res.status, 200);
  assert.equal(res.body.account_id, VALID_ACCOUNT_ID);
  const mainQuery = stubbedPool.calls.find((c) => /SELECT t\.id/.test(c.sql) && c.params.includes(VALID_ACCOUNT_ID));
  assert.ok(mainQuery, "main SELECT should have been issued");
  assert.ok(mainQuery.sql.includes("AND t.account_id ="), "SQL should include account_id filter");
  assert.ok(mainQuery.params.includes(VALID_ACCOUNT_ID), "params should carry the account_id");
});

test("GET /api/transactions?all=true bumps limit to the hard cap and reports returned_all", async () => {
  const { router, stubbedPool } = loadTransactionsRouterWithStubs();
  const app = buildApp(router);
  const csrf = "csrf-all";
  const auth = makeToken();
  const res = await request(app)
    .get(`/api/transactions?all=true`)
    .set("Authorization", `Bearer ${auth}`)
    .set(csrfHeaders(csrf));
  assert.equal(res.status, 200);
  assert.equal(res.body.returned_all, true);
  assert.equal(res.body.limit, 50000);
  const mainQuery = stubbedPool.calls.find((c) => /SELECT t\.id/.test(c.sql) && c.params.includes(50000));
  assert.ok(mainQuery.params.includes(50000), "limit param should be the 50k hard cap");
});

test("GET /api/transactions defaults to limit=100 when neither all nor limit are passed", async () => {
  const { router, stubbedPool } = loadTransactionsRouterWithStubs();
  const app = buildApp(router);
  const csrf = "csrf-default";
  const auth = makeToken();
  const res = await request(app)
    .get(`/api/transactions`)
    .set("Authorization", `Bearer ${auth}`)
    .set(csrfHeaders(csrf));
  assert.equal(res.status, 200);
  assert.equal(res.body.limit, 100);
  assert.equal(res.body.returned_all, false);
});

test("GET /api/transactions caps an explicit huge limit to 5000 when all is not set", async () => {
  const { router, stubbedPool } = loadTransactionsRouterWithStubs();
  const app = buildApp(router);
  const csrf = "csrf-cap";
  const auth = makeToken();
  const res = await request(app)
    .get(`/api/transactions?limit=99999`)
    .set("Authorization", `Bearer ${auth}`)
    .set(csrfHeaders(csrf));
  assert.equal(res.status, 200);
  assert.equal(res.body.limit, 5000);
});

test("GET /api/transactions returns 400 when category_id is not a valid UUID", async () => {
  const { router } = loadTransactionsRouterWithStubs();
  const app = buildApp(router);
  const csrf = "csrf-bad-category";
  const auth = makeToken();
  const res = await request(app)
    .get("/api/transactions?category_id=not-a-uuid")
    .set("Authorization", `Bearer ${auth}`)
    .set(csrfHeaders(csrf));
  assert.equal(res.status, 400);
  assert.match(res.body.error || "", /category_id/i);
});

test("GET /api/transactions threads type, category, search, and period filters into the SQL", async () => {
  const { router, stubbedPool } = loadTransactionsRouterWithStubs();
  const app = buildApp(router);
  const csrf = "csrf-filter-combo";
  const auth = makeToken();
  const categoryId = "33333333-3333-4333-8333-333333333333";
  const res = await request(app)
    .get(`/api/transactions?type=income&category_id=${categoryId}&search=stripe&period=last-month`)
    .set("Authorization", `Bearer ${auth}`)
    .set(csrfHeaders(csrf));

  assert.equal(res.status, 200);
  assert.equal(res.body.type, "income");
  assert.equal(res.body.category_id, categoryId);
  assert.equal(res.body.search, "stripe");
  assert.equal(res.body.period, "last-month");
  assert.equal(res.body.summary.transaction_count, 1);

  const mainQuery = stubbedPool.calls.find((c) => /SELECT t\.id/.test(c.sql) && c.params.includes(categoryId));
  assert.ok(mainQuery, "main SELECT should have been issued");
  assert.match(mainQuery.sql, /t\.category_id =/i);
  assert.match(mainQuery.sql, /t\.type =/i);
  assert.match(mainQuery.sql, /COALESCE\(t\.description, ''\) ILIKE/i);
  assert.match(mainQuery.sql, /t\.date >=/i);
  assert.ok(mainQuery.params.includes(categoryId));
  assert.ok(mainQuery.params.includes("income"));
  assert.ok(mainQuery.params.includes("%stripe%"));
});
