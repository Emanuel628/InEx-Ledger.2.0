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
        note: "Invoice (April)"
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
    naics: "541611",
    region: "us",
    province: ""
  });
}

function loadExportsRouter(options = {}) {
  const originalLoad = Module._load.bind(Module);
  const state = {
    dispatchedJob: null,
    savedRedacted: null,
    insertedExport: null,
    insertedMetadata: null,
    released: false
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

  const workerResult = options.workerResult || {
    fullPdfBuffer: Buffer.from("%PDF-full%"),
    redactedPdfBuffer: Buffer.from("%PDF-redacted%"),
    metadata: {
      pageCount: 3,
      notes: "Generated via test worker"
    }
  };

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
        decryptJwe: async () => "12-3456789"
      };
    }
    if (requestName === "../services/pdfGeneratorService.js" || /pdfGeneratorService\.js$/.test(requestName)) {
      return {
        buildPdfExport
      };
    }
    if (requestName === "../services/pdfWorkerClient.js" || /pdfWorkerClient\.js$/.test(requestName)) {
      return {
        async dispatchPdfJob(job) {
          state.dispatchedJob = job;
          return workerResult;
        }
      };
    }
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
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
        logError() {}
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
  assert.match(pdf, /\(Business export summary\) Tj/);
  assert.match(pdf, /\(Tax ID: 12-3456789\) Tj/);
  assert.match(pdf, /\(Legal business name: Jose Consulting\) Tj/);
  assert.match(pdf, /\(Operating name \\\(DBA\\\): Cafe Etude\) Tj/);
  assert.doesNotMatch(pdf, /<FEFF/i);
  assert.doesNotMatch(pdf, /[^\x00-\x7F]/);
});

test("exports generate route dispatches worker job and returns the full PDF buffer", async () => {
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
    assert.deepEqual(response.body, Buffer.from("%PDF-full%"));
    assert.ok(fixture.state.dispatchedJob, "worker job should be dispatched");
    assert.equal(fixture.state.dispatchedJob.taxId_jwe, "encrypted_tax_id");
    assert.deepEqual(fixture.state.savedRedacted, {
      jobId: fixture.state.dispatchedJob.jobId,
      buffer: Buffer.from("%PDF-redacted%")
    });
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
