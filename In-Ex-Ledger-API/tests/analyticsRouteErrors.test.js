"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const { attachCentralErrorHandler } = require("./helpers/testPool.js");

const ROUTE_PATH = require.resolve("../routes/analytics.routes.js");

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
      return { resolveBusinessIdForUser: async () => "biz_1" };
    }
    if (/subscriptionService\.js$/.test(requestName)) {
      return {
        getSubscriptionSnapshotForBusiness: async () => ({ plan: "basic" }),
        hasFeatureAccess: () => false
      };
    }
    if (/db\.js$/.test(requestName)) {
      return {
        pool: {
          query: queryImpl || (async () => ({ rows: [], rowCount: 0 }))
        }
      };
    }
    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[ROUTE_PATH];
  const router = require(ROUTE_PATH);
  const app = express();
  app.use(express.json());
  app.use("/api/analytics", router);
  attachCentralErrorHandler(app);

  return {
    app,
    cleanup() {
      delete require.cache[ROUTE_PATH];
      Module._load = originalLoad;
    }
  };
}

test("POST /whatif returns a specific 400 for invalid numeric inputs", async () => {
  const fixture = loadFixture();
  try {
    const response = await request(fixture.app)
      .post("/api/analytics/whatif")
      .send({ income_change_pct: "not-a-number" });

    assert.equal(response.status, 400);
    assert.deepEqual(response.body, { error: "income_change_pct must be a finite number." });
  } finally {
    fixture.cleanup();
  }
});

test("GET /cash-flow returns a generic 500 for unexpected database failures", async () => {
  const fixture = loadFixture({
    queryImpl: async () => {
      throw new Error("connection reset");
    }
  });

  try {
    const response = await request(fixture.app).get("/api/analytics/cash-flow");

    assert.equal(response.status, 500);
    assert.deepEqual(response.body, { error: "Internal server error" });
  } finally {
    fixture.cleanup();
  }
});

test("GET /seasonal preserves the empty analytics response shape", async () => {
  const fixture = loadFixture();
  try {
    const response = await request(fixture.app).get("/api/analytics/seasonal");

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { months: [], overall_avg: 0, insights: [] });
  } finally {
    fixture.cleanup();
  }
});
