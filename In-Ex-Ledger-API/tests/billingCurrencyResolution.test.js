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
  subscriptionSnapshots = null,
  searchedStripeCustomerId = null,
  missingSubscriptionRow = false,
  stripeSubscriptionResponse = null,
  priceOverrides = {},
  businessRegion = null
} = {}) {
  const state = {
    stripeRequests: [],
    stripeCustomerId: null,
    normalizationUpdates: 0,
    country,
    missingSubscriptionRow,
    auditCalls: []
  };

  const originalLoad = Module._load.bind(Module);
  const originalFetch = global.fetch;

  Module._load = function (requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql) {
            if (/SELECT region FROM businesses/i.test(sql)) {
              return businessRegion
                ? { rows: [{ region: businessRegion }], rowCount: 1 }
                : { rows: [], rowCount: 0 };
            }
            if (/SELECT stripe_customer_id/i.test(sql)) {
              if (state.missingSubscriptionRow) {
                return { rows: [], rowCount: 0 };
              }
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
                  if (state.missingSubscriptionRow) {
                    return { rows: [], rowCount: 0 };
                  }
                  return state.stripeCustomerId
                    ? { rows: [{ stripe_customer_id: state.stripeCustomerId }], rowCount: 1 }
                    : { rows: [], rowCount: 0 };
                }
                if (/UPDATE business_subscriptions\s+SET stripe_customer_id/i.test(sql)) {
                  state.stripeCustomerId = params[1] || null;
                  return { rows: [], rowCount: 1 };
                }
                if (/INSERT INTO business_subscriptions[\s\S]*stripe_customer_id/i.test(sql)) {
                  state.stripeCustomerId = params[3] || null;
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

    if (requestName === "../services/auditEventService.js" || /auditEventService\.js$/.test(requestName)) {
      return {
        AUDIT_ACTIONS: {
          BILLING_CHECKOUT_STARTED: "billing.checkout.started"
        },
        async recordAuditEventForRequest(_pool, _req, payload) {
          state.auditCalls.push(payload);
          return "audit-1";
        }
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
        }),
        buildStripePriceLookup: () => ({
          basePriceIds: new Set([
            "price_month_usd",
            "price_month_cad",
            "price_year_usd",
            "price_year_cad"
          ]),
          addonPriceIds: new Set([
            "price_addon_month_usd",
            "price_addon_month_cad",
            "price_addon_year_usd",
            "price_addon_year_cad"
          ]),
          metadataByPriceId: new Map([
            ["price_month_usd", { billingInterval: "monthly", currency: "usd", type: "base" }],
            ["price_month_cad", { billingInterval: "monthly", currency: "cad", type: "base" }],
            ["price_year_usd", { billingInterval: "yearly", currency: "usd", type: "base" }],
            ["price_year_cad", { billingInterval: "yearly", currency: "cad", type: "base" }],
            ["price_addon_month_usd", { billingInterval: "monthly", currency: "usd", type: "addon" }],
            ["price_addon_month_cad", { billingInterval: "monthly", currency: "cad", type: "addon" }],
            ["price_addon_year_usd", { billingInterval: "yearly", currency: "usd", type: "addon" }],
            ["price_addon_year_cad", { billingInterval: "yearly", currency: "cad", type: "addon" }]
          ])
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
        fetchIpLocation: async () => (state.country ? { country: state.country } : null)
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
      body: options.body ? new URLSearchParams(options.body) : null,
      headers: options.headers || {}
    });

    if (String(url).includes("/prices/")) {
      const priceId = String(url).split("/prices/")[1];
      const catalog = {
        price_month_usd: { id: "price_month_usd", product: "prod_base_usd", unit_amount: 1200, recurring: { interval: "month" } },
        price_month_cad: { id: "price_month_cad", product: "prod_base_cad", unit_amount: 1700, recurring: { interval: "month" } },
        price_year_usd: { id: "price_year_usd", product: "prod_base_usd", unit_amount: 12240, recurring: { interval: "year" } },
        price_year_cad: { id: "price_year_cad", product: "prod_base_cad", unit_amount: 17500, recurring: { interval: "year" } },
        price_addon_month_usd: { id: "price_addon_month_usd", product: "prod_addon_usd", unit_amount: 500, recurring: { interval: "month" } },
        price_addon_month_cad: { id: "price_addon_month_cad", product: "prod_addon_cad", unit_amount: 700, recurring: { interval: "month" } },
        price_addon_year_usd: { id: "price_addon_year_usd", product: "prod_addon_usd", unit_amount: 5100, recurring: { interval: "year" } },
        price_addon_year_cad: { id: "price_addon_year_cad", product: "prod_addon_cad", unit_amount: 7200, recurring: { interval: "year" } },
        ...priceOverrides
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

    if (String(url).includes("/customers/search?")) {
      return {
        ok: true,
        json: async () => ({
          data: searchedStripeCustomerId ? [{ id: searchedStripeCustomerId }] : []
        })
      };
    }

    if (String(url).includes("/subscriptions?customer=")) {
      return {
        ok: true,
        json: async () => ({ data: existingStripeSubscription ? [existingStripeSubscription] : [] })
      };
    }

    if (/\/subscriptions\/[^/?]+$/.test(String(url))) {
      const subscriptionId = String(url).split("/subscriptions/")[1];
      const defaultSubscription = {
        id: subscriptionId,
        status: "active",
        cancel_at_period_end: false,
        current_period_start: Math.floor(Date.now() / 1000) - 86400,
        current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
        customer: "cus_test_123",
        metadata: {
          billing_interval: "monthly",
          currency: "usd",
          additional_businesses: "0"
        },
        items: { data: [] }
      };
      return {
        ok: true,
        json: async () => ({ ...defaultSubscription, ...(stripeSubscriptionResponse || {}) })
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

    if (String(url).endsWith("/billing_portal/configurations")) {
      return {
        ok: true,
        json: async () => ({
          id: "bpc_test_123"
        })
      };
    }

    if (String(url).endsWith("/billing_portal/sessions")) {
      return {
        ok: true,
        json: async () => ({
          id: "bps_test_123",
          url: "https://billing.stripe.com/p/session/test_123"
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
        checkoutAttemptId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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
    assert.equal(checkoutRequest.body.get("line_items[0][quantity]"), "1");
    // Pro checkout is plan-only: a client-supplied additionalBusinesses is
    // ignored, so no addon line item is ever added to this session.
    assert.equal(checkoutRequest.body.get("line_items[1][price]"), null);
    assert.equal(checkoutRequest.body.get("allow_promotion_codes"), "true");
    assert.equal(checkoutRequest.body.get("metadata[billing_interval]"), "monthly");
    assert.equal(checkoutRequest.body.get("metadata[additional_businesses]"), "0");
    assert.equal(checkoutRequest.body.get("subscription_data[metadata][billing_interval]"), "monthly");
    assert.equal(checkoutRequest.body.get("subscription_data[metadata][additional_businesses]"), "0");
    assert.equal(checkoutRequest.body.get("metadata[currency]"), "cad");
    assert.equal(checkoutRequest.body.get("metadata[country_code]"), "ca");
    assert.equal(checkoutRequest.body.get("metadata[currency_source]"), "ip_geolocation");
  } finally {
    fixture.cleanup();
  }
});

test("billing checkout prefers the business's own region over IP geolocation for currency", async () => {
  // A Canadian business owner checking out from a US IP (VPN, travel, CDN
  // edge, ...) should still be billed in CAD -- their own business's
  // configured region is a much stronger signal than the network they
  // happen to be on.
  const fixture = loadBillingRouter({ country: "United States", businessRegion: "CA" });

  try {
    const res = await request(fixture.app)
      .post("/api/billing/checkout-session")
      .send({
        checkoutAttemptId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        billingInterval: "monthly"
      });

    assert.equal(res.status, 200);

    const checkoutRequest = fixture.state.stripeRequests.find((entry) =>
      String(entry.url).endsWith("/checkout/sessions")
    );

    assert.ok(checkoutRequest, "Stripe checkout request should be created");
    assert.equal(checkoutRequest.body.get("line_items[0][price]"), "price_month_cad");
    assert.equal(checkoutRequest.body.get("metadata[currency]"), "cad");
    assert.equal(checkoutRequest.body.get("metadata[country_code]"), "ca");
    assert.equal(checkoutRequest.body.get("metadata[currency_source]"), "business_region");
  } finally {
    fixture.cleanup();
  }
});

test("billing checkout falls back to IP geolocation when the business has no region on file", async () => {
  const fixture = loadBillingRouter({ country: "Canada", businessRegion: null });

  try {
    const res = await request(fixture.app)
      .post("/api/billing/checkout-session")
      .send({
        checkoutAttemptId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        billingInterval: "monthly"
      });

    assert.equal(res.status, 200);

    const checkoutRequest = fixture.state.stripeRequests.find((entry) =>
      String(entry.url).endsWith("/checkout/sessions")
    );

    assert.ok(checkoutRequest, "Stripe checkout request should be created");
    assert.equal(checkoutRequest.body.get("metadata[currency]"), "cad");
    assert.equal(checkoutRequest.body.get("metadata[currency_source]"), "ip_geolocation");
  } finally {
    fixture.cleanup();
  }
});

test("billing checkout rejects Stripe prices mapped to the wrong recurring interval", async () => {
  const fixture = loadBillingRouter({
    country: "United States",
    priceOverrides: {
      price_month_usd: { id: "price_month_usd", unit_amount: 1200, recurring: { interval: "year" } }
    }
  });

  try {
    const res = await request(fixture.app)
      .post("/api/billing/checkout-session")
      .send({ checkoutAttemptId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", billingInterval: "monthly" });

    assert.equal(res.status, 400);
    assert.match(res.body.error || "", /Monthly base Stripe Price is configured for year, not month/);
    const checkoutRequest = fixture.state.stripeRequests.find((entry) =>
      String(entry.url).endsWith("/checkout/sessions")
    );
    assert.equal(checkoutRequest, undefined);
  } finally {
    fixture.cleanup();
  }
});

test("legacy billing cancel portal endpoint schedules cancellation directly", async () => {
  const fixture = loadBillingRouter({
    country: "United States",
    subscriptionSnapshots: [
      {
        stripeSubscriptionId: "sub_test_cancel_123",
        stripeCustomerId: "cus_test_123",
        effectiveTier: "v1",
        isPaid: true,
        isTrialing: false,
        cancelAtPeriodEnd: false
      },
      {
        stripeSubscriptionId: "sub_test_cancel_123",
        stripeCustomerId: "cus_test_123",
        effectiveTier: "v1",
        isPaid: true,
        isTrialing: false,
        cancelAtPeriodEnd: true
      }
    ]
  });

  try {
    const res = await request(fixture.app)
      .post("/api/billing/customer-portal/cancel")
      .send({});

    assert.equal(res.status, 200);
    assert.equal(res.body.subscription.cancelAtPeriodEnd, true);

    const cancelRequest = fixture.state.stripeRequests.find((entry) =>
      String(entry.url).endsWith("/subscriptions/sub_test_cancel_123") &&
      entry.body?.get("cancel_at_period_end") === "true"
    );

    assert.ok(cancelRequest, "Stripe subscription should be scheduled to cancel in place");
  } finally {
    fixture.cleanup();
  }
});

test("billing portal sessions use a configuration with monthly and yearly plan choices", async () => {
  const fixture = loadBillingRouter({
    country: "United States",
    subscriptionSnapshots: [
      {
        stripeSubscriptionId: "sub_test_update_123",
        stripeCustomerId: "cus_test_123",
        effectiveTier: "v1",
        isPaid: true,
        isTrialing: false,
        cancelAtPeriodEnd: true,
        billingInterval: "yearly",
        currency: "usd"
      }
    ]
  });

  try {
    const res = await request(fixture.app)
      .post("/api/billing/customer-portal")
      .send({});

    assert.equal(res.status, 200);
    assert.equal(res.body.url, "https://billing.stripe.com/p/session/test_123");

    const configRequest = fixture.state.stripeRequests.find((entry) =>
      String(entry.url).endsWith("/billing_portal/configurations")
    );
    assert.ok(configRequest, "Stripe portal configuration should be created by the app");
    assert.equal(configRequest.body.get("features[subscription_update][enabled]"), "true");
    assert.equal(configRequest.body.get("features[subscription_update][default_allowed_updates][0]"), "price");
    // The general "Manage billing" portal must never expose quantity or the
    // additional-business product -- one account keeps exactly one
    // subscription, and business slots are only purchasable via the
    // dedicated "addon" confirm flow below.
    assert.equal(configRequest.body.get("features[subscription_update][default_allowed_updates][1]"), null);
    assert.equal(configRequest.body.get("features[subscription_update][products][0][product]"), "prod_base_usd");
    assert.equal(configRequest.body.get("features[subscription_update][products][0][prices][0]"), "price_month_usd");
    assert.equal(configRequest.body.get("features[subscription_update][products][0][prices][1]"), "price_year_usd");
    assert.equal(configRequest.body.get("features[subscription_update][products][1][product]"), null);

    const portalRequest = fixture.state.stripeRequests.find((entry) =>
      String(entry.url).endsWith("/billing_portal/sessions")
    );
    assert.equal(portalRequest.body.get("configuration"), "bpc_test_123");
    // "Manage billing" opens the portal's default home (invoices, payment
    // method, cancel) instead of deep-linking straight into a plan-change
    // flow -- no flow_data[type] means Stripe shows its own landing page.
    assert.equal(portalRequest.body.get("flow_data[type]"), null);
    assert.equal(portalRequest.body.get("flow_data[subscription_update][subscription]"), null);
  } finally {
    fixture.cleanup();
  }
});

test("additional-business slot checkout sends the user to a Stripe subscription_update_confirm session for a new addon item", async () => {
  const fixture = loadBillingRouter({
    country: "United States",
    subscriptionSnapshots: [
      {
        stripeSubscriptionId: "sub_test_update_123",
        stripeCustomerId: "cus_test_123",
        effectiveTier: "v1",
        isPaid: true,
        isTrialing: false,
        cancelAtPeriodEnd: false,
        billingInterval: "monthly",
        currency: "usd"
      }
    ],
    stripeSubscriptionResponse: {
      items: { data: [] }
    }
  });

  try {
    const res = await request(fixture.app)
      .post("/api/billing/additional-businesses/checkout")
      .send({ additionalBusinesses: 2 });

    assert.equal(res.status, 200);
    assert.equal(res.body.url, "https://billing.stripe.com/p/session/test_123");

    // This flow must only ever fetch/verify the additional-business prices --
    // never the base Pro prices -- so a misconfigured base price can't 500 a
    // business-slot purchase that has nothing to do with it.
    const priceRequests = fixture.state.stripeRequests
      .filter((entry) => String(entry.url).includes("/prices/"))
      .map((entry) => String(entry.url).split("/prices/")[1]);
    assert.deepEqual(priceRequests.sort(), ["price_addon_month_usd", "price_addon_year_usd"]);

    const configRequest = fixture.state.stripeRequests.find((entry) =>
      String(entry.url).endsWith("/billing_portal/configurations")
    );
    assert.ok(configRequest, "Stripe portal configuration should be created by the app");
    assert.equal(configRequest.body.get("features[subscription_update][default_allowed_updates][0]"), "price");
    assert.equal(configRequest.body.get("features[subscription_update][default_allowed_updates][1]"), "quantity");
    assert.equal(configRequest.body.get("features[subscription_update][products][0][product]"), "prod_addon_usd");
    assert.equal(configRequest.body.get("features[subscription_update][products][1][product]"), null);

    const portalRequest = fixture.state.stripeRequests.find((entry) =>
      String(entry.url).endsWith("/billing_portal/sessions")
    );
    assert.ok(portalRequest, "should create a billing portal session");
    assert.equal(portalRequest.body.get("configuration"), "bpc_test_123");
    assert.equal(portalRequest.body.get("flow_data[type]"), "subscription_update_confirm");
    assert.equal(portalRequest.body.get("flow_data[subscription_update_confirm][subscription]"), "sub_test_update_123");
    assert.equal(portalRequest.body.get("flow_data[subscription_update_confirm][items][0][price]"), "price_addon_month_usd");
    assert.equal(portalRequest.body.get("flow_data[subscription_update_confirm][items][0][quantity]"), "2");
    assert.equal(portalRequest.body.get("return_url"), "https://app.inexledger.test/subscription?billing=updated");
  } finally {
    fixture.cleanup();
  }
});

test("additional-business slot checkout reuses the existing addon subscription item by id when one already exists", async () => {
  const fixture = loadBillingRouter({
    country: "United States",
    subscriptionSnapshots: [
      {
        stripeSubscriptionId: "sub_test_update_456",
        stripeCustomerId: "cus_test_123",
        effectiveTier: "v1",
        isPaid: true,
        isTrialing: false,
        cancelAtPeriodEnd: false,
        billingInterval: "monthly",
        currency: "usd"
      }
    ],
    stripeSubscriptionResponse: {
      items: {
        data: [
          { id: "si_base_123", price: { id: "price_month_usd" } },
          { id: "si_addon_123", price: { id: "price_addon_month_usd" } }
        ]
      }
    }
  });

  try {
    const res = await request(fixture.app)
      .post("/api/billing/additional-businesses/checkout")
      .send({ additionalBusinesses: 3 });

    assert.equal(res.status, 200);

    const portalRequest = fixture.state.stripeRequests.find((entry) =>
      String(entry.url).endsWith("/billing_portal/sessions")
    );
    assert.equal(portalRequest.body.get("flow_data[subscription_update_confirm][items][0][id]"), "si_addon_123");
    assert.equal(portalRequest.body.get("flow_data[subscription_update_confirm][items][0][quantity]"), "3");
    assert.equal(portalRequest.body.get("flow_data[subscription_update_confirm][items][0][price]"), null);
  } finally {
    fixture.cleanup();
  }
});

test("additional-business slot checkout rejects a non-positive quantity", async () => {
  const fixture = loadBillingRouter({
    subscriptionSnapshots: [
      {
        stripeSubscriptionId: "sub_test_update_789",
        stripeCustomerId: "cus_test_123",
        effectiveTier: "v1",
        isPaid: true,
        isTrialing: false,
        cancelAtPeriodEnd: false,
        billingInterval: "monthly",
        currency: "usd"
      }
    ]
  });

  try {
    const res = await request(fixture.app)
      .post("/api/billing/additional-businesses/checkout")
      .send({ additionalBusinesses: 0 });

    assert.equal(res.status, 400);
  } finally {
    fixture.cleanup();
  }
});

test("additional-business slot checkout requires an existing Stripe subscription", async () => {
  const fixture = loadBillingRouter({
    subscriptionSnapshots: [
      {
        stripeSubscriptionId: null,
        stripeCustomerId: null,
        effectiveTier: "v1",
        isPaid: false,
        isTrialing: true,
        cancelAtPeriodEnd: false,
        billingInterval: "monthly",
        currency: "usd"
      }
    ]
  });

  try {
    const res = await request(fixture.app)
      .post("/api/billing/additional-businesses/checkout")
      .send({ additionalBusinesses: 1 });

    assert.equal(res.status, 409);
  } finally {
    fixture.cleanup();
  }
});

test("billing overview still returns the subscription status when the Stripe payment-method/invoice lookup fails", async () => {
  // The fixture's mocked fetch has no case for GET /customers/:id?expand=..., so
  // it throws "Unexpected fetch URL" -- simulating a live Stripe hiccup fetching
  // supplementary payment-method/invoice display data. The overview must still
  // succeed with the already-resolved subscription snapshot instead of 500ing.
  const fixture = loadBillingRouter({
    country: "United States",
    subscriptionSnapshots: [
      {
        stripeSubscriptionId: "sub_test_overview_123",
        stripeCustomerId: "cus_test_overview_123",
        effectiveTier: "v1",
        isPaid: true,
        isTrialing: false,
        cancelAtPeriodEnd: false,
        billingInterval: "monthly",
        currency: "usd"
      }
    ]
  });

  try {
    const res = await request(fixture.app).get("/api/billing/overview");

    assert.equal(res.status, 200);
    assert.equal(res.body.subscription?.stripeCustomerId, "cus_test_overview_123");
    assert.equal(res.body.paymentMethod, null);
    assert.deepEqual(res.body.invoices, []);
  } finally {
    fixture.cleanup();
  }
});

test("billing pricing context does not stay pinned to a stale IP cache when the verified region changes", async () => {
  const fixture = loadBillingRouter({ country: "Canada" });

  try {
    const first = await request(fixture.app).get("/api/billing/pricing-context");
    assert.equal(first.status, 200);
    assert.equal(first.body.currency, "cad");

    fixture.state.country = "United States";

    const second = await request(fixture.app).get("/api/billing/pricing-context");
    assert.equal(second.status, 200);
    assert.equal(second.body.currency, "usd");
    assert.equal(second.body.country_code, "us");
    assert.equal(second.body.source, "ip_geolocation");
  } finally {
    fixture.cleanup();
  }
});

test("billing checkout reuses an existing Stripe customer found by metadata search before creating a new one", async () => {
  const fixture = loadBillingRouter({
    country: "United States",
    searchedStripeCustomerId: "cus_existing_456"
  });

  try {
    const res = await request(fixture.app)
      .post("/api/billing/checkout-session")
      .send({
        checkoutAttemptId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        billingInterval: "monthly",
        additionalBusinesses: 0
      });

    assert.equal(res.status, 200);

    const customerSearchRequest = fixture.state.stripeRequests.find((entry) =>
      String(entry.url).includes("/customers/search?")
    );
    const customerCreateRequests = fixture.state.stripeRequests.filter((entry) =>
      String(entry.url).endsWith("/customers")
    );
    const checkoutRequest = fixture.state.stripeRequests.find((entry) =>
      String(entry.url).endsWith("/checkout/sessions")
    );

    assert.ok(customerSearchRequest, "Stripe customer metadata search should run before customer creation");
    assert.equal(customerCreateRequests.length, 0, "existing Stripe customer should be reused");
    assert.equal(checkoutRequest?.body?.get("customer"), "cus_existing_456");
  } finally {
    fixture.cleanup();
  }
});

test("billing checkout persists a created Stripe customer even when the subscription row is missing", async () => {
  const fixture = loadBillingRouter({
    country: "United States",
    missingSubscriptionRow: true
  });

  try {
    const res = await request(fixture.app)
      .post("/api/billing/checkout-session")
      .send({
        checkoutAttemptId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        billingInterval: "monthly",
        additionalBusinesses: 0
      });

    assert.equal(res.status, 200);
    assert.equal(fixture.state.stripeCustomerId, "cus_test_123");

    const customerInsert = fixture.state.stripeRequests.find((entry) =>
      String(entry.url).endsWith("/customers")
    );
    assert.ok(customerInsert, "Stripe customer should still be created and persisted");
  } finally {
    fixture.cleanup();
  }
});

test("billing checkout records an audit event with resolved checkout metadata", async () => {
  const fixture = loadBillingRouter({ country: "Canada" });

  try {
    const res = await request(fixture.app)
      .post("/api/billing/checkout-session")
      .send({
        checkoutAttemptId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        billingInterval: "monthly",
        additionalBusinesses: 2,
        returnPath: "/trial-setup?next=%2Ftransactions"
      });

    assert.equal(res.status, 200);
    assert.equal(fixture.state.auditCalls.length, 1);
    assert.equal(fixture.state.auditCalls[0].action, "billing.checkout.started");
    assert.equal(fixture.state.auditCalls[0].businessId, "22222222-2222-4222-8222-222222222222");
    assert.equal(fixture.state.auditCalls[0].metadata.billingInterval, "monthly");
    assert.equal(fixture.state.auditCalls[0].metadata.currency, "cad");
    // Pro checkout is plan-only; a client-supplied additionalBusinesses is ignored.
    assert.equal(fixture.state.auditCalls[0].metadata.additionalBusinesses, 0);
  } finally {
    fixture.cleanup();
  }
});

test("billing checkout keeps the existing subscription currency when trial metadata is already set", async () => {
  const fixture = loadBillingRouter({
    country: "Canada",
    subscriptionSnapshots: [
      {
        isPaid: false,
        isCanceledWithRemainingAccess: false,
        isTrialing: true,
        currency: "usd"
      }
    ]
  });

  try {
    const res = await request(fixture.app)
      .post("/api/billing/checkout-session")
      .send({
        checkoutAttemptId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        billingInterval: "monthly",
        additionalBusinesses: 1
      });

    assert.equal(res.status, 200);

    const checkoutRequest = fixture.state.stripeRequests.find((entry) =>
      String(entry.url).endsWith("/checkout/sessions")
    );

    assert.ok(checkoutRequest, "Stripe checkout request should be created");
    assert.equal(checkoutRequest.body.get("line_items[0][price]"), "price_month_usd");
    // Pro checkout is plan-only; a client-supplied additionalBusinesses is ignored.
    assert.equal(checkoutRequest.body.get("line_items[1][price]"), null);
    assert.equal(checkoutRequest.body.get("metadata[currency]"), "usd");
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
        checkoutAttemptId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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
        checkoutAttemptId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        billingInterval: "monthly",
        additionalBusinesses: 1
      });

    assert.equal(res.status, 409);
    assert.match(String(res.body?.error || ""), /already has an active|overlapping/i);
  } finally {
    fixture.cleanup();
  }
});

test("billing checkout reuses a deterministic Stripe idempotency key for identical retries", async () => {
  const fixture = loadBillingRouter({ country: "Canada" });

  try {
    const first = await request(fixture.app)
      .post("/api/billing/checkout-session")
      .send({
        checkoutAttemptId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        billingInterval: "monthly",
        additionalBusinesses: 1
      });
    const second = await request(fixture.app)
      .post("/api/billing/checkout-session")
      .send({
        checkoutAttemptId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        billingInterval: "monthly",
        additionalBusinesses: 1
      });

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);

    const checkoutRequests = fixture.state.stripeRequests.filter((entry) =>
      String(entry.url).endsWith("/checkout/sessions")
    );

    assert.equal(checkoutRequests.length, 2);
    assert.equal(
      checkoutRequests[0].headers["Idempotency-Key"],
      checkoutRequests[1].headers["Idempotency-Key"]
    );
  } finally {
    fixture.cleanup();
  }
});

test("billing checkout blocks new sessions for past-due subscriptions", async () => {
  const fixture = loadBillingRouter({
    country: "United States",
    subscriptionSnapshots: [
      {
        isPaid: true,
        isTrialing: false,
        cancelAtPeriodEnd: false,
        isCanceledWithRemainingAccess: false,
        effectiveStatus: "past_due",
        stripeSubscriptionId: "sub_past_due_123"
      }
    ]
  });

  try {
    const res = await request(fixture.app)
      .post("/api/billing/checkout-session")
      .send({
        checkoutAttemptId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        billingInterval: "monthly",
        additionalBusinesses: 0
      });

    assert.equal(res.status, 409);
    assert.match(String(res.body?.error || ""), /past-due stripe subscription/i);
  } finally {
    fixture.cleanup();
  }
});

test("billing checkout blocks unpaid subscriptions with a targeted payment-update message", async () => {
  const fixture = loadBillingRouter({
    country: "United States",
    subscriptionSnapshots: [
      {
        isPaid: false,
        isTrialing: false,
        cancelAtPeriodEnd: false,
        isCanceledWithRemainingAccess: false,
        effectiveStatus: "unpaid",
        stripeSubscriptionId: "sub_unpaid_123"
      }
    ]
  });

  try {
    const res = await request(fixture.app)
      .post("/api/billing/checkout-session")
      .send({
        checkoutAttemptId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        billingInterval: "monthly",
        additionalBusinesses: 0
      });

    assert.equal(res.status, 409);
    assert.match(String(res.body?.error || ""), /unpaid stripe subscription/i);
    assert.match(String(res.body?.error || ""), /update the payment method/i);
  } finally {
    fixture.cleanup();
  }
});

test("billing checkout allows a fresh checkout after Stripe has already canceled the prior subscription", async () => {
  const fixture = loadBillingRouter({
    country: "United States",
    existingStripeSubscription: {
      id: "sub_canceled_live_access",
      status: "canceled",
      current_period_end: Math.floor(Date.now() / 1000) + 86400 * 14
    },
    subscriptionSnapshots: [
      {
        isPaid: true,
        isCanceledWithRemainingAccess: true,
        cancelAtPeriodEnd: false
      }
    ]
  });

  try {
    const res = await request(fixture.app)
      .post("/api/billing/checkout-session")
      .send({
        checkoutAttemptId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        billingInterval: "monthly",
        additionalBusinesses: 0
      });

    assert.equal(res.status, 200);
    const checkoutRequest = fixture.state.stripeRequests.find((entry) =>
      String(entry.url).endsWith("/checkout/sessions")
    );
    assert.ok(checkoutRequest, "Stripe checkout request should be created");
  } finally {
    fixture.cleanup();
  }
});

test("billing checkout returns a validation error when pricing is not configured for the resolved currency", async () => {
  const fixture = loadBillingRouter({ country: "Canada" });
  const originalCadPrice = process.env.STRIPE_PRO_M_CA;

  try {
    delete process.env.STRIPE_PRO_M_CA;

    const res = await request(fixture.app)
      .post("/api/billing/checkout-session")
      .send({
        checkoutAttemptId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        billingInterval: "monthly",
        additionalBusinesses: 0
      });

    assert.equal(res.status, 400);
    assert.match(String(res.body?.error || ""), /pricing is not configured yet/i);
  } finally {
    process.env.STRIPE_PRO_M_CA = originalCadPrice;
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
        checkoutAttemptId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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

test("billing checkout enables Stripe automatic tax by default", async () => {
  const fixture = loadBillingRouter({ country: "United States" });

  try {
    const res = await request(fixture.app)
      .post("/api/billing/checkout-session")
      .send({
        checkoutAttemptId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        billingInterval: "monthly",
        additionalBusinesses: 0
      });

    assert.equal(res.status, 200);
    const checkoutRequest = fixture.state.stripeRequests.find((entry) =>
      String(entry.url).endsWith("/checkout/sessions")
    );
    assert.ok(checkoutRequest, "Stripe checkout request should be created");
    assert.equal(checkoutRequest.body.get("automatic_tax[enabled]"), "true");
  } finally {
    fixture.cleanup();
  }
});

test("billing checkout can disable Stripe automatic tax with env flag", async () => {
  const beforeFlag = process.env.STRIPE_AUTOMATIC_TAX_ENABLED;
  process.env.STRIPE_AUTOMATIC_TAX_ENABLED = "false";
  const fixture = loadBillingRouter({ country: "United States" });

  try {
    const res = await request(fixture.app)
      .post("/api/billing/checkout-session")
      .send({
        checkoutAttemptId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        billingInterval: "monthly",
        additionalBusinesses: 0
      });

    assert.equal(res.status, 200);
    const checkoutRequest = fixture.state.stripeRequests.find((entry) =>
      String(entry.url).endsWith("/checkout/sessions")
    );
    assert.ok(checkoutRequest, "Stripe checkout request should be created");
    assert.equal(checkoutRequest.body.get("automatic_tax[enabled]"), null);
  } finally {
    if (beforeFlag === undefined) delete process.env.STRIPE_AUTOMATIC_TAX_ENABLED;
    else process.env.STRIPE_AUTOMATIC_TAX_ENABLED = beforeFlag;
    fixture.cleanup();
  }
});

test("billing resume clears cancel_at_period_end on the existing Stripe subscription", async () => {
  const fixture = loadBillingRouter({
    country: "United States",
    subscriptionSnapshots: [
      {
        isPaid: true,
        isCanceledWithRemainingAccess: false,
        isTrialing: false,
        cancelAtPeriodEnd: true,
        stripeSubscriptionId: "sub_resume_123",
        additionalBusinesses: 2
      },
      {
        isPaid: true,
        isCanceledWithRemainingAccess: false,
        isTrialing: false,
        cancelAtPeriodEnd: false,
        stripeSubscriptionId: "sub_resume_123",
        additionalBusinesses: 2
      }
    ]
  });

  try {
    const res = await request(fixture.app)
      .post("/api/billing/resume")
      .send({});

    assert.equal(res.status, 200);

    const resumeRequest = fixture.state.stripeRequests.find((entry) =>
      String(entry.url).endsWith("/subscriptions/sub_resume_123") &&
      entry.body?.get("cancel_at_period_end") === "false"
    );

    assert.ok(resumeRequest, "Stripe subscription should be resumed in place");
  } finally {
    fixture.cleanup();
  }
});

test("billing resume can switch a canceling yearly subscription to monthly", async () => {
  const fixture = loadBillingRouter({
    country: "United States",
    stripeSubscriptionResponse: {
      metadata: {
        billing_interval: "yearly",
        currency: "usd",
        additional_businesses: "1"
      },
      items: {
        data: [
          {
            id: "si_base_yearly",
            quantity: 1,
            price: { id: "price_year_usd" }
          },
          {
            id: "si_addon_yearly",
            quantity: 1,
            price: { id: "price_addon_year_usd" }
          }
        ]
      }
    },
    subscriptionSnapshots: [
      {
        isPaid: true,
        isCanceledWithRemainingAccess: false,
        isTrialing: false,
        cancelAtPeriodEnd: true,
        stripeSubscriptionId: "sub_resume_123",
        billingInterval: "yearly",
        currency: "usd",
        additionalBusinesses: 1
      },
      {
        isPaid: true,
        isCanceledWithRemainingAccess: false,
        isTrialing: false,
        cancelAtPeriodEnd: false,
        stripeSubscriptionId: "sub_resume_123",
        billingInterval: "monthly",
        currency: "usd",
        additionalBusinesses: 1
      }
    ]
  });

  try {
    const res = await request(fixture.app)
      .post("/api/billing/resume")
      .send({ billingInterval: "monthly" });

    assert.equal(res.status, 200);

    const resumeRequest = fixture.state.stripeRequests.find((entry) =>
      String(entry.url).endsWith("/subscriptions/sub_resume_123") &&
      entry.body?.get("cancel_at_period_end") === "false" &&
      entry.body?.get("items[0][id]") === "si_base_yearly"
    );

    assert.ok(resumeRequest, "Stripe subscription should be resumed with an item price update");
    assert.equal(resumeRequest.body.get("items[0][price]"), "price_month_usd");
    assert.equal(resumeRequest.body.get("items[1][id]"), "si_addon_yearly");
    assert.equal(resumeRequest.body.get("items[1][price]"), "price_addon_month_usd");
    assert.equal(resumeRequest.body.get("metadata[billing_interval]"), "monthly");
  } finally {
    fixture.cleanup();
  }
});
