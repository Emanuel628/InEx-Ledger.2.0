"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const ROUTE_PATH = require.resolve("../routes/entitlements.routes.js");

function loadRouter({ effectiveTier = "v1", usage = null, businesses = [{ id: "biz-1" }], subscriptionExtra = {} } = {}) {
  const originalLoad = Module._load.bind(Module);
  const state = {
    logErrors: [],
    forceError: false
  };

  const defaultUsage = {
    transactions: { limit: 50, used: 17, remaining: 33 },
    receipts: { limit: 25, used: 8, remaining: 17 }
  };

  Module._load = function (requestName, parent, isMain) {
    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        requireAuth(req, res, next) {
          if (!String(req.headers.cookie || "").includes("access_token=")) {
            return res.status(401).json({ error: "Authentication required" });
          }
          req.user = { id: "user-1" };
          next();
        }
      };
    }
    if (requestName === "../api/utils/resolveBusinessIdForUser.js" || /resolveBusinessIdForUser\.js$/.test(requestName)) {
      return {
        resolveBusinessIdForUser: async () => "00000000-0000-4000-8000-000000000301",
        listBusinessesForUser: async () => businesses
      };
    }
    if (requestName === "../services/subscriptionService.js" || /subscriptionService\.js$/.test(requestName)) {
      return {
        PLAN_PRO: "v1",
        PLAN_BUSINESS: "business",
        getSubscriptionSnapshotForBusiness: async () => {
          if (state.forceError) {
            throw new Error("subscription exploded");
          }
          return {
            effectiveTier,
            effectiveStatus: effectiveTier === "v1" ? "active" : "free",
            isPaid: effectiveTier === "v1",
            isTrialing: false,
            cancelAtPeriodEnd: false,
            additionalBusinesses: 0,
            maxBusinessesAllowed: effectiveTier === "v1" ? 2 : 1,
            ...subscriptionExtra
          };
        }
      };
    }
    if (requestName === "../services/basicPlanUsageService.js" || /basicPlanUsageService\.js$/.test(requestName)) {
      return {
        getUsageSummary: async () => usage || defaultUsage
      };
    }
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return { pool: {} };
    }
    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return {
        logError(message, context) {
          state.logErrors.push({ message, context });
        }
      };
    }

    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[ROUTE_PATH];
  const router = require("../routes/entitlements.routes.js");
  const app = express();
  app.use("/api/entitlements", router);

  return {
    app,
    state,
    cleanup() {
      delete require.cache[ROUTE_PATH];
      Module._load = originalLoad;
    }
  };
}

test("entitlements routes require auth", async () => {
  const fixture = loadRouter();
  try {
    const response = await request(fixture.app).get("/api/entitlements/plan-context");
    assert.equal(response.status, 401);
  } finally {
    fixture.cleanup();
  }
});

test("plan-context reports Basic features, usage, and no quick-add fields", async () => {
  const fixture = loadRouter({ effectiveTier: "free" });
  try {
    const response = await request(fixture.app)
      .get("/api/entitlements/plan-context")
      .set("Cookie", "access_token=test");

    assert.equal(response.status, 200);
    assert.equal(response.body.plan.code, "free");
    assert.equal(response.body.plan.name, "Basic");
    assert.equal(response.body.features.transactions, true);
    assert.equal(response.body.features.receipts, true);
    assert.equal(response.body.features.invoices, true);
    assert.equal(response.body.features.mileage, true);
    assert.equal(response.body.features.recurring_transactions, false);
    assert.equal(response.body.features.tax_estimates, false);
    assert.equal(response.body.features.pdf_exports, false);
    assert.equal(response.body.usage.transactions.limit, 50);
    assert.equal(response.body.usage.transactions.used, 17);
    assert.equal(response.body.usage.transactions.remaining, 33);
    assert.ok(response.body.usage.transactions.resetsAt);
    assert.equal(response.body.usage.receipts.limit, 25);
    assert.equal(response.body.upgrade.available, true);
    assert.equal(response.body.upgrade.targetPlan, "v1");
    assert.equal(JSON.stringify(response.body).includes("quick_add"), false);
  } finally {
    fixture.cleanup();
  }
});

test("plan-context reports Pro features with null (not Infinity) usage limits", async () => {
  const fixture = loadRouter({
    effectiveTier: "v1",
    usage: {
      transactions: { limit: Number.POSITIVE_INFINITY, used: 120, remaining: Number.POSITIVE_INFINITY },
      receipts: { limit: Number.POSITIVE_INFINITY, used: 40, remaining: Number.POSITIVE_INFINITY }
    }
  });
  try {
    const response = await request(fixture.app)
      .get("/api/entitlements/plan-context")
      .set("Cookie", "access_token=test");

    assert.equal(response.status, 200);
    assert.equal(response.body.plan.code, "v1");
    assert.equal(response.body.plan.name, "Pro");
    assert.equal(response.body.features.recurring_transactions, true);
    assert.equal(response.body.features.tax_estimates, true);
    assert.equal(response.body.features.pdf_exports, true);
    assert.equal(response.body.usage.transactions.limit, null);
    assert.equal(response.body.usage.transactions.remaining, null);
    assert.equal(response.body.upgrade.available, false);
    const raw = JSON.stringify(response.body);
    assert.doesNotMatch(raw, /Infinity/);
  } finally {
    fixture.cleanup();
  }
});

test("plan-context route logs failures and returns 500", async () => {
  const fixture = loadRouter({ effectiveTier: "v1" });
  try {
    fixture.state.forceError = true;
    const response = await request(fixture.app)
      .get("/api/entitlements/plan-context")
      .set("Cookie", "access_token=test");

    assert.equal(response.status, 500);
    assert.equal(fixture.state.logErrors.length, 1);
    assert.match(fixture.state.logErrors[0].message, /GET \/entitlements\/plan-context error/);
  } finally {
    fixture.cleanup();
  }
});

test("legacy /features endpoint agrees with the plan-context feature map", async () => {
  const fixture = loadRouter({ effectiveTier: "free" });
  try {
    const planContext = await request(fixture.app)
      .get("/api/entitlements/plan-context")
      .set("Cookie", "access_token=test");
    const features = await request(fixture.app)
      .get("/api/entitlements/features")
      .set("Cookie", "access_token=test");

    assert.equal(features.status, 200);
    assert.equal(features.body.effective_tier, "free");
    assert.equal(features.body.receipts_enabled, planContext.body.features.receipts);
    assert.equal(features.body.recurring_templates_enabled, planContext.body.features.recurring_transactions);
    assert.equal(features.body.tax_estimates_enabled, planContext.body.features.tax_estimates);
    assert.equal(features.body.advanced_exports_enabled, planContext.body.features.advanced_exports);
    // Receipts are available on Basic -- confirms the old "receipts are
    // Pro-only" bug in this endpoint is fixed.
    assert.equal(features.body.receipts_enabled, true);
    assert.equal("quick_add_sidebar_enabled" in features.body, false);
    assert.equal("business_quick_add_enabled" in features.body, false);
  } finally {
    fixture.cleanup();
  }
});
