"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const ROUTE_PATH = require.resolve("../routes/recurring.routes.js");

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
        getSubscriptionSnapshotForBusiness: async () => ({ plan: "test" }),
        hasFeatureAccess: () => true
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
