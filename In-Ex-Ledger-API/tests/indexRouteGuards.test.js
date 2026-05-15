"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const ROUTE_PATH = require.resolve("../routes/index.js");

function emptyRouter() {
  return express.Router();
}

function loadIndexRouterFixture(options = {}) {
  const originalLoad = Module._load.bind(Module);
  const state = {
    arApBusinessId: null
  };

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../services/arApService") {
      return {
        getArApSummary: async (businessId) => {
          state.arApBusinessId = businessId;
          return { businessId, ok: true };
        }
      };
    }

    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        requireAuth(req, _res, next) {
          req.user = { id: "user_index_001" };
          next();
        }
      };
    }

    if (requestName === "../api/utils/resolveBusinessIdForUser.js" || /resolveBusinessIdForUser\.js$/.test(requestName)) {
      return {
        resolveBusinessIdForUser: async () => "biz_index_001"
      };
    }

    if (requestName === "../services/subscriptionService.js" || /subscriptionService\.js$/.test(requestName)) {
      return {
        PLAN_PRO: "pro",
        PLAN_BUSINESS: "business",
        getSubscriptionSnapshotForBusiness: async () => {
          if (options.throwSubscription) {
            throw new Error("subscription lookup failed");
          }
          return { effectiveTier: options.tier || "free" };
        }
      };
    }

    if (requestName === "../api/utils/requireV2BusinessEnabled.js" || /requireV2BusinessEnabled\.js$/.test(requestName)) {
      return {
        requireV2BusinessEnabled(_req, _res, next) {
          next();
        },
        requireV2Entitlement(_req, _res, next) {
          next();
        }
      };
    }

    if (requestName === "./exports.routes.js" || /exports\.routes\.js$/.test(requestName)) {
      const router = express.Router();
      router.get("/history", (_req, res) => res.json([{ id: "export_001" }]));
      return router;
    }

    if (requestName === "./recurring.routes.js" || /recurring\.routes\.js$/.test(requestName)) {
      const router = express.Router();
      router.get("/", (_req, res) => res.json([{ id: "recurring_001" }]));
      router.get("/upcoming", (_req, res) => res.json([{ id: "upcoming_001" }]));
      return router;
    }

    if (
      requestName.startsWith("./") &&
      requestName.endsWith(".routes.js") &&
      requestName !== "./exports.routes.js" &&
      requestName !== "./recurring.routes.js"
    ) {
      return emptyRouter();
    }

    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[ROUTE_PATH];

  try {
    const router = require("../routes/index.js");
    const app = express();
    app.use(express.json());
    app.use("/api", router);
    return {
      app,
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

test("index arap-summary resolves the business id instead of reading req.business", async () => {
  const fixture = loadIndexRouterFixture({ tier: "pro" });

  try {
    const response = await request(fixture.app).get("/api/arap-summary");
    assert.equal(response.status, 200);
    assert.equal(response.body.businessId, "biz_index_001");
    assert.equal(fixture.state.arApBusinessId, "biz_index_001");
  } finally {
    fixture.cleanup();
  }
});

test("index recurring preload returns an empty list for non-paid tiers", async () => {
  const fixture = loadIndexRouterFixture({ tier: "free" });

  try {
    const response = await request(fixture.app).get("/api/recurring");
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, []);
  } finally {
    fixture.cleanup();
  }
});

test("index exports/history fails closed when the tier lookup fails", async () => {
  const fixture = loadIndexRouterFixture({ throwSubscription: true });

  try {
    const response = await request(fixture.app).get("/api/exports/history");
    assert.equal(response.status, 503);
    assert.equal(response.body.error, "Failed to load export history preview.");
  } finally {
    fixture.cleanup();
  }
});
