"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const ROUTE_PATH = require.resolve("../routes/transactions.routes.js");
const TEST_TRANSACTION_ID = "00000000-0000-4000-8000-000000000201";
const TEST_BUSINESS_ID = "00000000-0000-4000-8000-000000000202";
const TEST_USER_ID = "00000000-0000-4000-8000-000000000203";

process.env.FIELD_ENCRYPTION_KEY =
  process.env.FIELD_ENCRYPTION_KEY ||
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function buildApp(router) {
  const app = express();
  app.use(express.json());
  app.use("/api/transactions", router);
  return app;
}

function loadRouter({ receiptCount = 0, lockedThroughDate = null } = {}) {
  const originalLoad = Module._load.bind(Module);
  const state = { updateParams: null };

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql, params) {
            if (/COALESCE\(rc\.receipt_count, 0\)::int AS receipt_count/i.test(sql) && /FROM transactions t/i.test(sql)) {
              return {
                rowCount: 1,
                rows: [{ id: TEST_TRANSACTION_ID, date: "2026-05-01", receipt_count: receiptCount }]
              };
            }
            if (/UPDATE transactions\s+SET receipt_status = \$1/i.test(sql)) {
              state.updateParams = params;
              return {
                rowCount: 1,
                rows: [
                  {
                    id: TEST_TRANSACTION_ID,
                    business_id: TEST_BUSINESS_ID,
                    receipt_status: params[0],
                    receipt_missing_reason: params[1],
                    business_purpose: params[2],
                    supporting_evidence: params[3],
                    receipt_status_confirmed_by: params[4],
                    cleared: true,
                    date: "2026-05-01",
                    description: "Office supplies",
                    description_encrypted: null,
                    account_name: "Checking",
                    category_name: "Office Supplies",
                    category_kind: "expense",
                    category_color: "blue",
                    tax_map_us: "office_expense",
                    tax_map_ca: null
                  }
                ]
              };
            }
            if (/INSERT INTO audit_events/i.test(sql)) {
              return { rows: [{ id: "audit-1" }], rowCount: 1 };
            }
            throw new Error(`Unhandled pool SQL: ${sql}`);
          },
          async connect() {
            throw new Error("client.connect() should not be used by this route");
          }
        }
      };
    }
    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return { requireAuth(req, _res, next) { req.user = { id: TEST_USER_ID }; next(); } };
    }
    if (requestName === "../middleware/csrf.middleware.js" || /csrf\.middleware\.js$/.test(requestName)) {
      return { requireCsrfProtection(_req, _res, next) { next(); } };
    }
    if (requestName === "../middleware/rateLimitTiers.js" || /rateLimitTiers\.js$/.test(requestName)) {
      return { createTransactionLimiter() { return (_req, _res, next) => next(); } };
    }
    if (requestName === "../api/utils/resolveBusinessIdForUser.js" || /resolveBusinessIdForUser\.js$/.test(requestName)) {
      return {
        resolveBusinessIdForUser: async () => TEST_BUSINESS_ID,
        getBusinessScopeForUser: async () => ({ businessIds: [TEST_BUSINESS_ID] })
      };
    }
    if (requestName === "../services/encryptionService.js" || /encryptionService\.js$/.test(requestName)) {
      return { encrypt: (v) => `enc:${v}`, decrypt: (v) => String(v || "").replace(/^enc:/, "") };
    }
    if (requestName === "../services/accountingLockService.js" || /accountingLockService\.js$/.test(requestName)) {
      class AccountingPeriodLockedError extends Error {
        constructor(message = "locked") {
          super(message);
          this.status = 409;
          this.code = "accounting_period_locked";
        }
      }
      return {
        AccountingPeriodLockedError,
        assertDateUnlocked(currentLockState, date) {
          if (currentLockState?.lockedThroughDate && String(date || "") <= String(currentLockState.lockedThroughDate)) {
            const error = new AccountingPeriodLockedError("Transaction date is inside a locked accounting period.");
            error.lockedThroughDate = currentLockState.lockedThroughDate;
            throw error;
          }
        },
        loadAccountingLockState: async () => ({ lockedThroughDate })
      };
    }
    if (requestName === "../services/transactionAuditService.js" || /transactionAuditService\.js$/.test(requestName)) {
      return {
        archiveTransaction: async () => null,
        restoreMostRecentArchivedTransaction: async () => null,
        countRestorableArchivedTransactions: async () => 0
      };
    }
    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return { logError() {}, logWarn() {}, logInfo() {} };
    }
    if (requestName === "../services/subscriptionService.js" || /subscriptionService\.js$/.test(requestName)) {
      return { getSubscriptionSnapshotForBusiness: async () => ({ plan: "test" }), hasFeatureAccess: () => true };
    }
    if (requestName === "../services/basicPlanUsageService.js" || /basicPlanUsageService\.js$/.test(requestName)) {
      class BasicPlanLimitError extends Error {}
      return { BasicPlanLimitError, assertCanCreateTransactions: async () => {} };
    }
    if (requestName === "../services/exportSnapshotService.js" || /exportSnapshotService\.js$/.test(requestName)) {
      return { invalidateSnapshotsForBusiness: async () => null };
    }
    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[ROUTE_PATH];

  try {
    return {
      router: require("../routes/transactions.routes.js"),
      state,
      cleanup() { delete require.cache[ROUTE_PATH]; }
    };
  } finally {
    Module._load = originalLoad;
  }
}

test("PATCH /:id/receipt-status rejects an invalid transaction id", async () => {
  const fixture = loadRouter();
  try {
    const app = buildApp(fixture.router);
    const res = await request(app)
      .patch("/api/transactions/not-a-uuid/receipt-status")
      .send({ receipt_status: "missing", receipt_missing_reason: "lost" });
    assert.equal(res.status, 400);
  } finally {
    fixture.cleanup();
  }
});

test("PATCH /:id/receipt-status rejects a client trying to set 'attached' directly", async () => {
  const fixture = loadRouter();
  try {
    const app = buildApp(fixture.router);
    const res = await request(app)
      .patch(`/api/transactions/${TEST_TRANSACTION_ID}/receipt-status`)
      .send({ receipt_status: "attached" });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /cannot be set to 'attached' directly/);
  } finally {
    fixture.cleanup();
  }
});

test("PATCH /:id/receipt-status rejects 'missing' without a reason", async () => {
  const fixture = loadRouter();
  try {
    const app = buildApp(fixture.router);
    const res = await request(app)
      .patch(`/api/transactions/${TEST_TRANSACTION_ID}/receipt-status`)
      .send({ receipt_status: "missing" });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /receipt_missing_reason is required/);
  } finally {
    fixture.cleanup();
  }
});

test("PATCH /:id/receipt-status rejects 'not_required' without a business purpose", async () => {
  const fixture = loadRouter();
  try {
    const app = buildApp(fixture.router);
    const res = await request(app)
      .patch(`/api/transactions/${TEST_TRANSACTION_ID}/receipt-status`)
      .send({ receipt_status: "not_required" });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /business_purpose is required/);
  } finally {
    fixture.cleanup();
  }
});

test("PATCH /:id/receipt-status refuses to override status when a receipt file is already on record", async () => {
  const fixture = loadRouter({ receiptCount: 1 });
  try {
    const app = buildApp(fixture.router);
    const res = await request(app)
      .patch(`/api/transactions/${TEST_TRANSACTION_ID}/receipt-status`)
      .send({ receipt_status: "missing", receipt_missing_reason: "lost" });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, "receipt_status_conflict");
  } finally {
    fixture.cleanup();
  }
});

test("PATCH /:id/receipt-status is blocked when the transaction date falls in a locked accounting period", async () => {
  const fixture = loadRouter({ receiptCount: 0, lockedThroughDate: "2026-06-01" });
  try {
    const app = buildApp(fixture.router);
    const res = await request(app)
      .patch(`/api/transactions/${TEST_TRANSACTION_ID}/receipt-status`)
      .send({ receipt_status: "missing", receipt_missing_reason: "lost" });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, "accounting_period_locked");
  } finally {
    fixture.cleanup();
  }
});

test("PATCH /:id/receipt-status sets 'missing' with a reason, stamps the confirming user, and never touches cleared", async () => {
  const fixture = loadRouter({ receiptCount: 0 });
  try {
    const app = buildApp(fixture.router);
    const res = await request(app)
      .patch(`/api/transactions/${TEST_TRANSACTION_ID}/receipt-status`)
      .send({ receipt_status: "missing", receipt_missing_reason: "Cash tip, no receipt issued" });

    assert.equal(res.status, 200);
    assert.equal(res.body.receipt_status, "missing");
    assert.equal(res.body.receipt_missing_reason, "Cash tip, no receipt issued");
    // The endpoint must never alter `cleared` — the mock echoes back
    // whatever value was already on the row (true), proving the UPDATE
    // statement issued by the route has no `cleared` column in its SET list.
    assert.equal(res.body.cleared, true);
    assert.equal(fixture.state.updateParams[0], "missing");
    assert.equal(fixture.state.updateParams[4], TEST_USER_ID);
    // Category/account join fields are present immediately, same as POST/PUT.
    assert.equal(res.body.category_name, "Office Supplies");
    assert.equal(res.body.account_name, "Checking");
  } finally {
    fixture.cleanup();
  }
});

test("PATCH /:id/receipt-status sets 'not_required' with a business purpose", async () => {
  const fixture = loadRouter({ receiptCount: 0 });
  try {
    const app = buildApp(fixture.router);
    const res = await request(app)
      .patch(`/api/transactions/${TEST_TRANSACTION_ID}/receipt-status`)
      .send({ receipt_status: "not_required", business_purpose: "Bank-assessed fee, no receipt is issued." });

    assert.equal(res.status, 200);
    assert.equal(res.body.receipt_status, "not_required");
    assert.equal(res.body.business_purpose, "Bank-assessed fee, no receipt is issued.");
  } finally {
    fixture.cleanup();
  }
});

test("PATCH /:id/receipt-status resets back to 'pending' and clears reason/purpose", async () => {
  const fixture = loadRouter({ receiptCount: 0 });
  try {
    const app = buildApp(fixture.router);
    const res = await request(app)
      .patch(`/api/transactions/${TEST_TRANSACTION_ID}/receipt-status`)
      .send({ receipt_status: "pending" });

    assert.equal(res.status, 200);
    assert.equal(fixture.state.updateParams[0], "pending");
    assert.equal(fixture.state.updateParams[1], null);
    assert.equal(fixture.state.updateParams[2], null);
  } finally {
    fixture.cleanup();
  }
});
