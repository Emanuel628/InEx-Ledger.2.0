"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const ROUTE_PATH = require.resolve("../routes/businesses.routes.js");

function loadBusinessesRouterFixture() {
  const originalLoad = Module._load.bind(Module);
  const state = {
    updateParams: null
  };

  Module._load = function (requestName, parent, isMain) {
    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        requireAuth(req, _res, next) {
          req.user = { id: "user_profile_123", email: "user@example.com" };
          next();
        },
        requireMfaIfEnabled(_req, _res, next) {
          next();
        }
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
        resolveBusinessIdForUser: async () => "biz_profile_001",
        listBusinessesForUser: async () => [],
        setActiveBusinessForUser: async () => true,
        createBusinessForUserInTransaction: async () => "biz_profile_002"
      };
    }

    if (requestName === "../services/subscriptionService.js" || /subscriptionService\.js$/.test(requestName)) {
      return {
        PLAN_V1: "v1",
        findBillingAnchorBusinessIdForUser: async () => "biz_profile_001",
        getSubscriptionSnapshotForBusiness: async () => ({ effectiveTier: "free", maxBusinessesAllowed: 1 }),
        syncStripeSubscriptionForBusiness: async () => ({})
      };
    }

    if (requestName === "../services/taxIdService.js" || /taxIdService\.js$/.test(requestName)) {
      return {
        decryptTaxId: (value) => value,
        encryptTaxId: (value) => value
      };
    }

    if (requestName === "../utils/authUtils.js" || /authUtils\.js$/.test(requestName)) {
      return { verifyPassword: async () => ({ match: true }) };
    }

    if (requestName === "../services/receiptStorage.js" || /receiptStorage\.js$/.test(requestName)) {
      return { isManagedReceiptPath: () => true };
    }

    if (requestName === "../services/emailI18nService.js" || /emailI18nService\.js$/.test(requestName)) {
      return {
        getPreferredLanguageForUser: async () => "en",
        buildBusinessLifecycleEmail: () => ({ subject: "Test", html: "<p>Test</p>", text: "Test" })
      };
    }

    if (requestName === "../services/stripeClient.js" || /stripeClient\.js$/.test(requestName)) {
      return {
        stripeRequest: async () => ({}),
        stripeGet: async () => ({})
      };
    }

    if (requestName === "../services/stripePriceConfig.js" || /stripePriceConfig\.js$/.test(requestName)) {
      return {
        buildStripePriceEnvMap: () => ({ base: {}, addon: {} }),
        buildStripePriceLookup: () => ({ addonPriceIds: new Set() })
      };
    }

    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return { logError() {}, logWarn() {}, logInfo() {} };
    }

    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql, params = []) {
            if (/SELECT id, name, region, language, fiscal_year_start, province,/i.test(sql)) {
              return {
                rows: [{
                  id: "biz_profile_001",
                  name: "Biz",
                  region: "US",
                  language: "en",
                  fiscal_year_start: "01-01",
                  province: null,
                  business_type: "sole_proprietor",
                  tax_id: null,
                  address: null,
                  operating_name: null,
                  business_activity_code: null,
                  accounting_method: "cash",
                  material_participation: true,
                  gst_hst_registered: false,
                  gst_hst_number: null,
                  gst_hst_method: null,
                  locked_through_date: null,
                  locked_period_note: null,
                  locked_period_updated_at: null,
                  created_at: new Date().toISOString()
                }],
                rowCount: 1
              };
            }
            if (/UPDATE businesses\s+SET name = COALESCE/i.test(sql)) {
              state.updateParams = params;
              return {
                rows: [{
                  id: "biz_profile_001",
                  name: "Biz",
                  region: "US",
                  language: "en",
                  fiscal_year_start: params[3],
                  province: null,
                  business_type: "sole_proprietor",
                  tax_id: null,
                  address: null,
                  operating_name: null,
                  business_activity_code: null,
                  accounting_method: "cash",
                  material_participation: true,
                  gst_hst_registered: false,
                  gst_hst_number: null,
                  gst_hst_method: null,
                  locked_through_date: null,
                  locked_period_note: null,
                  locked_period_updated_at: null,
                  created_at: new Date().toISOString()
                }],
                rowCount: 1
              };
            }
            return { rows: [], rowCount: 0 };
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

test("business profile update normalizes YYYY-MM-DD fiscal year input to MM-DD storage", async () => {
  const fixture = loadBusinessesRouterFixture();

  try {
    const response = await request(fixture.app)
      .put("/api/businesses/biz_profile_001/profile")
      .send({ fiscal_year_start: "2000-04-15" });

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(fixture.state.updateParams));
    assert.equal(fixture.state.updateParams[3], "04-15");
    assert.equal(response.body?.fiscal_year_start, "04-15");
  } finally {
    fixture.cleanup();
  }
});
