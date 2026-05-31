"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-csv-import-route";
process.env.CSRF_SECRET = process.env.CSRF_SECRET || "test-csrf-secret-csv-import-route";
process.env.FIELD_ENCRYPTION_KEY =
  process.env.FIELD_ENCRYPTION_KEY ||
  "0000000000000000000000000000000000000000000000000000000000000000";

const ROUTE_PATH = require.resolve("../routes/transactions.routes.js");

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

function loadTransactionsRouterWithState() {
  const originalLoad = Module._load.bind(Module);
  const state = {
    poolQueries: [],
    clientQueries: [],
    insertedTransactions: [],
    finalizedBatch: null,
    emailed: false,
    loggedErrors: []
  };

  const businessId = "00000000-0000-4000-8000-000000000901";
  const accountId = "00000000-0000-4000-8000-000000000902";
  const categories = [
    makeCategory("cat-car", "Car & Truck Expenses", "expense", "car_truck"),
    makeCategory("cat-software", "Software & Subscriptions", "expense", "software_subscriptions"),
    makeCategory("cat-imported-exp", "Imported Expense", "expense", "other_expense"),
    makeCategory("cat-sales", "Sales Revenue", "income", "gross_receipts_sales"),
    makeCategory("cat-imported-inc", "Imported Income", "income", "other_income"),
    makeCategory("cat-meals", "Meals", "expense", "meals"),
    makeCategory("cat-phone", "Phone & Internet", "expense", "utilities"),
    makeCategory("cat-ads", "Advertising & Marketing", "expense", "advertising")
  ];

  const fakeClient = {
    async query(sql, params) {
      state.clientQueries.push({ sql, params });

      if (/^BEGIN$/i.test(sql) || /^COMMIT$/i.test(sql)) {
        return { rows: [], rowCount: 0 };
      }

      if (/pg_advisory_xact_lock/i.test(sql)) {
        return { rows: [], rowCount: 1 };
      }

      if (/SELECT id, name, kind, color, tax_map_us, tax_map_ca FROM categories WHERE business_id = \$1/i.test(sql)) {
        return {
          rows: categories.map(({ is_active, ...rest }) => ({ ...rest })),
          rowCount: categories.length
        };
      }

      if (/UPDATE categories/i.test(sql)) {
        return { rows: [], rowCount: 1 };
      }

      if (/INSERT INTO transactions/i.test(sql)) {
        state.insertedTransactions.push({
          id: params[0],
          business_id: params[1],
          account_id: params[2],
          category_id: params[3],
          amount: params[4],
          type: params[5],
          description: params[6],
          date: params[8],
          merchant_name: params[9],
          category_guess: params[10],
          tax_treatment: params[12],
          import_batch_id: params[13],
          category_mapping_reason: params[14],
          category_mapping_confidence: params[15],
          category_mapping_rule_id: params[16]
        });
        return { rows: [], rowCount: 1 };
      }

      throw new Error(`Unhandled client SQL: ${sql}`);
    },
    release() {}
  };

  const fakePool = {
    async query(sql, params) {
      state.poolQueries.push({ sql, params });

      if (/SELECT id FROM accounts WHERE id = \$1 AND business_id = \$2/i.test(sql)) {
        return { rows: [{ id: accountId }], rowCount: 1 };
      }

      if (/SELECT region, province, fiscal_year_start FROM businesses WHERE id = \$1 LIMIT 1/i.test(sql)) {
        return { rows: [{ region: "US", province: "", fiscal_year_start: "01-01" }], rowCount: 1 };
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

      throw new Error(`Unhandled pool SQL: ${sql}`);
    },
    async connect() {
      return fakeClient;
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
    if (requestName === "../middleware/rateLimitTiers.js" || /rateLimitTiers\.js$/.test(requestName)) {
      return { createTransactionLimiter() { return (_req, _res, next) => next(); } };
    }
    if (requestName === "../api/utils/resolveBusinessIdForUser.js" || /resolveBusinessIdForUser\.js$/.test(requestName)) {
      return {
        resolveBusinessIdForUser: async () => businessId,
        getBusinessScopeForUser: async () => ({ businessIds: [businessId] })
      };
    }
    if (requestName === "../services/encryptionService.js" || /encryptionService\.js$/.test(requestName)) {
      return {
        encrypt: (value) => value,
        decrypt: (value) => value
      };
    }
    if (requestName === "../services/accountingLockService.js" || /accountingLockService\.js$/.test(requestName)) {
      return {
        AccountingPeriodLockedError: class AccountingPeriodLockedError extends Error {},
        assertDateUnlocked() {},
        loadAccountingLockState: async () => null
      };
    }
    if (requestName === "../services/transactionAuditService.js" || /transactionAuditService\.js$/.test(requestName)) {
      return {
        archiveTransaction: async () => null,
        restoreMostRecentArchivedTransaction: async () => null,
        countRestorableArchivedTransactions: async () => 0
      };
    }
    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return {
        logError(...args) {
          state.loggedErrors.push(args.map((value) => {
            if (value instanceof Error) {
              return { message: value.message, stack: value.stack };
            }
            return value;
          }));
        },
        logWarn() {},
        logInfo() {}
      };
    }
    if (requestName === "../services/subscriptionService.js" || /subscriptionService\.js$/.test(requestName)) {
      return {
        getSubscriptionSnapshotForBusiness: async () => ({ plan: "pro" }),
        hasFeatureAccess: () => true
      };
    }
    if (requestName === "../services/basicPlanUsageService.js" || /basicPlanUsageService\.js$/.test(requestName)) {
      return {
        BasicPlanLimitError: class BasicPlanLimitError extends Error {},
        assertCanCreateTransactions: async () => null,
        assertCanImportCsvRows: async () => null
      };
    }
    if (requestName === "../services/usageLimitEmailService.js" || /usageLimitEmailService\.js$/.test(requestName)) {
      return { evaluateUsageLimitEmails: async () => null };
    }
    if (requestName === "../services/transactionImportService.js" || /transactionImportService\.js$/.test(requestName)) {
      return {
        createImportBatch: async () => ({ id: "batch-1" }),
        finalizeImportBatch: async (_client, batchId, summary) => {
          state.finalizedBatch = { batchId, summary };
        },
        findDuplicateCandidates: async () => [],
        listImportBatches: async () => [],
        getImportBatch: async () => null,
        revertImportBatch: async () => null
      };
    }
    if (requestName === "../services/taxSummaryService.js" || /taxSummaryService\.js$/.test(requestName)) {
      return {
        getPayerSummaryForYear: async () => ({}),
        getTaxLineSummaryForYear: async () => ({})
      };
    }
    if (requestName === "../services/quarterlyTaxReminderService.js" || /quarterlyTaxReminderService\.js$/.test(requestName)) {
      return { getQuarterlyReminders: () => [] };
    }
    if (requestName === "../services/taxDashboardService.js" || /taxDashboardService\.js$/.test(requestName)) {
      return { getTaxDashboard: async () => ({}) };
    }
    if (requestName === "../services/exportSnapshotService.js" || /exportSnapshotService\.js$/.test(requestName)) {
      return { invalidateSnapshotsForBusiness: async () => null };
    }
    if (requestName === "../services/bookkeepingEmailService.js" || /bookkeepingEmailService\.js$/.test(requestName)) {
      return {
        sendBookkeepingActivityEmail() {
          state.emailed = true;
        }
      };
    }
    if (requestName === "../services/transactionMappingRuleService.js" || /transactionMappingRuleService\.js$/.test(requestName)) {
      return {
        learnTransactionMappingRules: async () => [],
        normalizeRuleValue(value) {
          return String(value || "")
            .toLowerCase()
            .normalize("NFKD")
            .replace(/[^\x00-\x7F]/g, "")
            .replace(/[^a-z0-9]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        }
      };
    }
    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[ROUTE_PATH];

  try {
    const router = require("../routes/transactions.routes.js");
    const app = express();
    app.use("/api/transactions", router);
    return { app, state, categories, accountId };
  } finally {
    Module._load = originalLoad;
  }
}

test("POST /api/transactions/import/csv maps the real merchant set through the live route", async () => {
  const { app, state, categories, accountId } = loadTransactionsRouterWithState();
  const categoryIdByName = new Map(categories.map((category) => [category.name, category.id]));
  const csv = [
    "Date,Merchant_Name,Description,Amount",
    "2026-05-01,Adobe Systems,*Photoshop Sub,-54.99",
    "2026-05-02,OpenAI,*ChatGPT Plus Sub USD,-20.00",
    "2026-05-03,Uber* Eats,Business Lunch,-32.10",
    "2026-05-04,Shell Oil 48293,New Jersey,-74.00",
    "2026-05-05,Stripe,Payout - Bulk Sales,1250.00",
    "2026-05-06,Comcast Business,Internet,-89.42",
    "2026-05-07,Facebook,Ads - Campaign 1,-150.00",
    "2026-05-08,Amazon.com,Amzn.pmts USD 138.45,-138.45"
  ].join("\n");

  const response = await request(app)
    .post("/api/transactions/import/csv")
    .field("account_id", accountId)
    .field("skip_duplicates", "false")
    .attach("file", Buffer.from(csv, "utf8"), "merchant-import.csv");

  assert.equal(response.status, 200, JSON.stringify({
    body: response.body,
    loggedErrors: state.loggedErrors
  }));
  assert.equal(response.body.imported, 8);
  assert.equal(state.insertedTransactions.length, 8);
  assert.deepEqual(
    state.insertedTransactions.map((row) => ({
      merchant: row.merchant_name,
      categoryId: row.category_id,
      type: row.type,
      reason: row.category_mapping_reason,
      confidence: row.category_mapping_confidence
    })),
    [
      {
        merchant: "Adobe Systems",
        categoryId: categoryIdByName.get("Software & Subscriptions"),
        type: "expense",
        reason: "canonical_rule",
        confidence: "high"
      },
      {
        merchant: "OpenAI",
        categoryId: categoryIdByName.get("Software & Subscriptions"),
        type: "expense",
        reason: "canonical_rule",
        confidence: "high"
      },
      {
        merchant: "Uber* Eats",
        categoryId: categoryIdByName.get("Meals"),
        type: "expense",
        reason: "canonical_rule",
        confidence: "high"
      },
      {
        merchant: "Shell Oil 48293",
        categoryId: categoryIdByName.get("Car & Truck Expenses"),
        type: "expense",
        reason: "canonical_rule",
        confidence: "high"
      },
      {
        merchant: "Stripe",
        categoryId: categoryIdByName.get("Sales Revenue"),
        type: "income",
        reason: "canonical_rule",
        confidence: "high"
      },
      {
        merchant: "Comcast Business",
        categoryId: categoryIdByName.get("Phone & Internet"),
        type: "expense",
        reason: "canonical_rule",
        confidence: "high"
      },
      {
        merchant: "Facebook",
        categoryId: categoryIdByName.get("Advertising & Marketing"),
        type: "expense",
        reason: "canonical_rule",
        confidence: "medium"
      },
      {
        merchant: "Amazon.com",
        categoryId: categoryIdByName.get("Imported Expense"),
        type: "expense",
        reason: "fallback_imported",
        confidence: "low"
      }
    ]
  );
  assert.deepEqual(state.finalizedBatch, {
    batchId: "batch-1",
    summary: {
      imported: 8,
      duplicate: 0,
      failed: 0,
      totalRows: 8
    }
  });
  assert.equal(state.emailed, true);
});
