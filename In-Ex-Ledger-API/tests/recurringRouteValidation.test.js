"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const ROUTE_PATH = require.resolve("../routes/recurring.routes.js");
const REQUIRE_PLAN_FEATURE_PATH = require.resolve("../middleware/requirePlanFeature.js");

function loadRecurringRouter(options = {}) {
  const originalLoad = Module._load.bind(Module);
  const state = {
    dbTouched: false,
    queries: []
  };

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        requireAuth(req, _res, next) {
          req.user = { id: "00000000-0000-4000-8000-000000000711" };
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
        resolveBusinessIdForUser: async () => "00000000-0000-4000-8000-000000000712"
      };
    }
    if (requestName === "../services/subscriptionService.js" || /subscriptionService\.js$/.test(requestName)) {
      return {
        PLAN_PRO: "v1",
        getSubscriptionSnapshotForBusiness: async () => ({ plan: "test", effectiveTier: "free" }),
        hasFeatureAccess: options.hasFeatureAccess || (() => true)
      };
    }
    if (requestName === "../services/basicPlanUsageService.js" || /basicPlanUsageService\.js$/.test(requestName)) {
      class BasicPlanLimitError extends Error {
        constructor() {
          super("limit");
          this.statusCode = 402;
        }
      }
      return { BasicPlanLimitError };
    }
    if (requestName === "../services/recurringTransactionsService.js" || /recurringTransactionsService\.js$/.test(requestName)) {
      return {
        RecurringTemplateValidationError: class RecurringTemplateValidationError extends Error {},
        normalizeRecurringPayload: () => ({
          valid: true,
          normalized: {
            accountId: "00000000-0000-4000-8000-000000000713",
            categoryId: "00000000-0000-4000-8000-000000000714",
            amount: 1,
            type: "expense",
            description: "Rent",
            note: null,
            cadence: "monthly",
            startDate: "2026-05-01",
            endDate: null,
            clearedDefault: false,
            active: true
          }
        }),
        materializeTemplateRuns: async () => {
          if (options.materializeError) {
            throw options.materializeError;
          }
          return {};
        },
        materializeNextTemplateRun: async () => ({ found: true, created: false }),
        verifyTemplateOwnership: async () => ({}),
        mapRecurringRow: (row) => row,
        computeNextRunDateForUpdate: () => ({
          nextRunDate: "2026-05-01",
          active: true
        }),
        projectUpcomingOccurrences: () => []
      };
    }
    if (requestName === "../services/accountingLockService.js" || /accountingLockService\.js$/.test(requestName)) {
      return {
        loadAccountingLockState: async () => null,
        isDateLocked: () => false
      };
    }
    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return {
        logError() {},
        logWarn() {},
        logInfo() {}
      };
    }
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query() {
            state.dbTouched = true;
            state.queries.push(arguments[0]);
            const sql = String(arguments[0] || "");
            if (/WITH latest_deleted/i.test(sql)) {
              return {
                rowCount: 1,
                rows: [
                  {
                    id: "00000000-0000-4000-8000-000000000799",
                    business_id: "00000000-0000-4000-8000-000000000712",
                    account_id: "00000000-0000-4000-8000-000000000713",
                    category_id: "00000000-0000-4000-8000-000000000714",
                    amount: 1,
                    type: "expense",
                    description: "Rent",
                    note: null,
                    cadence: "monthly",
                    start_date: "2026-05-01",
                    next_run_date: "2026-05-01",
                    end_date: null,
                    last_run_date: null,
                    cleared_default: false,
                    active: true,
                    created_at: "2026-05-01T00:00:00.000Z",
                    updated_at: "2026-05-01T00:00:00.000Z"
                  }
                ]
              };
            }
            return { rowCount: 0, rows: [] };
          },
          async connect() {
            state.dbTouched = true;
            return {
              async query() {
                state.dbTouched = true;
                state.queries.push(arguments[0]);
                const sql = String(arguments[0] || "");
                if (/INSERT INTO recurring_transactions/i.test(sql)) {
                  return {
                    rowCount: 1,
                    rows: [
                      {
                        id: "00000000-0000-4000-8000-000000000799",
                        business_id: "00000000-0000-4000-8000-000000000712"
                      }
                    ]
                  };
                }
                if (/SELECT id, business_id, account_id, category_id, amount, type, description, note/i.test(sql)) {
                  return {
                    rowCount: 1,
                    rows: [
                      {
                        id: "00000000-0000-4000-8000-000000000799",
                        business_id: "00000000-0000-4000-8000-000000000712",
                        account_id: "00000000-0000-4000-8000-000000000713",
                        category_id: "00000000-0000-4000-8000-000000000714",
                        amount: 1,
                        type: "expense",
                        description: "Rent",
                        note: null,
                        cadence: "monthly",
                        start_date: "2026-05-01",
                        next_run_date: "2026-05-01",
                        end_date: null,
                        last_run_date: null,
                        cleared_default: false,
                        active: true,
                        created_at: "2026-05-01T00:00:00.000Z",
                        updated_at: "2026-05-01T00:00:00.000Z"
                      }
                    ]
                  };
                }
                return { rowCount: 0, rows: [] };
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
  // requirePlanFeature.js destructures hasFeatureAccess/getSubscriptionSnapshotForBusiness
  // from subscriptionService.js at module-load time, so it must be re-required
  // (not served from a stale cache) every time this fixture swaps that mock in.
  delete require.cache[REQUIRE_PLAN_FEATURE_PATH];

  try {
    const router = require("../routes/recurring.routes.js");
    const app = express();
    app.use(express.json());
    app.use("/api/recurring", router);
    return {
      app,
      state,
      cleanup() {
        delete require.cache[ROUTE_PATH];
        delete require.cache[REQUIRE_PLAN_FEATURE_PATH];
        Module._load = originalLoad;
      }
    };
  } catch (error) {
    Module._load = originalLoad;
    throw error;
  }
}

test("recurring PUT rejects invalid ids before touching the database", async () => {
  const fixture = loadRecurringRouter();
  try {
    const response = await request(fixture.app)
      .put("/api/recurring/not-a-uuid")
      .send({ amount: 1 });

    assert.equal(response.status, 400);
    assert.match(response.body.error, /invalid recurring transaction id/i);
    assert.equal(fixture.state.dbTouched, false);
  } finally {
    fixture.cleanup();
  }
});

test("recurring PATCH status rejects invalid ids before touching the database", async () => {
  const fixture = loadRecurringRouter();
  try {
    const response = await request(fixture.app)
      .patch("/api/recurring/not-a-uuid/status")
      .send({ active: true });

    assert.equal(response.status, 400);
    assert.match(response.body.error, /invalid recurring transaction id/i);
    assert.equal(fixture.state.dbTouched, false);
  } finally {
    fixture.cleanup();
  }
});

test("recurring DELETE rejects invalid ids before touching the database", async () => {
  const fixture = loadRecurringRouter();
  try {
    const response = await request(fixture.app)
      .delete("/api/recurring/not-a-uuid");

    assert.equal(response.status, 400);
    assert.match(response.body.error, /invalid recurring transaction id/i);
    assert.equal(fixture.state.dbTouched, false);
  } finally {
    fixture.cleanup();
  }
});

test("recurring undo-delete restores the latest deleted template", async () => {
  const fixture = loadRecurringRouter();
  try {
    const response = await request(fixture.app)
      .post("/api/recurring/undo-delete")
      .send({});

    assert.equal(response.status, 200);
    assert.equal(response.body.message, "Recurring transaction restored.");
    assert.match(String(fixture.state.queries.find((sql) => /WITH latest_deleted/i.test(String(sql))) || ""), /UPDATE recurring_transactions/i);
  } finally {
    fixture.cleanup();
  }
});

const VALID_TEMPLATE_ID = "00000000-0000-4000-8000-000000000799";

test("Basic can still list previously-created recurring templates", async () => {
  const fixture = loadRecurringRouter({ hasFeatureAccess: () => false });
  try {
    const response = await request(fixture.app).get("/api/recurring");

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, []);
    assert.equal(fixture.state.dbTouched, true);
  } finally {
    fixture.cleanup();
  }
});

test("Basic cannot create a recurring template (403 feature_requires_plan)", async () => {
  const fixture = loadRecurringRouter({ hasFeatureAccess: () => false });
  try {
    const response = await request(fixture.app)
      .post("/api/recurring")
      .send({ amount: 1 });

    assert.equal(response.status, 403);
    assert.equal(response.body.code, "feature_requires_plan");
    assert.equal(response.body.feature, "recurring_transactions");
    assert.equal(response.body.required_plan, "v1");
    assert.equal(response.body.required_plan_name, "Pro");
    assert.equal(fixture.state.dbTouched, false);
  } finally {
    fixture.cleanup();
  }
});

test("Basic cannot edit a recurring template (403 feature_requires_plan)", async () => {
  const fixture = loadRecurringRouter({ hasFeatureAccess: () => false });
  try {
    const response = await request(fixture.app)
      .put(`/api/recurring/${VALID_TEMPLATE_ID}`)
      .send({ amount: 1 });

    assert.equal(response.status, 403);
    assert.equal(response.body.code, "feature_requires_plan");
    assert.equal(fixture.state.dbTouched, false);
  } finally {
    fixture.cleanup();
  }
});

test("Basic cannot execute (run) a recurring template (403 feature_requires_plan)", async () => {
  const fixture = loadRecurringRouter({ hasFeatureAccess: () => false });
  try {
    const response = await request(fixture.app).post(`/api/recurring/${VALID_TEMPLATE_ID}/run`);

    assert.equal(response.status, 403);
    assert.equal(response.body.code, "feature_requires_plan");
    assert.equal(fixture.state.dbTouched, false);
  } finally {
    fixture.cleanup();
  }
});

test("Basic cannot restore (undo-delete) a recurring template (403 feature_requires_plan)", async () => {
  const fixture = loadRecurringRouter({ hasFeatureAccess: () => false });
  try {
    const response = await request(fixture.app)
      .post("/api/recurring/undo-delete")
      .send({});

    assert.equal(response.status, 403);
    assert.equal(response.body.code, "feature_requires_plan");
    assert.equal(fixture.state.dbTouched, false);
  } finally {
    fixture.cleanup();
  }
});

test("Basic can deactivate but not reactivate a recurring template", async () => {
  const fixture = loadRecurringRouter({ hasFeatureAccess: () => false });
  try {
    const deactivate = await request(fixture.app)
      .patch(`/api/recurring/${VALID_TEMPLATE_ID}/status`)
      .send({ active: false });

    // Not blocked by plan gating -- reaches the (mocked, empty) database and
    // reports 404 for the not-found row rather than a 403 feature gate.
    assert.equal(deactivate.status, 404);
    assert.equal(fixture.state.dbTouched, true);

    fixture.state.dbTouched = false;
    const reactivate = await request(fixture.app)
      .patch(`/api/recurring/${VALID_TEMPLATE_ID}/status`)
      .send({ active: true });

    assert.equal(reactivate.status, 403);
    assert.equal(reactivate.body.code, "feature_requires_plan");
    assert.equal(fixture.state.dbTouched, false);
  } finally {
    fixture.cleanup();
  }
});

test("Basic can still delete a previously-created recurring template", async () => {
  const fixture = loadRecurringRouter({ hasFeatureAccess: () => false });
  try {
    const response = await request(fixture.app).delete(`/api/recurring/${VALID_TEMPLATE_ID}`);

    // Not blocked by plan gating -- reaches the (mocked, empty) database and
    // reports 404 for the not-found row rather than a 403 feature gate.
    assert.equal(response.status, 404);
    assert.equal(fixture.state.dbTouched, true);
  } finally {
    fixture.cleanup();
  }
});

test("recurring POST rolls back template creation when initial materialization fails", async () => {
  const fixture = loadRecurringRouter({
    materializeError: new Error("materialization failed")
  });
  try {
    const response = await request(fixture.app)
      .post("/api/recurring")
      .send({ amount: 1 });

    assert.equal(response.status, 500);
    assert.match(response.body.error, /materialization failed/i);
    assert.equal(fixture.state.queries.some((sql) => /COMMIT/i.test(String(sql))), false);
    assert.equal(fixture.state.queries.some((sql) => /ROLLBACK/i.test(String(sql))), true);
  } finally {
    fixture.cleanup();
  }
});
