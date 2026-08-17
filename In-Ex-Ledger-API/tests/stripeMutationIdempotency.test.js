"use strict";

// Regression coverage for the Stripe mutation idempotency-key redesign:
// keys used to be built purely from the *desired end-state* (operation +
// business + target values), so two calls that legitimately want the same
// end-state -- e.g. cancel, then resume, then cancel again -- produced the
// exact same key. Stripe would replay the first call's cached response for
// the second one instead of actually performing it. Keys now also fold in a
// client-supplied mutationAttemptId (one fresh UUID per user-initiated
// action, reused only across retries of that same action), so this file
// proves: (a) two legitimate operations that land on the same target state
// get different keys, (b) a retried attempt (same mutationAttemptId resent)
// reuses the exact same key, and (c) a missing/invalid attempt id is
// rejected rather than silently producing an unkeyed request.

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const { attachCentralErrorHandler } = require("./helpers/testPool.js");

const BILLING_ROUTE_PATH = require.resolve("../routes/billing.routes.js");
const BUSINESS_ID = "33333333-3333-4333-8333-333333333333";
const SUBSCRIPTION_ID = "sub_regression_idem";

const MONTHLY_BASE_PRICE = "price_month_usd_regress";
const YEARLY_BASE_PRICE = "price_year_usd_regress";
const ADDON_PRICE = "price_addon_month_usd_regress";

const ATTEMPT_1 = "11111111-aaaa-4aaa-8aaa-111111111111";
const ATTEMPT_2 = "22222222-aaaa-4aaa-8aaa-222222222222";
const ATTEMPT_3 = "33333333-aaaa-4aaa-8aaa-333333333333";

function loadBillingRouter() {
  const state = {
    snapshot: {
      effectiveTier: "v1",
      isPaid: true,
      isTrialing: false,
      cancelAtPeriodEnd: false,
      isCanceledWithRemainingAccess: false,
      stripeSubscriptionId: SUBSCRIPTION_ID,
      stripeCustomerId: "cus_regression_idem",
      billingInterval: "monthly",
      currency: "usd",
      additionalBusinesses: 0,
    },
    stripeSub: {
      id: SUBSCRIPTION_ID,
      customer: "cus_regression_idem",
      status: "active",
      cancel_at_period_end: false,
      metadata: { billing_interval: "monthly", currency: "usd" },
      items: {
        data: [
          {
            id: "si_base_regression",
            quantity: 1,
            price: { id: MONTHLY_BASE_PRICE },
          },
        ],
      },
    },
    stripeRequests: [],
  };

  const originalLoad = Module._load.bind(Module);
  const originalFetch = global.fetch;

  global.fetch = async (url, opts) => {
    const method = (opts?.method || "GET").toUpperCase();
    const urlStr = String(url);

    if (urlStr.endsWith(`/subscriptions/${SUBSCRIPTION_ID}`) && method === "GET") {
      return { ok: true, async json() { return state.stripeSub; } };
    }

    if (urlStr.endsWith(`/subscriptions/${SUBSCRIPTION_ID}`) && method === "POST") {
      const body = new URLSearchParams(opts?.body || "");
      state.stripeRequests.push({
        method,
        url: urlStr,
        body: Object.fromEntries(body.entries()),
        headers: opts?.headers || {},
      });
      return { ok: true, async json() { return state.stripeSub; } };
    }

    throw new Error(`Unexpected fetch in stripeMutationIdempotency test: ${method} ${urlStr}`);
  };

  Module._load = function (requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return { pool: { async query() { return { rows: [], rowCount: 0 }; } } };
    }

    if (requestName === "../services/subscriptionService.js" || /subscriptionService\.js$/.test(requestName)) {
      return {
        PLAN_FREE: "free",
        getSubscriptionSnapshotForBusiness: async () => state.snapshot,
        findBillingAnchorBusinessIdForUser: async () => BUSINESS_ID,
        updateStripeCustomerForBusiness: async () => {},
        syncStripeSubscriptionForBusiness: async () => {},
        setFreePlanForBusiness: async () => {},
        setTrialPlanSelectionForBusiness: async () => {},
      };
    }

    if (requestName === "../services/stripePriceConfig.js" || /stripePriceConfig\.js$/.test(requestName)) {
      return {
        buildStripePriceEnvMap: () => ({
          base: { monthly: { usd: "STRIPE_PRICE_MONTHLY_USD" }, yearly: { usd: "STRIPE_PRICE_YEARLY_USD" } },
          addon: { monthly: { usd: "STRIPE_ADDON_PRICE_MONTHLY_USD" }, yearly: { usd: "STRIPE_ADDON_PRICE_YEARLY_USD" } },
        }),
        buildStripePriceLookup: () => ({
          basePriceIds: new Set([MONTHLY_BASE_PRICE, YEARLY_BASE_PRICE]),
          addonPriceIds: new Set([ADDON_PRICE]),
          metadataByPriceId: new Map([
            [MONTHLY_BASE_PRICE, { billingInterval: "monthly", currency: "usd", type: "base" }],
            [YEARLY_BASE_PRICE, { billingInterval: "yearly", currency: "usd", type: "base" }],
            [ADDON_PRICE, { billingInterval: "monthly", currency: "usd", type: "addon" }],
          ]),
        }),
      };
    }

    if (requestName === "../services/emailI18nService.js" || /emailI18nService\.js$/.test(requestName)) {
      return {
        getPreferredLanguageForUser: async () => "en",
        buildBillingLifecycleEmail: () => ({ subject: "ok", html: "<p>ok</p>", text: "ok" }),
      };
    }

    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        requireAuth: (req, _res, next) => {
          req.user = { id: "user_regression_idem", email: "owner@example.com" };
          next();
        },
        requireMfa: (_req, _res, next) => next(),
        requireMfaIfEnabled: (_req, _res, next) => next(),
      };
    }

    if (requestName === "../middleware/csrf.middleware.js" || /csrf\.middleware\.js$/.test(requestName)) {
      return { requireCsrfProtection: (_req, _res, next) => next() };
    }

    if (requestName === "../middleware/rateLimitTiers.js" || /rateLimitTiers\.js$/.test(requestName)) {
      return { createBillingMutationLimiter: () => (_req, _res, next) => next() };
    }

    if (requestName === "../api/utils/resolveBusinessIdForUser.js" || /resolveBusinessIdForUser\.js$/.test(requestName)) {
      return { resolveBusinessIdForUser: async () => BUSINESS_ID };
    }

    if (requestName === "../services/signInSecurityService.js" || /signInSecurityService\.js$/.test(requestName)) {
      return { normalizeIpAddress: (ip) => ip || "", fetchIpLocation: async () => null };
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
          constructor() { this.emails = { send: async () => ({ id: "email_test_regress" }) }; }
        },
      };
    }

    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[BILLING_ROUTE_PATH];
  process.env.STRIPE_SECRET_KEY = "sk_test_regression_idem";
  process.env.APP_BASE_URL = "https://app.inexledger.test";
  process.env.STRIPE_PRICE_MONTHLY_USD = MONTHLY_BASE_PRICE;
  process.env.STRIPE_PRICE_YEARLY_USD = YEARLY_BASE_PRICE;
  process.env.STRIPE_ADDON_PRICE_MONTHLY_USD = ADDON_PRICE;

  try {
    const router = require("../routes/billing.routes.js");
    const app = express();
    app.use(express.json());
    app.use("/api/billing", router);
    attachCentralErrorHandler(app);
    return {
      app,
      state,
      cleanup() {
        delete require.cache[BILLING_ROUTE_PATH];
        Module._load = originalLoad;
        global.fetch = originalFetch;
        delete process.env.STRIPE_SECRET_KEY;
        delete process.env.APP_BASE_URL;
        delete process.env.STRIPE_PRICE_MONTHLY_USD;
        delete process.env.STRIPE_PRICE_YEARLY_USD;
        delete process.env.STRIPE_ADDON_PRICE_MONTHLY_USD;
      },
    };
  } catch (err) {
    Module._load = originalLoad;
    global.fetch = originalFetch;
    throw err;
  }
}

test("cancel -> resume -> cancel: the two cancel calls get different idempotency keys despite an identical desired end-state", async () => {
  const { app, state, cleanup } = loadBillingRouter();
  try {
    const cancel1 = await request(app)
      .post("/api/billing/cancel")
      .send({ mutationAttemptId: ATTEMPT_1 });
    assert.equal(cancel1.status, 200);
    state.snapshot.cancelAtPeriodEnd = true;

    const resume = await request(app)
      .post("/api/billing/resume")
      .send({ mutationAttemptId: ATTEMPT_2 });
    assert.equal(resume.status, 200);
    state.snapshot.cancelAtPeriodEnd = false;

    const cancel2 = await request(app)
      .post("/api/billing/cancel")
      .send({ mutationAttemptId: ATTEMPT_3 });
    assert.equal(cancel2.status, 200);

    assert.equal(state.stripeRequests.length, 3, "cancel, resume, and cancel should each make one Stripe write");
    const [firstCancelReq, resumeReq, secondCancelReq] = state.stripeRequests;

    assert.equal(firstCancelReq.body.cancel_at_period_end, "true");
    assert.equal(secondCancelReq.body.cancel_at_period_end, "true");
    assert.equal(
      firstCancelReq.body.cancel_at_period_end,
      secondCancelReq.body.cancel_at_period_end,
      "sanity check: both cancel calls really do request the identical Stripe mutation",
    );

    const firstKey = firstCancelReq.headers["Idempotency-Key"];
    const secondKey = secondCancelReq.headers["Idempotency-Key"];
    assert.ok(firstKey && secondKey, "both cancel calls should carry an idempotency key");
    assert.notEqual(
      firstKey,
      secondKey,
      "the second cancel must not reuse the first cancel's key -- Stripe would replay the cached first response instead of performing the real second cancellation",
    );
    assert.notEqual(resumeReq.headers["Idempotency-Key"], firstKey);
  } finally {
    cleanup();
  }
});

test("additional businesses 2 -> 1 -> 2: the two calls targeting quantity 2 get different idempotency keys", async () => {
  const { app, state, cleanup } = loadBillingRouter();
  try {
    // Start from an existing addon item at some baseline quantity, so every
    // call below (including the two that both target 2) travels through the
    // exact same "update existing item" branch with the exact same
    // desired-state parts -- the precise shape that collided under the old
    // scheme, which hashed only operation+scope+[subId, itemId, quantity].
    state.snapshot.additionalBusinesses = 3;
    state.stripeSub.items.data.push({
      id: "si_addon_regression",
      quantity: 3,
      price: { id: ADDON_PRICE },
    });

    const toTwoFirstTime = await request(app)
      .patch("/api/billing/additional-businesses")
      .send({ additionalBusinesses: 2, mutationAttemptId: ATTEMPT_1 });
    assert.equal(toTwoFirstTime.status, 200);
    state.stripeSub.items.data[1].quantity = 2;
    state.snapshot.additionalBusinesses = 2;

    const toOne = await request(app)
      .patch("/api/billing/additional-businesses")
      .send({ additionalBusinesses: 1, mutationAttemptId: ATTEMPT_2 });
    assert.equal(toOne.status, 200);
    state.stripeSub.items.data[1].quantity = 1;
    state.snapshot.additionalBusinesses = 1;

    // Later, a separate legitimate request lands back on the exact same
    // target (2) the first call already reached.
    const toTwoAgain = await request(app)
      .patch("/api/billing/additional-businesses")
      .send({ additionalBusinesses: 2, mutationAttemptId: ATTEMPT_3 });
    assert.equal(toTwoAgain.status, 200);

    assert.equal(state.stripeRequests.length, 3);
    const [firstToTwo, toOneReq, secondToTwo] = state.stripeRequests;

    assert.equal(firstToTwo.body["items[0][quantity]"], "2");
    assert.equal(toOneReq.body["items[0][quantity]"], "1");
    assert.equal(secondToTwo.body["items[0][quantity]"], "2");
    assert.equal(
      firstToTwo.body["items[0][quantity]"],
      secondToTwo.body["items[0][quantity]"],
      "sanity check: both quantity-2 calls really do request the identical Stripe mutation",
    );

    assert.notEqual(
      firstToTwo.headers["Idempotency-Key"],
      secondToTwo.headers["Idempotency-Key"],
      "the later call setting quantity back to 2 must not reuse the earlier quantity-2 call's key",
    );
  } finally {
    cleanup();
  }
});

test("resume/switch repeated later: switching to the same billing interval twice gets different idempotency keys each time", async () => {
  const { app, state, cleanup } = loadBillingRouter();
  try {
    state.snapshot.cancelAtPeriodEnd = false;
    state.snapshot.billingInterval = "monthly";

    const toYearly = await request(app)
      .post("/api/billing/resume")
      .send({ billingInterval: "yearly", mutationAttemptId: ATTEMPT_1 });
    assert.equal(toYearly.status, 200);
    state.snapshot.billingInterval = "yearly";
    state.stripeSub.items.data[0].price = { id: YEARLY_BASE_PRICE };
    state.stripeSub.metadata = { billing_interval: "yearly", currency: "usd" };

    const backToMonthly = await request(app)
      .post("/api/billing/resume")
      .send({ billingInterval: "monthly", mutationAttemptId: ATTEMPT_2 });
    assert.equal(backToMonthly.status, 200);
    state.snapshot.billingInterval = "monthly";
    state.stripeSub.items.data[0].price = { id: MONTHLY_BASE_PRICE };
    state.stripeSub.metadata = { billing_interval: "monthly", currency: "usd" };

    // Later, switch to yearly again -- the exact same target interval as
    // the very first call.
    const toYearlyAgain = await request(app)
      .post("/api/billing/resume")
      .send({ billingInterval: "yearly", mutationAttemptId: ATTEMPT_3 });
    assert.equal(toYearlyAgain.status, 200);

    assert.equal(state.stripeRequests.length, 3);
    const [firstToYearly, , secondToYearly] = state.stripeRequests;

    assert.equal(firstToYearly.body["items[0][price]"], YEARLY_BASE_PRICE);
    assert.equal(secondToYearly.body["items[0][price]"], YEARLY_BASE_PRICE);
    assert.notEqual(
      firstToYearly.headers["Idempotency-Key"],
      secondToYearly.headers["Idempotency-Key"],
      "repeating the same switch later must not reuse the earlier switch's key",
    );
  } finally {
    cleanup();
  }
});

test("retry safety: resending the same mutationAttemptId reuses the exact same idempotency key", async () => {
  const { app, state, cleanup } = loadBillingRouter();
  try {
    const first = await request(app)
      .post("/api/billing/cancel")
      .send({ mutationAttemptId: ATTEMPT_1 });
    assert.equal(first.status, 200);

    // Simulate a network-level retry of the exact same attempt: the client
    // resends the identical body (same mutationAttemptId) because it never
    // saw the first response. The subscription state hasn't changed yet.
    const retry = await request(app)
      .post("/api/billing/cancel")
      .send({ mutationAttemptId: ATTEMPT_1 });
    assert.equal(retry.status, 200);

    assert.equal(state.stripeRequests.length, 2);
    assert.equal(
      state.stripeRequests[0].headers["Idempotency-Key"],
      state.stripeRequests[1].headers["Idempotency-Key"],
      "retrying the same attempt must reuse the same idempotency key, or Stripe could double-execute it",
    );
  } finally {
    cleanup();
  }
});

test("missing mutationAttemptId is rejected with 400 on cancel, resume, and additional-businesses", async () => {
  const { app, cleanup } = loadBillingRouter();
  try {
    const cancelRes = await request(app).post("/api/billing/cancel").send({});
    assert.equal(cancelRes.status, 400);
    assert.match(cancelRes.body.error, /mutation attempt/i);

    const resumeRes = await request(app).post("/api/billing/resume").send({});
    assert.equal(resumeRes.status, 400);
    assert.match(resumeRes.body.error, /mutation attempt/i);

    const legacyCancelRes = await request(app)
      .post("/api/billing/customer-portal/cancel")
      .send({});
    assert.equal(legacyCancelRes.status, 400);
    assert.match(legacyCancelRes.body.error, /mutation attempt/i);

    const addonRes = await request(app)
      .patch("/api/billing/additional-businesses")
      .send({ additionalBusinesses: 2 });
    assert.equal(addonRes.status, 400);
    assert.match(addonRes.body.error, /mutation attempt/i);
  } finally {
    cleanup();
  }
});

test("malformed mutationAttemptId (not a UUID) is rejected with 400", async () => {
  const { app, cleanup } = loadBillingRouter();
  try {
    const res = await request(app)
      .post("/api/billing/cancel")
      .send({ mutationAttemptId: "not-a-real-uuid" });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /mutation attempt/i);
  } finally {
    cleanup();
  }
});
