"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const ROUTE_PATH = require.resolve("../routes/transactions.routes.js");

function loadRouter({ effectiveTier = "free" } = {}) {
  const originalLoad = Module._load.bind(Module);

  Module._load = function (requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql) {
            if (/SELECT region FROM businesses/i.test(sql)) {
              return { rows: [{ region: "US" }], rowCount: 1 };
            }
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

    if (
      requestName === "../middleware/auth.middleware.js" ||
      /auth\.middleware\.js$/.test(requestName)
    ) {
      return {
        requireAuth: (req, _res, next) => {
          req.user = { id: "user_test_1", email: "owner@example.com" };
          next();
        }
      };
    }

    if (
      requestName === "../middleware/csrf.middleware.js" ||
      /csrf\.middleware\.js$/.test(requestName)
    ) {
      return { requireCsrfProtection: (_req, _res, next) => next() };
    }

    if (
      requestName === "../middleware/rateLimitTiers.js" ||
      /rateLimitTiers\.js$/.test(requestName)
    ) {
      return { createTransactionLimiter: () => (_req, _res, next) => next() };
    }

    if (
      requestName === "../api/utils/resolveBusinessIdForUser.js" ||
      /resolveBusinessIdForUser\.js$/.test(requestName)
    ) {
      return {
        resolveBusinessIdForUser: async () => "biz_test_1",
        getBusinessScopeForUser: async () => ({ businessIds: ["biz_test_1"] })
      };
    }

    if (
      requestName === "../services/subscriptionService.js" ||
      /subscriptionService\.js$/.test(requestName)
    ) {
      return {
        getSubscriptionSnapshotForBusiness: async () => ({ effectiveTier }),
        hasFeatureAccess: (subscription, feature) => {
          if (feature === "edge_case_tools") {
            return subscription?.effectiveTier === "v1";
          }
          return true;
        }
      };
    }

    if (
      requestName === "../services/basicPlanUsageService.js" ||
      /basicPlanUsageService\.js$/.test(requestName)
    ) {
      return {
        BasicPlanLimitError: class BasicPlanLimitError extends Error {},
        assertCanCreateTransactions: async () => {}
      };
    }

    if (
      requestName === "../services/accountingLockService.js" ||
      /accountingLockService\.js$/.test(requestName)
    ) {
      return {
        AccountingPeriodLockedError: class AccountingPeriodLockedError extends Error {},
        assertDateUnlocked() {},
        loadAccountingLockState: async () => ({})
      };
    }

    if (
      requestName === "../services/transactionAuditService.js" ||
      /transactionAuditService\.js$/.test(requestName)
    ) {
      return { archiveTransaction: async () => true };
    }

    if (
      requestName === "../services/encryptionService.js" ||
      /encryptionService\.js$/.test(requestName)
    ) {
      return {
        encrypt: (value) => value,
        decrypt: (value) => value
      };
    }

    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return { logError() {}, logWarn() {}, logInfo() {} };
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

test("basic plan rejects advanced transaction payload fields", async () => {
  const fixture = loadRouter({ effectiveTier: "free" });

  try {
    const res = await request(fixture.app)
      .post("/api/transactions")
      .send({
        account_id: "11111111-1111-4111-8111-111111111111",
        category_id: "22222222-2222-4222-8222-222222222222",
        amount: 45,
        type: "expense",
        date: "2026-04-26",
        tax_treatment: "capital"
      });

    assert.equal(res.status, 402);
    assert.match(String(res.body?.error || ""), /Pro plan/i);
  } finally {
    fixture.cleanup();
  }
});
