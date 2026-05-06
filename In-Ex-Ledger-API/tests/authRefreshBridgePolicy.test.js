"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
const cookieParser = require("cookie-parser");
const Module = require("node:module");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-refresh-bridge-policy-secret";

const INDEX_ROUTE_PATH = require.resolve("../routes/index.js");

function loadIndexRouter() {
  const originalLoad = Module._load.bind(Module);

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../utils/authUtils.js" || /authUtils\.js$/.test(requestName)) {
      return {
        COOKIE_OPTIONS: { httpOnly: true, sameSite: "strict", secure: false, path: "/" }
      };
    }

    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        requireAuth: (_req, _res, next) => next()
      };
    }

    if (requestName === "../services/subscriptionService.js" || /subscriptionService\.js$/.test(requestName)) {
      return {
        PLAN_PRO: "v1",
        PLAN_BUSINESS: "v2",
        getSubscriptionSnapshotForBusiness: async () => ({ effectiveTier: "free" })
      };
    }

    if (requestName === "../api/utils/resolveBusinessIdForUser.js" || /resolveBusinessIdForUser\.js$/.test(requestName)) {
      return { resolveBusinessIdForUser: async () => "business_1" };
    }

    if (requestName === "../middleware/accountSwitchMfaTrust.js" || /accountSwitchMfaTrust\.js$/.test(requestName)) {
      return {
        allowTrustedBrowserAccountSwitch: (_req, _res, next) => next(),
        rememberTrustedBrowserOnLogout: (_req, _res, next) => next()
      };
    }

    if (requestName === "../api/utils/requireV2BusinessEnabled.js" || /requireV2BusinessEnabled\.js$/.test(requestName)) {
      return {
        requireV2BusinessEnabled: (_req, _res, next) => next(),
        requireV2Entitlement: (_req, _res, next) => next()
      };
    }

    if (requestName === "../services/arApService" || /arApService$/.test(requestName)) {
      return { getArApSummary: async () => ({}) };
    }

    if (/\.routes\.js$/.test(requestName) || /\.routes$/.test(requestName)) {
      const router = express.Router();
      if (/auth\.routes\.js$/.test(requestName)) {
        router.post("/refresh", (_req, res) => res.json({ token: "new-access-token" }));
      }
      return router;
    }

    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[INDEX_ROUTE_PATH];
  try {
    const router = require("../routes/index.js");
    return {
      router,
      cleanup() {
        delete require.cache[INDEX_ROUTE_PATH];
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
  app.use(cookieParser());
  app.use(express.json());
  app.use("/api", router);
  return app;
}

test("refresh is blocked outside the post-login bridge and preserves trusted-device cookies", async () => {
  const fixture = loadIndexRouter();
  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", [
        "refresh_token=abc",
        "mfa_trust=trusted-device-cookie",
        "mfa_global_trust=global-trust-cookie"
      ]);

    assert.equal(response.status, 401);
    assert.equal(response.body?.code, "REAUTH_REQUIRED");
    const setCookies = response.headers["set-cookie"] || [];
    assert.ok(setCookies.some((cookie) => cookie.startsWith("refresh_token=;")), "refresh cookie should be cleared");
    assert.ok(!setCookies.some((cookie) => cookie.startsWith("mfa_trust=;")), "mfa_trust must not be cleared");
    assert.ok(!setCookies.some((cookie) => cookie.startsWith("mfa_global_trust=;")), "mfa_global_trust must not be cleared");
  } finally {
    fixture.cleanup();
  }
});

test("refresh passes through during the short post-login bridge window", async () => {
  const fixture = loadIndexRouter();
  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", [
        "refresh_token=abc",
        "post_login_refresh_bridge=1"
      ]);

    assert.equal(response.status, 200);
    assert.equal(response.body?.token, "new-access-token");
    const setCookies = response.headers["set-cookie"] || [];
    assert.ok(!setCookies.some((cookie) => cookie.startsWith("post_login_refresh_bridge=;")), "bridge should not be consumed on first request");
  } finally {
    fixture.cleanup();
  }
});
