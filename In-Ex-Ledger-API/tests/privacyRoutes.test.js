"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const ROUTE_PATH = require.resolve("../routes/privacy.routes.js");
const MANAGED_EXPORT_PATH = path.resolve(process.cwd(), "storage", "exports", "tax.pdf");

function loadPrivacyRouter(options = {}) {
  const originalLoad = Module._load.bind(Module);
  const originalUnlink = fs.promises.unlink;
  const state = {
    queries: [],
    logs: [],
    unlinkCalls: [],
    userId: "00000000-0000-4000-8000-000000000111",
    passwordHash: "hash",
    passwordMatches: options.passwordMatches ?? true,
    dataResidency: options.dataResidency || "US",
    businesses: options.businesses || [
      { id: "00000000-0000-4000-8000-000000000211", name: "Northwind", region: "CA", language: "en" }
    ],
    exportRows: options.exportRows || {
      user: [{ id: "00000000-0000-4000-8000-000000000111", email: "owner@example.com", full_name: "Owner", display_name: "Owner", created_at: "2026-05-01T00:00:00.000Z" }],
      transactions: [{ transaction_id: "tx1", account: "Checking", category: "Meals", amount: "12.50", type: "expense", description: "Lunch", description_encrypted: null, date: "2026-05-01", note: "", cleared: true, business_id: "00000000-0000-4000-8000-000000000211", created_at: "2026-05-01T00:00:00.000Z" }],
      adjustments: [],
      accounts: [{ id: "acc1", name: "Checking", type: "checking", business_id: "00000000-0000-4000-8000-000000000211", created_at: "2026-05-01T00:00:00.000Z" }],
      categories: [{ id: "cat1", name: "Meals", kind: "expense", business_id: "00000000-0000-4000-8000-000000000211", created_at: "2026-05-01T00:00:00.000Z" }],
      auditLog: [{ action: "data_export", format: "json", created_at: "2026-05-02T00:00:00.000Z" }],
      mileage: [],
      vehicleCosts: [],
      recurringTransactions: [],
      receipts: [{ id: "r1", business_id: "00000000-0000-4000-8000-000000000211", transaction_id: "tx1", filename: "lunch.pdf", mime_type: "application/pdf", uploaded_at: "2026-05-01T01:00:00.000Z", file_hash: "abc123" }],
      exportHistory: [{ id: "exp1", business_id: "00000000-0000-4000-8000-000000000211", user_id: "00000000-0000-4000-8000-000000000111", export_type: "pdf", status: "complete", created_at: "2026-05-03T00:00:00.000Z", completed_at: "2026-05-03T00:01:00.000Z", metadata: { file_path: MANAGED_EXPORT_PATH } }],
      bankConnections: [{ id: "bc1", business_id: "00000000-0000-4000-8000-000000000211", provider: "plaid", external_item_id: "item_1", institution_name: "Test Bank", institution_logo_url: null, status: "active", last_synced_at: null, last_error: null, created_at: "2026-05-04T00:00:00.000Z", updated_at: "2026-05-04T00:00:00.000Z" }],
      invoices: [{ id: "inv1", business_id: "00000000-0000-4000-8000-000000000211", invoice_number: "INV-2026-0001", customer_name: "Acme", customer_email: "billing@acme.test", issue_date: "2026-05-01", due_date: "2026-05-15", status: "sent", currency: "CAD", line_items: [], subtotal: "100.00", tax_rate: "0.0500", tax_amount: "5.00", total_amount: "105.00", notes: "", deleted_at: null, created_at: "2026-05-01T00:00:00.000Z", updated_at: "2026-05-01T00:00:00.000Z" }],
      privacySettings: [{ data_sharing_opt_out: false, consent_given: true, analytics_opt_in: false, updated_at: "2026-05-01T00:00:00.000Z" }],
      consentLog: [{ data_residency: "CA-QC", action: "opt_in", ip_address: "127.0.0.1", user_agent: "test-agent", created_at: "2026-05-05T00:00:00.000Z" }]
    },
    existingPrivacyRow: options.existingPrivacyRow || null,
    receiptPaths: options.receiptPaths || ["C:\\managed\\receipts\\receipt-1.pdf"],
    exportPaths: options.exportPaths || [MANAGED_EXPORT_PATH]
  };

  function defaultQuery(sql, params) {
    state.queries.push({ sql, params });

    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
      return { rows: [], rowCount: 0 };
    }
    if (/SELECT data_residency FROM users/i.test(sql)) {
      return { rows: [{ data_residency: state.dataResidency }], rowCount: 1 };
    }
    if (/SELECT data_sharing_opt_out, consent_given, analytics_opt_in, marketing_email_opt_in/i.test(sql)) {
      return { rows: state.existingPrivacyRow ? [state.existingPrivacyRow] : [], rowCount: state.existingPrivacyRow ? 1 : 0 };
    }
    if (/INSERT INTO user_privacy_settings/i.test(sql)) {
      return { rows: [], rowCount: 1 };
    }
    if (/INSERT INTO privacy_consent_log/i.test(sql)) {
      return { rows: [], rowCount: 1 };
    }
    if (/SELECT id, email, full_name, display_name, created_at FROM users/i.test(sql)) {
      return { rows: state.exportRows.user, rowCount: state.exportRows.user.length };
    }
    if (/SELECT id, name, region, language, created_at FROM businesses/i.test(sql)) {
      return { rows: state.businesses, rowCount: state.businesses.length };
    }
    if (/FROM transactions t/i.test(sql) && /description_encrypted/i.test(sql) && /is_adjustment\s*=\s*false/i.test(sql)) {
      return { rows: state.exportRows.transactions, rowCount: state.exportRows.transactions.length };
    }
    if (/FROM transactions t/i.test(sql) && /adjustment_id/i.test(sql)) {
      return { rows: state.exportRows.adjustments, rowCount: state.exportRows.adjustments.length };
    }
    if (/SELECT id, name, type, business_id, created_at FROM accounts/i.test(sql)) {
      return { rows: state.exportRows.accounts, rowCount: state.exportRows.accounts.length };
    }
    if (/SELECT id, name, kind, business_id, created_at FROM categories/i.test(sql)) {
      return { rows: state.exportRows.categories, rowCount: state.exportRows.categories.length };
    }
    if (/FROM user_action_audit_log[\s\S]*WHERE user_id = \$1/i.test(sql) && /SELECT action, format, created_at/i.test(sql)) {
      return { rows: state.exportRows.auditLog, rowCount: state.exportRows.auditLog.length };
    }
    if (/FROM mileage/i.test(sql)) {
      return { rows: state.exportRows.mileage, rowCount: state.exportRows.mileage.length };
    }
    if (/FROM vehicle_costs/i.test(sql) && /^\s*SELECT/i.test(sql)) {
      return { rows: state.exportRows.vehicleCosts, rowCount: state.exportRows.vehicleCosts.length };
    }
    if (/FROM recurring_transactions/i.test(sql) && /^\s*SELECT/i.test(sql)) {
      return { rows: state.exportRows.recurringTransactions, rowCount: state.exportRows.recurringTransactions.length };
    }
    if (/FROM receipts/i.test(sql) && /file_hash/i.test(sql) && /^\s*SELECT/i.test(sql)) {
      return { rows: state.exportRows.receipts, rowCount: state.exportRows.receipts.length };
    }
    if (/FROM exports e/i.test(sql) && /jsonb_object_agg/i.test(sql)) {
      return { rows: state.exportRows.exportHistory, rowCount: state.exportRows.exportHistory.length };
    }
    if (/FROM bank_connections/i.test(sql) && /^\s*SELECT/i.test(sql)) {
      return { rows: state.exportRows.bankConnections, rowCount: state.exportRows.bankConnections.length };
    }
    if (/FROM invoices_v1/i.test(sql) && /^\s*SELECT/i.test(sql)) {
      return { rows: state.exportRows.invoices, rowCount: state.exportRows.invoices.length };
    }
    if (/SELECT data_sharing_opt_out, consent_given, analytics_opt_in, updated_at FROM user_privacy_settings/i.test(sql)) {
      return { rows: state.exportRows.privacySettings, rowCount: state.exportRows.privacySettings.length };
    }
    if (/FROM privacy_consent_log/i.test(sql) && /^\s*SELECT/i.test(sql)) {
      return { rows: state.exportRows.consentLog, rowCount: state.exportRows.consentLog.length };
    }
    if (/INSERT INTO user_action_audit_log/i.test(sql)) {
      return { rows: [], rowCount: 1 };
    }
    if (/SELECT password_hash FROM users/i.test(sql)) {
      return { rows: [{ password_hash: state.passwordHash }], rowCount: 1 };
    }
    if (/SELECT id FROM businesses WHERE user_id = \$1/i.test(sql)) {
      return { rows: state.businesses.map((business) => ({ id: business.id })), rowCount: state.businesses.length };
    }
    if (/SELECT storage_path FROM receipts/i.test(sql)) {
      return { rows: state.receiptPaths.map((storage_path) => ({ storage_path })), rowCount: state.receiptPaths.length };
    }
    if (/SELECT DISTINCT metadata\.file_path/i.test(sql)) {
      return { rows: state.exportPaths.map((file_path) => ({ file_path })), rowCount: state.exportPaths.length };
    }
    if (/^DELETE FROM /i.test(sql)) {
      return { rows: [], rowCount: 1 };
    }

    throw new Error(`Unhandled SQL in privacyRoutes.test.js: ${sql}`);
  }

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql, params) {
            return defaultQuery(sql, params);
          },
          async connect() {
            return {
              async query(sql, params) {
                return defaultQuery(sql, params);
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
          req.user = { id: state.userId, mfa_enabled: true, mfa_authenticated: true };
          next();
        },
        requireMfaIfEnabled(_req, _res, next) {
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
        listBusinessesForUser: async () => state.businesses
      };
    }

    if (requestName === "../utils/authUtils.js" || /authUtils\.js$/.test(requestName)) {
      return {
        verifyPassword: async () => ({ match: state.passwordMatches })
      };
    }

    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return {
        logError(...args) {
          state.logs.push(args);
        }
      };
    }

    if (requestName === "../services/encryptionService.js" || /encryptionService\.js$/.test(requestName)) {
      return {
        decrypt(value) {
          return `decrypted:${value}`;
        }
      };
    }

    if (requestName === "../services/receiptStorage.js" || /receiptStorage\.js$/.test(requestName)) {
      return {
        isManagedReceiptPath(filePath) {
          return String(filePath || "").startsWith("C:\\managed\\receipts\\");
        }
      };
    }

    return originalLoad(requestName, parent, isMain);
  };

  fs.promises.unlink = async (filePath) => {
    state.unlinkCalls.push(filePath);
  };

  delete require.cache[ROUTE_PATH];

  try {
    const router = require("../routes/privacy.routes.js");
    return {
      router,
      state,
      cleanup() {
        delete require.cache[ROUTE_PATH];
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

function buildApp(router) {
  const app = express();
  app.use(express.json());
  app.use("/api/privacy", router);
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message });
  });
  return app;
}

test("privacy export includes receipts, export history, bank connections, invoices, and consent log", async () => {
  const fixture = loadPrivacyRouter();
  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .post("/api/privacy/export")
      .send({ format: "json" });

    if (response.status !== 200) {
      throw new Error(JSON.stringify({ body: response.body, logs: fixture.state.logs }, null, 2));
    }
    assert.equal(response.status, 200);
    assert.equal(response.body.receipts[0].filename, "lunch.pdf");
    assert.equal(response.body.exportHistory[0].id, "exp1");
    assert.equal(response.body.bankConnections[0].id, "bc1");
    assert.equal(response.body.invoices[0].invoice_number, "INV-2026-0001");
    assert.equal(response.body.privacyConsentLog[0].data_residency, "CA-QC");
  } finally {
    fixture.cleanup();
  }
});

test("privacy delete removes invoices, bank connections, subscriptions, and cleans up managed files after commit", async () => {
  const fixture = loadPrivacyRouter();
  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .post("/api/privacy/delete")
      .send({ password: "CorrectHorseBatteryStaple1!" });

    assert.equal(response.status, 200);

    const deleteSqls = fixture.state.queries
      .filter(({ sql }) => /^\s*DELETE FROM /i.test(sql))
      .map(({ sql }) => sql.trim());

    assert.ok(deleteSqls.some((sql) => /DELETE FROM invoices_v1/i.test(sql)));
    assert.ok(deleteSqls.some((sql) => /DELETE FROM bank_connections/i.test(sql)));
    assert.ok(deleteSqls.some((sql) => /DELETE FROM business_subscriptions/i.test(sql)));
    assert.ok(fixture.state.queries.some(({ sql }) => sql === "COMMIT"));
    assert.deepEqual(
      fixture.state.unlinkCalls.sort(),
      [MANAGED_EXPORT_PATH, "C:\\managed\\receipts\\receipt-1.pdf"].sort()
    );
  } finally {
    fixture.cleanup();
  }
});

test("Quebec privacy settings do not write duplicate consent logs when nothing changed", async () => {
  const fixture = loadPrivacyRouter({
    dataResidency: "CA-QC",
    existingPrivacyRow: {
      data_sharing_opt_out: false,
      consent_given: true,
      analytics_opt_in: false,
      marketing_email_opt_in: false
    }
  });

  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .post("/api/privacy/settings")
      .send({
        dataSharingOptOut: false,
        consentGiven: true,
        analyticsOptIn: false,
        marketingEmailOptIn: false
      });

    assert.equal(response.status, 200);

    const consentInsertQueries = fixture.state.queries.filter(({ sql }) =>
      /INSERT INTO privacy_consent_log/i.test(sql)
    );
    assert.equal(consentInsertQueries.length, 0);
  } finally {
    fixture.cleanup();
  }
});
