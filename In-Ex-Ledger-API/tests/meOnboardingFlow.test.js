"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const ME_ROUTE_PATH = require.resolve("../routes/me.routes.js");

function loadMeRouterFixture() {
  const originalLoad = Module._load.bind(Module);

  const state = {
    resolvedOptions: [],
    dbQueries: [],
    txQueries: [],
    clientReleased: false
  };

  const userRow = {
    id: "user-1",
    email: "user@example.com",
    role: "user",
    email_verified: true,
    mfa_enabled: false,
    full_name: "Test User",
    display_name: "Test",
    country: "US",
    province: null,
    data_residency: "us",
    created_at: new Date().toISOString(),
    onboarding_completed: false,
    onboarding_completed_at: null,
    onboarding_data: {},
    onboarding_tour_seen: {}
  };

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql, params = []) {
            state.dbQueries.push({ sql, params });
            if (/FROM users\s+WHERE id = \$1/i.test(sql)) {
              return { rows: [userRow], rowCount: 1 };
            }
            if (/UPDATE users\s+SET full_name = CASE WHEN \$4::boolean THEN \$1 ELSE full_name END,/i.test(sql)) {
              return {
                rows: [{
                  id: "user-1",
                  email: "user@example.com",
                  full_name: params[0],
                  display_name: params[1],
                  created_at: new Date().toISOString()
                }],
                rowCount: 1
              };
            }
            throw new Error(`Unhandled pool SQL: ${sql}`);
          },
          async connect() {
            return {
              async query(sql, params = []) {
                state.txQueries.push({ sql, params });
                if (/^BEGIN$/i.test(sql) || /^COMMIT$/i.test(sql) || /^ROLLBACK$/i.test(sql)) {
                  return { rows: [], rowCount: 0 };
                }
                if (/SELECT onboarding_completed FROM users WHERE id = \$1 FOR UPDATE/i.test(sql)) {
                  return { rows: [{ onboarding_completed: false }], rowCount: 1 };
                }
                if (/UPDATE businesses/i.test(sql)) {
                  return { rows: [], rowCount: 1 };
                }
                if (/DELETE FROM accounts WHERE business_id = \$1/i.test(sql)) {
                  return { rows: [], rowCount: 3 };
                }
                if (/SELECT 1 FROM accounts WHERE business_id = \$1 LIMIT 1/i.test(sql)) {
                  return { rows: [], rowCount: 0 };
                }
                if (/INSERT INTO accounts/i.test(sql)) {
                  return { rows: [], rowCount: 1 };
                }
                if (/UPDATE users\s+SET onboarding_completed = true/i.test(sql)) {
                  return {
                    rows: [{
                      onboarding_completed: true,
                      onboarding_completed_at: new Date().toISOString(),
                      onboarding_data: {},
                      onboarding_tour_seen: {}
                    }],
                    rowCount: 1
                  };
                }
                throw new Error(`Unhandled tx SQL: ${sql}`);
              },
              release() {
                state.clientReleased = true;
              }
            };
          }
        }
      };
    }

    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        requireAuth(req, _res, next) {
          req.user = { id: "user-1", email: "user@example.com" };
          next();
        },
        requireMfa(_req, _res, next) {
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

    if (requestName === "../middleware/rate-limit.middleware.js" || /rate-limit\.middleware\.js$/.test(requestName)) {
      return {
        createDataApiLimiter() {
          return (_req, _res, next) => next();
        }
      };
    }

    if (requestName === "../api/utils/resolveBusinessIdForUser.js" || /resolveBusinessIdForUser\.js$/.test(requestName)) {
      return {
        async resolveBusinessIdForUser(_user, options = {}) {
          state.resolvedOptions.push(options);
          return "business-1";
        },
        async listBusinessesForUser() {
          return [{ id: "business-1", name: "Biz", region: "US", province: "", language: "en", is_active: true }];
        }
      };
    }

    if (requestName === "../services/subscriptionService.js" || /subscriptionService\.js$/.test(requestName)) {
      return {
        getSubscriptionSnapshotForBusiness: async () => ({ status: "active" }),
        getSubscriptionSnapshotForUser: async () => ({ status: "active" })
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
      return { isManagedReceiptPath: () => false };
    }

    if (requestName === "../utils/authUtils.js" || /authUtils\.js$/.test(requestName)) {
      return { COOKIE_OPTIONS: {}, isLegacyScryptHash: () => false, verifyPassword: async () => ({ match: false }) };
    }

    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[ME_ROUTE_PATH];
  const router = require("../routes/me.routes.js");

  return {
    router,
    state,
    cleanup() {
      delete require.cache[ME_ROUTE_PATH];
      Module._load = originalLoad;
    }
  };
}

function buildApp(router) {
  const app = express();
  app.use(express.json());
  app.use("/api/me", router);
  app.use((err, _req, res, _next) => {
    res.status(500).json({ error: err?.message || "error" });
  });
  return app;
}

test("GET /api/me resolves business without account pre-seeding", async () => {
  const fixture = loadMeRouterFixture();
  try {
    const app = buildApp(fixture.router);
    const response = await request(app).get("/api/me");

    assert.equal(response.status, 200);
    assert.deepEqual(fixture.state.resolvedOptions[0], { seedDefaults: false });
  } finally {
    fixture.cleanup();
  }
});

test("PUT /api/me/onboarding replaces pre-seeded accounts before starter account insert", async () => {
  const fixture = loadMeRouterFixture();
  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .put("/api/me/onboarding")
      .send({
        business_name: "My Business",
        business_type: "sole_proprietor",
        region: "US",
        language: "en",
        starter_account_type: "checking",
        starter_account_name: "Primary Checking",
        start_focus: "transactions"
      });

    assert.equal(response.status, 200);
    assert.deepEqual(fixture.state.resolvedOptions[0], { seedDefaults: false });

    const txSql = fixture.state.txQueries.map((entry) => entry.sql);
    const lockSql = txSql.find((sql) => /SELECT onboarding_completed FROM users WHERE id = \$1 FOR UPDATE/i.test(sql));
    const deleteIdx = txSql.findIndex((sql) => /DELETE FROM accounts WHERE business_id = \$1/i.test(sql));
    const insertIdx = txSql.findIndex((sql) => /INSERT INTO accounts/i.test(sql));
    assert.ok(lockSql, "onboarding should lock the user row before mutating starter-account state");
    assert.ok(deleteIdx !== -1, "onboarding should clear pre-seeded accounts");
    assert.ok(insertIdx !== -1, "onboarding should insert starter account");
    assert.ok(deleteIdx < insertIdx, "account cleanup should happen before starter insert");
    assert.equal(fixture.state.clientReleased, true);
  } finally {
    fixture.cleanup();
  }
});

test("PUT /api/me/onboarding rejects oversized business names before opening a transaction", async () => {
  const fixture = loadMeRouterFixture();
  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .put("/api/me/onboarding")
      .send({
        business_name: "B".repeat(201),
        business_type: "sole_proprietor",
        region: "US",
        language: "en"
      });

    assert.equal(response.status, 400);
    assert.match(String(response.body?.error || ""), /Business name/i);
    assert.equal(fixture.state.txQueries.length, 0);
  } finally {
    fixture.cleanup();
  }
});

test("PUT /api/me rejects oversized profile names before issuing the update", async () => {
  const fixture = loadMeRouterFixture();
  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .put("/api/me")
      .send({
        full_name: "A".repeat(121)
      });

    assert.equal(response.status, 400);
    assert.match(String(response.body?.error || ""), /Full name/i);
    const profileUpdateQuery = fixture.state.dbQueries.find((entry) =>
      /UPDATE users\s+SET full_name/i.test(entry.sql)
    );
    assert.equal(profileUpdateQuery, undefined);
  } finally {
    fixture.cleanup();
  }
});
