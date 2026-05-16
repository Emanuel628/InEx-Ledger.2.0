"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const ROUTE_PATH = require.resolve("../routes/transactions.routes.js");

function loadRouter() {
  const originalLoad = Module._load.bind(Module);

  Module._load = function (requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query() {
            return { rows: [], rowCount: 0 };
          }
        }
      };
    }

    if (requestName === "multer") {
      const multerStub = function multer() {
        return {
          single: () => (_req, _res, next) => next()
        };
      };
      multerStub.memoryStorage = () => ({});
      return multerStub;
    }

    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        requireAuth(req, _res, next) {
          req.user = { id: "user_test_1", email: "owner@example.com" };
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
      return { createTransactionLimiter: () => (_req, _res, next) => next() };
    }

    if (requestName === "../api/utils/resolveBusinessIdForUser.js" || /resolveBusinessIdForUser\.js$/.test(requestName)) {
      return {
        resolveBusinessIdForUser: async () => "biz_test_1",
        getBusinessScopeForUser: async () => ({ businessIds: ["biz_test_1"] })
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
        loadAccountingLockState: async () => ({})
      };
    }

    if (requestName === "../services/transactionAuditService.js" || /transactionAuditService\.js$/.test(requestName)) {
      return {
        archiveTransaction: async () => true,
        restoreMostRecentArchivedTransaction: async () => null,
        countRestorableArchivedTransactions: async () => 0
      };
    }

    if (requestName === "../services/subscriptionService.js" || /subscriptionService\.js$/.test(requestName)) {
      return {
        getSubscriptionSnapshotForBusiness: async () => ({ effectiveTier: "v1" }),
        hasFeatureAccess: () => true
      };
    }

    if (requestName === "../services/basicPlanUsageService.js" || /basicPlanUsageService\.js$/.test(requestName)) {
      return {
        BasicPlanLimitError: class BasicPlanLimitError extends Error {},
        assertCanCreateTransactions: async () => ({ remaining: 100 })
      };
    }

    if (requestName === "../services/transactionImportService.js" || /transactionImportService\.js$/.test(requestName)) {
      return {
        createImportBatch: async () => ({}),
        finalizeImportBatch: async () => ({}),
        findDuplicateCandidates: async () => [],
        listImportBatches: async () => [],
        getImportBatch: async () => null,
        revertImportBatch: async () => ({ revertedCount: 0 })
      };
    }

    if (
      requestName === "../services/taxSummaryService.js" ||
      requestName === "../services/quarterlyTaxReminderService.js" ||
      requestName === "../services/taxDashboardService.js"
    ) {
      return {
        getPayerSummaryForYear: async () => ({}),
        getTaxLineSummaryForYear: async () => ({}),
        getQuarterlyReminders: () => ({}),
        getTaxDashboard: async () => ({})
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
    const router = require("../routes/transactions.routes.js");
    const app = express();
    app.use(express.json());
    app.use("/api/transactions", router);
    return {
      app,
      cleanup() {
        delete require.cache[ROUTE_PATH];
        Module._load = originalLoad;
      }
    };
  } catch (error) {
    Module._load = originalLoad;
    throw error;
  }
}

test("GET /api/transactions/exchange-rate-reference forwards an abort signal to the upstream request", async () => {
  const fixture = loadRouter();
  const originalFetch = global.fetch;
  let capturedSignal = null;

  global.fetch = async (_url, options = {}) => {
    capturedSignal = options.signal || null;
    return {
      ok: true,
      async json() {
        return {
          date: "2026-05-16",
          rates: { CAD: 1.37 }
        };
      }
    };
  };

  try {
    const response = await request(fixture.app)
      .get("/api/transactions/exchange-rate-reference?from=USD&to=CAD");

    assert.equal(response.status, 200);
    assert.equal(response.body?.rate, 1.37);
    assert.ok(capturedSignal, "expected upstream fetch to receive an abort signal");
  } finally {
    global.fetch = originalFetch;
    fixture.cleanup();
  }
});

test("GET /api/transactions/exchange-rate-reference returns 504 when the upstream request times out", async () => {
  const fixture = loadRouter();
  const originalFetch = global.fetch;

  global.fetch = async () => {
    const error = new Error("Request timed out.");
    error.name = "AbortError";
    throw error;
  };

  try {
    const response = await request(fixture.app)
      .get("/api/transactions/exchange-rate-reference?from=USD&to=CAD");

    assert.equal(response.status, 504);
    assert.equal(response.body?.error, "Reference exchange rate lookup timed out.");
  } finally {
    global.fetch = originalFetch;
    fixture.cleanup();
  }
});
