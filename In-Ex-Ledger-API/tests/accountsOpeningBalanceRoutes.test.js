"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const ROUTE_PATH = require.resolve("../routes/accounts.routes.js");

function loadRouterWithState() {
  const originalLoad = Module._load.bind(Module);
  const state = {
    queries: []
  };

  const fakePool = {
    async query(sql, params) {
      state.queries.push({ sql, params });

      if (/INSERT INTO accounts/i.test(sql)) {
        return {
          rows: [{
            id: "00000000-0000-4000-8000-000000000001",
            business_id: "00000000-0000-4000-8000-000000000101",
            name: params[2],
            type: params[3],
            opening_balance: String(params[4]),
            opening_balance_as_of: params[5],
            created_at: "2026-05-31T00:00:00.000Z"
          }],
          rowCount: 1
        };
      }

      if (/SELECT id, type FROM accounts/i.test(sql)) {
        return {
          rows: [{
            id: params[0],
            type: "checking"
          }],
          rowCount: 1
        };
      }

      if (/UPDATE accounts/i.test(sql)) {
        return {
          rows: [{
            id: params[5],
            business_id: params[6],
            name: params[0] || "Main Checking",
            type: params[1] || "checking",
            opening_balance: String(params[2] ?? "125.5"),
            opening_balance_as_of: params[3] ? params[4] : "2026-01-01"
          }],
          rowCount: 1
        };
      }

      throw new Error(`Unhandled SQL: ${sql}`);
    }
  };

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return { pool: fakePool };
    }
    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return { requireAuth(req, _res, next) { req.user = { id: "user-1" }; next(); } };
    }
    if (requestName === "../middleware/csrf.middleware.js" || /csrf\.middleware\.js$/.test(requestName)) {
      return { requireCsrfProtection(_req, _res, next) { next(); } };
    }
    if (requestName === "../middleware/rate-limit.middleware.js" || /rate-limit\.middleware\.js$/.test(requestName)) {
      return { createDataApiLimiter() { return (_req, _res, next) => next(); } };
    }
    if (requestName === "../api/utils/resolveBusinessIdForUser.js" || /resolveBusinessIdForUser\.js$/.test(requestName)) {
      return {
        resolveBusinessIdForUser: async () => "00000000-0000-4000-8000-000000000101",
        getBusinessScopeForUser: async () => ({ businessIds: ["00000000-0000-4000-8000-000000000101"] })
      };
    }
    if (requestName === "../services/accountingLockService.js" || /accountingLockService\.js$/.test(requestName)) {
      return {
        loadAccountingLockState: async () => null,
        assertNoLockedPeriodTransactionsForAccount: async () => null,
        AccountingPeriodLockedError: class AccountingPeriodLockedError extends Error {}
      };
    }
    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return {
        logError() {},
        logWarn() {},
        logInfo() {}
      };
    }
    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[ROUTE_PATH];

  try {
    const router = require("../routes/accounts.routes.js");
    const app = express();
    app.use(express.json());
    app.use("/api/accounts", router);
    return { app, state };
  } finally {
    Module._load = originalLoad;
  }
}

test("POST /api/accounts persists opening balance fields", async () => {
  const { app, state } = loadRouterWithState();

  const response = await request(app)
    .post("/api/accounts")
    .send({
      name: "Legacy Checking",
      type: "checking",
      opening_balance: "125.50",
      opening_balance_as_of: "2026-01-01"
    });

  assert.equal(response.status, 201);
  assert.equal(response.body.opening_balance, "125.5");
  assert.equal(response.body.opening_balance_as_of, "2026-01-01");

  const insertQuery = state.queries.find(({ sql }) => /INSERT INTO accounts/i.test(sql));
  assert.ok(insertQuery);
  assert.equal(insertQuery.params[4], 125.5);
  assert.equal(insertQuery.params[5], "2026-01-01");
});

test("PUT /api/accounts/:id can clear opening_balance_as_of while updating opening balance", async () => {
  const { app, state } = loadRouterWithState();

  const response = await request(app)
    .put("/api/accounts/00000000-0000-4000-8000-000000000001")
    .send({
      opening_balance: "250.00",
      opening_balance_as_of: null
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.opening_balance, "250");
  assert.equal(response.body.opening_balance_as_of, null);

  const updateQuery = state.queries.find(({ sql }) => /UPDATE accounts/i.test(sql));
  assert.ok(updateQuery);
  assert.equal(updateQuery.params[2], 250);
  assert.equal(updateQuery.params[3], true);
  assert.equal(updateQuery.params[4], null);
});

test("POST /api/accounts rejects invalid opening_balance", async () => {
  const { app, state } = loadRouterWithState();

  const response = await request(app)
    .post("/api/accounts")
    .send({
      name: "Legacy Checking",
      type: "checking",
      opening_balance: "abc"
    });

  assert.equal(response.status, 400);
  assert.match(response.body.error || "", /opening_balance/i);
  assert.equal(state.queries.length, 0);
});
