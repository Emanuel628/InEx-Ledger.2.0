"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const { attachCentralErrorHandler } = require("./helpers/testPool.js");

const ROUTE_PATH = require.resolve("../routes/accounts.routes.js");
const VALID_ID = "11111111-1111-4111-8111-111111111111";

class FakeAccountingPeriodLockedError extends Error {
  constructor(lockedThroughDate) {
    super(`Transactions dated on or before ${lockedThroughDate} are locked for this business.`);
    this.name = "AccountingPeriodLockedError";
    this.status = 409;
    this.code = "accounting_period_locked";
    this.lockedThroughDate = lockedThroughDate;
  }
}

function loadFixture({ queryImpl, lockCheckImpl } = {}) {
  const originalLoad = Module._load.bind(Module);

  Module._load = function patchedLoad(requestName, parent, isMain) {
    if (/auth\.middleware\.js$/.test(requestName)) {
      return { requireAuth(req, _res, next) { req.user = { id: "user_1" }; next(); } };
    }
    if (/csrf\.middleware\.js$/.test(requestName)) {
      return { requireCsrfProtection: (_req, _res, next) => next() };
    }
    if (/rate-limit\.middleware\.js$/.test(requestName)) {
      return { createDataApiLimiter: () => (_req, _res, next) => next() };
    }
    if (/resolveBusinessIdForUser\.js$/.test(requestName)) {
      return {
        resolveBusinessIdForUser: async () => "biz_1",
        getBusinessScopeForUser: async () => ({ businessIds: ["biz_1"] })
      };
    }
    if (/accountingLockService\.js$/.test(requestName)) {
      return {
        loadAccountingLockState: async () => ({ lockedThroughDate: "2026-01-31" }),
        assertNoLockedPeriodTransactionsForAccount: lockCheckImpl || (async () => {}),
        AccountingPeriodLockedError: FakeAccountingPeriodLockedError
      };
    }
    if (/db\.js$/.test(requestName)) {
      return { pool: { query: queryImpl, connect: async () => ({ query: queryImpl, release() {} }) } };
    }
    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[ROUTE_PATH];
  const router = require(ROUTE_PATH);
  const app = express();
  app.use(express.json());
  app.use("/api/accounts", router);
  attachCentralErrorHandler(app);

  return {
    app,
    cleanup() {
      delete require.cache[ROUTE_PATH];
      Module._load = originalLoad;
    }
  };
}

test("GET / returns a generic 500 for an unexpected DB failure", async () => {
  const fixture = loadFixture({ queryImpl: async () => { throw new Error("connection reset"); } });
  try {
    const response = await request(fixture.app).get("/api/accounts");
    assert.equal(response.status, 500);
    assert.deepEqual(response.body, { error: "Internal server error" });
  } finally {
    fixture.cleanup();
  }
});

test("POST / maps a unique-name violation to a 409", async () => {
  const fixture = loadFixture({
    queryImpl: async () => {
      const err = new Error("duplicate key value violates unique constraint");
      err.code = "23505";
      throw err;
    }
  });
  try {
    const response = await request(fixture.app)
      .post("/api/accounts")
      .send({ name: "Checking", type: "checking" });
    assert.equal(response.status, 409);
    assert.equal(response.body.error, "An account with this name already exists. Please choose a different name.");
  } finally {
    fixture.cleanup();
  }
});

test("POST / returns a generic 500 for an unmapped DB failure", async () => {
  const fixture = loadFixture({ queryImpl: async () => { throw new Error("connection reset"); } });
  try {
    const response = await request(fixture.app)
      .post("/api/accounts")
      .send({ name: "Checking", type: "checking" });
    assert.equal(response.status, 500);
    assert.deepEqual(response.body, { error: "Internal server error" });
  } finally {
    fixture.cleanup();
  }
});

test("PUT /:id returns 404 when the account doesn't belong to the business", async () => {
  const fixture = loadFixture({ queryImpl: async () => ({ rows: [], rowCount: 0 }) });
  try {
    const response = await request(fixture.app).put(`/api/accounts/${VALID_ID}`).send({ name: "New name" });
    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Account not found or access denied.");
  } finally {
    fixture.cleanup();
  }
});

test("PUT /:id responds directly with the locked-period error's extra fields, bypassing the generic envelope", async () => {
  const fixture = loadFixture({
    queryImpl: async (sql) => {
      if (/SELECT id, type FROM accounts/i.test(sql)) {
        return { rows: [{ id: VALID_ID, type: "checking" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    lockCheckImpl: async () => {
      throw new FakeAccountingPeriodLockedError("2026-01-31");
    }
  });
  try {
    const response = await request(fixture.app)
      .put(`/api/accounts/${VALID_ID}`)
      .send({ type: "savings" });
    assert.equal(response.status, 409);
    assert.equal(response.body.code, "accounting_period_locked");
    assert.equal(response.body.locked_through_date, "2026-01-31");
    assert.match(response.body.error, /locked for this business/);
  } finally {
    fixture.cleanup();
  }
});

test("PUT /:id maps a unique-name violation to a 409", async () => {
  const fixture = loadFixture({
    queryImpl: async (sql) => {
      if (/SELECT id, type FROM accounts/i.test(sql)) {
        return { rows: [{ id: VALID_ID, type: "checking" }], rowCount: 1 };
      }
      if (/UPDATE accounts/i.test(sql)) {
        const err = new Error("duplicate key value violates unique constraint");
        err.code = "23505";
        throw err;
      }
      return { rows: [], rowCount: 0 };
    }
  });
  try {
    const response = await request(fixture.app)
      .put(`/api/accounts/${VALID_ID}`)
      .send({ name: "Existing Name" });
    assert.equal(response.status, 409);
    assert.equal(response.body.error, "An account with this name already exists. Please choose a different name.");
  } finally {
    fixture.cleanup();
  }
});

test("DELETE /:id rejects a non-UUID account id", async () => {
  const fixture = loadFixture();
  try {
    const response = await request(fixture.app).delete("/api/accounts/not-a-uuid");
    assert.equal(response.status, 400);
    assert.equal(response.body.error, "Invalid account ID.");
  } finally {
    fixture.cleanup();
  }
});

test("DELETE /:id returns 409 when the account is in use by active transactions", async () => {
  const fixture = loadFixture({
    queryImpl: async (sql) => {
      if (/FROM transactions WHERE account_id/i.test(sql)) {
        return { rows: [{ count: "3" }], rowCount: 1 };
      }
      return { rows: [{ count: "0" }], rowCount: 1 };
    }
  });
  try {
    const response = await request(fixture.app).delete(`/api/accounts/${VALID_ID}`);
    assert.equal(response.status, 409);
    assert.equal(response.body.error, "This account cannot be deleted because it is in use.");
  } finally {
    fixture.cleanup();
  }
});

test("DELETE /:id returns 404 when nothing was deleted", async () => {
  const fixture = loadFixture({
    queryImpl: async (sql) => {
      if (/FROM transactions WHERE account_id|FROM recurring_transactions WHERE account_id/i.test(sql)) {
        return { rows: [{ count: "0" }], rowCount: 1 };
      }
      if (/DELETE FROM accounts/i.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    }
  });
  try {
    const response = await request(fixture.app).delete(`/api/accounts/${VALID_ID}`);
    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Account not found or access denied.");
  } finally {
    fixture.cleanup();
  }
});

test("DELETE /:id rolls back and returns a generic 500 when the transaction fails", async () => {
  let rolledBack = false;
  const fixture = loadFixture({
    queryImpl: async (sql) => {
      if (/FROM transactions WHERE account_id|FROM recurring_transactions WHERE account_id/i.test(sql)) {
        return { rows: [{ count: "0" }], rowCount: 1 };
      }
      if (sql === "BEGIN") return {};
      if (sql === "ROLLBACK") {
        rolledBack = true;
        return {};
      }
      if (/UPDATE transactions SET account_id/i.test(sql)) {
        throw new Error("connection reset");
      }
      return { rows: [], rowCount: 0 };
    }
  });
  try {
    const response = await request(fixture.app).delete(`/api/accounts/${VALID_ID}`);
    assert.equal(response.status, 500);
    assert.deepEqual(response.body, { error: "Internal server error" });
    assert.equal(rolledBack, true);
  } finally {
    fixture.cleanup();
  }
});

test("DELETE /:id succeeds and commits", async () => {
  const fixture = loadFixture({
    queryImpl: async (sql) => {
      if (/FROM transactions WHERE account_id|FROM recurring_transactions WHERE account_id/i.test(sql)) {
        return { rows: [{ count: "0" }], rowCount: 1 };
      }
      if (/DELETE FROM accounts/i.test(sql)) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
  });
  try {
    const response = await request(fixture.app).delete(`/api/accounts/${VALID_ID}`);
    assert.equal(response.status, 200);
    assert.equal(response.body.message, "Account deleted successfully.");
  } finally {
    fixture.cleanup();
  }
});
