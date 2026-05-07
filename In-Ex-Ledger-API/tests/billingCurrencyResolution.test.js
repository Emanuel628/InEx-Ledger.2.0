"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const BILLING_ROUTE_PATH = require.resolve("../routes/billing.routes.js");

function loadBillingRouter({
  country = "Canada",
  existingStripeSubscription = null,
  subscriptionSnapshots = null
} = {}) {
  const state = {
    stripeRequests: [],
    stripeCustomerId: null,
    normalizationUpdates: 0
  };

  const originalLoad = Module._load.bind(Module);
  const originalFetch = global.fetch;

  Module._load = function (requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql) {
            if (/SELECT stripe_customer_id/i.test(sql)) {
              return state.stripeCustomerId
                ? { rows: [{ stripe_customer_id: state.stripeCustomerId }], rowCount: 1 }
                : { rows: [], rowCount: 0 };
            }
            if (/UPDATE business_subscriptions\s+SET cancel_at_period_end = false/i.test(sql)) {
              state.normalizationUpdates += 1;
              return { rows: [], rowCount: 1 };
            }
            return { rows: [], rowCount: 0 };
          },
          async connect() {
            return {
              async query(sql, params = []) {
                if (/SELECT pg_advisory_xact_lock/i.test(sql)) return { rows: [], rowCount: 1 };
                if (/SELECT stripe_customer_id/i.test(sql)) {
                  return state.stripeCustomerId
                    ? { rows: [{ stripe_customer_id: state.stripeCustomerId }], rowCount: 1 }
                    : { rows: [], rowCount: 0 };
                }
                if (/UPDATE business_subscriptions\s+SET stripe_customer_id/i.test(sql)) {
                  state.stripeCustomerId = params[1] || null;
                  return { rows: [], rowCount: 1 };
                }
                if (/UPDATE business_subscriptions\s+SET cancel_at_period_end = false/i.test(sql)) {
                  state.normalizationUpdates += 1;
                  return { rows: [], rowCount: 1 };
                }
                return { rows: [], rowCount: 0 };
              },
              release() {}
            };
          }
        }
      };
    }

    if (
      requestName === "../services/subscriptionService.js" ||
      /subscriptionService\.js$/.test(requestName)
    ) {
      const snapshots = Array.isArray(subscriptionSnapshots) && subscriptionSnapshots.length
        ? subscriptionSnapshots.map((snapshot) => ({ ...snapshot }))
        : null;
      return {
        getSubscriptionSnapshotForBusiness: async () => {
          if (snapshots) {
            return snapshots.length > 1 ? snapshots.shift() : snapshots[0];
          }
          return {
            isPaid: false,
            isCanceledWithRemainingAccess: false
          };
        },
        findBillingAnchorBusinessIdForUser: async () => "22222222-2222-4222-8222-222222222222",
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
              usd: "STRIPE_PRO_M_US",
              cad: "STRIPE_PRO_M_CA"
            },
            yearly: {
              usd: "STRIPE_PRO_Y_US",
              cad: "STRIPE_PRO_Y_CA"
            }
          },
          addon: {
            monthly: {
              usd: "STRIPE_ADDL_M_US",
              cad: "STRIPE_ADDL_M_CA"
            },
            yearly: {
              usd: "STRIPE_ADDL_Y_US",
              cad: "STRIPE_ADDL_Y_CA"
            }
          }
        })
      };
    }

    if (
      requestName === "../services/emailI18nService.js" ||
      /emailI18nService\.js$/.test(requestName)
    ) {
      return {
        getPreferredLanguageForUser: async () => "en",
        buildBillingLifecycleEmail: () => ({
          subject: "Billing update",
          html: "<p>ok</p>",
          text: "ok"
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
        requireMfa: (_req, _res, next) => next(),
        requireMfaIfEnabled: (_req, _res, next) => next()
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

  process.env.STRIPE_SECRET_KEY = "sk_test_billing";
  process.env.APP_BASE_URL = "https://app.inexledger.test";
  process.env.STRIPE_PRO_M_US = "price_month_usd";
  process.env.STRIPE_PRO_M_CA = "price_month_cad";
  process.env.STRIPE_PRO_Y_US = "price_year_usd";
  process.env.STRIPE_PRO_Y_CA = "price_year_cad";
  process.env.STRIPE_ADDL_M_US = "price_addon_month_usd";
  process.env.STRIPE_ADDL_M_CA = "price_addon_month_cad";
  process.env.STRIPE_ADDL_Y_US = "price_addon_year_usd";
  process.env.STRIPE_ADDL_Y_CA = "price_addon_year_cad";

  global.fetch = async (url, options = {}) => {
    state.stripeRequests.push({
      url,
      body: options.body ? new URLSearchParams(options.body) : null
    });

    if (String(url).includes("/prices/")) {
      const priceId = String(url).split("/prices/")[1];
      const catalog = {
        price_month_usd: { id: "price_month_usd", unit_amount: 1200 },
        price_month_cad: { id: "price_month_cad", unit_amount: 1700 },
        price_year_usd: { id: "price_year_usd", unit_amount: 12240 },
        price_year_cad: { id: "price_year_cad", unit_amount: 17500 },
        price_addon_month_usd: { id: "price_addon_month_usd", unit_amount: 500 },
        price_addon_month_cad: { id: "price_addon_month_cad", unit_amount: 700 },
        price_addon_year_usd: { id: "price_addon_year_usd", unit_amount: 5100 },
        price_addon_year_cad: { id: "price_addon_year_cad", unit_amount: 7200 }
      };
      const price = catalog[priceId];
      if (!price) {
        throw new Error(`Unexpected Stripe price lookup: ${url}`);
      }
      return {
        ok: true,
        json: async () => price
      };
    }

    if (String(url).endsWith("/customers")) {
      return {
        ok: true,
        json: async () => ({ id: "cus_test_123" })
      };
    }

    if (String(url).includes("/subscriptions?customer=")) {
      return {
        ok: true,
        json: async () => ({ data: existingStripeSubscription ? [existingStripeSubscription] : [] })
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
        delete process.env.STRIPE_PRO_M_US;
        delete process.env.STRIPE_PRO_M_CA;
        delete process.env.STRIPE_PRO_Y_US;
        delete process.env.STRIPE_PRO_Y_CA;
        delete process.env.STRIPE_ADDL_M_US;
        delete process.env.STRIPE_ADDL_M_CA;
        delete process.env.STRIPE_ADDL_Y_US;
        delete process.env.STRIPE_ADDL_Y_CA;
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

test("billing pricing returns Stripe-backed monthly and yearly amounts for the resolved currency", async () => {
  const fixture = loadBillingRouter({ country: "Canada" });

  try {
    const res = await request(fixture.app).get("/api/billing/pricing");
    assert.equal(res.status, 200);
    assert.equal(res.body.currency, "cad");
    assert.equal(res.body.pricing.monthly.base, 17);
    assert.equal(res.body.pricing.monthly.addon, 7);
    assert.equal(res.body.pricing.yearly.base, 175);
    assert.equal(res.body.pricing.yearly.addon, 72);
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

test("billing checkout rejects insecure APP_BASE_URL values", async () => {
  const fixture = loadBillingRouter({ country: "United States" });
  const originalBaseUrl = process.env.APP_BASE_URL;

  try {
    process.env.APP_BASE_URL = "http://app.inexledger.test";

    const res = await request(fixture.app)
      .post("/api/billing/checkout-session")
      .send({
        billingInterval: "monthly",
        additionalBusinesses: 0
      });

    assert.equal(res.status, 500);
    assert.equal(res.body.error, "Failed to start checkout.");
  } finally {
    process.env.APP_BASE_URL = originalBaseUrl;
    fixture.cleanup();
  }
});

test("billing checkout blocks duplicate subscription creation when Stripe already has a live subscription for the customer", async () => {
  const fixture = loadBillingRouter({
    country: "United States",
    existingStripeSubscription: {
      id: "sub_existing_live",
      status: "active",
      current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30
    }
  });

  try {
    const res = await request(fixture.app)
      .post("/api/billing/checkout-session")
      .send({
        billingInterval: "monthly",
        additionalBusinesses: 1
      });

    assert.equal(res.status, 409);
    assert.match(String(res.body?.error || ""), /already has an active|overlapping/i);
  } finally {
    fixture.cleanup();
  }
});

test("billing checkout normalizes downgraded trial state before creating Stripe checkout", async () => {
  const fixture = loadBillingRouter({
    country: "Canada",
    subscriptionSnapshots: [
      {
        isPaid: false,
        isCanceledWithRemainingAccess: false,
        isTrialing: true,
        cancelAtPeriodEnd: true,
        selectedPlanCode: "free",
        trialPlanSelection: "free",
        isTrialDowngradedToFree: true,
        trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        isPaid: false,
        isCanceledWithRemainingAccess: false,
        isTrialing: true,
        cancelAtPeriodEnd: false,
        selectedPlanCode: "v1",
        trialPlanSelection: "v1",
        isTrialDowngradedToFree: false,
        trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      }
    ]
  });

  try {
    const res = await request(fixture.app)
      .post("/api/billing/checkout-session")
      .send({
        billingInterval: "monthly",
        additionalBusinesses: 0
      });

    assert.equal(res.status, 200);
    assert.equal(fixture.state.normalizationUpdates, 1);

    const checkoutRequest = fixture.state.stripeRequests.find((entry) =>
      String(entry.url).endsWith("/checkout/sessions")
    );

    assert.ok(checkoutRequest, "Stripe checkout request should be created");
    assert.ok(checkoutRequest.body.get("subscription_data[trial_end]"));
  } finally {
    fixture.cleanup();
  }
});
