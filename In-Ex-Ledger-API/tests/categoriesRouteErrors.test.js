"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const { attachCentralErrorHandler } = require("./helpers/testPool.js");

const ROUTE_PATH = require.resolve("../routes/categories.routes.js");
const BUSINESS_ID = "00000000-0000-4000-8000-000000000901";
const CATEGORY_ID = "00000000-0000-4000-8000-000000000902";

function loadFixture({ queryImpl } = {}) {
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
        resolveBusinessIdForUser: async () => BUSINESS_ID,
        getBusinessScopeForUser: async () => ({ businessIds: [BUSINESS_ID] })
      };
    }
    if (/accountingLockService\.js$/.test(requestName)) {
      return {
        loadAccountingLockState: async () => ({ lockedThroughDate: null }),
        assertNoLockedPeriodTransactionsForCategory: async () => {},
        AccountingPeriodLockedError: class AccountingPeriodLockedError extends Error {}
      };
    }
    if (/seedDefaultsForBusiness\.js$/.test(requestName)) {
      return { seedDefaultCategoriesForBusiness: async () => [] };
    }
    if (/taxSummaryService\.js$/.test(requestName)) {
      return { getUnmappedCategories: async () => [] };
    }
    if (/exportSnapshotService\.js$/.test(requestName)) {
      return { invalidateSnapshotsForBusiness: async () => {} };
    }
    if (/db\.js$/.test(requestName)) {
      return { pool: { query: queryImpl || (async () => ({ rows: [], rowCount: 0 })) } };
    }
    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[ROUTE_PATH];
  const router = require(ROUTE_PATH);
  const app = express();
  app.use(express.json());
  app.use("/api/categories", router);
  attachCentralErrorHandler(app);

  return {
    app,
    cleanup() {
      delete require.cache[ROUTE_PATH];
      Module._load = originalLoad;
    }
  };
}

test("GET / returns a generic 500 for unexpected database failures", async () => {
  const fixture = loadFixture({
    queryImpl: async () => {
      throw new Error("connection reset");
    }
  });

  try {
    const response = await request(fixture.app).get("/api/categories");

    assert.equal(response.status, 500);
    assert.deepEqual(response.body, { error: "Internal server error" });
  } finally {
    fixture.cleanup();
  }
});

test("POST / preserves category-name conflict as 409", async () => {
  const fixture = loadFixture({
    queryImpl: async (sql) => {
      if (/SELECT region FROM businesses/i.test(sql)) {
        return { rows: [{ region: "US" }], rowCount: 1 };
      }
      if (/INSERT INTO categories/i.test(sql)) {
        const error = new Error("duplicate key value violates unique constraint");
        error.code = "23505";
        error.constraint = "categories_business_name_unique";
        throw error;
      }
      return { rows: [], rowCount: 0 };
    }
  });

  try {
    const response = await request(fixture.app)
      .post("/api/categories")
      .send({ name: "Meals", kind: "expense" });

    assert.equal(response.status, 409);
    assert.deepEqual(response.body, { error: "A category with this name already exists." });
  } finally {
    fixture.cleanup();
  }
});

test("DELETE /:id preserves not-found as 404", async () => {
  const fixture = loadFixture();

  try {
    const response = await request(fixture.app).delete(`/api/categories/${CATEGORY_ID}`);

    assert.equal(response.status, 404);
    assert.deepEqual(response.body, { error: "Category not found." });
  } finally {
    fixture.cleanup();
  }
});
