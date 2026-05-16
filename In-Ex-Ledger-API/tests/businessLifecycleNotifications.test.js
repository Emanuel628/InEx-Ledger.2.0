"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const BUSINESSES_ROUTE_PATH = require.resolve("../routes/businesses.routes.js");

function loadBusinessesRouterFixture(options = {}) {
  const originalLoad = Module._load.bind(Module);
  const sentEmails = [];
  const stripeCalls = [];
  const state = {
    businessCount: options.businessCount ?? 1,
    businesses: options.businesses ?? [
      { id: "biz_main_001", name: "Main", is_active: true }
    ]
  };

  Module._load = function (requestName, parent, isMain) {
    if (requestName === "resend") {
      return {
        Resend: class {
          constructor() {
            this.emails = {
              send: async (payload) => {
                sentEmails.push(payload);
                return { id: "email_test_001" };
              }
            };
          }
        }
      };
    }

    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        requireAuth: (req, _res, next) => {
          req.user = {
            id: "user_notify_123",
            email: "owner@example.com",
            business_id: "biz_main_001"
          };
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
        resolveBusinessIdForUser: async () => "biz_main_001",
        listBusinessesForUser: async () => state.businesses,
        setActiveBusinessForUser: async () => true,
        createBusinessForUserInTransaction: options.createBusinessForUserInTransaction || (async () => "biz_new_002")
      };
    }

    if (requestName === "../services/subscriptionService.js" || /subscriptionService\.js$/.test(requestName)) {
      return {
        PLAN_V1: "v1",
        findBillingAnchorBusinessIdForUser: async () => "biz_main_001",
        getSubscriptionSnapshotForBusiness: async () => (options.subscription || {
          effectiveTier: "free",
          effectiveStatus: "free",
          additionalBusinesses: 0,
          billingInterval: "monthly",
          currency: "usd"
        }),
        syncStripeSubscriptionForBusiness: async () => {},
        setTrialPlanSelectionForBusiness: async () => {},
        setFreePlanForBusiness: async () => {}
      };
    }

    if (requestName === "../services/stripePriceConfig.js" || /stripePriceConfig\.js$/.test(requestName)) {
      return {
        buildStripePriceLookup: () => ({ addonPriceIds: new Set(), metadataByPriceId: new Map() }),
        buildStripePriceEnvMap: () => ({
          base: {
            monthly: { usd: "STRIPE_PRO_M_US" },
            yearly: { usd: "STRIPE_PRO_Y_US" }
          },
          addon: {
            monthly: { usd: "STRIPE_ADDL_M_US" },
            yearly: { usd: "STRIPE_ADDL_Y_US" }
          }
        })
      };
    }

    if (requestName === "../services/taxIdService.js" || /taxIdService\.js$/.test(requestName)) {
      return {
        decryptTaxId: (value) => value,
        encryptTaxId: (value) => value
      };
    }

    if (requestName === "../utils/authUtils.js" || /authUtils\.js$/.test(requestName)) {
      return { verifyPassword: async () => ({ match: options.passwordMatches ?? true }) };
    }

    if (requestName === "../services/receiptStorage.js" || /receiptStorage\.js$/.test(requestName)) {
      return { isManagedReceiptPath: () => true };
    }

    if (requestName === "../services/emailI18nService.js" || /emailI18nService\.js$/.test(requestName)) {
      return {
        getPreferredLanguageForUser: async () => "en",
        buildBusinessLifecycleEmail: (_lang, kind, payload) => ({
          subject: `business:${kind}`,
          html: JSON.stringify(payload.details),
          text: payload.details.map((detail) => `${detail.label}: ${detail.value}`).join("\n")
        })
      };
    }

    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return { logError() {}, logWarn() {}, logInfo() {} };
    }

    if (requestName === "../services/stripeClient.js" || /stripeClient\.js$/.test(requestName)) {
      return {
        stripeRequest: async () => ({}),
        stripeGet: async (path) => {
          stripeCalls.push(path);
          if (path.includes(process.env.STRIPE_PRO_M_US)) return { unit_amount: 1200 };
          if (path.includes(process.env.STRIPE_PRO_Y_US)) return { unit_amount: 12240 };
          if (path.includes(process.env.STRIPE_ADDL_M_US)) return { unit_amount: 500 };
          if (path.includes(process.env.STRIPE_ADDL_Y_US)) return { unit_amount: 5100 };
          return { unit_amount: 0 };
        }
      };
    }

    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql, params = []) {
            if (/SELECT email\s+FROM users/i.test(sql)) {
              return { rows: [{ email: "owner@example.com" }], rowCount: 1 };
            }
            if (/SELECT id, name FROM businesses/i.test(sql)) {
              return { rows: [{ id: params[0], name: options.deletedBusinessName || "Delete Me LLC" }], rowCount: 1 };
            }
            if (/SELECT COUNT\(\*\)::int AS count FROM businesses/i.test(sql)) {
              return {
                rows: [{ count: options.currentBusinessCount ?? state.businesses.length }],
                rowCount: 1
              };
            }
            if (/SELECT id\s+FROM businesses/i.test(sql) && /id <>/i.test(sql)) {
              return { rows: [{ id: "biz_keep_002" }], rowCount: 1 };
            }
            if (/SELECT password_hash FROM users/i.test(sql)) {
              return { rows: [{ password_hash: "hash" }], rowCount: 1 };
            }
            return { rows: [], rowCount: 0 };
          },
          async connect() {
            return {
              async query(sql) {
                if (/SELECT pg_advisory_xact_lock/i.test(sql)) return { rows: [], rowCount: 1 };
                if (/SELECT COUNT\(\*\)::int AS count FROM businesses/i.test(sql)) {
                  return { rows: [{ count: options.businessCount ?? 1 }], rowCount: 1 };
                }
                if (/SELECT storage_path FROM receipts/i.test(sql)) return { rows: [], rowCount: 0 };
                return { rows: [], rowCount: 0 };
              },
              release() {}
            };
          }
        }
      };
    }

    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[BUSINESSES_ROUTE_PATH];
  const router = require("../routes/businesses.routes.js");
  const app = express();
  app.use(express.json());
  app.use("/api/businesses", router);

  return {
    app,
    sentEmails,
    stripeCalls,
    cleanup() {
      delete require.cache[BUSINESSES_ROUTE_PATH];
      Module._load = originalLoad;
    }
  };
}

test("business creation sends a lifecycle email with the updated monthly total", async () => {
  process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "re_test_123";
  process.env.APP_BASE_URL = process.env.APP_BASE_URL || "https://www.inexledger.com";
  process.env.STRIPE_PRO_M_US = process.env.STRIPE_PRO_M_US || "price_pro_m_us";
  process.env.STRIPE_PRO_Y_US = process.env.STRIPE_PRO_Y_US || "price_pro_y_us";
  process.env.STRIPE_ADDL_M_US = process.env.STRIPE_ADDL_M_US || "price_addl_m_us";
  process.env.STRIPE_ADDL_Y_US = process.env.STRIPE_ADDL_Y_US || "price_addl_y_us";

  const fixture = loadBusinessesRouterFixture({
    businessCount: 1,
    businesses: [
      { id: "biz_main_001", name: "Main", is_active: true },
      { id: "biz_new_002", name: "Second Business", is_active: false }
    ],
    subscription: {
      effectiveTier: "v1",
      effectiveStatus: "active",
      additionalBusinesses: 1,
      maxBusinessesAllowed: 2,
      billingInterval: "monthly",
      currency: "usd"
    },
    createBusinessForUserInTransaction: async () => "biz_new_002"
  });

  try {
    const response = await request(fixture.app)
      .post("/api/businesses")
      .send({ name: "Second Business", region: "US", language: "en" });

    assert.equal(response.status, 201);
    assert.equal(fixture.sentEmails.length, 1);
    assert.equal(fixture.sentEmails[0].subject, "business:added");
    assert.match(fixture.sentEmails[0].text, /Business: Second Business/);
    assert.match(fixture.sentEmails[0].text, /Updated monthly total: \$17 \/ month/);
  } finally {
    fixture.cleanup();
  }
});

test("business deletion sends a lifecycle email with the updated zero-dollar total on free tier", async () => {
  process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "re_test_123";
  process.env.APP_BASE_URL = process.env.APP_BASE_URL || "https://www.inexledger.com";

  const fixture = loadBusinessesRouterFixture({
    currentBusinessCount: 2,
    businesses: [
      { id: "biz_keep_002", name: "Keep Me", is_active: true }
    ],
    subscription: {
      effectiveTier: "free",
      effectiveStatus: "free",
      additionalBusinesses: 0,
      billingInterval: "monthly",
      currency: "usd"
    },
    deletedBusinessName: "Delete Me LLC"
  });

  try {
    const response = await request(fixture.app)
      .delete("/api/businesses/biz_delete_001")
      .send({ password: "secret" });

    assert.equal(response.status, 200);
    assert.equal(fixture.sentEmails.length, 1);
    assert.equal(fixture.sentEmails[0].subject, "business:deleted");
    assert.match(fixture.sentEmails[0].text, /Business: Delete Me LLC/);
    assert.match(fixture.sentEmails[0].text, /Updated monthly total: \$0 \/ month/);
  } finally {
    fixture.cleanup();
  }
});
