"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const ROUTE_PATH = require.resolve("../routes/entitlements.routes.js");

function loadRouter(effectiveTier = "v1") {
  const originalLoad = Module._load.bind(Module);
  const state = {
    logErrors: [],
    forceError: false
  };

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        requireAuth(req, res, next) {
          if (!req.headers.authorization) {
            return res.status(401).json({ error: "Authentication required" });
          }
          req.user = { id: "user-1" };
          next();
        }
      };
    }
    if (requestName === "../api/utils/resolveBusinessIdForUser.js" || /resolveBusinessIdForUser\.js$/.test(requestName)) {
      return {
        resolveBusinessIdForUser: async () => "00000000-0000-4000-8000-000000000301"
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
          return { effectiveTier };
        }
      };
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
    const response = await request(fixture.app).get("/api/entitlements/features");
    assert.equal(response.status, 401);
  } finally {
    fixture.cleanup();
  }
});

test("entitlements features reflect the current business tier", async () => {
  const fixture = loadRouter("business");
  try {
    const response = await request(fixture.app)
      .get("/api/entitlements/features")
      .set("Authorization", "Bearer test");

    assert.equal(response.status, 200);
    assert.equal(response.body.effective_tier, "business");
    assert.equal(response.body.business_quick_add_enabled, true);
    assert.equal(response.body.quick_add_sidebar_enabled, true);
  } finally {
    fixture.cleanup();
  }
});

test("entitlements route logs failures and returns 500", async () => {
  const fixture = loadRouter("v1");
  try {
    fixture.state.forceError = true;
    const response = await request(fixture.app)
      .get("/api/entitlements/features")
      .set("Authorization", "Bearer test");

    assert.equal(response.status, 500);
    assert.equal(fixture.state.logErrors.length, 1);
    assert.match(fixture.state.logErrors[0].message, /GET \/entitlements\/features error/);
  } finally {
    fixture.cleanup();
  }
});
