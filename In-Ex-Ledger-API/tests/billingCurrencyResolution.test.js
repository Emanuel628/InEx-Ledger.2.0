"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const BILLING_ROUTE_PATH = require.resolve("../routes/billing.routes.js");

function loadBillingRouter({ country = "Canada" } = {}) {
  const state = {
    stripeRequests: []
  };

  const originalLoad = Module._load.bind(Module);
  const originalFetch = global.fetch;

  Module._load = function (requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql) {
            if (/SELECT stripe_customer_id/i.test(sql)) {
              return { rows: [], rowCount: 0 };
            }
            return { rows: [], rowCount: 0 };
          }
        }
      };
    }

    if (
      requestName === "../services/subscriptionService.js" ||
      /subscriptionService\.js$/.test(requestName)
    ) {
      return {
        getSubscriptionSnapshotForBusiness: async () => ({
          isPaid: false,
          isCanceledWithRemainingAccess: false
        }),
        updateStripeCustomerForBusiness: async () => {},
        syncStripeSubscriptionForBusiness: async () => {},
        setFreePlanForBusiness: async () => {}
      };
    }

    if (
      requestName === "../services/stripePriceConfig.js" ||
      /stripePriceConfig\.js$/.test(requestName)
    ) {
      return {
        buildStripePriceEnvMap: () => ({
          base: {
            monthly: {
              usd: "STRIPE_PRICE_V1_MONTHLY_USD",
              cad: "STRIPE_PRICE_V1_MONTHLY_CAD"
            },
            yearly: {
              usd: "STRIPE_PRICE_V1_YEARLY_USD",
              cad: "STRIPE_PRICE_V1_YEARLY_CAD"
            }
          },
          addon: {
            monthly: {
              usd: "STRIPE_PRICE_V1_ADDON_MONTHLY_USD",
              cad: "STRIPE_PRICE_V1_ADDON_MONTHLY_CAD"
            },
            yearly: {
              usd: "STRIPE_PRICE_V1_ADDON_YEARLY_USD",
              cad: "STRIPE_PRICE_V1_ADDON_YEARLY_CAD"
            }
          }
        })
      };
    }

    if (
      requestName === "../services/signInSecurityService.js" ||
      /signInSecurityService\.js$/.test(requestName)
    ) {
      return {
        normalizeIpAddress: (value) => String(value || "").trim(),
        fetchIpLocation: async () => (country ? { country } : null)
      };
    }

    if (
      requestName === "../middleware/auth.middleware.js" ||
      /auth\.middleware\.js$/.test(requestName)
    ) {
      return {
        requireAuth: (req, _res, next) => {
          req.user = {
            id: "11111111-1111-4111-8111-111111111111",
            email: "owner@example.com",
            display_name: "Owner Example"
          };
          next();
        },
        requireMfa: (_req, _res, next) => next()
      };
    }

    if (
      requestName === "../middleware/csrf.middleware.js" ||
      /csrf\.middleware\.js$/.test(requestName)
    ) {
      return { requireCsrfProtection: (_req, _res, next) => next() };
    }

    if (
      requestName === "../middleware/rateLimitTiers.js" ||
      /rateLimitTiers\.js$/.test(requestName)
    ) {
      return { createBillingMutationLimiter: () => (_req, _res, next) => next() };
    }

    if (
      requestName === "../api/utils/resolveBusinessIdForUser.js" ||
      /resolveBusinessIdForUser\.js$/.test(requestName)
    ) {
      return {
        resolveBusinessIdForUser: async () => "22222222-2222-4222-8222-222222222222"
      };
    }

    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return { logError() {}, logWarn() {}, logInfo() {} };
    }

    if (requestName === "express-rate-limit") {
      return function rateLimit() {
        return (_req, _res, next) => next();
      };
    }

    return originalLoad(requestName, parent, isMain);
  };

  process.env.STRIPE_SECRET_KEY = "sk_test_billing";
  process.env.APP_BASE_URL = "https://app.inexledger.test";
  process.env.STRIPE_PRICE_V1_MONTHLY_USD = "price_month_usd";
  process.env.STRIPE_PRICE_V1_MONTHLY_CAD = "price_month_cad";
  process.env.STRIPE_PRICE_V1_YEARLY_USD = "price_year_usd";
  process.env.STRIPE_PRICE_V1_YEARLY_CAD = "price_year_cad";
  process.env.STRIPE_PRICE_V1_ADDON_MONTHLY_USD = "price_addon_month_usd";
  process.env.STRIPE_PRICE_V1_ADDON_MONTHLY_CAD = "price_addon_month_cad";
  process.env.STRIPE_PRICE_V1_ADDON_YEARLY_USD = "price_addon_year_usd";
  process.env.STRIPE_PRICE_V1_ADDON_YEARLY_CAD = "price_addon_year_cad";

  global.fetch = async (url, options = {}) => {
    state.stripeRequests.push({
      url,
      body: options.body ? new URLSearchParams(options.body) : null
    });

    if (String(url).endsWith("/customers")) {
      return {
        ok: true,
        json: async () => ({ id: "cus_test_123" })
      };
    }

    if (String(url).endsWith("/checkout/sessions")) {
      return {
        ok: true,
        json: async () => ({
          id: "cs_test_123",
          url: "https://checkout.stripe.com/pay/cs_test_123"
        })
      };
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  delete require.cache[BILLING_ROUTE_PATH];

  try {
    const router = require("../routes/billing.routes.js");
    const app = express();
    app.use(express.json());
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
        delete process.env.STRIPE_PRICE_V1_MONTHLY_USD;
        delete process.env.STRIPE_PRICE_V1_MONTHLY_CAD;
        delete process.env.STRIPE_PRICE_V1_YEARLY_USD;
        delete process.env.STRIPE_PRICE_V1_YEARLY_CAD;
        delete process.env.STRIPE_PRICE_V1_ADDON_MONTHLY_USD;
        delete process.env.STRIPE_PRICE_V1_ADDON_MONTHLY_CAD;
        delete process.env.STRIPE_PRICE_V1_ADDON_YEARLY_USD;
        delete process.env.STRIPE_PRICE_V1_ADDON_YEARLY_CAD;
      }
    };
  } catch (err) {
    Module._load = originalLoad;
    global.fetch = originalFetch;
    throw err;
  }
}

test("billing pricing context resolves CAD from verified IP geolocation", async () => {
  const fixture = loadBillingRouter({ country: "Canada" });

  try {
    const res = await request(fixture.app).get("/api/billing/pricing-context");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      currency: "cad",
      country_code: "ca",
      source: "ip_geolocation"
    });
  } finally {
    fixture.cleanup();
  }
});

test("billing checkout ignores client currency and uses verified region currency", async () => {
  const fixture = loadBillingRouter({ country: "Canada" });

  try {
    const res = await request(fixture.app)
      .post("/api/billing/checkout-session")
      .send({
        billingInterval: "monthly",
        currency: "usd",
        additionalBusinesses: 2
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.url, "https://checkout.stripe.com/pay/cs_test_123");

    const checkoutRequest = fixture.state.stripeRequests.find((entry) =>
      String(entry.url).endsWith("/checkout/sessions")
    );

    assert.ok(checkoutRequest, "Stripe checkout request should be created");
    assert.equal(checkoutRequest.body.get("line_items[0][price]"), "price_month_cad");
    assert.equal(checkoutRequest.body.get("line_items[1][price]"), "price_addon_month_cad");
    assert.equal(checkoutRequest.body.get("metadata[currency]"), "cad");
    assert.equal(checkoutRequest.body.get("metadata[country_code]"), "ca");
    assert.equal(checkoutRequest.body.get("metadata[currency_source]"), "ip_geolocation");
  } finally {
    fixture.cleanup();
  }
});
