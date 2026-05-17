"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const ROUTE_PATH = require.resolve("../routes/categories.routes.js");
const TEST_USER_ID = "00000000-0000-4000-8000-000000000511";
const TEST_BUSINESS_ID = "00000000-0000-4000-8000-000000000611";

function loadCategoriesRouter({ businessRegion = "US" } = {}) {
  const originalLoad = Module._load.bind(Module);
  const state = {
    queries: []
  };

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        requireAuth(req, _res, next) {
          req.user = { id: TEST_USER_ID };
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
    if (requestName === "../middleware/rate-limit.middleware.js" || /rate-limit\.middleware\.js$/.test(requestName)) {
      return {
        createDataApiLimiter() {
          return (_req, _res, next) => next();
        }
      };
    }
    if (requestName === "../api/utils/resolveBusinessIdForUser.js" || /resolveBusinessIdForUser\.js$/.test(requestName)) {
      return {
        resolveBusinessIdForUser: async () => TEST_BUSINESS_ID,
        getBusinessScopeForUser: async () => ({ businessIds: [TEST_BUSINESS_ID] })
      };
    }
    if (requestName === "../services/accountingLockService.js" || /accountingLockService\.js$/.test(requestName)) {
      return {
        loadAccountingLockState: async () => ({ lockedThroughDate: null }),
        assertNoLockedPeriodTransactionsForCategory: async () => {},
        AccountingPeriodLockedError: class AccountingPeriodLockedError extends Error {}
      };
    }
    if (requestName === "../api/utils/seedDefaultsForBusiness.js" || /seedDefaultsForBusiness\.js$/.test(requestName)) {
      return {
        seedDefaultCategoriesForBusiness: async () => []
      };
    }
    if (requestName === "../services/taxSummaryService.js" || /taxSummaryService\.js$/.test(requestName)) {
      return {
        getUnmappedCategories: async () => []
      };
    }
    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return {
        logError() {},
        logWarn() {},
        logInfo() {}
      };
    }
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql, params = []) {
            state.queries.push({ sql, params });

            if (/SELECT region FROM businesses/i.test(sql)) {
              return { rows: [{ region: businessRegion }], rowCount: 1 };
            }
            if (/INSERT INTO categories/i.test(sql)) {
              return {
                rows: [{
                  id: "cat-1",
                  name: params[2],
                  kind: params[3],
                  color: params[4],
                  tax_map_us: params[5],
                  tax_map_ca: params[6],
                  is_default: false,
                  is_active: true,
                  created_at: "2026-05-17T00:00:00.000Z"
                }],
                rowCount: 1
              };
            }
            if (/FROM categories c/i.test(sql)) {
              return { rows: [], rowCount: 0 };
            }
            if (/UPDATE categories\s+SET is_active = false/i.test(sql)) {
              return { rows: [], rowCount: 2 };
            }
            throw new Error(`Unhandled SQL in categoryRegionGating.test.js: ${sql}`);
          }
        }
      };
    }

    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[ROUTE_PATH];

  try {
    const router = require("../routes/categories.routes.js");
    return {
      router,
      state,
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

function buildApp(router) {
  const app = express();
  app.use(express.json());
  app.use("/api/categories", router);
  app.use((err, _req, res, _next) => {
    res.status(500).json({ error: err.message || "error" });
  });
  return app;
}

test("US businesses reject Canada-only tax_map_ca values on category create", async () => {
  const fixture = loadCategoriesRouter({ businessRegion: "US" });

  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .post("/api/categories")
      .send({
        name: "GST/HST Paid",
        kind: "expense",
        tax_map_ca: "gst_hst_paid"
      });

    assert.equal(response.status, 400);
    assert.match(response.body.error || "", /tax_map_ca is not allowed for US businesses/i);
  } finally {
    fixture.cleanup();
  }
});

test("Canada businesses reject US-only tax_map_us values on category create", async () => {
  const fixture = loadCategoriesRouter({ businessRegion: "CA" });

  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .post("/api/categories")
      .send({
        name: "Schedule C Utilities",
        kind: "expense",
        tax_map_us: "utilities"
      });

    assert.equal(response.status, 400);
    assert.match(response.body.error || "", /tax_map_us is not allowed for Canada businesses/i);
  } finally {
    fixture.cleanup();
  }
});

test("GET /api/categories applies a region filter that hides opposite-region default categories", async () => {
  const fixture = loadCategoriesRouter({ businessRegion: "US" });

  try {
    const app = buildApp(fixture.router);
    const response = await request(app).get("/api/categories");

    assert.equal(response.status, 200);
    const categoriesQuery = fixture.state.queries.find((entry) => /FROM categories c/i.test(entry.sql));
    assert.ok(categoriesQuery, "categories query should run");
    assert.match(categoriesQuery.sql, /c\.tax_map_ca IS NULL OR c\.tax_map_us IS NOT NULL/i);
    assert.match(categoriesQuery.sql, /c\.tax_map_us IS NULL OR c\.tax_map_ca IS NOT NULL/i);
  } finally {
    fixture.cleanup();
  }
});

test("POST /api/categories/defaults deactivates incompatible default categories before seeding the new region", async () => {
  const fixture = loadCategoriesRouter({ businessRegion: "US" });

  try {
    const app = buildApp(fixture.router);
    const response = await request(app).post("/api/categories/defaults").send({});

    assert.equal(response.status, 200);
    const deactivateQuery = fixture.state.queries.find((entry) => /UPDATE categories\s+SET is_active = false/i.test(entry.sql));
    assert.ok(deactivateQuery, "defaults flow should deactivate incompatible defaults first");
    assert.equal(deactivateQuery.params[0], TEST_BUSINESS_ID);
    assert.match(deactivateQuery.sql, /tax_map_ca IS NOT NULL AND tax_map_us IS NULL/i);
  } finally {
    fixture.cleanup();
  }
});
