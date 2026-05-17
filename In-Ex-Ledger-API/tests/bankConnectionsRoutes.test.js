"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const ROUTE_PATH = require.resolve("../routes/bank-connections.routes.js");

function loadRouter() {
  const originalLoad = Module._load.bind(Module);
  const state = {
    listCalls: 0,
    disconnectCalls: 0,
    logErrors: [],
    forceListError: false,
    disconnectResult: true
  };

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return { pool: {} };
    }
    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        requireAuth(req, res, next) {
          if (!req.headers.authorization) {
            return res.status(401).json({ error: "Authentication required" });
          }
          req.user = { id: "user-1" };
          next();
        }
      };
    }
    if (requestName === "../middleware/csrf.middleware.js" || /csrf\.middleware\.js$/.test(requestName)) {
      return {
        requireCsrfProtection(req, res, next) {
          if (!req.headers["x-csrf-token"]) {
            return res.status(403).json({ error: "CSRF token required" });
          }
          next();
        }
      };
    }
    if (requestName === "../middleware/rate-limit.middleware.js" || /rate-limit\.middleware\.js$/.test(requestName)) {
      return {
        createDataApiLimiter() {
          return (_req, _res, next) => next();
        }
      };
    }
    if (requestName === "../api/utils/resolveBusinessIdForUser.js" || /resolveBusinessIdForUser\.js$/.test(requestName)) {
      return {
        resolveBusinessIdForUser: async () => "00000000-0000-4000-8000-000000000201"
      };
    }
    if (requestName === "../services/bankConnectionService.js" || /bankConnectionService\.js$/.test(requestName)) {
      return {
        listBankConnectionsForBusiness: async () => {
          state.listCalls += 1;
          if (state.forceListError) {
            throw new Error("connections exploded");
          }
          return [{ id: "bc_1", provider: "plaid" }];
        },
        disconnectBankConnection: async (_pool, _businessId, connectionId) => {
          state.disconnectCalls += 1;
          state.lastConnectionId = connectionId;
          return state.disconnectResult;
        }
      };
    }
    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return {
        logError(message, context) {
          state.logErrors.push({ message, context });
        }
      };
    }

    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[ROUTE_PATH];
  const router = require("../routes/bank-connections.routes.js");
  const app = express();
  app.use(express.json());
  app.use("/api/bank-connections", router);

  return {
    app,
    state,
    cleanup() {
      delete require.cache[ROUTE_PATH];
      Module._load = originalLoad;
    }
  };
}

test("bank-connections routes require auth", async () => {
  const fixture = loadRouter();
  try {
    const response = await request(fixture.app).get("/api/bank-connections");
    assert.equal(response.status, 401);
  } finally {
    fixture.cleanup();
  }
});

test("bank-connections list returns connection count", async () => {
  const fixture = loadRouter();
  try {
    const response = await request(fixture.app)
      .get("/api/bank-connections")
      .set("Authorization", "Bearer test")
      .set("x-csrf-token", "test-csrf");

    assert.equal(response.status, 200);
    assert.equal(response.body.count, 1);
    assert.equal(fixture.state.listCalls, 1);
  } finally {
    fixture.cleanup();
  }
});

test("bank-connections delete rejects invalid ids before the service layer", async () => {
  const fixture = loadRouter();
  try {
    const response = await request(fixture.app)
      .delete("/api/bank-connections/not-a-uuid")
      .set("Authorization", "Bearer test")
      .set("x-csrf-token", "test-csrf");

    assert.equal(response.status, 400);
    assert.equal(fixture.state.disconnectCalls, 0);
  } finally {
    fixture.cleanup();
  }
});

test("bank-connections list logs failures and returns 500", async () => {
  const fixture = loadRouter();
  try {
    fixture.state.forceListError = true;
    const response = await request(fixture.app)
      .get("/api/bank-connections")
      .set("Authorization", "Bearer test")
      .set("x-csrf-token", "test-csrf");

    assert.equal(response.status, 500);
    assert.equal(fixture.state.logErrors.length, 1);
    assert.match(fixture.state.logErrors[0].message, /GET \/bank-connections error/);
  } finally {
    fixture.cleanup();
  }
});
