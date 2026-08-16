"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");
const { attachCentralErrorHandler } = require("./helpers/testPool.js");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-plaid-sync-route";
process.env.CSRF_SECRET = process.env.CSRF_SECRET || "test-csrf-secret-plaid-sync-route";
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://local:test@localhost:5432/inex_ledger_test";

const ROUTE_PATH = require.resolve("../routes/plaid.routes.js");

function makeCategory(id, name, kind, taxMapUs) {
  return {
    id,
    name,
    kind,
    color: "slate",
    tax_map_us: taxMapUs,
    tax_map_ca: null,
    is_active: true
  };
}

function loadPlaidRouterWithState({
  failGetConnection = false,
  failInsert = false,
  missingPlaidAccount = false,
  connectionCursor = null
} = {}) {
  const originalLoad = Module._load.bind(Module);
  const state = {
    queries: [],
    inserted: [],
    updated: [],
    finalizedBatch: null,
    updatedConnectionStatus: null
  };

  const businessId = "00000000-0000-4000-8000-000000000931";
  const connectionId = "00000000-0000-4000-8000-000000000932";
  const accountId = "00000000-0000-4000-8000-000000000933";
  const categories = [
    makeCategory("cat-software", "Software & Subscriptions", "expense", "software_subscriptions"),
    makeCategory("cat-imported-exp", "Imported Expense", "expense", "other_expense"),
    makeCategory("cat-ads", "Advertising & Marketing", "expense", "advertising")
  ];
  const categoryIdByName = new Map(categories.map((category) => [category.name, category.id]));

  const fakePool = {
    async query(sql, params) {
      state.queries.push({ sql, params });

      if (/SELECT id, external_account_id, currency\s+FROM accounts/i.test(sql)) {
        return {
          rows: missingPlaidAccount ? [] : [{ id: accountId, external_account_id: "plaid-account-1", currency: "USD" }],
          rowCount: missingPlaidAccount ? 0 : 1
        };
      }

      if (/SELECT region FROM businesses WHERE id = \$1 LIMIT 1/i.test(sql)) {
        return { rows: [{ region: "US" }], rowCount: 1 };
      }

      if (/SELECT id, name, kind, color, tax_map_us, tax_map_ca, is_active\s+FROM categories/i.test(sql)) {
        return { rows: categories, rowCount: categories.length };
      }

      if (/FROM transactions t\s+JOIN categories c ON c.id = t.category_id/i.test(sql)) {
        return { rows: [], rowCount: 0 };
      }

      if (/FROM transaction_mapping_rules r\s+JOIN categories c ON c.id = r.category_id/i.test(sql)) {
        return { rows: [], rowCount: 0 };
      }

      if (/INSERT INTO categories/i.test(sql)) {
        return { rows: [], rowCount: 0 };
      }

      if (/SELECT id FROM categories WHERE business_id = \$1 AND lower\(name\) = lower\(\$2\) LIMIT 1/i.test(sql)) {
        const name = params[1];
        return { rows: [{ id: categoryIdByName.get(name) }], rowCount: 1 };
      }

      if (/INSERT INTO transactions/i.test(sql)) {
        if (failInsert) {
          throw new Error("insert failed");
        }
        state.inserted.push({
          category_id: params[3],
          merchant_name: params[10],
          category_guess: params[11],
          category_mapping_reason: params[16],
          category_mapping_confidence: params[17],
          category_mapping_rule_id: params[18]
        });
        return { rows: [{ id: `txn-${state.inserted.length}` }], rowCount: 1 };
      }

      if (/SELECT t.account_id, t.category_guess, a.currency/i.test(sql)) {
        return {
          rows: [{
            account_id: accountId,
            category_guess: "OLD_HINT",
            currency: "USD"
          }],
          rowCount: 1
        };
      }

      if (/UPDATE transactions\s+SET amount/i.test(sql)) {
        state.updated.push({
          category_id: params[7],
          category_guess: params[8],
          category_mapping_reason: params[9],
          category_mapping_confidence: params[10],
          category_mapping_rule_id: params[11],
          external_id: params[13]
        });
        return { rows: [], rowCount: 1 };
      }

      if (/UPDATE transactions\s+SET deleted_at = NOW/i.test(sql)) {
        return { rows: [], rowCount: 0 };
      }

      throw new Error(`Unhandled SQL: ${sql}`);
    }
  };

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return { pool: fakePool };
    }
    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return { requireAuth(req, _res, next) { req.user = { id: "user-1" }; next(); } };
    }
    if (requestName === "../middleware/csrf.middleware.js" || /csrf\.middleware\.js$/.test(requestName)) {
      return { requireCsrfProtection(_req, _res, next) { next(); } };
    }
    if (requestName === "../middleware/rate-limit.middleware.js" || /rate-limit\.middleware\.js$/.test(requestName)) {
      return { createDataApiLimiter() { return (_req, _res, next) => next(); } };
    }
    if (requestName === "../api/utils/resolveBusinessIdForUser.js" || /resolveBusinessIdForUser\.js$/.test(requestName)) {
      return { resolveBusinessIdForUser: async () => businessId };
    }
    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return {
        logInfo() {},
        logWarn() {},
        logError() {}
      };
    }
    if (requestName === "../services/plaidService.js" || /plaidService\.js$/.test(requestName)) {
      return {
        isPlaidConfigured: () => true,
        getPlaidClient() {
          return {
            async transactionsSync() {
              return {
                data: {
                  added: [{
                    transaction_id: "plaid-added-1",
                    account_id: "plaid-account-1",
                    _canonical: {
                      amount: 20,
                      type: "expense",
                      description: "OpenAI *ChatGPT Plus Sub USD",
                      merchant_name: "OpenAI",
                      category_guess: "INTERNET_SOFTWARE",
                      date: "2026-05-10",
                      posted_date: "2026-05-10",
                      pending: false,
                      currency: "USD",
                      external_id: "plaid-added-1"
                    }
                  }],
                  modified: [{
                    transaction_id: "plaid-modified-1",
                    _canonical: {
                      amount: 150,
                      type: "expense",
                      description: "Facebook Ads - Campaign 1",
                      merchant_name: "Facebook",
                      category_guess: "ADVERTISING",
                      date: "2026-05-11",
                      posted_date: "2026-05-11",
                      pending: false,
                      currency: "USD",
                      external_id: "plaid-modified-1"
                    }
                  }],
                  removed: [],
                  has_more: false,
                  next_cursor: "cursor-next-1"
                }
              };
            }
          };
        },
        getCountryCodes: () => ["US"],
        plaidTransactionToCanonical(raw, fallback) {
          return {
            account_id: fallback.accountId,
            ...raw._canonical
          };
        },
        plaidAccountToRow() {
          return null;
        },
        describePlaidError(err) {
          return { message: err.message, code: err.code || "plaid_error" };
        }
      };
    }
    if (requestName === "../services/bankConnectionService.js" || /bankConnectionService\.js$/.test(requestName)) {
      return {
        createBankConnection: async () => null,
        getBankConnection: async () => {
          if (failGetConnection) {
            throw new Error("connection reset");
          }
          return {
            id: connectionId,
            provider: "plaid",
            cursor: connectionCursor
          };
        },
        decryptAccessToken() {
          return "access-token";
        },
        updateBankConnectionStatus: async (_pool, _businessId, _connectionId, payload) => {
          state.updatedConnectionStatus = payload;
        }
      };
    }
    if (requestName === "../services/transactionImportService.js" || /transactionImportService\.js$/.test(requestName)) {
      return {
        createImportBatch: async () => ({ id: "batch-plaid-1" }),
        finalizeImportBatch: async (_pool, batchId, summary) => {
          state.finalizedBatch = { batchId, summary };
        }
      };
    }
    if (requestName === "../services/auditEventService.js" || /auditEventService\.js$/.test(requestName)) {
      return {
        AUDIT_ACTIONS: {},
        recordAuditEventForRequest: async () => null
      };
    }
    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[ROUTE_PATH];

  try {
    const router = require("../routes/plaid.routes.js");
    const app = express();
    app.use(express.json());
    app.use("/api/plaid", router);
    attachCentralErrorHandler(app);
    return { app, state, connectionId, categoryIdByName };
  } finally {
    Module._load = originalLoad;
  }
}

test("POST /api/plaid/connections/:id/sync applies categorization and mapping metadata to added and modified rows", async () => {
  const { app, state, connectionId, categoryIdByName } = loadPlaidRouterWithState();

  const response = await request(app)
    .post(`/api/plaid/connections/${connectionId}/sync`)
    .send({});

  assert.equal(response.status, 200);
  assert.equal(response.body.inserted, 1);
  assert.equal(response.body.modified, 1);

  assert.deepEqual(state.inserted, [{
    category_id: categoryIdByName.get("Software & Subscriptions"),
    merchant_name: "OpenAI",
    category_guess: "INTERNET_SOFTWARE",
    category_mapping_reason: "canonical_rule",
    category_mapping_confidence: "medium",
    category_mapping_rule_id: null
  }]);

  assert.deepEqual(state.updated, [{
    category_id: categoryIdByName.get("Advertising & Marketing"),
    category_guess: "ADVERTISING",
    category_mapping_reason: "canonical_rule",
    category_mapping_confidence: "medium",
    category_mapping_rule_id: null,
    external_id: "plaid-modified-1"
  }]);

  assert.deepEqual(state.finalizedBatch, {
    batchId: "batch-plaid-1",
    summary: {
      imported: 1,
      duplicate: 0,
      failed: 0,
      totalRows: 2
    }
  });

  assert.deepEqual(state.updatedConnectionStatus, {
    status: "active",
    lastError: null,
    cursor: "cursor-next-1"
  });
  assert.equal(response.body.failed, 0);
  assert.equal(response.body.cursor_advanced, true);
});

test("POST /api/plaid/connections/:id/sync does not advance cursor after row-level failures", async () => {
  const { app, state, connectionId } = loadPlaidRouterWithState({
    connectionCursor: "cursor-prev-1",
    failInsert: true
  });

  const response = await request(app)
    .post(`/api/plaid/connections/${connectionId}/sync`)
    .send({});

  assert.equal(response.status, 200);
  assert.equal(response.body.inserted, 0);
  assert.equal(response.body.modified, 1);
  assert.equal(response.body.failed, 1);
  assert.equal(response.body.cursor_advanced, false);

  assert.deepEqual(state.finalizedBatch, {
    batchId: "batch-plaid-1",
    summary: {
      imported: 0,
      duplicate: 0,
      failed: 1,
      totalRows: 2
    }
  });

  assert.equal(state.updatedConnectionStatus.status, "error");
  assert.match(state.updatedConnectionStatus.lastError, /1 row-level failure/);
  assert.equal(state.updatedConnectionStatus.cursor, "cursor-prev-1");
});

test("POST /api/plaid/connections/:id/sync treats unknown Plaid accounts as retry-blocking failures", async () => {
  const { app, state, connectionId } = loadPlaidRouterWithState({
    connectionCursor: "cursor-prev-2",
    missingPlaidAccount: true
  });

  const response = await request(app)
    .post(`/api/plaid/connections/${connectionId}/sync`)
    .send({});

  assert.equal(response.status, 200);
  assert.equal(response.body.inserted, 0);
  assert.equal(response.body.skipped_unknown_account, 1);
  assert.equal(response.body.failed, 1);
  assert.equal(response.body.cursor_advanced, false);
  assert.equal(state.updatedConnectionStatus.status, "error");
  assert.equal(state.updatedConnectionStatus.cursor, "cursor-prev-2");
});

test("POST /api/plaid/connections/:id/sync rejects invalid connection ids", async () => {
  const { app } = loadPlaidRouterWithState();

  const response = await request(app)
    .post("/api/plaid/connections/not-a-uuid/sync")
    .send({});

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: "Invalid connection id." });
});

test("POST /api/plaid/exchange-public-token rejects a missing public token", async () => {
  const { app } = loadPlaidRouterWithState();

  const response = await request(app)
    .post("/api/plaid/exchange-public-token")
    .send({});

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: "public_token is required." });
});

test("POST /api/plaid/connections/:id/sync hides unexpected connection lookup failures", async () => {
  const { app, connectionId } = loadPlaidRouterWithState({ failGetConnection: true });

  const response = await request(app)
    .post(`/api/plaid/connections/${connectionId}/sync`)
    .send({});

  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { error: "Internal server error" });
});
