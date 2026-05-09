"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const BILLING_ROUTE_PATH = require.resolve("../routes/billing.routes.js");

const ADDON_PRICE_ID = "price_addon_monthly_usd_test";
const BASE_PRICE_ID = "price_base_monthly_usd_test";
const ADDON_ITEM_ID = "si_addon_001";

function makeSub(overrides = {}) {
  const futureTs = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  return {
    id: "sub_test_addon",
    customer: "cus_test_addon",
    status: "active",
    cancel_at_period_end: false,
    current_period_start: Math.floor(Date.now() / 1000) - 86400,
    current_period_end: futureTs,
    metadata: { business_id: "biz_addon_001", billing_interval: "monthly", currency: "usd" },
    items: {
      data: [
        { id: "si_base_001", price: { id: BASE_PRICE_ID }, quantity: 1 }
      ]
    },
    ...overrides
  };
}

function loadBillingRouter(options = {}) {
  const state = {
    syncCalls: [],
    stripeUpdates: [],
    snapshot: options.snapshot || {
      effectiveTier: "v1",
      isPaid: true,
      cancelAtPeriodEnd: false,
      stripeSubscriptionId: "sub_test_addon",
      additionalBusinesses: 0
    },
    stripeSub: options.stripeSub || makeSub(),
    stripeError: options.stripeError || null
  };

  const originalLoad = Module._load.bind(Module);
  const originalFetch = global.fetch;

  global.fetch = async (url, opts) => {
    const method = (opts?.method || "GET").toUpperCase();
    const urlStr = String(url);

    if (urlStr.includes("/subscriptions/sub_test_addon") && method === "GET") {
      return { ok: true, async json() { return state.stripeSub; } };
    }

    if (urlStr.includes("/subscriptions/sub_test_addon") && method === "POST") {
      if (state.stripeError) {
        return { ok: false, async json() { return { error: { message: state.stripeError } }; } };
      }
      const body = new URLSearchParams(opts?.body || "");
      state.stripeUpdates.push(Object.fromEntries(body.entries()));
      return { ok: true, async json() { return state.stripeSub; } };
    }

    throw new Error(`Unexpected fetch in billingAddonManagement test: ${method} ${urlStr}`);
  };

  Module._load = function (requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql, params = []) {
            if (/SELECT metadata_json FROM business_subscriptions/i.test(sql)) {
              return {
                rows: [{ metadata_json: { billing_interval: "monthly", currency: "usd" } }],
                rowCount: 1
              };
            }
            if (/UPDATE business_subscriptions\s+SET metadata_json/i.test(sql)) {
              state.snapshot = {
                ...state.snapshot,
                additionalBusinesses: Number(params[1] || 0)
              };
              return { rows: [], rowCount: 1 };
            }
            if (/INSERT INTO stripe_webhook_events/i.test(sql)) return { rowCount: 1 };
            return { rows: [], rowCount: 0 };
          }
        }
      };
    }

    if (requestName === "../services/subscriptionService.js" || /subscriptionService\.js$/.test(requestName)) {
      let callCount = 0;
      return {
        getSubscriptionSnapshotForBusiness: async () => {
          callCount += 1;
          if (callCount === 1) return state.snapshot;
          return {
            ...state.snapshot,
            additionalBusinesses: state.snapshot.additionalBusinesses ?? (state.stripeUpdates.length > 0 ? 2 : 0)
          };
        },
        findBillingAnchorBusinessIdForUser: async () => "biz_addon_001",
        updateStripeCustomerForBusiness: async () => {},
        syncStripeSubscriptionForBusiness: async (bizId, sub) => {
          state.syncCalls.push({ bizId, sub });
        },
        setFreePlanForBusiness: async () => {},
        getPlanDisplayName: (tier) => tier
      };
    }

    if (requestName === "../services/stripePriceConfig.js" || /stripePriceConfig\.js$/.test(requestName)) {
      return {
        buildStripePriceEnvMap: () => ({
          base: { monthly: { usd: "STRIPE_PRICE_MONTHLY_USD" } },
          addon: { monthly: { usd: "STRIPE_ADDON_PRICE_MONTHLY_USD" } }
        }),
        buildStripePriceLookup: () => ({
          basePriceIds: new Set([BASE_PRICE_ID]),
          addonPriceIds: new Set([ADDON_PRICE_ID]),
          metadataByPriceId: new Map()
        })
      };
    }

    if (requestName === "../services/emailI18nService.js" || /emailI18nService\.js$/.test(requestName)) {
      return {
        getPreferredLanguageForUser: async () => "en",
        buildBillingLifecycleEmail: () => ({ subject: "ok", html: "<p>ok</p>", text: "ok" })
      };
    }

    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        requireAuth: (req, _res, next) => { req.user = { id: "user_test_001", email: "test@example.com" }; next(); },
        requireMfa: (_req, _res, next) => next(),
        requireMfaIfEnabled: (_req, _res, next) => next()
      };
    }

    if (requestName === "../middleware/csrf.middleware.js" || /csrf\.middleware\.js$/.test(requestName)) {
      return { requireCsrfProtection: (_req, _res, next) => next() };
    }

    if (requestName === "../middleware/rateLimitTiers.js" || /rateLimitTiers\.js$/.test(requestName)) {
      return { createBillingMutationLimiter: () => (_req, _res, next) => next() };
    }

    if (requestName === "../api/utils/resolveBusinessIdForUser.js" || /resolveBusinessIdForUser\.js$/.test(requestName)) {
      return { resolveBusinessIdForUser: async () => "biz_addon_001" };
    }

    if (requestName === "../services/signInSecurityService.js" || /signInSecurityService\.js$/.test(requestName)) {
      return {
        normalizeIpAddress: (ip) => ip || "",
        fetchIpLocation: async () => null
      };
    }

    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return { logError() {}, logWarn() {}, logInfo() {} };
    }

    if (requestName === "express-rate-limit") {
      return function rateLimit() { return (_req, _res, next) => next(); };
    }

    if (requestName === "resend") {
      return {
        Resend: class Resend {
          constructor() { this.emails = { send: async () => ({ id: "email_test_123" }) }; }
        }
      };
    }

    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[BILLING_ROUTE_PATH];
  process.env.STRIPE_SECRET_KEY = "sk_test_addon_mgmt";
  process.env.APP_BASE_URL = "https://app.inexledger.test";
  process.env.STRIPE_ADDON_PRICE_MONTHLY_USD = ADDON_PRICE_ID;
  process.env.STRIPE_PRICE_MONTHLY_USD = BASE_PRICE_ID;

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
        delete process.env.STRIPE_ADDON_PRICE_MONTHLY_USD;
        delete process.env.STRIPE_PRICE_MONTHLY_USD;
      }
    };
  } catch (err) {
    Module._load = originalLoad;
    global.fetch = originalFetch;
    throw err;
  }
}

test("PATCH /additional-businesses — Basic user cannot change slots (403)", async () => {
  const { app, cleanup } = loadBillingRouter({
    snapshot: {
      effectiveTier: "free",
      isPaid: false,
      cancelAtPeriodEnd: false,
      stripeSubscriptionId: null,
      additionalBusinesses: 0
    }
  });
  try {
    const res = await request(app)
      .patch("/api/billing/additional-businesses")
      .send({ additionalBusinesses: 2 });
    assert.equal(res.status, 403);
    assert.ok(res.body.error);
  } finally {
    cleanup();
  }
});

test("PATCH /additional-businesses — Canceling Pro user cannot change slots (409)", async () => {
  const { app, cleanup } = loadBillingRouter({
    snapshot: {
      effectiveTier: "v1",
      isPaid: true,
      cancelAtPeriodEnd: true,
      stripeSubscriptionId: "sub_test_addon",
      additionalBusinesses: 1
    }
  });
  try {
    const res = await request(app)
      .patch("/api/billing/additional-businesses")
      .send({ additionalBusinesses: 2 });
    assert.equal(res.status, 409);
    assert.ok(res.body.error);
  } finally {
    cleanup();
  }
});

test("PATCH /additional-businesses — canceled Pro subscription with remaining access cannot change slots (409)", async () => {
  const { app, cleanup } = loadBillingRouter({
    snapshot: {
      effectiveTier: "v1",
      isPaid: true,
      isCanceledWithRemainingAccess: true,
      cancelAtPeriodEnd: false,
      stripeSubscriptionId: "sub_test_addon",
      additionalBusinesses: 1
    }
  });
  try {
    const res = await request(app)
      .patch("/api/billing/additional-businesses")
      .send({ additionalBusinesses: 2 });
    assert.equal(res.status, 409);
    assert.match(res.body.error, /already been canceled/i);
  } finally {
    cleanup();
  }
});

test("PATCH /additional-businesses — invalid quantity rejects with 400", async () => {
  const { app, cleanup } = loadBillingRouter();
  try {
    const res = await request(app)
      .patch("/api/billing/additional-businesses")
      .send({ additionalBusinesses: -1 });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  } finally {
    cleanup();
  }
});

test("PATCH /additional-businesses — quantity over max rejects with 400", async () => {
  const { app, cleanup } = loadBillingRouter();
  try {
    const res = await request(app)
      .patch("/api/billing/additional-businesses")
      .send({ additionalBusinesses: 101 });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  } finally {
    cleanup();
  }
});

test("PATCH /additional-businesses — active Pro user can increase slots", async () => {
  const { app, state, cleanup } = loadBillingRouter({
    stripeSub: makeSub()
  });
  try {
    const res = await request(app)
      .patch("/api/billing/additional-businesses")
      .send({ additionalBusinesses: 2 });
    assert.equal(res.status, 200);
    assert.ok(res.body.subscription);
    assert.equal(state.syncCalls.length, 1);
    assert.equal(state.stripeUpdates.length, 1);
    const update = state.stripeUpdates[0];
    assert.equal(update["items[0][price]"], ADDON_PRICE_ID);
    assert.equal(update["items[0][quantity]"], "2");
    assert.equal(update["proration_behavior"], "create_prorations");
  } finally {
    cleanup();
  }
});

test("PATCH /additional-businesses — active Pro user can decrease existing addon item", async () => {
  const subWithAddon = makeSub({
    items: {
      data: [
        { id: "si_base_001", price: { id: BASE_PRICE_ID }, quantity: 1 },
        { id: ADDON_ITEM_ID, price: { id: ADDON_PRICE_ID }, quantity: 3 }
      ]
    }
  });
  const { app, state, cleanup } = loadBillingRouter({
    snapshot: {
      effectiveTier: "v1",
      isPaid: true,
      cancelAtPeriodEnd: false,
      stripeSubscriptionId: "sub_test_addon",
      additionalBusinesses: 3
    },
    stripeSub: subWithAddon
  });
  try {
    const res = await request(app)
      .patch("/api/billing/additional-businesses")
      .send({ additionalBusinesses: 1 });
    assert.equal(res.status, 200);
    assert.equal(state.stripeUpdates.length, 1);
    const update = state.stripeUpdates[0];
    assert.equal(update["items[0][id]"], ADDON_ITEM_ID);
    assert.equal(update["items[0][quantity]"], "1");
  } finally {
    cleanup();
  }
});

test("PATCH /additional-businesses — quantity 0 removes existing addon item", async () => {
  const subWithAddon = makeSub({
    items: {
      data: [
        { id: "si_base_001", price: { id: BASE_PRICE_ID }, quantity: 1 },
        { id: ADDON_ITEM_ID, price: { id: ADDON_PRICE_ID }, quantity: 2 }
      ]
    }
  });
  const { app, state, cleanup } = loadBillingRouter({
    snapshot: {
      effectiveTier: "v1",
      isPaid: true,
      cancelAtPeriodEnd: false,
      stripeSubscriptionId: "sub_test_addon",
      additionalBusinesses: 2
    },
    stripeSub: subWithAddon
  });
  try {
    const res = await request(app)
      .patch("/api/billing/additional-businesses")
      .send({ additionalBusinesses: 0 });
    assert.equal(res.status, 200);
    assert.equal(state.stripeUpdates.length, 1);
    const update = state.stripeUpdates[0];
    assert.equal(update["items[0][id]"], ADDON_ITEM_ID);
    assert.equal(update["items[0][deleted]"], "true");
  } finally {
    cleanup();
  }
});

test("PATCH /additional-businesses — quantity 0 with no addon item is a no-op (no Stripe update)", async () => {
  const { app, state, cleanup } = loadBillingRouter({
    stripeSub: makeSub()
  });
  try {
    const res = await request(app)
      .patch("/api/billing/additional-businesses")
      .send({ additionalBusinesses: 0 });
    assert.equal(res.status, 200);
    assert.equal(state.stripeUpdates.length, 0, "should make no Stripe write for a no-op");
    assert.equal(state.syncCalls.length, 1, "should still sync after no-op");
  } finally {
    cleanup();
  }
});

test("PATCH /additional-businesses — existing addon item is updated, not duplicated", async () => {
  const subWithAddon = makeSub({
    items: {
      data: [
        { id: "si_base_001", price: { id: BASE_PRICE_ID }, quantity: 1 },
        { id: ADDON_ITEM_ID, price: { id: ADDON_PRICE_ID }, quantity: 1 }
      ]
    }
  });
  const { app, state, cleanup } = loadBillingRouter({
    snapshot: {
      effectiveTier: "v1",
      isPaid: true,
      cancelAtPeriodEnd: false,
      stripeSubscriptionId: "sub_test_addon",
      additionalBusinesses: 1
    },
    stripeSub: subWithAddon
  });
  try {
    const res = await request(app)
      .patch("/api/billing/additional-businesses")
      .send({ additionalBusinesses: 4 });
    assert.equal(res.status, 200);
    assert.equal(state.stripeUpdates.length, 1, "should make exactly one Stripe write");
    const update = state.stripeUpdates[0];
    assert.equal(update["items[0][id]"], ADDON_ITEM_ID, "should target the existing item id");
    assert.equal(update["items[0][quantity]"], "4");
    assert.equal(update["items[0][price]"], undefined, "should not add a second price entry");
  } finally {
    cleanup();
  }
});


test("PATCH /additional-businesses ? trialing Pro user can increase slots", async () => {
  const { app, state, cleanup } = loadBillingRouter({
    snapshot: {
      effectiveTier: "v1",
      isPaid: false,
      isTrialing: true,
      cancelAtPeriodEnd: false,
      stripeSubscriptionId: "sub_test_addon",
      additionalBusinesses: 0
    },
    stripeSub: makeSub({ status: "trialing" })
  });
  try {
    const res = await request(app)
      .patch("/api/billing/additional-businesses")
      .send({ additionalBusinesses: 2 });
    assert.equal(res.status, 200);
    assert.ok(res.body.subscription);
    assert.equal(state.syncCalls.length, 1);
    assert.equal(state.stripeUpdates.length, 1);
    const update = state.stripeUpdates[0];
    assert.equal(update["items[0][price]"], ADDON_PRICE_ID);
    assert.equal(update["items[0][quantity]"], "2");
    assert.equal(update["proration_behavior"], "create_prorations");
  } finally {
    cleanup();
  }
});

test("PATCH /additional-businesses — trialing user without Stripe subscription stores slot count locally", async () => {
  const { app, state, cleanup } = loadBillingRouter({
    snapshot: {
      effectiveTier: "v1",
      isPaid: false,
      isTrialing: true,
      cancelAtPeriodEnd: false,
      stripeSubscriptionId: null,
      additionalBusinesses: 0
    }
  });
  try {
    const res = await request(app)
      .patch("/api/billing/additional-businesses")
      .send({ additionalBusinesses: 3 });
    assert.equal(res.status, 200);
    assert.equal(state.stripeUpdates.length, 0, "trial slot changes should not hit Stripe before paid conversion");
    assert.equal(res.body.subscription?.additionalBusinesses, 3);
  } finally {
    cleanup();
  }
});

test("PATCH /additional-businesses — downgraded active trial can still update slots", async () => {
  const { app, state, cleanup } = loadBillingRouter({
    snapshot: {
      effectiveTier: "v1",
      isPaid: false,
      isTrialing: true,
      cancelAtPeriodEnd: true,
      selectedPlanCode: "free",
      isTrialDowngradedToFree: true,
      stripeSubscriptionId: null,
      additionalBusinesses: 1
    }
  });
  try {
    const res = await request(app)
      .patch("/api/billing/additional-businesses")
      .send({ additionalBusinesses: 4 });
    assert.equal(res.status, 200);
    assert.equal(state.stripeUpdates.length, 0, "trial slot changes should stay local until paid checkout");
    assert.equal(res.body.subscription?.additionalBusinesses, 4);
  } finally {
    cleanup();
  }
});
