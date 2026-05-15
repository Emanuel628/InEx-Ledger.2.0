"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const TRANSACTIONS_ROUTE_PATH = require.resolve("../routes/transactions.routes.js");
const {
  collectRequiredEnvironmentVariables,
  validateEnvironmentOrThrow
} = require("../services/envValidationService.js");

const TEST_TRANSACTION_ID = "00000000-0000-4000-8000-000000000101";
const TEST_ACCOUNT_ID = "00000000-0000-4000-8000-000000000102";
const TEST_CATEGORY_ID = "00000000-0000-4000-8000-000000000103";
const TEST_BUSINESS_ID = "00000000-0000-4000-8000-000000000104";
const TEST_USER_ID = "00000000-0000-4000-8000-000000000105";

function buildApp(router) {
  const app = express();
  app.use(express.json());
  app.use("/api/transactions", router);
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message });
  });
  return app;
}

function loadTransactionsRouter(options = {}) {
  const originalLoad = Module._load.bind(Module);
  const state = {
    insertParams: null,
    updateParams: null,
    bulkDeleteUpdateCalled: false
  };

  const lockState = options.lockState || {
    lockedThroughDate: null,
    isLocked: false
  };

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql, params) {
            if (/SELECT region FROM businesses/i.test(sql)) {
              return { rows: [{ region: "US" }], rowCount: 1 };
            }
            if (/FROM transactions t/i.test(sql) && /JOIN businesses/i.test(sql)) {
              return {
                rowCount: 1,
                rows: [
                  {
                    id: TEST_TRANSACTION_ID,
                    business_id: TEST_BUSINESS_ID,
                    business_name: "Acme",
                    account_id: TEST_ACCOUNT_ID,
                    account_name: "Checking",
                    category_id: TEST_CATEGORY_ID,
                    category_name: "Income",
                    amount: "1200.00",
                    type: "income",
                    cleared: false,
                    description: "Client A",
                    description_encrypted: null,
                    date: "2026-05-01",
                    note: "Invoice",
                    currency: "USD",
                    source_amount: null,
                    exchange_rate: null,
                    exchange_date: null,
                    converted_amount: "1200.00",
                    tax_treatment: "income",
                    indirect_tax_amount: null,
                    indirect_tax_recoverable: false,
                    personal_use_pct: null,
                    review_status: "ready",
                    review_notes: null,
                    payer_name: "Acme Platform",
                    tax_form_type: "1099-K",
                    recurring_transaction_id: null,
                    recurring_occurrence_date: null,
                    is_adjustment: false,
                    original_transaction_id: null,
                    created_at: "2026-05-01T00:00:00.000Z"
                  }
                ]
              };
            }
            if (/SELECT COUNT\(\*\)/i.test(sql)) {
              return { rows: [{ count: "1" }], rowCount: 1 };
            }
            if (/SELECT id,\s*date\s+FROM transactions/i.test(sql)) {
              return {
                rowCount: 1,
                rows: [{ id: TEST_TRANSACTION_ID, date: "2026-05-01" }]
              };
            }
            if (/SELECT id FROM accounts/i.test(sql)) {
              return { rowCount: 1, rows: [{ id: TEST_ACCOUNT_ID }] };
            }
            if (/SELECT id FROM businesses WHERE id = \$1 AND user_id = \$2 LIMIT 1/i.test(sql)) {
              return options.isBusinessOwner === false
                ? { rowCount: 0, rows: [] }
                : { rowCount: 1, rows: [{ id: TEST_BUSINESS_ID }] };
            }
            if (/INSERT INTO transactions/i.test(sql)) {
              state.insertParams = params;
              return {
                rowCount: 1,
                rows: [
                  {
                    id: TEST_TRANSACTION_ID,
                    account_id: params[2],
                    category_id: params[3],
                    amount: params[4],
                    type: params[5],
                    cleared: params[6],
                    description: params[7],
                    description_encrypted: params[8],
                    date: params[9],
                    note: params[10],
                    currency: params[11],
                    payer_name: params[22],
                    tax_form_type: params[23]
                  }
                ]
              };
            }
            if (/UPDATE transactions\s+SET account_id/i.test(sql)) {
              state.updateParams = params;
              return {
                rowCount: 1,
                rows: [
                  {
                    id: TEST_TRANSACTION_ID,
                    account_id: params[0],
                    category_id: params[1],
                    amount: params[2],
                    type: params[3],
                    cleared: params[4],
                    description: params[5],
                    description_encrypted: params[6],
                    date: params[7],
                    note: params[8],
                    currency: params[9],
                    payer_name: params[20],
                    tax_form_type: params[21]
                  }
                ]
              };
            }
            if (/UPDATE transactions\s+SET review_status = \$1/i.test(sql)) {
              return {
                rowCount: 1,
                rows: [
                  {
                    id: TEST_TRANSACTION_ID,
                    business_id: TEST_BUSINESS_ID,
                    review_status: params[0],
                    date: "2026-05-01",
                    description: "Client A",
                    description_encrypted: null
                  }
                ]
              };
            }
            if (/SELECT id\s+FROM transactions\s+WHERE business_id = \$1\s+AND deleted_at IS NULL\s+AND date <= \$2/i.test(sql)) {
              if (options.lockedTransactionExists) {
                return { rowCount: 1, rows: [{ id: TEST_TRANSACTION_ID }] };
              }
              return { rowCount: 0, rows: [] };
            }
            if (/UPDATE transactions\s+SET deleted_at = now\(\), is_void = true, voided_at = now\(\)/i.test(sql)) {
              state.bulkDeleteUpdateCalled = true;
              return { rowCount: 4, rows: [] };
            }
            throw new Error(`Unhandled pool SQL: ${sql}`);
          }
        }
      };
    }

    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        requireAuth(req, _res, next) {
          req.user = { id: TEST_USER_ID, email_verified: true };
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

    if (requestName === "../middleware/rateLimitTiers.js" || /rateLimitTiers\.js$/.test(requestName)) {
      return {
        createTransactionLimiter() {
          return (_req, _res, next) => next();
        }
      };
    }

    if (requestName === "../api/utils/resolveBusinessIdForUser.js" || /resolveBusinessIdForUser\.js$/.test(requestName)) {
      return {
        resolveBusinessIdForUser: async () => TEST_BUSINESS_ID,
        getBusinessScopeForUser: async () => ({ businessIds: [TEST_BUSINESS_ID] })
      };
    }

    if (requestName === "../services/encryptionService.js" || /encryptionService\.js$/.test(requestName)) {
      return {
        encrypt(value) {
          return `enc:${value}`;
        },
        decrypt(value) {
          return String(value || "").replace(/^enc:/, "");
        }
      };
    }

    if (requestName === "../services/accountingLockService.js" || /accountingLockService\.js$/.test(requestName)) {
      class AccountingPeriodLockedError extends Error {
        constructor(message = "locked") {
          super(message);
          this.status = 409;
          this.code = "accounting_period_locked";
        }
      }

      return {
        AccountingPeriodLockedError,
        assertDateUnlocked(currentLockState, date) {
          if (currentLockState?.lockedThroughDate && String(date || "") <= String(currentLockState.lockedThroughDate)) {
            const error = new AccountingPeriodLockedError(
              "Transaction date is inside a locked accounting period."
            );
            error.lockedThroughDate = currentLockState.lockedThroughDate;
            error.transactionDate = date;
            throw error;
          }
        },
        loadAccountingLockState: async () => lockState
      };
    }

    if (requestName === "../services/transactionAuditService.js" || /transactionAuditService\.js$/.test(requestName)) {
      return {
        archiveTransaction: async () => ({ id: TEST_TRANSACTION_ID }),
        restoreMostRecentArchivedTransaction: async () => null,
        countRestorableArchivedTransactions: async () => 0
      };
    }

    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return {
        logError() {},
        logWarn() {},
        logInfo() {}
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
        constructor(message = "limit") {
          super(message);
          this.statusCode = 402;
          this.code = "basic_plan_limit";
        }
      }

      return {
        BasicPlanLimitError,
        assertCanCreateTransactions: async () => {}
      };
    }

    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[TRANSACTIONS_ROUTE_PATH];

  try {
    return {
      router: require("../routes/transactions.routes.js"),
      state,
      cleanup() {
        delete require.cache[TRANSACTIONS_ROUTE_PATH];
      }
    };
  } finally {
    Module._load = originalLoad;
  }
}

test("transactions GET returns payer and tax form fields for income rows", async () => {
  const fixture = loadTransactionsRouter();

  try {
    const app = buildApp(fixture.router);
    const response = await request(app).get("/api/transactions");

    assert.equal(response.status, 200);
    assert.equal(response.body.total, 1);
    assert.equal(response.body.data[0].payer_name, "Acme Platform");
    assert.equal(response.body.data[0].tax_form_type, "1099-K");
  } finally {
    fixture.cleanup();
  }
});

test("transactions PUT persists payer and tax form updates for income transactions", async () => {
  const fixture = loadTransactionsRouter();

  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .put(`/api/transactions/${TEST_TRANSACTION_ID}`)
      .send({
        account_id: TEST_ACCOUNT_ID,
        category_id: TEST_CATEGORY_ID,
        amount: 4500,
        type: "income",
        date: "2026-05-02",
        description: "Client B",
        note: "Platform payout",
        payer_name: "Freelance Marketplace",
        tax_form_type: "1099-NEC"
      });

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(fixture.state.updateParams));
    assert.equal(fixture.state.updateParams[20], "Freelance Marketplace");
    assert.equal(fixture.state.updateParams[21], "1099-NEC");
    assert.equal(response.body.payer_name, "Freelance Marketplace");
    assert.equal(response.body.tax_form_type, "1099-NEC");
  } finally {
    fixture.cleanup();
  }
});

test("transactions POST stores encrypted descriptions without duplicating plain text when encryption is available", async () => {
  const fixture = loadTransactionsRouter();

  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .post("/api/transactions")
      .send({
        account_id: TEST_ACCOUNT_ID,
        category_id: TEST_CATEGORY_ID,
        amount: 1200,
        type: "income",
        date: "2026-05-02",
        description: "Client B",
        note: "Invoice",
        payer_name: "Freelance Marketplace",
        tax_form_type: "1099-NEC"
      });

    assert.equal(response.status, 201);
    assert.ok(Array.isArray(fixture.state.insertParams));
    assert.equal(fixture.state.insertParams[7], null);
    assert.equal(fixture.state.insertParams[8], "enc:Client B");
    assert.equal(response.body.description, "Client B");
  } finally {
    fixture.cleanup();
  }
});

test("transactions PUT stores encrypted descriptions without duplicating plain text when encryption is available", async () => {
  const fixture = loadTransactionsRouter();

  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .put(`/api/transactions/${TEST_TRANSACTION_ID}`)
      .send({
        account_id: TEST_ACCOUNT_ID,
        category_id: TEST_CATEGORY_ID,
        amount: 4500,
        type: "income",
        date: "2026-05-02",
        description: "Client B",
        note: "Platform payout",
        payer_name: "Freelance Marketplace",
        tax_form_type: "1099-NEC"
      });

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(fixture.state.updateParams));
    assert.equal(fixture.state.updateParams[5], null);
    assert.equal(fixture.state.updateParams[6], "enc:Client B");
    assert.equal(response.body.description, "Client B");
  } finally {
    fixture.cleanup();
  }
});

test("transactions bulk delete is blocked when the business has locked-period transactions", async () => {
  const fixture = loadTransactionsRouter({
    lockState: {
      lockedThroughDate: "2026-03-31",
      isLocked: true
    },
    lockedTransactionExists: true
  });

  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .delete("/api/transactions/bulk-delete-all")
      .send({ confirm: "DELETE" });

    assert.equal(response.status, 409);
    assert.equal(response.body.code, "ACCOUNTING_PERIOD_LOCKED");
    assert.equal(response.body.locked_through_date, "2026-03-31");
    assert.equal(fixture.state.bulkDeleteUpdateCalled, false);
  } finally {
    fixture.cleanup();
  }
});

test("transactions bulk delete is blocked for non-owner business members", async () => {
  const fixture = loadTransactionsRouter({ isBusinessOwner: false });

  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .delete("/api/transactions/bulk-delete-all")
      .send({ confirm: "DELETE" });

    assert.equal(response.status, 403);
    assert.equal(response.body.error, "Only the business owner can delete all transactions.");
    assert.equal(fixture.state.bulkDeleteUpdateCalled, false);
  } finally {
    fixture.cleanup();
  }
});

test("transactions review-status update is blocked when the transaction date falls in a locked period", async () => {
  const fixture = loadTransactionsRouter({
    lockState: {
      lockedThroughDate: "2026-05-31",
      isLocked: true
    }
  });

  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .patch(`/api/transactions/${TEST_TRANSACTION_ID}/review-status`)
      .send({ review_status: "matched" });

    assert.equal(response.status, 409);
    assert.equal(response.body.code, "accounting_period_locked");
    assert.equal(response.body.locked_through_date, "2026-05-31");
    assert.equal(response.body.transaction_date, "2026-05-01");
  } finally {
    fixture.cleanup();
  }
});

test("production env validation requires FIELD_ENCRYPTION_KEY and Stripe price IDs", () => {
  const previousEnv = { ...process.env };

  try {
    process.env = {
      ...previousEnv,
      DATABASE_URL: "postgresql://example",
      JWT_SECRET: "secret",
      APP_BASE_URL: "https://app.example.com",
      RESEND_API_KEY: "resend_test",
      CSRF_SECRET: "csrf_test",
      STRIPE_SECRET_KEY: "sk_test_123",
      STRIPE_WEBHOOK_SECRET: "whsec_123",
      EXPORT_GRANT_SECRET: "grant_test",
      RECEIPT_STORAGE_DIR: "storage/receipts",
      STRIPE_PRO_M_US: "price_1",
      STRIPE_PRO_Y_US: "price_2",
      STRIPE_PRO_M_CA: "price_3",
      STRIPE_PRO_Y_CA: "price_4",
      STRIPE_ADDL_M_US: "price_5",
      STRIPE_ADDL_Y_US: "price_6",
      STRIPE_ADDL_M_CA: "price_7",
      STRIPE_ADDL_Y_CA: "price_8"
    };

    assert.throws(
      () => validateEnvironmentOrThrow("production"),
      (error) => {
        assert.equal(error.code, "ENV_VALIDATION_FAILED");
        assert.ok(error.missing.includes("FIELD_ENCRYPTION_KEY"));
        return true;
      }
    );
  } finally {
    process.env = previousEnv;
  }
});

test("non-production env validation does not require encryption or Stripe configuration", () => {
  const previousEnv = { ...process.env };

  try {
    process.env = {
      ...previousEnv,
      DATABASE_URL: "postgresql://example",
      JWT_SECRET: "secret",
      APP_BASE_URL: "http://localhost:3000",
      RESEND_API_KEY: "resend_test"
    };

    assert.doesNotThrow(() => validateEnvironmentOrThrow("development"));
    assert.equal(collectRequiredEnvironmentVariables("development").includes("FIELD_ENCRYPTION_KEY"), false);
  } finally {
    process.env = previousEnv;
  }
});
