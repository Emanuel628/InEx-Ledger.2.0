"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const EXPORTS_ROUTE_PATH = require.resolve("../routes/exports.routes.js");
const { buildPdfExport } = require("../services/pdfGeneratorService.js");

function buildTestPdf() {
  return buildPdfExport({
    transactions: [
      {
        id: "tx_income",
        type: "income",
        amount: "1200.00",
        categoryId: "cat_income",
        accountId: "acc_main",
        date: "2026-04-01",
        merchant: "Client A",
        note: "Invoice (April)",
        payer_name: "Acme Platform",
        tax_form_type: "1099-K"
      },
      {
        id: "tx_expense",
        type: "expense",
        amount: "200.00",
        categoryId: "cat_expense",
        accountId: "acc_main",
        date: "2026-04-02",
        merchant: "Office Depot",
        note: "Supplies"
      }
    ],
    accounts: [{ id: "acc_main", name: "Checking" }],
    categories: [{ id: "cat_expense", taxLabel: "Office Supplies" }],
    receipts: [],
    mileage: [],
    startDate: "2026-04-01",
    endDate: "2026-04-30",
    exportLang: "en",
    currency: "USD",
    legalName: "José Consulting",
    businessName: "Acme",
    operatingName: "Café Étude",
    taxId: "12-3456789",
    generatedAt: "2026-04-30T15:45:00.000Z",
    reportId: "EXP-20260430-TEST",
    naics: "541611",
    region: "us",
    province: ""
  });
}

function loadExportsRouter(options = {}) {
  const originalLoad = Module._load.bind(Module);
  const state = {
    savedRedacted: null,
    insertedExport: null,
    insertedMetadata: null,
    released: false,
    vehicleCostQueryCount: 0
  };

  const grantPayload = options.grantPayload || {
    action: "generate_pdf",
    businessId: "biz_test",
    userId: "user_test",
    includeTaxId: true,
    jti: "grant_jti_123",
    dateRange: {
      startDate: "2026-04-01",
      endDate: "2026-04-30"
    },
    metadata: {
      language: "en",
      currency: "USD",
      templateVersion: "v1"
    }
  };

  const exportData = {
    transactions: [
      {
        id: "tx_income",
        account_id: "acc_main",
        category_id: "cat_income",
        amount: "1200.00",
        type: "income",
        description: "Client A",
        date: new Date("2026-04-01T00:00:00.000Z"),
        note: "Invoice (April)",
        currency: "USD",
        payer_name: "Acme Platform",
        tax_form_type: "1099-K"
      },
      {
        id: "tx_expense",
        account_id: "acc_main",
        category_id: "cat_expense",
        amount: "200.00",
        type: "expense",
        description: "Office Depot",
        date: new Date("2026-04-02T00:00:00.000Z"),
        note: "Supplies",
        currency: "USD"
      }
    ],
    accounts: [{ id: "acc_main", name: "Checking", type: "bank" }],
    categories: [
      { id: "cat_income", name: "Income", kind: "income", tax_map_us: "Gross receipts", tax_map_ca: "" },
      { id: "cat_expense", name: "Office Supplies", kind: "expense", tax_map_us: "Office Supplies", tax_map_ca: "" }
    ],
    receipts: [],
    mileage: [],
    vehicleCosts: [
      {
        id: "vc_1",
        entry_type: "expense",
        entry_date: "2026-04-03",
        title: "Fuel",
        vendor: "Shell",
        amount: "45.00",
        notes: "Client travel"
      }
    ],
    business: { name: "Acme", region: "us", province: "" }
  };
  const decryptErrorMessage = options.decryptErrorMessage || "";

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        requireAuth(req, _res, next) {
          req.user = {
            id: "user_test",
            email_verified: true
          };
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
        createExportGrantLimiter() {
          return (_req, _res, next) => next();
        },
        createSecureExportLimiter() {
          return (_req, _res, next) => next();
        }
      };
    }
    if (requestName === "../api/utils/resolveBusinessIdForUser.js" || /resolveBusinessIdForUser\.js$/.test(requestName)) {
      return {
        resolveBusinessIdForUser: async () => grantPayload.businessId
      };
    }
    if (requestName === "../services/exportGrantService.js" || /exportGrantService\.js$/.test(requestName)) {
      return {
        issueExportGrant: async () => {
          throw new Error("issueExportGrant should not be called in this test");
        },
        verifyExportGrant: async () => grantPayload
      };
    }
    if (requestName === "../services/exportStorage.js" || /exportStorage\.js$/.test(requestName)) {
      return {
        async saveRedactedPdf(jobId, buffer) {
          state.savedRedacted = { jobId, buffer };
          return {
            filePath: `C:\\exports\\${jobId}.pdf`,
            hash: "hash_test_123"
          };
        },
        buildRedactedStream() {
          throw new Error("buildRedactedStream should not be called in this test");
        }
      };
    }
    if (requestName === "../services/jweDecryptService.js" || /jweDecryptService\.js$/.test(requestName)) {
      return {
        decryptJwe: () => {
          if (decryptErrorMessage) {
            throw new Error(decryptErrorMessage);
          }
          return "12-3456789";
        }
      };
    }
    if (requestName === "../services/pdfGeneratorService.js" || /pdfGeneratorService\.js$/.test(requestName)) {
      return {
        buildPdfExport
      };
    }
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql) {
            if (/FROM transactions/i.test(sql)) {
              return { rows: exportData.transactions };
            }
            if (/FROM accounts/i.test(sql)) {
              return { rows: exportData.accounts };
            }
            if (/FROM categories/i.test(sql)) {
              return { rows: exportData.categories };
            }
            if (/FROM receipts/i.test(sql)) {
              return { rows: exportData.receipts };
            }
            if (/FROM mileage/i.test(sql)) {
              return { rows: exportData.mileage };
            }
            if (/FROM vehicle_costs/i.test(sql)) {
              state.vehicleCostQueryCount += 1;
              return { rows: exportData.vehicleCosts };
            }
            if (/FROM businesses/i.test(sql)) {
              return { rows: [exportData.business] };
            }
            throw new Error(`Unhandled pool SQL: ${sql}`);
          },
          async connect() {
            return {
              async query(sql, params) {
                if (/INSERT INTO exports/i.test(sql)) {
                  state.insertedExport = params;
                } else if (/INSERT INTO export_metadata/i.test(sql)) {
                  state.insertedMetadata = params;
                }
                return { rowCount: 1, rows: [] };
              },
              release() {
                state.released = true;
              }
            };
          }
        }
      };
    }
    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return {
        logError() {},
        logInfo() {}
      };
    }
    if (requestName === "../utils/logSanitizer.js" || /logSanitizer\.js$/.test(requestName)) {
      return {
        sanitizePayload(value) {
          return value;
        }
      };
    }
    if (requestName === "../services/subscriptionService.js" || /subscriptionService\.js$/.test(requestName)) {
      return {
        getSubscriptionSnapshotForBusiness: async () => ({ plan: "test" }),
        hasFeatureAccess: () => true
      };
    }

    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[EXPORTS_ROUTE_PATH];

  try {
    const router = require("../routes/exports.routes.js");
    return {
      router,
      state,
      cleanup() {
        delete require.cache[EXPORTS_ROUTE_PATH];
      }
    };
  } finally {
    Module._load = originalLoad;
  }
}

function buildApp(router) {
  const app = express();
  app.use(express.json());
  app.use("/api/exports", router);
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message });
  });
  return app;
}

function parseBinaryResponse(res, callback) {
  res.setEncoding("binary");
  let data = "";
  res.on("data", (chunk) => {
    data += chunk;
  });
  res.on("end", () => {
    callback(null, Buffer.from(data, "binary"));
  });
}

test("buildPdfExport writes literal Helvetica text commands instead of UTF-16 hex strings", () => {
  const pdf = buildTestPdf().toString("latin1");

  assert.match(pdf, /\/BaseFont \/Helvetica/);
  assert.match(pdf, /\(Bookkeeping Export for CPA Review\) Tj/);
  assert.match(pdf, /\(Secure Export\) Tj/);
  assert.match(pdf, /\(Export ID: EXP-20260430-TEST\) Tj/);
  assert.match(pdf, /\(Tax ID: 12-3456789\) Tj/);
  assert.match(pdf, /\(Legal business name: Jose Consulting\) Tj/);
  assert.match(pdf, /\(Operating name \\\(DBA\\\): Cafe Etude\) Tj/);
  assert.match(pdf, /\(Category Totals and Suggested Tax Mapping\) Tj/);
  assert.match(pdf, /\(Detailed Transaction Ledger\) Tj/);
  assert.match(pdf, /\(Review Items and Exceptions\) Tj/);
  assert.match(pdf, /\(Invoice \\\(April\\\) \| Paye\.\.\.\) Tj/);
  assert.doesNotMatch(pdf, /<FEFF/i);
  assert.doesNotMatch(pdf, /[^\x00-\x7F]/);
});

test("exports generate route returns the inline PDF buffer and stores only the redacted copy", async () => {
  const fixture = loadExportsRouter();

  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .post("/api/exports/generate")
      .buffer(true)
      .parse(parseBinaryResponse)
      .send({
        grantToken: "grant_token_123",
        taxId_jwe: "encrypted_tax_id"
      });

    assert.equal(response.status, 200);
    assert.equal(response.headers["content-type"], "application/pdf");
    assert.ok(Buffer.isBuffer(response.body));
    assert.match(response.body.toString("latin1"), /^%PDF-/);
    assert.match(response.body.toString("latin1"), /\(Tax ID: 12-3456789\) Tj/);
    assert.match(response.body.toString("latin1"), /\(Secure Export\) Tj/);
    assert.match(response.body.toString("latin1"), /\(Client A \| Payer: Acme\.\.\.\) Tj/);
    assert.equal(fixture.state.vehicleCostQueryCount > 0, true, "vehicle costs should be included in export queries");
    assert.ok(fixture.state.savedRedacted?.jobId, "redacted export should be saved");
    assert.ok(Buffer.isBuffer(fixture.state.savedRedacted?.buffer));
    assert.match(fixture.state.savedRedacted.buffer.toString("latin1"), /^%PDF-/);
    assert.match(fixture.state.savedRedacted.buffer.toString("latin1"), /\(Redacted Export\) Tj/);
    assert.doesNotMatch(fixture.state.savedRedacted.buffer.toString("latin1"), /\(Tax ID: 12-3456789\) Tj/);
    assert.ok(Array.isArray(fixture.state.insertedExport), "export row should be inserted");
    assert.ok(Array.isArray(fixture.state.insertedMetadata), "metadata rows should be inserted");
    assert.ok(
      fixture.state.insertedMetadata.includes("full_version_available"),
      "history metadata should include the full-version availability flag"
    );
    assert.ok(
      fixture.state.insertedMetadata.includes("false"),
      "history metadata should record that only the redacted copy is stored"
    );
    assert.equal(fixture.state.released, true);
  } finally {
    fixture.cleanup();
  }
});

test("exports secure-export rejects the request when JWE decrypt fails", async () => {
  const fixture = loadExportsRouter({ decryptErrorMessage: "decrypt failed" });

  try {
    const app = buildApp(fixture.router);

    const response = await request(app)
      .post("/api/exports/secure-export")
      .buffer(true)
      .parse(parseBinaryResponse)
      .send({
        dateRange: { startDate: "2026-04-01", endDate: "2026-04-30" },
        includeTaxId: true,
        taxId_jwe: "broken_jwe",
        language: "en",
        currency: "USD",
        templateVersion: "v1"
      });

    assert.equal(response.status, 400);
    assert.match(String(response.body?.toString("utf8") || ""), /unable to decrypt tax id/i);
  } finally {
    fixture.cleanup();
  }
});
