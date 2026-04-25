"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const ROUTE_PATH = require.resolve("../routes/transactions.routes.js");

function loadTransactionRouteModule() {
  const originalLoad = Module._load.bind(Module);

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return { requireAuth(_req, _res, next) { next(); } };
    }
    if (requestName === "../middleware/csrf.middleware.js" || /csrf\.middleware\.js$/.test(requestName)) {
      return { requireCsrfProtection(_req, _res, next) { next(); } };
    }
    if (requestName === "../middleware/rateLimitTiers.js" || /rateLimitTiers\.js$/.test(requestName)) {
      return { createTransactionLimiter() { return (_req, _res, next) => next(); } };
    }
    if (requestName === "../api/utils/resolveBusinessIdForUser.js" || /resolveBusinessIdForUser\.js$/.test(requestName)) {
      return {
        resolveBusinessIdForUser: async () => "biz-test",
        getBusinessScopeForUser: async () => ({ businessIds: ["biz-test"] })
      };
    }
    if (requestName === "../services/encryptionService.js" || /encryptionService\.js$/.test(requestName)) {
      return {
        encrypt: (value) => value,
        decrypt: (value) => value
      };
    }
    if (requestName === "../services/accountingLockService.js" || /accountingLockService\.js$/.test(requestName)) {
      return {
        AccountingPeriodLockedError: class AccountingPeriodLockedError extends Error {},
        assertDateUnlocked() {},
        loadAccountingLockState: async () => null
      };
    }
    if (requestName === "../services/transactionAuditService.js" || /transactionAuditService\.js$/.test(requestName)) {
      return {
        archiveTransaction: async () => null
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
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query() {
            return { rows: [], rowCount: 0 };
          }
        }
      };
    }
    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[ROUTE_PATH];

  try {
    return require("../routes/transactions.routes.js");
  } finally {
    Module._load = originalLoad;
  }
}

test("parseCsv preserves embedded newlines inside quoted fields", () => {
  const routeModule = loadTransactionRouteModule();
  const { parseCsv } = routeModule.__private;

  const rows = parseCsv(
    'Date,Description,Amount\n' +
    '"2026-04-01","Vendor line 1\nVendor line 2","-45.67"\n'
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, "2026-04-01");
  assert.equal(rows[0].description, "Vendor line 1\nVendor line 2");
  assert.equal(rows[0].amount, "-45.67");
});
