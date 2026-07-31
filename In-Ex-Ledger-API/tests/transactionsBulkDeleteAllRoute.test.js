"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-bulk-delete-all";
process.env.CSRF_SECRET = process.env.CSRF_SECRET || "test-csrf-secret-bulk-delete-all";
process.env.FIELD_ENCRYPTION_KEY =
  process.env.FIELD_ENCRYPTION_KEY ||
  "0000000000000000000000000000000000000000000000000000000000000000";

const ROUTE_PATH = require.resolve("../routes/transactions.routes.js");
const BUSINESS_ID = "00000000-0000-4000-8000-000000000901";
const OWNER_USER_ID = "user-owner-1";

function loadTransactionsRouterWithState({
  isOwner = true,
  lockedThroughDate = null,
  deletedCount = 42,
  accountExists = true
} = {}) {
  const originalLoad = Module._load.bind(Module);
  const state = { poolQueries: [] };

  const fakePool = {
    async query(sql, params) {
      state.poolQueries.push({ sql, params });

      if (/SELECT id FROM businesses WHERE id = \$1 AND user_id = \$2/i.test(sql)) {
        return isOwner ? { rows: [{ id: BUSINESS_ID }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      if (/SELECT id FROM accounts WHERE id = \$1 AND business_id = \$2/i.test(sql)) {
        return accountExists ? { rows: [{ id: params[0] }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      if (/SELECT id\s+FROM transactions\s+WHERE business_id = \$1\s+AND deleted_at IS NULL\s+AND date <= \$2/i.test(sql)) {
        return lockedThroughDate ? { rows: [{ id: "locked-txn-1" }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      if (/UPDATE transactions\s+SET deleted_at = now\(\), is_void = true, voided_at = now\(\)/i.test(sql)) {
        return { rows: [], rowCount: deletedCount };
      }

      if (/UPDATE transactions\s+SET deleted_reason = 'bulk_delete_all'\s+WHERE business_id = \$1\s+AND deleted_at IS NOT NULL/i.test(sql)) {
        return { rows: [], rowCount: 0 };
      }

      throw new Error(`Unhandled pool SQL: ${sql}`);
    },
    async connect() {
      throw new Error("connect() should not be called by bulk-delete-all");
    }
  };

  Module._load = function (requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return { pool: fakePool };
    }
    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return { requireAuth(req, _res, next) { req.user = { id: OWNER_USER_ID }; next(); } };
    }
    if (requestName === "../middleware/csrf.middleware.js" || /csrf\.middleware\.js$/.test(requestName)) {
      return { requireCsrfProtection(_req, _res, next) { next(); } };
    }
    if (requestName === "../middleware/rateLimitTiers.js" || /rateLimitTiers\.js$/.test(requestName)) {
      return { createTransactionLimiter() { return (_req, _res, next) => next(); } };
    }
    if (requestName === "../api/utils/resolveBusinessIdForUser.js" || /resolveBusinessIdForUser\.js$/.test(requestName)) {
      return {
        resolveBusinessIdForUser: async () => BUSINESS_ID,
        getBusinessScopeForUser: async () => ({ businessIds: [BUSINESS_ID] })
      };
    }
    if (requestName === "../services/encryptionService.js" || /encryptionService\.js$/.test(requestName)) {
      return { encrypt: (value) => value, decrypt: (value) => value };
    }
    if (requestName === "../services/accountingLockService.js" || /accountingLockService\.js$/.test(requestName)) {
      return {
        AccountingPeriodLockedError: class AccountingPeriodLockedError extends Error {},
        assertDateUnlocked() {},
        loadAccountingLockState: async () => (lockedThroughDate ? { lockedThroughDate } : null)
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
      return { getSubscriptionSnapshotForBusiness: async () => ({ plan: "pro" }), hasFeatureAccess: () => true };
    }
    if (requestName === "../services/basicPlanUsageService.js" || /basicPlanUsageService\.js$/.test(requestName)) {
      return {
        BasicPlanLimitError: class BasicPlanLimitError extends Error {},
        assertCanCreateTransactions: async () => null,
        assertCanImportCsvRows: async () => null
      };
    }
    if (requestName === "../services/usageLimitEmailService.js" || /usageLimitEmailService\.js$/.test(requestName)) {
      return { evaluateUsageLimitEmails: async () => null };
    }
    if (requestName === "../services/transactionImportService.js" || /transactionImportService\.js$/.test(requestName)) {
      return {
        createImportBatch: async () => ({ id: "batch-1" }),
        finalizeImportBatch: async () => {},
        findDuplicateCandidates: async () => [],
        listImportBatches: async () => [],
        getImportBatch: async () => null,
        revertImportBatch: async () => null
      };
    }
    if (requestName === "../services/taxSummaryService.js" || /taxSummaryService\.js$/.test(requestName)) {
      return { getPayerSummaryForYear: async () => ({}), getTaxLineSummaryForYear: async () => ({}) };
    }
    if (requestName === "../services/quarterlyTaxReminderService.js" || /quarterlyTaxReminderService\.js$/.test(requestName)) {
      return { getQuarterlyReminders: () => [] };
    }
    if (requestName === "../services/taxDashboardService.js" || /taxDashboardService\.js$/.test(requestName)) {
      return { getTaxDashboard: async () => ({}) };
    }
    if (requestName === "../services/exportSnapshotService.js" || /exportSnapshotService\.js$/.test(requestName)) {
      return { invalidateSnapshotsForBusiness: async () => null };
    }
    if (requestName === "../services/bookkeepingEmailService.js" || /bookkeepingEmailService\.js$/.test(requestName)) {
      return { sendBookkeepingActivityEmail() {} };
    }
    if (requestName === "../services/transactionMappingRuleService.js" || /transactionMappingRuleService\.js$/.test(requestName)) {
      return { learnTransactionMappingRules: async () => [], normalizeRuleValue: (value) => String(value || "").toLowerCase() };
    }
    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[ROUTE_PATH];

  try {
    const router = require("../routes/transactions.routes.js");
    const app = express();
    app.use(express.json());
    app.use("/api/transactions", router);
    return { app, state };
  } finally {
    Module._load = originalLoad;
  }
}

test("DELETE /api/transactions/bulk-delete-all rejects a missing confirmation string", async () => {
  const { app } = loadTransactionsRouterWithState();
  const response = await request(app).delete("/api/transactions/bulk-delete-all").send({});
  assert.equal(response.status, 400);
  assert.match(response.body.error, /confirmation required/i);
});

test("DELETE /api/transactions/bulk-delete-all rejects a wrong confirmation string", async () => {
  const { app } = loadTransactionsRouterWithState();
  const response = await request(app).delete("/api/transactions/bulk-delete-all").send({ confirm: "delete" });
  assert.equal(response.status, 400);
});

test("DELETE /api/transactions/bulk-delete-all rejects a non-owner", async () => {
  const { app } = loadTransactionsRouterWithState({ isOwner: false });
  const response = await request(app).delete("/api/transactions/bulk-delete-all").send({ confirm: "DELETE" });
  assert.equal(response.status, 403);
  assert.match(response.body.error, /business owner/i);
});

test("DELETE /api/transactions/bulk-delete-all refuses when a locked-period transaction exists", async () => {
  const { app } = loadTransactionsRouterWithState({ lockedThroughDate: "2026-06-30" });
  const response = await request(app).delete("/api/transactions/bulk-delete-all").send({ confirm: "DELETE" });
  assert.equal(response.status, 409);
  assert.equal(response.body.code, "ACCOUNTING_PERIOD_LOCKED");
});

test("DELETE /api/transactions/bulk-delete-all soft-deletes every transaction for the business when confirmed", async () => {
  const { app, state } = loadTransactionsRouterWithState({ deletedCount: 7 });
  const response = await request(app).delete("/api/transactions/bulk-delete-all").send({ confirm: "DELETE" });
  assert.equal(response.status, 200);
  assert.equal(response.body.count, 7);

  const updateQuery = state.poolQueries.find((entry) => /UPDATE transactions/i.test(entry.sql));
  assert.ok(updateQuery, "expected an UPDATE transactions query to run");
  assert.deepEqual(updateQuery.params, [BUSINESS_ID]);
  assert.match(updateQuery.sql, /deleted_at IS NULL/);
});

test("DELETE /api/transactions/bulk-delete-all also clears any pre-existing undo-eligible deletion so Undo Delete resets", async () => {
  const { app, state } = loadTransactionsRouterWithState({ deletedCount: 3 });
  const response = await request(app).delete("/api/transactions/bulk-delete-all").send({ confirm: "DELETE" });
  assert.equal(response.status, 200);

  const resetQuery = state.poolQueries.find((entry) =>
    /UPDATE transactions\s+SET deleted_reason = 'bulk_delete_all'\s+WHERE business_id = \$1\s+AND deleted_at IS NOT NULL/i.test(entry.sql)
  );
  assert.ok(resetQuery, "expected a follow-up UPDATE clearing prior undo-eligible deletions");
  assert.deepEqual(resetQuery.params, [BUSINESS_ID]);
  assert.match(resetQuery.sql, /deleted_reason IS DISTINCT FROM 'bulk_delete_all'/);
});

test("DELETE /api/transactions/bulk-delete-all with an accountId only deletes that account's transactions", async () => {
  const { app, state } = loadTransactionsRouterWithState({ deletedCount: 5 });
  const accountId = "00000000-0000-4000-8000-000000000777";
  const response = await request(app)
    .delete("/api/transactions/bulk-delete-all")
    .send({ confirm: "DELETE", accountId });

  assert.equal(response.status, 200);
  assert.equal(response.body.count, 5);

  const updateQuery = state.poolQueries.find((entry) => /UPDATE transactions\s+SET deleted_at = now\(\)/i.test(entry.sql));
  assert.ok(updateQuery, "expected an UPDATE transactions query to run");
  assert.deepEqual(updateQuery.params, [BUSINESS_ID, accountId]);
  assert.match(updateQuery.sql, /AND account_id = \$2/);
});

test("DELETE /api/transactions/bulk-delete-all rejects an accountId that doesn't belong to this business", async () => {
  const { app } = loadTransactionsRouterWithState({ accountExists: false });
  const response = await request(app)
    .delete("/api/transactions/bulk-delete-all")
    .send({ confirm: "DELETE", accountId: "00000000-0000-4000-8000-000000000778" });

  assert.equal(response.status, 404);
});

test("DELETE /api/transactions/bulk-delete-all treats accountId 'ALL' as a whole-business delete", async () => {
  const { app, state } = loadTransactionsRouterWithState({ deletedCount: 9 });
  const response = await request(app)
    .delete("/api/transactions/bulk-delete-all")
    .send({ confirm: "DELETE", accountId: "ALL" });

  assert.equal(response.status, 200);
  const updateQuery = state.poolQueries.find((entry) => /UPDATE transactions\s+SET deleted_at = now\(\)/i.test(entry.sql));
  assert.deepEqual(updateQuery.params, [BUSINESS_ID]);
  assert.doesNotMatch(updateQuery.sql, /account_id/);
});
