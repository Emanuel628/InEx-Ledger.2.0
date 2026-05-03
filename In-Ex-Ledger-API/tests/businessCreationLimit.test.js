"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const BUSINESSES_ROUTE_PATH = require.resolve("../routes/businesses.routes.js");

function loadBusinessesRouterFixture(options = {}) {
  const originalLoad = Module._load.bind(Module);
  const state = {
    businessCount: options.businessCount ?? 1
  };

  Module._load = function (requestName, parent, isMain) {
    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        requireAuth: (req, _res, next) => {
          req.user = { id: "user_limit_123", email: "user@example.com" };
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
        resolveBusinessIdForUser: async () => "biz_limit_001",
        listBusinessesForUser: async () => options.listBusinesses || [
          { id: "biz_limit_001", name: "Main", is_active: true }
        ],
        setActiveBusinessForUser: async () => true,
        createBusinessForUserInTransaction: options.createBusinessForUserInTransaction || (async () => {
          throw new Error("createBusinessForUserInTransaction should not be called when capped");
        })
      };
    }

    if (requestName === "../services/subscriptionService.js" || /subscriptionService\.js$/.test(requestName)) {
      return {
        findBillingAnchorBusinessIdForUser: async () => "biz_limit_001",
        getSubscriptionSnapshotForBusiness: async () => (options.subscription || {
          effectiveTier: "free",
          maxBusinessesAllowed: 1
        })
      };
    }

    if (requestName === "../services/taxIdService.js" || /taxIdService\.js$/.test(requestName)) {
      return { decryptTaxId: (value) => value };
    }

    if (requestName === "../utils/authUtils.js" || /authUtils\.js$/.test(requestName)) {
      return { verifyPassword: async () => ({ match: true }) };
    }

    if (requestName === "../services/receiptStorage.js" || /receiptStorage\.js$/.test(requestName)) {
      return { isManagedReceiptPath: () => true };
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
              async query(sql) {
                if (/SELECT pg_advisory_xact_lock/i.test(sql)) return { rows: [], rowCount: 1 };
                if (/SELECT COUNT\(\*\)::int AS count FROM businesses/i.test(sql)) {
                  return { rows: [{ count: state.businessCount }], rowCount: 1 };
                }
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
    state,
    cleanup() {
      delete require.cache[BUSINESSES_ROUTE_PATH];
      Module._load = originalLoad;
    }
  };
}

test("business creation requires payment when user is already at the business cap", async () => {
  const fixture = loadBusinessesRouterFixture();

  try {
    const response = await request(fixture.app)
      .post("/api/businesses")
      .send({ name: "Second business", region: "US", language: "en" });

    assert.equal(response.status, 402);
    assert.equal(response.body?.code, "additional_business_payment_required");
    assert.equal(response.body?.max_businesses_allowed, 1);
    assert.equal(response.body?.current_business_count, 1);
  } finally {
    fixture.cleanup();
  }
});

test("business creation is allowed during Pro trial when slot capacity already exists", async () => {
  const fixture = loadBusinessesRouterFixture({
    businessCount: 1,
    subscription: {
      effectiveTier: "v1",
      effectiveStatus: "trialing",
      isTrialing: true,
      additionalBusinesses: 2,
      maxBusinessesAllowed: 3
    },
    createBusinessForUserInTransaction: async () => "biz_limit_002",
    listBusinesses: [
      { id: "biz_limit_001", name: "Main", is_active: true },
      { id: "biz_limit_002", name: "Second business", is_active: false }
    ]
  });

  try {
    const response = await request(fixture.app)
      .post("/api/businesses")
      .send({ name: "Second business", region: "US", language: "en" });

    assert.equal(response.status, 201);
    assert.equal(response.body?.active_business_id, "biz_limit_002");
  } finally {
    fixture.cleanup();
  }
});
