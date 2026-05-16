"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const SYSTEM_ROUTE_PATH = require.resolve("../routes/system.routes.js");

function loadSystemRouter() {
  const originalLoad = Module._load.bind(Module);
  const state = {
    limiterHits: 0,
    diagnosticsShouldThrow: false,
    logErrors: []
  };

  Module._load = function(requestName, parent, isMain) {
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
    if (requestName === "../middleware/rate-limit.middleware.js" || /rate-limit\.middleware\.js$/.test(requestName)) {
      return {
        createDataApiLimiter() {
          return (req, res, next) => {
            state.limiterHits += 1;
            if (req.headers["x-test-rate-limit"] === "block") {
              return res.status(429).json({ error: "Too many requests." });
            }
            next();
          };
        },
        getRateLimiterHealth() {
          return { mode: "enforced" };
        }
      };
    }
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        migrationStats: { total: 1, applied: 0, skipped: 1, lastAppliedAt: null, lastCheckedAt: null }
      };
    }
    if (requestName === "../services/receiptStorage.js" || /receiptStorage\.js$/.test(requestName)) {
      return {
        getReceiptStorageStatus() {
          return { ok: true };
        }
      };
    }
    if (requestName === "../services/diagnosticsService.js" || /diagnosticsService\.js$/.test(requestName)) {
      return {
        buildDiagnostics() {
          if (state.diagnosticsShouldThrow) {
            throw new Error("diagnostics exploded");
          }
          return { ok: true };
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

  delete require.cache[SYSTEM_ROUTE_PATH];
  const router = require("../routes/system.routes.js");
  const app = express();
  app.use("/api/system", router);

  return {
    app,
    state,
    cleanup() {
      delete require.cache[SYSTEM_ROUTE_PATH];
      Module._load = originalLoad;
    }
  };
}

test("system health route is protected by its public rate limiter", async () => {
  const fixture = loadSystemRouter();
  try {
    const response = await request(fixture.app)
      .get("/api/system/health")
      .set("x-test-rate-limit", "block");

    assert.equal(response.status, 429);
    assert.equal(fixture.state.limiterHits > 0, true);
  } finally {
    fixture.cleanup();
  }
});

test("system links route is protected by its public rate limiter", async () => {
  const fixture = loadSystemRouter();
  try {
    const response = await request(fixture.app)
      .get("/api/system/links")
      .set("x-test-rate-limit", "block");

    assert.equal(response.status, 429);
    assert.equal(fixture.state.limiterHits > 0, true);
  } finally {
    fixture.cleanup();
  }
});

test("system diagnostics logs failures instead of swallowing them", async () => {
  const fixture = loadSystemRouter();
  try {
    fixture.state.diagnosticsShouldThrow = true;
    const response = await request(fixture.app)
      .get("/api/system/diagnostics")
      .set("Authorization", "Bearer test");

    assert.equal(response.status, 500);
    assert.equal(fixture.state.logErrors.length, 1);
    assert.match(fixture.state.logErrors[0].message, /GET \/api\/system\/diagnostics error/);
  } finally {
    fixture.cleanup();
  }
});
