"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const RECEIPTS_ROUTE_PATH = require.resolve("../routes/receipts.routes.js");

function loadReceiptsRouter(options = {}) {
  const originalLoad = Module._load.bind(Module);
  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "receipt-upload-route-"));
  const state = {
    businessId: options.businessId || "00000000-0000-4000-8000-0000000000b1",
    transactionRow: options.transactionRow,
    insertParams: null,
    lockCheckDate: null,
    queryCount: 0
  };

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        requireAuth(req, _res, next) {
          req.user = { id: "00000000-0000-4000-8000-000000000171" };
          next();
        }
      };
    }
    if (requestName === "../middleware/csrf.middleware.js" || /csrf\.middleware\.js$/.test(requestName)) {
      return {
        requireCsrfProtection(_req, _res, next) {
          next();
        }
      };
    }
    if (requestName === "../middleware/rateLimitTiers.js" || /rateLimitTiers\.js$/.test(requestName)) {
      return {
        createReceiptLimiter() {
          return (_req, _res, next) => next();
        }
      };
    }
    if (requestName === "../api/utils/resolveBusinessIdForUser.js" || /resolveBusinessIdForUser\.js$/.test(requestName)) {
      return {
        resolveBusinessIdForUser: async () => state.businessId,
        getBusinessScopeForUser: async () => ({ businessIds: [state.businessId] })
      };
    }
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql, params) {
            state.queryCount += 1;

            if (/FROM transactions/i.test(sql)) {
              if (!state.transactionRow) {
                return { rowCount: 0, rows: [] };
              }
              return { rowCount: 1, rows: [state.transactionRow] };
            }

            if (/INSERT INTO receipts/i.test(sql)) {
              state.insertParams = params;
              return { rowCount: 1, rows: [] };
            }

            throw new Error(`Unexpected query in test double: ${sql}`);
          }
        }
      };
    }
    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return {
        logError() {},
        logWarn() {},
        logInfo() {}
      };
    }
    if (requestName === "../services/subscriptionService.js" || /subscriptionService\.js$/.test(requestName)) {
      return {
        getSubscriptionSnapshotForBusiness: async () => ({ plan: "test" }),
        hasFeatureAccess: () => true
      };
    }
    if (requestName === "../services/receiptStorage.js" || /receiptStorage\.js$/.test(requestName)) {
      return {
        getReceiptStorageDir: () => storageDir,
        requirePersistentReceiptStorage(_req, _res, next) {
          next();
        }
      };
    }
    if (requestName === "../services/accountingLockService.js" || /accountingLockService\.js$/.test(requestName)) {
      return {
        loadAccountingLockState: async () => ({
          lockedThroughDate: options.lockedThroughDate || null
        }),
        assertDateUnlocked(_lockState, transactionDate) {
          state.lockCheckDate = transactionDate;
          if (options.lockError) {
            throw options.lockError;
          }
        }
      };
    }
    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[RECEIPTS_ROUTE_PATH];

  try {
    const router = require("../routes/receipts.routes.js");
    return {
      router,
      state,
      cleanup() {
        delete require.cache[RECEIPTS_ROUTE_PATH];
        fs.rmSync(storageDir, { recursive: true, force: true });
      }
    };
  } finally {
    Module._load = originalLoad;
  }
}

function buildApp(router) {
  const app = express();
  app.use("/api/receipts", router);
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message });
  });
  return app;
}

function uploadReceipt(agent, transactionId) {
  return agent
    .post("/api/receipts")
    .field("transaction_id", transactionId)
    .attach("receipt", Buffer.from("fake-image"), {
      filename: "receipt.png",
      contentType: "image/png"
    });
}

test("receipt upload rejects malformed transaction_id values before any database write", async () => {
  const fixture = loadReceiptsRouter();
  try {
    const app = buildApp(fixture.router);
    const response = await uploadReceipt(request(app), "not-a-uuid");

    assert.equal(response.status, 400);
    assert.match(response.body.error, /valid uuid/i);
    assert.equal(fixture.state.insertParams, null);
  } finally {
    fixture.cleanup();
  }
});

test("receipt upload rejects linked transactions that do not belong to the current business", async () => {
  const fixture = loadReceiptsRouter({
    transactionRow: null
  });
  try {
    const app = buildApp(fixture.router);
    const response = await uploadReceipt(
      request(app),
      "00000000-0000-4000-8000-000000000111"
    );

    assert.equal(response.status, 404);
    assert.match(response.body.error, /does not belong to this business/i);
    assert.equal(fixture.state.insertParams, null);
  } finally {
    fixture.cleanup();
  }
});

test("receipt upload rejects transactions inside a locked accounting period", async () => {
  const fixture = loadReceiptsRouter({
    transactionRow: {
      id: "00000000-0000-4000-8000-000000000222",
      date: "2026-03-15"
    },
    lockError: {
      name: "AccountingPeriodLockedError",
      status: 409,
      code: "accounting_period_locked",
      lockedThroughDate: "2026-03-31",
      message: "This accounting period is locked."
    }
  });
  try {
    const app = buildApp(fixture.router);
    const response = await uploadReceipt(
      request(app),
      "00000000-0000-4000-8000-000000000222"
    );

    assert.equal(response.status, 409);
    assert.equal(response.body.code, "accounting_period_locked");
    assert.equal(response.body.locked_through_date, "2026-03-31");
    assert.equal(fixture.state.insertParams, null);
    assert.equal(fixture.state.lockCheckDate, "2026-03-15");
  } finally {
    fixture.cleanup();
  }
});

test("receipt upload inserts only after transaction ownership and lock checks pass", async () => {
  const transactionId = "00000000-0000-4000-8000-000000000333";
  const fixture = loadReceiptsRouter({
    transactionRow: {
      id: transactionId,
      date: "2026-04-15"
    }
  });
  try {
    const app = buildApp(fixture.router);
    const response = await uploadReceipt(request(app), transactionId);

    assert.equal(response.status, 201);
    assert.equal(response.body.transaction_id, transactionId);
    assert.ok(Array.isArray(fixture.state.insertParams));
    assert.equal(fixture.state.insertParams[1], fixture.state.businessId);
    assert.equal(fixture.state.insertParams[2], transactionId);
    assert.equal(fixture.state.lockCheckDate, "2026-04-15");
  } finally {
    fixture.cleanup();
  }
});
