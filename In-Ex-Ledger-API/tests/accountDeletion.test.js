"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const ME_ROUTE_PATH = require.resolve("../routes/me.routes.js");

function loadMeRouter(options = {}) {
  const originalLoad = Module._load.bind(Module);
  const state = {
    queries: [],
    userId: "00000000-0000-4000-8000-0000000000u1",
    email: "delete-me@example.com",
    passwordHash: "hash",
    receiptPaths: options.receiptPaths || [],
    businessIds: options.businessIds || ["00000000-0000-4000-8000-0000000000b1"],
    userDeleteCount: options.userDeleteCount ?? 1,
    passwordMatches: options.passwordMatches ?? true,
    unlinkCalls: [],
    clearedCookie: null
  };

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async connect() {
            return {
              async query(sql, params) {
                state.queries.push({ sql, params });

                if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
                  return { rows: [], rowCount: 0 };
                }
                if (/SELECT id, email, password_hash FROM users/i.test(sql)) {
                  return {
                    rows: [{ id: state.userId, email: state.email, password_hash: state.passwordHash }],
                    rowCount: 1
                  };
                }
                if (/SELECT r\.storage_path/i.test(sql)) {
                  return {
                    rows: state.receiptPaths.map((storage_path) => ({ storage_path })),
                    rowCount: state.receiptPaths.length
                  };
                }
                if (/SELECT id FROM businesses WHERE user_id = \$1/i.test(sql)) {
                  return {
                    rows: state.businessIds.map((id) => ({ id })),
                    rowCount: state.businessIds.length
                  };
                }
                if (/DELETE FROM users WHERE id = \$1 RETURNING id/i.test(sql)) {
                  return {
                    rows: state.userDeleteCount ? [{ id: state.userId }] : [],
                    rowCount: state.userDeleteCount
                  };
                }
                return { rows: [], rowCount: 0 };
              },
              release() {}
            };
          }
        }
      };
    }

    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        requireAuth(req, _res, next) {
          req.user = { id: state.userId };
          next();
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
        resolveBusinessIdForUser: async () => state.businessIds[0] || null,
        listBusinessesForUser: async () => [],
        setActiveBusinessForUser: async () => null,
        createBusinessForUser: async () => null
      };
    }

    if (requestName === "../services/subscriptionService.js" || /subscriptionService\.js$/.test(requestName)) {
      return {
        getSubscriptionSnapshotForBusiness: async () => ({})
      };
    }

    if (requestName === "../services/cpaAccessService.js" || /cpaAccessService\.js$/.test(requestName)) {
      return {
        listAssignedCpaGrants: async () => [],
        listAccessibleBusinessScopeForUser: async () => []
      };
    }

    if (requestName === "../utils/authUtils.js" || /authUtils\.js$/.test(requestName)) {
      return {
        COOKIE_OPTIONS: { path: "/", httpOnly: true },
        isLegacyScryptHash: () => false,
        verifyPassword: async () => ({ match: state.passwordMatches })
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
        logWarn() {},
        logInfo() {}
      };
    }

    if (requestName === "../services/receiptStorage.js" || /receiptStorage\.js$/.test(requestName)) {
      return {
        isManagedReceiptPath(filePath) {
          return String(filePath || "").startsWith("C:\\managed\\");
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
        compare: async () => state.passwordMatches
      };
    }

    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[ME_ROUTE_PATH];

  const originalUnlink = fs.promises.unlink;
  fs.promises.unlink = async (filePath) => {
    state.unlinkCalls.push(filePath);
    if (options.unlinkError && filePath === options.unlinkError.path) {
      const error = new Error(options.unlinkError.message || "unlink failed");
      error.code = options.unlinkError.code;
      throw error;
    }
  };

  try {
    const router = require("../routes/me.routes.js");
    return {
      router,
      state,
      cleanup() {
        delete require.cache[ME_ROUTE_PATH];
        Module._load = originalLoad;
        fs.promises.unlink = originalUnlink;
      }
    };
  } catch (error) {
    Module._load = originalLoad;
    fs.promises.unlink = originalUnlink;
    throw error;
  }
}

function buildApp(router, state) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    const originalClearCookie = res.clearCookie.bind(res);
    res.clearCookie = (name, options) => {
      state.clearedCookie = { name, options };
      return originalClearCookie(name, options);
    };
    next();
  });
  app.use("/api/me", router);
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message });
  });
  return app;
}

test("account deletion executes the hard delete and returns success", async () => {
  const fixture = loadMeRouter({
    receiptPaths: ["C:\\managed\\receipt-1.pdf"]
  });

  try {
    const app = buildApp(fixture.router, fixture.state);
    const response = await request(app)
      .delete("/api/me")
      .send({ password: "CorrectHorseBatteryStaple1!" });

    assert.equal(response.status, 200);
    assert.match(response.body.message, /deleted/i);
    assert.ok(
      fixture.state.queries.some(({ sql }) => /DELETE FROM users WHERE id = \$1 RETURNING id/i.test(sql)),
      "route must issue a hard DELETE against users"
    );
    assert.ok(
      fixture.state.queries.some(({ sql }) => /DELETE FROM businesses WHERE user_id = \$1/i.test(sql)),
      "route must delete owned businesses before deleting the user"
    );
    assert.deepEqual(fixture.state.unlinkCalls, ["C:\\managed\\receipt-1.pdf"]);
    assert.equal(fixture.state.clearedCookie?.name, "refresh_token");
  } finally {
    fixture.cleanup();
  }
});

test("account deletion still returns success when receipt cleanup fails after commit", async () => {
  const fixture = loadMeRouter({
    receiptPaths: ["C:\\managed\\receipt-2.pdf"],
    unlinkError: {
      path: "C:\\managed\\receipt-2.pdf",
      code: "EPERM",
      message: "permission denied"
    }
  });

  try {
    const app = buildApp(fixture.router, fixture.state);
    const response = await request(app)
      .delete("/api/me")
      .send({ password: "CorrectHorseBatteryStaple1!" });

    assert.equal(response.status, 200);
    assert.ok(
      fixture.state.queries.some(({ sql }) => sql === "COMMIT"),
      "database transaction must commit before file cleanup"
    );
  } finally {
    fixture.cleanup();
  }
});
