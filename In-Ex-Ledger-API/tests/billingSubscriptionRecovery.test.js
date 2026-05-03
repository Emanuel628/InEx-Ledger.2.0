"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const BILLING_ROUTE_PATH = require.resolve("../routes/billing.routes.js");

function loadBillingRouterFixture() {
  const state = {
    syncCalls: [],
    snapshotCalls: 0
  };

  const originalLoad = Module._load.bind(Module);
  const originalFetch = global.fetch;

  global.fetch = async (url) => {
    if (String(url).includes("/subscriptions?customer=")) {
      return {
        ok: true,
        async json() {
          return {
            data: [
              {
                id: "sub_live_123",
                customer: "cus_live_123",
                status: "active",
                cancel_at_period_end: false,
                current_period_start: Math.floor(Date.now() / 1000) - 86400,
                current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
                metadata: {
                  business_id: "biz_live_123",
                  additional_businesses: "2"
                },
                items: { data: [] }
              }
            ]
          };
        }
      };
    }

    throw new Error(`Unexpected fetch in billingSubscriptionRecovery test: ${url}`);
  };

  Module._load = function (requestName, parent, isMain) {
    if (requestName === "../services/subscriptionService.js" || /subscriptionService\.js$/.test(requestName)) {
      return {
        getSubscriptionSnapshotForBusiness: async () => {
          state.snapshotCalls += 1;
          if (state.snapshotCalls === 1) {
            return {
              effectiveTier: "free",
              effectiveStatus: "free",
              isPaid: false,
              stripeCustomerId: "cus_live_123",
              maxBusinessesAllowed: 1
            };
          }
          return {
            effectiveTier: "v1",
            effectiveStatus: "active",
            isPaid: true,
            stripeCustomerId: "cus_live_123",
            additionalBusinesses: 2,
            maxBusinessesAllowed: 3
          };
        },
        updateStripeCustomerForBusiness: async () => {},
        syncStripeSubscriptionForBusiness: async (businessId, subscription) => {
          state.syncCalls.push({ businessId, subscription });
        },
        setFreePlanForBusiness: async () => {},
        getPlanDisplayName: (tier) => tier
      };
    }

    if (requestName === "../api/utils/resolveBusinessIdForUser.js" || /resolveBusinessIdForUser\.js$/.test(requestName)) {
      return { resolveBusinessIdForUser: async () => "biz_live_123" };
    }

    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        requireAuth: (req, _res, next) => {
          req.user = { id: "user_live_123", email: "user@example.com" };
          next();
        },
        requireMfa: (_req, _res, next) => next(),
        requireMfaIfEnabled: (_req, _res, next) => next()
      };
    }

    if (requestName === "../middleware/csrf.middleware.js" || /csrf\.middleware\.js$/.test(requestName)) {
      return { requireCsrfProtection: (_req, _res, next) => next() };
    }

    if (requestName === "../middleware/rateLimitTiers.js" || /rateLimitTiers\.js$/.test(requestName)) {
      return {
        createBillingMutationLimiter: () => (_req, _res, next) => next()
      };
    }

    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return { pool: { async query() { return { rows: [], rowCount: 0 }; } } };
    }

    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return { logError() {}, logWarn() {}, logInfo() {} };
    }

    if (requestName === "../services/stripePriceConfig.js" || /stripePriceConfig\.js$/.test(requestName)) {
      return {
        buildStripePriceEnvMap: () => ({ base: {}, addon: {} }),
        buildStripePriceLookup: () => ({ basePriceIds: new Set(), addonPriceIds: new Set(), metadataByPriceId: new Map() })
      };
    }

    if (requestName === "../services/emailI18nService.js" || /emailI18nService\.js$/.test(requestName)) {
      return {
        getPreferredLanguageForUser: async () => "en",
        buildBillingLifecycleEmail: () => ({ subject: "ok", html: "<p>ok</p>", text: "ok" })
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
            this.emails = { send: async () => ({ id: "email_test_123" }) };
          }
        }
      };
    }

    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[BILLING_ROUTE_PATH];
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_billing_subscription_recovery";
  process.env.APP_BASE_URL = process.env.APP_BASE_URL || "https://app.inexledger.test";

  const router = require("../routes/billing.routes.js");
  const app = express();
  app.use("/api/billing", router);

  return {
    app,
    state,
    cleanup() {
      delete require.cache[BILLING_ROUTE_PATH];
      Module._load = originalLoad;
      global.fetch = originalFetch;
      delete process.env.STRIPE_SECRET_KEY;
      delete process.env.APP_BASE_URL;
    }
  };
}

test("billing subscription endpoint self-heals stale free state from Stripe", async () => {
  const fixture = loadBillingRouterFixture();

  try {
    const response = await request(fixture.app).get("/api/billing/subscription");
    assert.equal(response.status, 200);
    assert.equal(fixture.state.syncCalls.length, 1);
    assert.equal(fixture.state.syncCalls[0].businessId, "biz_live_123");
    assert.equal(response.body?.subscription?.effectiveTier, "v1");
    assert.equal(response.body?.subscription?.maxBusinessesAllowed, 3);
  } finally {
    fixture.cleanup();
  }
});
