"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const ROUTE_PATH = require.resolve("../routes/businesses.routes.js");

function buildStripeSubscription(state) {
  const items = [];
  if (state.currentAddonQty > 0) {
    items.push({
      id: "si_addon_1",
      quantity: state.currentAddonQty,
      price: {
        id: "price_addon_usd",
        currency: "usd",
        recurring: { interval: "month" }
      }
    });
  }
  items.push({
    id: "si_base_1",
    quantity: 1,
    price: {
      id: "price_base_usd",
      currency: "usd",
      recurring: { interval: "month" }
    }
  });

  return {
    id: "sub_provision_1",
    customer: "cus_provision_1",
    status: "active",
    cancel_at_period_end: false,
    current_period_start: 1760000000,
    current_period_end: 1762600000,
    items: { data: items },
    metadata: {
      business_id: state.currentBusinessId,
      additional_businesses: String(state.currentAddonQty),
      billing_interval: "monthly",
      currency: "usd"
    }
  };
}

function loadBusinessesRouterFixture(options = {}) {
  const originalLoad = Module._load.bind(Module);
  const state = {
    stripeRequests: [],
    currentAddonQty: options.initialAddonQty ?? 0,
    currentBusinessId: "biz_anchor_1",
    committed: false,
    rolledBack: false
  };

  Module._load = function (requestName, parent, isMain) {
    if (requestName === "resend") {
      return {
        Resend: class {
          constructor() {
            this.emails = { send: async () => ({ id: "email_test_1" }) };
          }
        }
      };
    }

    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        requireAuth: (req, _res, next) => {
          req.user = { id: "user_provision_1", email: "owner@example.com", business_id: "biz_anchor_1" };
          next();
        },
        requireMfaIfEnabled: (_req, _res, next) => next()
      };
    }

    if (requestName === "../middleware/csrf.middleware.js" || /csrf\.middleware\.js$/.test(requestName)) {
      return { requireCsrfProtection: (_req, _res, next) => next() };
    }

    if (requestName === "../middleware/rateLimitTiers.js" || /rateLimitTiers\.js$/.test(requestName)) {
      return {
        createBusinessDeleteLimiter: () => (_req, _res, next) => next()
      };
    }

    if (requestName === "../api/utils/resolveBusinessIdForUser.js" || /resolveBusinessIdForUser\.js$/.test(requestName)) {
      return {
        resolveBusinessIdForUser: async () => "biz_anchor_1",
        listBusinessesForUser: async () => [{ id: "biz_anchor_1", name: "Anchor", is_active: true }],
        setActiveBusinessForUser: async () => true,
        createBusinessForUserInTransaction: options.createBusinessForUserInTransaction || (async () => "biz_new_2")
      };
    }

    if (requestName === "../services/subscriptionService.js" || /subscriptionService\.js$/.test(requestName)) {
      return {
        PLAN_V1: "v1",
        findBillingAnchorBusinessIdForUser: async () => "biz_anchor_1",
        getSubscriptionSnapshotForBusiness: async () => ({
          businessId: "biz_anchor_1",
          effectiveTier: "v1",
          effectiveStatus: "active",
          isPaid: true,
          isTrialing: false,
          stripeSubscriptionId: "sub_provision_1",
          stripeCustomerId: "cus_provision_1",
          billingInterval: "monthly",
          currency: "usd",
          additionalBusinesses: state.currentAddonQty,
          maxBusinessesAllowed: 1 + state.currentAddonQty
        })
      };
    }

    if (requestName === "../services/stripePriceConfig.js" || /stripePriceConfig\.js$/.test(requestName)) {
      return {
        buildStripePriceLookup: () => ({
          basePriceIds: new Set(["price_base_usd"]),
          addonPriceIds: new Set(["price_addon_usd"]),
          metadataByPriceId: new Map([
            ["price_base_usd", { billingInterval: "monthly", currency: "usd", type: "base" }],
            ["price_addon_usd", { billingInterval: "monthly", currency: "usd", type: "addon" }]
          ])
        }),
        buildStripePriceEnvMap: () => ({
          base: {
            monthly: { usd: "STRIPE_PRO_M_US", cad: null },
            yearly: { usd: null, cad: null }
          },
          addon: {
            monthly: { usd: "STRIPE_ADDL_M_US", cad: null },
            yearly: { usd: null, cad: null }
          }
        })
      };
    }

    if (requestName === "../services/stripeClient.js" || /stripeClient\.js$/.test(requestName)) {
      return {
        stripeGet: async (path) => {
          if (String(path).includes("/subscriptions/")) {
            return buildStripeSubscription(state);
          }
          throw new Error(`Unhandled stripeGet path: ${path}`);
        },
        stripeRequest: async (path, payload) => {
          state.stripeRequests.push({ path, payload });
          if (String(path).includes("/subscriptions/")) {
            if (payload["items[0][deleted]"] === "true") {
              state.currentAddonQty = 0;
            } else if (payload["items[0][quantity]"]) {
              state.currentAddonQty = Number(payload["items[0][quantity]"]);
            }
            if (payload["metadata[business_id]"]) {
              state.currentBusinessId = payload["metadata[business_id]"];
            }
            return buildStripeSubscription(state);
          }
          if (String(path).includes("/customers/")) {
            if (payload["metadata[business_id]"]) {
              state.currentBusinessId = payload["metadata[business_id]"];
            }
            return {};
          }
          throw new Error(`Unhandled stripeRequest path: ${path}`);
        }
      };
    }

    if (requestName === "../services/emailI18nService.js" || /emailI18nService\.js$/.test(requestName)) {
      return {
        getPreferredLanguageForUser: async () => "en",
        buildBusinessLifecycleEmail: () => ({ subject: "biz", html: "", text: "" })
      };
    }

    if (requestName === "../services/emailPreferencesService.js" || /emailPreferencesService\.js$/.test(requestName)) {
      return {
        appendOptionalEmailFooter: (email) => email,
        getOptionalEmailPreferenceForUser: async () => false
      };
    }

    if (requestName === "../services/taxIdService.js" || /taxIdService\.js$/.test(requestName)) {
      return {
        decryptTaxId: (value) => value,
        encryptTaxId: (value) => value
      };
    }

    if (requestName === "../services/gstHstNumberService.js" || /gstHstNumberService\.js$/.test(requestName)) {
      return {
        decryptGstHstNumber: (value) => value,
        encryptGstHstNumber: (value) => value
      };
    }

    if (requestName === "../utils/authUtils.js" || /authUtils\.js$/.test(requestName)) {
      return { verifyPassword: async () => ({ match: true }) };
    }

    if (requestName === "../services/receiptStorage.js" || /receiptStorage\.js$/.test(requestName)) {
      return { isManagedReceiptPath: () => true };
    }

    if (requestName === "../services/exportSnapshotService.js" || /exportSnapshotService\.js$/.test(requestName)) {
      return { invalidateSnapshotsForBusiness: async () => {} };
    }

    if (requestName === "../utils/fiscalYear.js" || /fiscalYear\.js$/.test(requestName)) {
      return { normalizeFiscalYearStart: () => ({ valid: true, value: null }) };
    }

    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return { logError() {}, logWarn() {}, logInfo() {} };
    }

    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query() { return { rows: [], rowCount: 0 }; },
          async connect() {
            return {
              async query(sql, params = []) {
                if (/^BEGIN$/i.test(sql)) return { rows: [], rowCount: 0 };
                if (/^COMMIT$/i.test(sql)) {
                  state.committed = true;
                  return { rows: [], rowCount: 0 };
                }
                if (/^ROLLBACK$/i.test(sql)) {
                  state.rolledBack = true;
                  return { rows: [], rowCount: 0 };
                }
                if (/SELECT pg_advisory_xact_lock/i.test(sql)) return { rows: [], rowCount: 1 };
                if (/SELECT COUNT\(\*\)::int AS count FROM businesses/i.test(sql)) {
                  return { rows: [{ count: 1 }], rowCount: 1 };
                }
                if (/SELECT status,\s*metadata_json\s+FROM business_subscriptions/i.test(sql.replace(/\s+/g, " "))) {
                  return { rows: [{ status: "active", metadata_json: {} }], rowCount: 1 };
                }
                if (/UPDATE business_subscriptions/i.test(sql) || /INSERT INTO business_subscriptions/i.test(sql)) {
                  return { rows: [], rowCount: 1 };
                }
                throw new Error(`Unhandled client SQL: ${sql}`);
              },
              release() {}
            };
          }
        }
      };
    }

    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[ROUTE_PATH];
  const router = require("../routes/businesses.routes.js");
  const app = express();
  app.use(express.json());
  app.use("/api/businesses", router);

  return {
    app,
    state,
    cleanup() {
      delete require.cache[ROUTE_PATH];
      Module._load = originalLoad;
    }
  };
}

test("provision-add-on updates Stripe quantity and creates the business atomically", async () => {
  process.env.STRIPE_ADDL_M_US = "price_addon_usd";
  process.env.STRIPE_PRO_M_US = "price_base_usd";

  const fixture = loadBusinessesRouterFixture();
  try {
    const response = await request(fixture.app)
      .post("/api/businesses/provision-add-on")
      .send({ name: "Second Business" });

    assert.equal(response.status, 201);
    assert.equal(response.body?.success, true);
    assert.equal(response.body?.businessId, "biz_new_2");
    assert.equal(fixture.state.committed, true);
    assert.equal(fixture.state.currentAddonQty, 1);
    assert.equal(
      fixture.state.stripeRequests.some((entry) => entry.payload["items[0][quantity]"] === 1),
      true
    );
  } finally {
    fixture.cleanup();
  }
});

test("provision-add-on compensates Stripe when database work fails after the charge change", async () => {
  process.env.STRIPE_ADDL_M_US = "price_addon_usd";
  process.env.STRIPE_PRO_M_US = "price_base_usd";

  const fixture = loadBusinessesRouterFixture({
    createBusinessForUserInTransaction: async () => {
      throw new Error("insert failed");
    }
  });
  try {
    const response = await request(fixture.app)
      .post("/api/businesses/provision-add-on")
      .send({ name: "Second Business" });

    assert.equal(response.status, 500);
    assert.equal(fixture.state.rolledBack, true);
    assert.equal(fixture.state.currentAddonQty, 0);
    assert.equal(
      fixture.state.stripeRequests.some((entry) => entry.payload["items[0][deleted]"] === "true"),
      true
    );
  } finally {
    fixture.cleanup();
  }
});
