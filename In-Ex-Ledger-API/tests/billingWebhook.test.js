"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const BILLING_ROUTE_PATH = require.resolve("../routes/billing.routes.js");
const WEBHOOK_SECRET = "whsec_test_billing_webhook_secret";

function makeWebhookSignature(rawBody, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = `${timestamp}.${rawBody}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return { header: `t=${timestamp},v1=${sig}`, timestamp };
}

function buildWebhookEvent(type, objectOverrides = {}) {
  const futureTs = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // +30 days
  const pastTs = Math.floor(Date.now() / 1000) - 24 * 60 * 60; // -1 day
  const base = {
    id: `evt_test_${type.replace(/\./g, "_")}_${Date.now()}`,
    object: "event",
    type,
    data: {
      object: {
        id: "sub_test123",
        object: "subscription",
        customer: "cus_test123",
        status: "canceled",
        cancel_at_period_end: false,
        current_period_end: futureTs,
        current_period_start: Math.floor(Date.now() / 1000) - 15 * 24 * 60 * 60,
        metadata: { business_id: "biz_test_001" },
        items: { data: [] },
        ...objectOverrides
      }
    }
  };
  return { event: base, futureTs, pastTs };
}

function loadBillingRouter(options = {}) {
  const state = {
    syncCalls: [],
    freePlanCalls: [],
    customerUpdates: [],
    reserveResult: options.reserveResult ?? true,
    releaseCalls: [],
    processingError: options.processingError || null,
    customerBusinessId: options.customerBusinessId || "biz_test_001"
  };

  const originalLoad = Module._load.bind(Module);
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes("/subscriptions/")) {
      return {
        ok: true,
        async json() {
          return {
            id: "sub_test123",
            customer: "cus_test123",
            status: "active",
            cancel_at_period_end: false,
            current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
            current_period_start: Math.floor(Date.now() / 1000) - 15 * 24 * 60 * 60,
            metadata: { business_id: state.customerBusinessId },
            items: { data: [] }
          };
        }
      };
    }
    throw new Error(`Unexpected fetch in billingWebhook test: ${url}`);
  };

  Module._load = function (requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql, params = []) {
            // stripe_webhook_events INSERT
            if (/INSERT INTO stripe_webhook_events/i.test(sql)) {
              return { rowCount: state.reserveResult ? 1 : 0 };
            }
            if (/DELETE FROM stripe_webhook_events/i.test(sql)) {
              state.releaseCalls.push(sql);
              return { rowCount: 1 };
            }
            if (/SELECT business_id\s+FROM business_subscriptions\s+WHERE stripe_customer_id = \$1/i.test(sql)) {
              return { rows: state.customerBusinessId ? [{ business_id: state.customerBusinessId }] : [], rowCount: state.customerBusinessId ? 1 : 0 };
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
        getSubscriptionSnapshotForBusiness: async () => ({}),
        updateStripeCustomerForBusiness: async (bizId, customerId) => {
          state.customerUpdates.push({ bizId, customerId });
        },
        syncStripeSubscriptionForBusiness: async (bizId, sub) => {
          if (state.processingError === "sync") {
            throw new Error("sync failed");
          }
          state.syncCalls.push({ bizId, sub });
        },
        setFreePlanForBusiness: async (bizId) => {
          if (state.processingError === "free") {
            throw new Error("free failed");
          }
          state.freePlanCalls.push({ bizId });
        }
      };
    }

    if (
      requestName === "../services/stripePriceConfig.js" ||
      /stripePriceConfig\.js$/.test(requestName)
    ) {
      return {
        buildStripePriceEnvMap: () => ({ base: {}, addon: {} }),
        buildStripePriceLookup: () => ({
          basePriceIds: new Set(),
          addonPriceIds: new Set(),
          metadataByPriceId: new Map()
        })
      };
    }

    if (
      requestName === "../middleware/auth.middleware.js" ||
      /auth\.middleware\.js$/.test(requestName)
    ) {
      return {
        requireAuth: (_req, _res, next) => next(),
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
      return { resolveBusinessIdForUser: async () => "biz_test_001" };
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

  delete require.cache[BILLING_ROUTE_PATH];
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_billing_webhook";

  try {
    const router = require("../routes/billing.routes.js");
    const app = express();
    // Webhook endpoint requires the raw Buffer body
    app.use("/api/billing/webhook", (req, _res, next) => {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        req.body = Buffer.concat(chunks);
        next();
      });
    });
    app.use("/api/billing", router);

    return {
      app,
      state,
      cleanup() {
        delete require.cache[BILLING_ROUTE_PATH];
        Module._load = originalLoad;
        global.fetch = originalFetch;
        delete process.env.STRIPE_WEBHOOK_SECRET;
        delete process.env.STRIPE_SECRET_KEY;
      }
    };
  } catch (err) {
    Module._load = originalLoad;
    global.fetch = originalFetch;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_SECRET_KEY;
    throw err;
  }
}

async function sendWebhook(app, eventObj) {
  const rawBody = JSON.stringify(eventObj);
  const { header } = makeWebhookSignature(rawBody, WEBHOOK_SECRET);
  return request(app)
    .post("/api/billing/webhook")
    .set("stripe-signature", header)
    .set("Content-Type", "application/octet-stream")
    .send(rawBody);
}

// ── customer.subscription.deleted ────────────────────────────────────────────

test("webhook: subscription.deleted with future period end syncs canceled state (preserves access)", async () => {
  const fixture = loadBillingRouter();

  try {
    const futureTs = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    const { event } = buildWebhookEvent("customer.subscription.deleted", {
      current_period_end: futureTs
    });

    const res = await sendWebhook(fixture.app, event);
    assert.equal(res.status, 200);

    // Give the async post-response processing time to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(fixture.state.syncCalls.length, 1, "syncStripeSubscriptionForBusiness must be called");
    assert.equal(fixture.state.freePlanCalls.length, 0, "setFreePlanForBusiness must NOT be called mid-period");
    assert.equal(fixture.state.syncCalls[0].bizId, "biz_test_001");
  } finally {
    fixture.cleanup();
  }
});

test("webhook: subscription.deleted with past period end calls setFreePlanForBusiness", async () => {
  const fixture = loadBillingRouter();

  try {
    const pastTs = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
    const { event } = buildWebhookEvent("customer.subscription.deleted", {
      current_period_end: pastTs
    });

    const res = await sendWebhook(fixture.app, event);
    assert.equal(res.status, 200);

    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(fixture.state.freePlanCalls.length, 1, "setFreePlanForBusiness must be called when period has lapsed");
    assert.equal(fixture.state.syncCalls.length, 0, "syncStripeSubscriptionForBusiness must NOT be called");
    assert.equal(fixture.state.freePlanCalls[0].bizId, "biz_test_001");
  } finally {
    fixture.cleanup();
  }
});

test("webhook: subscription.deleted with missing period end falls back to setFreePlanForBusiness", async () => {
  const fixture = loadBillingRouter();

  try {
    const { event } = buildWebhookEvent("customer.subscription.deleted", {
      current_period_end: null
    });

    const res = await sendWebhook(fixture.app, event);
    assert.equal(res.status, 200);

    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(fixture.state.freePlanCalls.length, 1, "setFreePlanForBusiness must be called when period end is unknown");
    assert.equal(fixture.state.syncCalls.length, 0);
  } finally {
    fixture.cleanup();
  }
});

// ── cancel_at_period_end (existing behaviour, must not regress) ───────────────

test("webhook: subscription.updated with cancel_at_period_end syncs state (user retains access)", async () => {
  const fixture = loadBillingRouter();

  try {
    const futureTs = Math.floor(Date.now() / 1000) + 15 * 24 * 60 * 60;
    const { event } = buildWebhookEvent("customer.subscription.updated", {
      status: "active",
      cancel_at_period_end: true,
      current_period_end: futureTs
    });

    const res = await sendWebhook(fixture.app, event);
    assert.equal(res.status, 200);

    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(fixture.state.syncCalls.length, 1, "syncStripeSubscriptionForBusiness must be called on subscription.updated");
    assert.equal(fixture.state.freePlanCalls.length, 0);
  } finally {
    fixture.cleanup();
  }
});

// ── idempotency ───────────────────────────────────────────────────────────────

test("webhook: duplicate events are skipped (idempotency)", async () => {
  const fixture = loadBillingRouter({ reserveResult: false });

  try {
    const futureTs = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    const { event } = buildWebhookEvent("customer.subscription.deleted", {
      current_period_end: futureTs
    });

    const res = await sendWebhook(fixture.app, event);
    assert.equal(res.status, 200);

    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(fixture.state.syncCalls.length, 0, "duplicate event must not trigger service calls");
    assert.equal(fixture.state.freePlanCalls.length, 0);
  } finally {
    fixture.cleanup();
  }
});

test("webhook: processing failures return 500 so Stripe can retry and release the reservation", async () => {
  const fixture = loadBillingRouter({ processingError: "sync" });

  try {
    const futureTs = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    const { event } = buildWebhookEvent("customer.subscription.updated", {
      status: "active",
      current_period_end: futureTs
    });

    const res = await sendWebhook(fixture.app, event);
    assert.equal(res.status, 500);
    assert.equal(fixture.state.releaseCalls.length, 1, "reserved webhook id should be released on processing failure");
    assert.equal(fixture.state.syncCalls.length, 0);
  } finally {
    fixture.cleanup();
  }
});

test("webhook: checkout.session.completed syncs the paid subscription and stores the Stripe customer id", async () => {
  const fixture = loadBillingRouter();

  try {
    const { event } = buildWebhookEvent("checkout.session.completed", {
      id: "cs_test_123",
      object: "checkout.session",
      subscription: "sub_test123",
      customer: "cus_test123",
      metadata: { business_id: "biz_test_001" }
    });

    const res = await sendWebhook(fixture.app, event);
    assert.equal(res.status, 200);

    assert.equal(fixture.state.customerUpdates.length, 1);
    assert.deepEqual(fixture.state.customerUpdates[0], {
      bizId: "biz_test_001",
      customerId: "cus_test123"
    });
    assert.equal(fixture.state.syncCalls.length, 1);
    assert.equal(fixture.state.syncCalls[0].bizId, "biz_test_001");
  } finally {
    fixture.cleanup();
  }
});

test("webhook: invoice.payment_succeeded re-syncs the subscription using the stored Stripe customer mapping", async () => {
  const fixture = loadBillingRouter({ customerBusinessId: "biz_test_lookup" });

  try {
    const { event } = buildWebhookEvent("invoice.payment_succeeded", {
      id: "in_test_123",
      object: "invoice",
      subscription: "sub_test123",
      customer: "cus_test123"
    });

    const res = await sendWebhook(fixture.app, event);
    assert.equal(res.status, 200);
    assert.equal(fixture.state.syncCalls.length, 1);
    assert.equal(fixture.state.syncCalls[0].bizId, "biz_test_lookup");
  } finally {
    fixture.cleanup();
  }
});
