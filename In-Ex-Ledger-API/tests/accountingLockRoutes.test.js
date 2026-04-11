const assert = require("node:assert/strict");
const test = require("node:test");
const express = require("express");
const request = require("supertest");

const {
  AccountingPeriodLockedError,
  buildAccountingLockErrorPayload
} = require("../services/accountingLockService.js");

function mockModule(modulePath, exportsValue) {
  const resolved = require.resolve(modulePath);
  const hadOriginal = Object.prototype.hasOwnProperty.call(require.cache, resolved);
  const original = require.cache[resolved];
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: exportsValue
  };

  return () => {
    if (hadOriginal) {
      require.cache[resolved] = original;
    } else {
      delete require.cache[resolved];
    }
  };
}

function createRouteApp(routePath, options = {}) {
  const {
    pool,
    resolveBusinessIdForUser = async () => "biz_123",
    recurringService = null,
    subscriptionService = null
  } = options;

  const routeResolved = require.resolve(routePath);
  delete require.cache[routeResolved];

  const restores = [
    mockModule("../db.js", { pool }),
    mockModule("../middleware/auth.middleware.js", {
      requireAuth(req, _res, next) {
        req.user = { id: "user_123" };
        next();
      }
    }),
    mockModule("../middleware/csrf.middleware.js", {
      requireCsrfProtection(_req, _res, next) {
        next();
      }
    }),
    mockModule("../middleware/rate-limit.middleware.js", {
      createDataApiLimiter() {
        return (_req, _res, next) => next();
      }
    }),
    mockModule("../middleware/rateLimitTiers.js", {
      createReceiptLimiter() {
        return (_req, _res, next) => next();
      },
      createTransactionLimiter() {
        return (_req, _res, next) => next();
      }
    }),
    mockModule("../api/utils/resolveBusinessIdForUser.js", {
      resolveBusinessIdForUser,
      getBusinessScopeForUser: async () => ({ businessIds: ["biz_123"] })
    })
  ];

  if (recurringService) {
    restores.push(mockModule("../services/recurringTransactionsService.js", recurringService));
  }
  if (subscriptionService) {
    restores.push(mockModule("../services/subscriptionService.js", subscriptionService));
  }

  const router = require(routePath);
  const app = express();
  app.use(express.json());
  app.use(router);

  return {
    app,
    restore() {
      delete require.cache[routeResolved];
      while (restores.length) {
        const restore = restores.pop();
        restore();
      }
    }
  };
}

test("accounts route blocks account type changes when locked-period transactions exist", async () => {
  const fakePool = {
    async query(sql) {
      if (sql.includes("SELECT id, type FROM accounts")) {
        return { rowCount: 1, rows: [{ id: "acct_1", type: "checking" }] };
      }
      if (sql.includes("FROM businesses")) {
        return { rowCount: 1, rows: [{ locked_through_date: "2026-03-31" }] };
      }
      if (sql.includes("FROM transactions") && sql.includes("account_id")) {
        return { rowCount: 1, rows: [{ date: "2026-03-20" }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };

  const harness = createRouteApp("../routes/accounts.routes.js", { pool: fakePool });
  try {
    const response = await request(harness.app)
      .put("/123e4567-e89b-12d3-a456-426614174001")
      .send({ type: "savings" })
      .expect(409);

    assert.deepEqual(response.body, buildAccountingLockErrorPayload(
      new AccountingPeriodLockedError({
        lockedThroughDate: "2026-03-31",
        transactionDate: "2026-03-20"
      })
    ));
  } finally {
    harness.restore();
  }
});

test("categories route blocks locked-period classification changes but keeps the same 409 contract", async () => {
  const fakePool = {
    async query(sql) {
      if (sql.includes("FROM categories WHERE id")) {
        return {
          rowCount: 1,
          rows: [{
            id: "cat_1",
            name: "Meals",
            kind: "expense",
            color: "blue",
            tax_map_us: "meals",
            tax_map_ca: "meals_ca"
          }]
        };
      }
      if (sql.includes("FROM businesses")) {
        return { rowCount: 1, rows: [{ locked_through_date: "2026-03-31" }] };
      }
      if (sql.includes("FROM transactions") && sql.includes("category_id")) {
        return { rowCount: 1, rows: [{ date: "2026-03-05" }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };

  const harness = createRouteApp("../routes/categories.routes.js", { pool: fakePool });
  try {
    const response = await request(harness.app)
      .put("/123e4567-e89b-12d3-a456-426614174000")
      .send({ tax_map_us: "travel_meals" })
      .expect(409);

    assert.deepEqual(response.body, buildAccountingLockErrorPayload(
      new AccountingPeriodLockedError({
        lockedThroughDate: "2026-03-31",
        transactionDate: "2026-03-05"
      })
    ));
  } finally {
    harness.restore();
  }
});

test("mileage route blocks locked-period creates", async () => {
  const fakePool = {
    async query(sql) {
      if (sql.includes("FROM businesses")) {
        return { rowCount: 1, rows: [{ locked_through_date: "2026-03-31" }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };

  const harness = createRouteApp("../routes/mileage.routes.js", { pool: fakePool });
  try {
    const response = await request(harness.app)
      .post("/")
      .send({ trip_date: "2026-03-10", purpose: "Client visit", miles: 12 })
      .expect(409);

    assert.deepEqual(response.body, buildAccountingLockErrorPayload(
      new AccountingPeriodLockedError({
        lockedThroughDate: "2026-03-31",
        transactionDate: "2026-03-10"
      })
    ));
  } finally {
    harness.restore();
  }
});

test("receipts route blocks attachment changes for receipts linked to locked-period transactions", async () => {
  const fakePool = {
    async query(sql) {
      if (sql.includes("FROM receipts r")) {
        return {
          rowCount: 1,
          rows: [{
            id: "receipt_1",
            transaction_id: "tx_1",
            transaction_date: "2026-03-12"
          }]
        };
      }
      if (sql.includes("FROM businesses")) {
        return { rowCount: 1, rows: [{ locked_through_date: "2026-03-31" }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };

  const harness = createRouteApp("../routes/receipts.routes.js", {
    pool: fakePool,
    subscriptionService: {
      getSubscriptionSnapshotForBusiness: async () => ({ effectiveTier: "v1" }),
      hasFeatureAccess: () => true
    }
  });
  try {
    const response = await request(harness.app)
      .patch("/receipt_1/attach")
      .send({ transaction_id: null })
      .expect(409);

    assert.deepEqual(response.body, buildAccountingLockErrorPayload(
      new AccountingPeriodLockedError({
        lockedThroughDate: "2026-03-31",
        transactionDate: "2026-03-12"
      })
    ));
  } finally {
    harness.restore();
  }
});

test("recurring route returns the standardized lock payload when manual posting hits a locked period", async () => {
  const lockedError = new AccountingPeriodLockedError({
    lockedThroughDate: "2026-03-31",
    transactionDate: "2026-03-15"
  });
  const harness = createRouteApp("../routes/recurring.routes.js", {
    pool: { async query() { throw new Error("pool.query should not be called"); } },
    recurringService: {
      RecurringTemplateValidationError: class RecurringTemplateValidationError extends Error {
        constructor(message) {
          super(message);
          this.statusCode = 400;
        }
      },
      normalizeRecurringPayload: () => ({ valid: true, normalized: {} }),
      materializeTemplateRuns: async () => {},
      materializeNextTemplateRun: async () => { throw lockedError; },
      verifyTemplateOwnership: async () => {},
      mapRecurringRow: (row) => row,
      computeNextRunDateForUpdate: () => ({ nextRunDate: "2026-04-01", active: true })
    }
  });

  try {
    const response = await request(harness.app)
      .post("/template_1/run")
      .send({})
      .expect(409);

    assert.deepEqual(response.body, buildAccountingLockErrorPayload(lockedError));
  } finally {
    harness.restore();
  }
});
