"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const ROUTE_PATH = require.resolve("../routes/billing.routes.js");

function loadBillingRouter(options = {}) {
  const originalLoad = Module._load.bind(Module);
  const previousEnv = {
    ENABLE_MOCK_BILLING: process.env.ENABLE_MOCK_BILLING,
    NODE_ENV: process.env.NODE_ENV,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    APP_BASE_URL: process.env.APP_BASE_URL
  };

  process.env.ENABLE_MOCK_BILLING = options.enableMockBilling ? "true" : "false";
  process.env.NODE_ENV = options.nodeEnv || "test";
  process.env.STRIPE_SECRET_KEY = options.stripeSecretKey || "sk_test_mock_billing";
  process.env.APP_BASE_URL = "https://app.inexledger.test";

  const state = {
    updateCalled: false
  };

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        requireAuth(req, res, next) {
          if (options.authenticated === false) {
            return res.status(401).json({ error: "Authentication required." });
          }
          req.user = { id: "user_mock_001" };
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
      return {
        createBillingMutationLimiter() {
          return (_req, _res, next) => next();
        }
      };
    }
    if (requestName === "../api/utils/resolveBusinessIdForUser.js" || /resolveBusinessIdForUser\.js$/.test(requestName)) {
      return {
        resolveBusinessIdForUser: async () => "biz_mock_001"
      };
    }
    if (requestName === "../services/subscriptionService.js" || /subscriptionService\.js$/.test(requestName)) {
      return {
        findBillingAnchorBusinessIdForUser: async () => "biz_mock_001",
        getSubscriptionSnapshotForBusiness: async () => ({ effectiveTier: "v1" }),
        updateStripeCustomerForBusiness: async () => {},
        syncStripeSubscriptionForBusiness: async () => {},
        setTrialPlanSelectionForBusiness: async () => {},
        setFreePlanForBusiness: async () => {}
      };
    }
    if (requestName === "../services/stripePriceConfig.js" || /stripePriceConfig\.js$/.test(requestName)) {
      return {
        buildStripePriceEnvMap: () => ({ base: {}, addon: {} }),
        buildStripePriceLookup: () => ({
          addonPriceIds: new Set(),
          metadataByPriceId: new Map()
        })
      };
    }
    if (requestName === "../services/emailI18nService.js" || /emailI18nService\.js$/.test(requestName)) {
      return {
        getPreferredLanguageForUser: async () => "en",
        buildBillingLifecycleEmail: () => ({ subject: "", html: "", text: "" })
      };
    }
    if (requestName === "../services/signInSecurityService.js" || /signInSecurityService\.js$/.test(requestName)) {
      return {
        normalizeIpAddress: () => null,
        fetchIpLocation: async () => null
      };
    }
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql) {
            if (/UPDATE business_subscriptions/i.test(sql)) {
              state.updateCalled = true;
            }
            return { rows: [], rowCount: 1 };
          }
        }
      };
    }
    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return {
        logError() {},
        logWarn() {},
        logInfo() {}
      };
    }
    if (requestName === "express-rate-limit") {
      return function rateLimit() {
        return (_req, _res, next) => next();
      };
    }
    if (requestName === "resend") {
      return {
        Resend: class Resend {
          constructor() {
            this.emails = { send: async () => ({ id: "email_mock_001" }) };
          }
        }
      };
    }

    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[ROUTE_PATH];

  try {
    const router = require("../routes/billing.routes.js");
    const app = express();
    app.use(express.json());
    app.use("/api/billing", router);
    return {
      app,
      state,
      cleanup() {
        delete require.cache[ROUTE_PATH];
        Module._load = originalLoad;
        process.env.ENABLE_MOCK_BILLING = previousEnv.ENABLE_MOCK_BILLING;
        process.env.NODE_ENV = previousEnv.NODE_ENV;
        process.env.STRIPE_SECRET_KEY = previousEnv.STRIPE_SECRET_KEY;
        process.env.APP_BASE_URL = previousEnv.APP_BASE_URL;
      }
    };
  } catch (error) {
    Module._load = originalLoad;
    process.env.ENABLE_MOCK_BILLING = previousEnv.ENABLE_MOCK_BILLING;
    process.env.NODE_ENV = previousEnv.NODE_ENV;
    process.env.STRIPE_SECRET_KEY = previousEnv.STRIPE_SECRET_KEY;
    process.env.APP_BASE_URL = previousEnv.APP_BASE_URL;
    throw error;
  }
}

test("billing mock-v1 status is no longer publicly readable", async () => {
  const fixture = loadBillingRouter({ authenticated: false });
  try {
    const response = await request(fixture.app)
      .get("/api/billing/mock-v1");

    assert.equal(response.status, 401);
  } finally {
    fixture.cleanup();
  }
});

test("billing mock-v1 returns 404 when mock billing is disabled", async () => {
  const fixture = loadBillingRouter({ authenticated: true, enableMockBilling: false });
  try {
    const response = await request(fixture.app)
      .get("/api/billing/mock-v1");

    assert.equal(response.status, 404);
  } finally {
    fixture.cleanup();
  }
});

test("billing mock-v1 write path is blocked in production-like environments", async () => {
  const fixture = loadBillingRouter({
    authenticated: true,
    enableMockBilling: true,
    stripeSecretKey: "sk_live_blocked_001"
  });
  try {
    const response = await request(fixture.app)
      .post("/api/billing/mock-v1")
      .send({});

    assert.equal(response.status, 404);
    assert.equal(fixture.state.updateCalled, false);
  } finally {
    fixture.cleanup();
  }
});

test("billing mock-v1 remains available only in explicit non-production test mode", async () => {
  const fixture = loadBillingRouter({
    authenticated: true,
    enableMockBilling: true,
    nodeEnv: "test",
    stripeSecretKey: "sk_test_mock_001"
  });
  try {
    const response = await request(fixture.app)
      .post("/api/billing/mock-v1")
      .send({});

    assert.equal(response.status, 200);
    assert.equal(fixture.state.updateCalled, true);
  } finally {
    fixture.cleanup();
  }
});
