"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const ME_ROUTE_PATH = require.resolve("../routes/me.routes.js");

function loadMeRouterFixture(options = {}) {
  const originalLoad = Module._load.bind(Module);

  const state = {
    resolvedOptions: [],
    dbQueries: [],
    txQueries: [],
    clientReleased: false,
    auditCalls: [],
    seededCategories: []
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
            if (/SELECT onboarding_completed, onboarding_data, onboarding_tour_seen/i.test(sql)) {
              return {
                rows: [{
                  onboarding_completed: true,
                  onboarding_data: options.currentOnboardingData || { guided_setup_active: true, guided_setup_step: "transactions" },
                  onboarding_tour_seen: {}
                }],
                rowCount: 1
              };
            }
            if (
              /UPDATE users\s+SET onboarding_data = \$1::jsonb/i.test(sql) ||
              (/UPDATE users/i.test(sql) &&
               /onboarding_tour_seen\s*=\s*'\{\}'::jsonb/i.test(sql) &&
               /onboarding_data = \$1::jsonb/i.test(sql))
            ) {
              const nextTourSeen =
                params[1] && typeof params[1] === "string" && String(params[1]).trim().startsWith("{")
                  ? JSON.parse(params[1])
                  : {};
              return {
                rows: [{
                  onboarding_completed: true,
                  onboarding_completed_at: new Date().toISOString(),
                  onboarding_data: JSON.parse(params[0] || "{}"),
                  onboarding_tour_seen: nextTourSeen
                }],
                rowCount: 1
              };
            }
            if (/FROM users\s+WHERE id = \$1/i.test(sql)) {
              return {
                rows: [{
                  ...userRow,
                  onboarding_data: options.currentOnboardingData || userRow.onboarding_data
                }],
                rowCount: 1
              };
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
                if (/SELECT onboarding_completed,\s*trial_eligible FROM users WHERE id = \$1 FOR UPDATE/i.test(sql)) {
                  return { rows: [{ onboarding_completed: false, trial_eligible: true }], rowCount: 1 };
                }
                if (/UPDATE businesses/i.test(sql)) {
                  return { rows: [], rowCount: 1 };
                }
                if (/SELECT id FROM accounts WHERE business_id = \$1 LIMIT 1/i.test(sql)) {
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
        getSubscriptionSnapshotForUser: async () => (
          options.subscriptionSnapshot || { effectiveStatus: "active" }
        )
      };
    }

    if (requestName === "../api/utils/seedDefaultsForBusiness.js" || /seedDefaultsForBusiness\.js$/.test(requestName)) {
      return {
        async seedDefaultCategoriesForBusiness(_client, businessId) {
          state.seededCategories.push(businessId);
          return [];
        }
      };
    }

    if (requestName === "../services/auditEventService.js" || /auditEventService\.js$/.test(requestName)) {
      return {
        AUDIT_ACTIONS: {
          ONBOARDING_COMPLETED: "onboarding.completed"
        },
        async recordAuditEventForRequest(_pool, _req, payload) {
          state.auditCalls.push(payload);
          return "audit-1";
        },
        async listAuditEventsForUser() {
          return [];
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

test("PUT /api/me/onboarding creates a starter account when the business has none", async () => {
  const fixture = loadMeRouterFixture();
  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .put("/api/me/onboarding")
      .send({
        business_name: "My Business",
        region: "US",
        language: "en",
        starter_account_type: "checking",
        starter_account_name: "Primary Checking",
        start_focus: "transactions",
        business_activity_code: "541611",
        accounting_method: "cash",
        material_participation: "yes"
      });

    assert.equal(response.status, 200);
    assert.deepEqual(fixture.state.resolvedOptions[0], { seedDefaults: false });

    const txSql = fixture.state.txQueries.map((entry) => entry.sql);
    const lockSql = txSql.find((sql) => /SELECT onboarding_completed,\s*trial_eligible FROM users WHERE id = \$1 FOR UPDATE/i.test(sql));
    const existingIdx = txSql.findIndex((sql) => /SELECT id FROM accounts WHERE business_id = \$1 LIMIT 1/i.test(sql));
    const insertIdx = txSql.findIndex((sql) => /INSERT INTO accounts/i.test(sql));
    assert.ok(lockSql, "onboarding should lock the user row before mutating starter-account state");
    assert.ok(existingIdx !== -1, "onboarding should check for an existing starter account before inserting");
    assert.ok(insertIdx !== -1, "onboarding should insert starter account");
    assert.ok(existingIdx < insertIdx, "account existence check should happen before starter insert");
    const businessUpdate = fixture.state.txQueries.find((entry) => /UPDATE businesses/i.test(entry.sql));
    assert.equal(businessUpdate?.params?.[1], "US");
    assert.equal(fixture.state.clientReleased, true);
  } finally {
    fixture.cleanup();
  }
});

test("PUT /api/me/onboarding sends a first-time trial user directly to trial setup", async () => {
  const fixture = loadMeRouterFixture({
    subscriptionSnapshot: {
      effectiveStatus: "trialing",
      stripeSubscriptionId: null,
      isTrialDowngradedToFree: false
    }
  });
  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .put("/api/me/onboarding")
      .send({
        business_name: "My Business",
        region: "US",
        language: "en",
        starter_account_type: "checking",
        starter_account_name: "Primary Checking",
        start_focus: "transactions"
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.redirect_to, "/trial-setup?next=%2Ftransactions");
  } finally {
    fixture.cleanup();
  }
});

test("PUT /api/me/onboarding records an onboarding completed audit event", async () => {
  const fixture = loadMeRouterFixture({
    subscriptionSnapshot: {
      effectiveStatus: "trialing",
      stripeSubscriptionId: null,
      isTrialDowngradedToFree: false
    }
  });

  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .put("/api/me/onboarding")
      .send({
        business_name: "Audit Trail LLC",
        starter_account_type: "checking",
        starter_account_name: "Main Checking",
        region: "US",
        language: "en",
        start_focus: "transactions"
      });

    assert.equal(response.status, 200);
    assert.equal(fixture.state.auditCalls.length, 1);
    assert.equal(fixture.state.auditCalls[0].action, "onboarding.completed");
    assert.equal(fixture.state.auditCalls[0].businessId, "business-1");
    assert.equal(fixture.state.auditCalls[0].metadata.startFocus, "transactions");
    assert.equal(fixture.state.auditCalls[0].metadata.redirectedToTrialSetup, true);
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

test("guided setup advances from transactions to a 4th import step", async () => {
  const fixture = loadMeRouterFixture();
  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .post("/api/me/onboarding/guide")
      .send({ action: "next", page: "transactions" });

    assert.equal(response.status, 200);
    assert.equal(response.body.redirect_to, "/transactions");
    assert.equal(response.body.onboarding.data.guided_setup_step, "import");
    assert.equal(response.body.onboarding.data.guided_setup_active, true);
  } finally {
    fixture.cleanup();
  }
});

test("PUT /api/me/onboarding stores a guided setup anchor when the selected first page is guided", async () => {
  const fixture = loadMeRouterFixture({
    subscriptionSnapshot: {
      effectiveStatus: "active"
    }
  });
  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .put("/api/me/onboarding")
      .send({
        business_name: "My Business",
        region: "US",
        language: "en",
        starter_account_type: "checking",
        starter_account_name: "Primary Checking",
        start_focus: "transactions",
        business_activity_code: "541611",
        accounting_method: "cash",
        material_participation: "yes"
      });

    assert.equal(response.status, 200);
    const onboardingUpdate = fixture.state.txQueries.find((entry) =>
      /UPDATE users\s+SET onboarding_completed = true/i.test(entry.sql)
    );
    assert.ok(onboardingUpdate, "onboarding should persist onboarding data");
    const onboardingData = JSON.parse(onboardingUpdate.params[0]);
    assert.equal(onboardingData.guided_setup_step, "transactions");
    assert.equal(onboardingData.guided_setup_anchor, "transactions");
  } finally {
    fixture.cleanup();
  }
});

test("guided setup rotates next step based on the selected anchor", async () => {
  const fixture = loadMeRouterFixture({
    currentOnboardingData: {
      start_focus: "transactions",
      guided_setup_active: true,
      guided_setup_anchor: "transactions",
      guided_setup_step: "transactions"
    }
  });
  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .post("/api/me/onboarding/guide")
      .send({ action: "next", page: "transactions" });

    assert.equal(response.status, 200);
    assert.equal(response.body.redirect_to, "/transactions");
    assert.equal(response.body.onboarding.data.guided_setup_step, "import");
    assert.equal(response.body.onboarding.data.guided_setup_anchor, "transactions");
  } finally {
    fixture.cleanup();
  }
});

test("guided setup replay restarts from the stored anchor instead of categories", async () => {
  const fixture = loadMeRouterFixture({
    currentOnboardingData: {
      start_focus: "transactions",
      guided_setup_active: false,
      guided_setup_anchor: "transactions",
      guided_setup_step: "complete"
    }
  });
  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .post("/api/me/onboarding/replay")
      .send({});

    assert.equal(response.status, 200);
    assert.equal(response.body.redirect_to, "/transactions");
  } finally {
    fixture.cleanup();
  }
});

test("guided setup import step finishes onboarding", async () => {
  const fixture = loadMeRouterFixture();
  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .post("/api/me/onboarding/guide")
      .send({ action: "finish", page: "import" });

    assert.equal(response.status, 200);
    assert.equal(response.body.redirect_to, "/transactions");
    assert.equal(response.body.onboarding.data.guided_setup_step, "complete");
    assert.equal(response.body.onboarding.data.guided_setup_active, false);
  } finally {
    fixture.cleanup();
  }
});

test("PUT /api/me/onboarding rejects non-numeric activity codes before opening a transaction", async () => {
  const fixture = loadMeRouterFixture();
  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .put("/api/me/onboarding")
      .send({
        business_name: "My Business",
        region: "US",
        language: "en",
        starter_account_type: "checking",
        starter_account_name: "Primary Checking",
        business_activity_code: "ABC123",
        accounting_method: "cash",
        material_participation: "yes"
      });

    assert.equal(response.status, 400);
    assert.match(String(response.body?.error || ""), /6 digits/i);
    assert.equal(fixture.state.txQueries.length, 0);
  } finally {
    fixture.cleanup();
  }
});

test("guided setup replay finish returns directly to transactions instead of trial setup", async () => {
  const fixture = loadMeRouterFixture({
    currentOnboardingData: {
      guided_setup_active: true,
      guided_setup_step: "import",
      guided_setup_replay: true
    }
  });
  try {
    const app = buildApp(fixture.router);
    const finishResponse = await request(app)
      .post("/api/me/onboarding/guide")
      .send({ action: "finish", page: "import" });

    assert.equal(finishResponse.status, 200);
    assert.equal(finishResponse.body.redirect_to, "/transactions");
    assert.equal(finishResponse.body.onboarding.data.guided_setup_step, "complete");
    assert.equal(finishResponse.body.onboarding.data.guided_setup_active, false);
    assert.equal("guided_setup_replay" in finishResponse.body.onboarding.data, false);
  } finally {
    fixture.cleanup();
  }
});
