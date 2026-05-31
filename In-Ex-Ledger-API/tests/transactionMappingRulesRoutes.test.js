"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const ROUTE_PATH = require.resolve("../routes/transactions.routes.js");

function loadRouter() {
  const originalLoad = Module._load.bind(Module);
  const queries = [];

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql, params) {
            queries.push({ sql, params });
            if (/FROM transaction_mapping_rules r/i.test(sql)) {
              return {
                rows: [{
                  id: "33333333-3333-4333-8333-333333333333",
                  transaction_kind: "expense",
                  match_field: "merchant_name",
                  match_operator: "equals",
                  match_value: "OpenAI",
                  match_value_normalized: "openai",
                  confidence: "confirmed",
                  category_id: "44444444-4444-4444-8444-444444444444",
                  category_name: "Software & Subscriptions",
                  category_kind: "expense"
                }],
                rowCount: 1
              };
            }
            if (/DELETE FROM transaction_mapping_rules/i.test(sql)) {
              return { rows: [{ id: params[0] }], rowCount: 1 };
            }
            return { rows: [], rowCount: 0 };
          }
        }
      };
    }
    if (requestName === "multer") {
      const multerStub = function multer() {
        return { single: () => (_req, _res, next) => next() };
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
      return { requireCsrfProtection: (_req, _res, next) => next() };
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
    if (requestName === "../services/subscriptionService.js" || /subscriptionService\.js$/.test(requestName)) {
      return {
        getSubscriptionSnapshotForBusiness: async () => ({ effectiveTier: "v1" }),
        hasFeatureAccess: () => true
      };
    }
    if (requestName === "../services/basicPlanUsageService.js" || /basicPlanUsageService\.js$/.test(requestName)) {
      return {
        BasicPlanLimitError: class BasicPlanLimitError extends Error {},
        assertCanCreateTransactions: async () => {},
        assertCanImportCsvRows: async () => {}
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
    if (requestName === "../services/encryptionService.js" || /encryptionService\.js$/.test(requestName)) {
      return { encrypt: (value) => value, decrypt: (value) => value };
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
      queries,
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

test("mapping rules endpoint returns business rules without being shadowed by :id", async () => {
  const fixture = loadRouter();
  try {
    const res = await request(fixture.app).get("/api/transactions/mapping-rules");
    assert.equal(res.status, 200);
    assert.equal(res.body.rules.length, 1);
    assert.equal(res.body.rules[0].match_field, "merchant_name");
  } finally {
    fixture.cleanup();
  }
});

test("mapping rule delete endpoint removes a rule by id", async () => {
  const fixture = loadRouter();
  try {
    const ruleId = "33333333-3333-4333-8333-333333333333";
    const res = await request(fixture.app).delete(`/api/transactions/mapping-rules/${ruleId}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.deleted, true);
    assert.equal(res.body.id, ruleId);
  } finally {
    fixture.cleanup();
  }
});
