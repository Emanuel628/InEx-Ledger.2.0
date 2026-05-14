"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const ROUTE_PATH = require.resolve("../routes/me.routes.js");

function loadMeRouter() {
  const originalLoad = Module._load.bind(Module);
  const state = {
    requestedLimit: null
  };

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        requireAuth(req, _res, next) {
          req.user = { id: "00000000-0000-4000-8000-000000000811" };
          next();
        },
        verifyToken() {
          return {};
        }
      };
    }
    if (requestName === "../middleware/csrf.middleware.js" || /csrf\.middleware\.js$/.test(requestName)) {
      return {
        requireCsrfProtection(_req, _res, next) {
          next();
        }
      };
    }
    if (requestName === "../api/utils/resolveBusinessIdForUser.js" || /resolveBusinessIdForUser\.js$/.test(requestName)) {
      return {
        resolveBusinessIdForUser: async () => "00000000-0000-4000-8000-000000000812",
        listBusinessesForUser: async () => [],
        setActiveBusinessForUser: async () => null,
        createBusinessForUser: async () => null
      };
    }
    if (requestName === "../services/subscriptionService.js" || /subscriptionService\.js$/.test(requestName)) {
      return {
        getSubscriptionSnapshotForUser: async () => ({})
      };
    }
    if (requestName === "../utils/authUtils.js" || /authUtils\.js$/.test(requestName)) {
      return {
        COOKIE_OPTIONS: { path: "/", httpOnly: true },
        isLegacyScryptHash: () => false,
        verifyPassword: async () => ({ match: true })
      };
    }
    if (requestName === "../middleware/rate-limit.middleware.js" || /rate-limit\.middleware\.js$/.test(requestName)) {
      return {
        createDataApiLimiter() {
          return (_req, _res, next) => next();
        }
      };
    }
    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return {
        logError() {},
        logInfo() {}
      };
    }
    if (requestName === "../services/receiptStorage.js" || /receiptStorage\.js$/.test(requestName)) {
      return {
        isManagedReceiptPath: () => true
      };
    }
    if (requestName === "../services/auditEventService.js" || /auditEventService\.js$/.test(requestName)) {
      return {
        listAuditEventsForUser: async (_pool, _userId, options = {}) => {
          state.requestedLimit = options.limit;
          return [];
        }
      };
    }
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query() {
            return { rows: [], rowCount: 0 };
          }
        }
      };
    }
    if (requestName === "express-rate-limit") {
      return function rateLimit() {
        return (_req, _res, next) => next();
      };
    }
    if (requestName === "bcrypt") {
      return {
        compare: async () => true
      };
    }

    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[ROUTE_PATH];

  try {
    const router = require("../routes/me.routes.js");
    const app = express();
    app.use(express.json());
    app.use("/api/me", router);
    return {
      app,
      state,
      cleanup() {
        delete require.cache[ROUTE_PATH];
        Module._load = originalLoad;
      }
    };
  } catch (error) {
    Module._load = originalLoad;
    throw error;
  }
}

test("me audit-events clamps oversized limits before calling the service", async () => {
  const fixture = loadMeRouter();
  try {
    const response = await request(fixture.app)
      .get("/api/me/audit-events?limit=1000000");

    assert.equal(response.status, 200);
    assert.equal(fixture.state.requestedLimit, 200);
  } finally {
    fixture.cleanup();
  }
});

test("me audit-events falls back to 50 when limit is invalid", async () => {
  const fixture = loadMeRouter();
  try {
    const response = await request(fixture.app)
      .get("/api/me/audit-events?limit=not-a-number");

    assert.equal(response.status, 200);
    assert.equal(fixture.state.requestedLimit, 50);
  } finally {
    fixture.cleanup();
  }
});
