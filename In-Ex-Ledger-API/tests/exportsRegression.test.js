"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const EXPORTS_ROUTE_PATH = require.resolve("../routes/exports.routes.js");
const pdfService = require("../services/pdfGeneratorService.js");
const { buildPdfExport, buildPdfExportDocument } = pdfService;

function buildFixtureOptions(overrides = {}) {
  return {
    transactions: [
      {
        id: "tx_income",
        type: "income",
        amount: "1200.00",
        categoryId: "cat_income",
        accountId: "acc_main",
        date: "2026-04-01",
        description: "Client A invoice",
        payer_name: "Acme Platform",
        tax_form_type: "1099-K"
      },
      {
        id: "tx_fuel",
        type: "expense",
        amount: "45.00",
        categoryId: "cat_fuel",
        accountId: "acc_main",
        date: "2026-04-02",
        description: "Shell fuel"
      },
      {
        id: "tx_meal",
        type: "expense",
        amount: "24.00",
        categoryId: "cat_meal",
        accountId: "acc_main",
        date: "2026-04-03",
        description: "Client lunch"
      },
      {
        id: "tx_phone",
        type: "expense",
        amount: "80.00",
        categoryId: "cat_phone",
        accountId: "acc_main",
        date: "2026-04-04",
        description: "Phone service"
      },
      {
        id: "tx_imported_expense",
        type: "expense",
        amount: "18.00",
        categoryId: "cat_imported_expense",
        accountId: "acc_main",
        date: "2026-04-05",
        description: "Imported row"
      },
      {
        id: "tx_imported_income",
        type: "income",
        amount: "12.00",
        categoryId: "cat_imported_income",
        accountId: "acc_main",
        date: "2026-04-06",
        description: "Cashback refund"
      },
      {
        id: "tx_cc_pay",
        type: "expense",
        amount: "250.00",
        categoryId: "cat_imported_expense",
        accountId: "acc_main",
        date: "2026-04-07",
        description: "Online payment thank you"
      }
    ],
    accounts: [{ id: "acc_main", name: "Checking", type: "bank" }],
    categories: [
      { id: "cat_income", name: "Sales Revenue", kind: "income", tax_map_us: "Line 1 - Gross receipts or sales", tax_map_ca: "Line 8000 - Gross business income" },
      { id: "cat_fuel", name: "Fuel & Gas", kind: "expense", tax_map_us: "", tax_map_ca: "" },
      { id: "cat_meal", name: "Food & Dining", kind: "expense", tax_map_us: "", tax_map_ca: "" },
      { id: "cat_phone", name: "Phone & Internet", kind: "expense", tax_map_us: "", tax_map_ca: "" },
      { id: "cat_imported_expense", name: "Imported Expense", kind: "expense", tax_map_us: "", tax_map_ca: "" },
      { id: "cat_imported_income", name: "Imported Income", kind: "income", tax_map_us: "", tax_map_ca: "" }
    ],
    receipts: [{ id: "r_meal", transaction_id: "tx_meal", filename: "meal.pdf" }],
    mileage: [{ id: "m1", trip_date: "2026-04-02", purpose: "Client visit", destination: "Downtown", miles: 12.5 }],
    vehicleCosts: [{ id: "vc1", entry_type: "fuel", entry_date: "2026-04-02", title: "Fuel", vendor: "Shell", amount: "45.00" }],
    startDate: "2026-04-01",
    endDate: "2026-04-30",
    exportLang: "en",
    currency: "USD",
    legalName: "Jose Consulting",
    businessName: "Jose Consulting",
    operatingName: "Cafe Etude",
    taxId: "12-3456789",
    generatedAt: "2026-04-30T15:45:00.000Z",
    reportId: "EXP-20260430-TEST",
    naics: "541611",
    region: "us",
    province: "",
    address: "123 Main St, New York, NY",
    accountingMethod: "cash",
    materialParticipation: true,
    supportArtifactMap: null,
    ...overrides
  };
}

function loadExportsRouter(options = {}) {
  const originalLoad = Module._load.bind(Module);
  const state = { insertedMetadata: null, insertedExport: null, released: false, savedRedacted: null, vehicleCostQueryCount: 0 };
  const grantPayload = options.grantPayload || {
    action: "generate_pdf",
    businessId: "biz_test",
    userId: "user_test",
    exportType: "pdf",
    includeTaxId: true,
    jti: "grant_jti_123",
    dateRange: { startDate: "2026-04-01", endDate: "2026-04-30" },
    metadata: { language: "en", currency: "USD" }
  };
  const fixture = buildFixtureOptions();

  Module._load = function(requestName, parent, isMain) {
    if (/auth\.middleware\.js$/.test(requestName)) {
      return {
        requireAuth(req, res, next) {
          if (options.authDenied) {
            return res.status(401).json({ error: "Unauthorized" });
          }
          req.user = { id: "user_test", email_verified: true };
          next();
        }
      };
    }
    if (/csrf\.middleware\.js$/.test(requestName)) {
      return { requireCsrfProtection(_req, _res, next) { next(); } };
    }
    if (/rateLimitTiers\.js$/.test(requestName)) {
      return {
        createExportGrantLimiter() { return (_req, _res, next) => next(); },
        createSecureExportLimiter() { return (_req, _res, next) => next(); }
      };
    }
    if (/resolveBusinessIdForUser\.js$/.test(requestName)) {
      return { resolveBusinessIdForUser: async () => "biz_test" };
    }
    if (/exportGrantService\.js$/.test(requestName)) {
      return {
        issueExportGrant: async (payload) => options.issueGrantResult || { token: "grant_token_123", expiresAt: Date.now() + 60_000, payload },
        verifyExportGrant: async () => grantPayload
      };
    }
    if (/exportStorage\.js$/.test(requestName)) {
      return {
        async saveRedactedPdf(jobId, buffer) {
          state.savedRedacted = { jobId, buffer };
          return { filePath: `C:\\exports\\${jobId}.pdf`, hash: "hash_test_123" };
        },
        buildRedactedStream() { throw new Error("not used"); },
        deleteExportFile: async () => {}
      };
    }
    if (/jweDecryptService\.js$/.test(requestName)) {
      return { decryptJwe: () => "12-3456789" };
    }
    if (/taxIdService\.js$/.test(requestName)) {
      return { decryptTaxId: () => "12-3456789" };
    }
    if (/gstHstNumberService\.js$/.test(requestName)) {
      return { decryptGstHstNumber: (value) => value };
    }
    if (/pdfGeneratorService\.js$/.test(requestName)) {
      return pdfService;
    }
    if (/db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql) {
            if (/FROM transactions/i.test(sql)) return { rows: fixture.transactions.map((row) => ({ ...row, account_id: row.accountId, category_id: row.categoryId })) };
            if (/FROM accounts/i.test(sql)) return { rows: fixture.accounts };
            if (/FROM categories/i.test(sql)) return { rows: fixture.categories };
            if (/FROM receipts/i.test(sql)) return { rows: fixture.receipts };
            if (/FROM support_artifacts/i.test(sql)) return { rows: [] };
            if (/FROM mileage/i.test(sql)) return { rows: fixture.mileage };
            if (/FROM vehicle_expense_details/i.test(sql)) { state.vehicleCostQueryCount += 1; return { rows: [] }; }
            if (/FROM vehicle_costs/i.test(sql)) { state.vehicleCostQueryCount += 1; return { rows: fixture.vehicleCosts }; }
            if (/FROM capital_assets/i.test(sql)) return { rows: [] };
            if (/FROM businesses/i.test(sql)) {
              return { rows: [{ name: fixture.businessName, region: "us", province: "", operating_name: fixture.operatingName, business_activity_code: fixture.naics, fiscal_year_start: "01-01", address: fixture.address, tax_id: fixture.taxId, accounting_method: fixture.accountingMethod, material_participation: true, gst_hst_registered: false, gst_hst_number: "", gst_hst_method: "", business_type: "sole_prop" }] };
            }
            throw new Error(`Unhandled pool SQL: ${sql}`);
          },
          async connect() {
            return {
              async query(sql, params) {
                if (/INSERT INTO export_metadata/i.test(sql)) state.insertedMetadata = params;
                if (/INSERT INTO exports/i.test(sql)) state.insertedExport = params;
                return { rowCount: 1, rows: [] };
              },
              release() { state.released = true; }
            };
          }
        }
      };
    }
    if (/logger\.js$/.test(requestName)) {
      return { logError() {}, logInfo() {} };
    }
    if (/logSanitizer\.js$/.test(requestName)) {
      return { sanitizePayload(value) { return value; } };
    }
    if (/subscriptionService\.js$/.test(requestName)) {
      return { getSubscriptionSnapshotForBusiness: async () => ({ plan: "test" }), hasFeatureAccess: () => true };
    }
    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[EXPORTS_ROUTE_PATH];
  try {
    return {
      router: require("../routes/exports.routes.js"),
      state,
      cleanup() { delete require.cache[EXPORTS_ROUTE_PATH]; Module._load = originalLoad; }
    };
  } catch (error) {
    Module._load = originalLoad;
    throw error;
  }
}

function buildApp(router) {
  const app = express();
  app.use(express.json());
  app.use("/api/exports", router);
  return app;
}

function parseBinaryResponse(res, callback) {
  res.setEncoding("binary");
  let data = "";
  res.on("data", (chunk) => { data += chunk; });
  res.on("end", () => callback(null, Buffer.from(data, "binary")));
}

test("buildPdfExport returns a valid PDF buffer with premium section titles and no TM or vague OK statuses", () => {
  const pdf = buildPdfExport(buildFixtureOptions()).toString("latin1");
  assert.match(pdf, /^%PDF-/);
  assert.match(pdf, /\(US CPA Workpaper Export\) Tj/);
  assert.match(pdf, /\(Prepared for Schedule C bookkeeping review\) Tj/);
  assert.match(pdf, /\(Secure Export\) Tj/);
  assert.match(pdf, /\(Executive Summary\) Tj/);
  assert.match(pdf, /\(Tax Mapping Summary\) Tj/);
  assert.match(pdf, /\(CPA Workpaper Checklist\) Tj/);
  assert.match(pdf, /\(Supporting Schedules and Final Disclosure\) Tj/);
  assert.match(pdf, /\(Draft - CPA Review Required\) Tj/);
  assert.match(pdf, /\(This export is a bookkeeping workpaper, not a filed return\.\) Tj/);
  assert.doesNotMatch(pdf, /\(TM\) Tj/);
});

test("shared header renders badges on their own reserved row", () => {
  const pdf = buildPdfExport(buildFixtureOptions()).toString("latin1");
  assert.match(pdf, /1 0 0 1 52\.00 708\.00 Tm\s+\(Prepared for Schedule C bookkeeping review\) Tj/s);
  assert.match(pdf, /52\.00 672\.00 84\.80 16\.00 re f[\s\S]{0,120}1 0 0 1 69\.44 680\.00 Tm\s+\(Secure Export\) Tj/s);
  assert.match(pdf, /144\.80 672\.00 163\.20 16\.00 re f[\s\S]{0,120}1 0 0 1 174\.56 680\.00 Tm\s+\(Draft - CPA Review Required\) Tj/s);
});

test("excluded section uses short reason codes and not truncated prose strings", () => {
  const pdf = buildPdfExport(buildFixtureOptions()).toString("latin1");
  assert.match(pdf, /\(CC PAY\) Tj/);
  assert.doesNotMatch(pdf, /CC payment - deduct und/i);
  assert.doesNotMatch(pdf, /Tax refund - not Schedu/i);
  assert.doesNotMatch(pdf, /Investment account - no/i);
});

test("checklist labels are not truncated and unsupported rows do not claim OK", () => {
  const pdf = buildPdfExport(buildFixtureOptions()).toString("latin1");
  assert.match(pdf, /\(Phone \/ Internet allocation\) Tj/);
  assert.match(pdf, /\(Vehicle support\) Tj/);
  assert.match(pdf, /\(Receipts\) Tj/);
  assert.doesNotMatch(pdf, /Receipts attached to all expens/);
});

test("vehicle costs appear in the support schedule when provided", () => {
  const pdf = buildPdfExport(buildFixtureOptions()).toString("latin1");
  assert.match(pdf, /\(Vehicle Review\) Tj/);
  assert.match(pdf, /\(Fuel: \$45\.00\) Tj/);
  assert.match(pdf, /\(Total vehicle costs: \$45\.00\) Tj/);
});

test("secure and redacted exports keep the same classification totals and sections", () => {
  const secure = buildPdfExportDocument(buildFixtureOptions());
  const redacted = buildPdfExportDocument(buildFixtureOptions({ taxId: "" }));
  const secureText = secure.buffer.toString("latin1");
  const redactedText = redacted.buffer.toString("latin1");
  assert.equal(secure.pageCount > 0, true);
  assert.equal(redacted.pageCount > 0, true);
  assert.equal(secure.pageCount, redacted.pageCount);
  assert.match(secureText, /\(Secure Export\) Tj/);
  assert.match(redactedText, /\(Redacted Export\) Tj/);
  assert.match(secureText, /\(Tax Mapping Summary\) Tj/);
  assert.match(redactedText, /\(Tax Mapping Summary\) Tj/);
  assert.match(secureText, /\(Gross income\) Tj/);
  assert.match(redactedText, /\(Gross income\) Tj/);
  assert.match(secureText, /\(Tax ID: 12-3456789\) Tj/);
  assert.doesNotMatch(redactedText, /\(Tax ID: 12-3456789\) Tj/);
});

test("mapping summary wording does not claim unmapped rows are mapped", () => {
  const pdf = buildPdfExport(buildFixtureOptions()).toString("latin1");
  assert.match(pdf, /\(Needs category\) Tj/);
  assert.match(pdf, /\(Mapped review line\) Tj/);
  assert.match(pdf, /\(Mapped support-ready\) Tj/);
  assert.match(pdf, /\(Truly unmapped\) Tj/);
  assert.doesNotMatch(pdf, /Unmapped[\s\S]{0,120}Status Mapped/i);
});

test("category metrics keep support totals aligned with the new status model", () => {
  const pdf = buildPdfExport(buildFixtureOptions()).toString("latin1");
  assert.match(pdf, /\(Needs support\) Tj/);
  assert.match(pdf, /\(\$137\.00\) Tj/);
  assert.match(pdf, /Support-risk categories: 3 \| Mapped transactions requiring support\/final confirmation: 3/i);
});

test("category and support labels use compact canonical wording instead of chopped prose", () => {
  const pdf = buildPdfExport(buildFixtureOptions()).toString("latin1");
  assert.match(pdf, /\(L24b Meals\) Tj/);
  assert.match(pdf, /\(L9 Vehicle\) Tj/);
  assert.match(pdf, /\(L25\/27a Phone\/util\) Tj/);
  assert.match(pdf, /\(Support: Business purpose needed\) Tj/);
  assert.match(pdf, /\(Support: Needs allocation\) Tj/);
  assert.match(pdf, /\(Support: Needs mileage log\) Tj/);
  assert.doesNotMatch(pdf, /Meals and enterta\.\.\./i);
  assert.doesNotMatch(pdf, /Needs category \/ no t\.\.\./i);
});

test("receipt and support metrics use distinct wording", () => {
  const pdf = buildPdfExport(buildFixtureOptions()).toString("latin1");
  assert.match(pdf, /expense transactions do not have receipt attachments/i);
  assert.match(pdf, /\(With receipt attachment: 1\) Tj/);
  assert.match(pdf, /\(Without receipt attachment: 3\) Tj/);
  assert.match(pdf, /Mapped transactions requiring support\/final confirmation: 3/i);
  assert.match(pdf, /Support-risk categories: 3 \| Mapped transactions requiring support\/final confirmation: 3/i);
  assert.match(pdf, /Expense transactions without receipt attachment: 3/i);
});

test("attached income receipts are surfaced in the PDF even when expense receipt coverage is zero", () => {
  const pdf = buildPdfExport(buildFixtureOptions({
    transactions: [
      {
        id: "tx_income_only",
        type: "income",
        amount: "1200.00",
        categoryId: "cat_income",
        accountId: "acc_main",
        date: "2026-04-01",
        description: "Client A invoice",
        payer_name: "Acme Platform",
        tax_form_type: "1099-K"
      }
    ],
    receipts: [
      { id: "r_income_1", transaction_id: "tx_income_only", filename: "invoice-proof-1.pdf" },
      { id: "r_income_2", transaction_id: "tx_income_only", filename: "invoice-proof-2.pdf" },
      { id: "r_income_3", transaction_id: "tx_income_only", filename: "invoice-proof-3.pdf" }
    ],
    mileage: [],
    vehicleCosts: []
  })).toString("latin1");

  assert.match(pdf, /3 receipt files are attached across 1 transactions in this export\./i);
  assert.match(pdf, /\(Attached receipt files: 3\) Tj/);
  assert.match(pdf, /\(Transactions with receipts: 1\) Tj/);
  assert.match(pdf, /Receipts: invoice-proof-1\.pdf, invo/i);
  assert.match(pdf, /\(0 of 0 expense transactions have attached receipts\./i);
});

test("phase 3 PDF adds unresolved exceptions and evidence schedules", () => {
  const pdf = buildPdfExport(buildFixtureOptions({
    supportArtifactMap: new Map([
      ["tx_meal", [{ artifact_type: "review_note", filename: "Review note", review_status: "accepted", notes: "Client lunch with prospect" }]],
      ["tx_fuel", [{ artifact_type: "mileage_log", filename: "mileage.pdf", review_status: "accepted", notes: "" }]]
    ])
  })).toString("latin1");

  assert.match(pdf, /Unresolved Exceptions Schedule/i);
  assert.match(pdf, /Evidence Schedule/i);
  assert.match(pdf, /Open blocker summary/i);
  assert.match(pdf, /mileage\.pdf/i);
});

test("executive summary and mapping pages keep truly unmapped counts consistent", () => {
  const pdf = buildPdfExport(buildFixtureOptions()).toString("latin1");
  assert.match(pdf, /1 imported \/ uncategorized transactions need real category assignment\./i);
  assert.match(pdf, /0 categorized transactions remain truly unmapped after category review\./i);
  assert.match(pdf, /\(Truly unmapped\) Tj[\s\S]{0,120}\(0 transactions \| \$0\.00\) Tj/i);
  assert.match(pdf, /Truly unmapped expenses: 0 totaling \$0\.00/i);
});

test("obvious non-P&L items render under excluded codes instead of ledger tax mapping", () => {
  const pdf = buildPdfExport(buildFixtureOptions({
    transactions: [
      {
        id: "tx_income",
        type: "income",
        amount: "1200.00",
        categoryId: "cat_income",
        accountId: "acc_main",
        date: "2026-04-01",
        description: "Client A invoice",
        payer_name: "Acme Platform",
        tax_form_type: "1099-K"
      },
      {
        id: "tx_transfer",
        type: "expense",
        amount: "300.00",
        categoryId: "cat_imported_expense",
        accountId: "acc_main",
        date: "2026-04-02",
        description: "TRANSFER TO SAV XXXXX7188"
      },
      {
        id: "tx_cc_pay",
        type: "expense",
        amount: "250.00",
        categoryId: "cat_imported_expense",
        accountId: "acc_main",
        date: "2026-04-03",
        description: "CITI CARD ONLINE PAYMENT"
      },
      {
        id: "tx_tax_ref",
        type: "income",
        amount: "125.00",
        categoryId: "cat_imported_income",
        accountId: "acc_main",
        date: "2026-04-04",
        description: "IRS TREAS 310 TAX REF"
      },
      {
        id: "tx_cashback",
        type: "income",
        amount: "25.00",
        categoryId: "cat_imported_income",
        accountId: "acc_main",
        date: "2026-04-05",
        description: "Cash Redemption"
      }
    ]
  })).toString("latin1");

  assert.match(pdf, /\(TRANSFER\) Tj/);
  assert.match(pdf, /\(CC PAY\) Tj/);
  assert.match(pdf, /\(TAX REF\) Tj/);
  assert.match(pdf, /\(CASHBACK\) Tj/);
  assert.doesNotMatch(pdf, /\(TRANSFER TO SAV XXXXX7188\) Tj[\s\S]{0,220}\(Needs category \/ no tax line yet\) Tj/);
  assert.doesNotMatch(pdf, /\(CITI CARD ONLINE PAYMENT\) Tj[\s\S]{0,220}\(Needs category \/ no tax line yet\) Tj/);
});

test("Canada export resolves T2125 review lines", () => {
  const pdf = buildPdfExport(buildFixtureOptions({
    region: "ca",
    province: "ON",
    currency: "CAD",
    gstHstRegistered: true,
    gstHstNumber: "123456789RT0001",
    gstHstMethod: "regular",
    fiscalYearStart: "2025-12-31",
    entityType: "llc",
    naics: "0628-12345",
    categories: [
      { id: "cat_income", name: "Sales Revenue", kind: "income", tax_map_us: "", tax_map_ca: "Line 8000 - Gross business income" },
      { id: "cat_fuel", name: "Fuel & Gas", kind: "expense", tax_map_us: "", tax_map_ca: "" },
      { id: "cat_meal", name: "Food & Dining", kind: "expense", tax_map_us: "", tax_map_ca: "" },
      { id: "cat_phone", name: "Phone & Internet", kind: "expense", tax_map_us: "", tax_map_ca: "" },
      { id: "cat_imported_expense", name: "Imported Expense", kind: "expense", tax_map_us: "", tax_map_ca: "" },
      { id: "cat_imported_income", name: "Imported Income", kind: "income", tax_map_us: "", tax_map_ca: "" }
    ]
  })).toString("latin1");
  assert.match(pdf, /\(Canada CPA Workpaper Export\) Tj/);
  assert.match(pdf, /\(Prepared for T2125 bookkeeping review\) Tj/);
  assert.match(pdf, /\(L9281 Motor vehicle\) Tj/);
  assert.match(pdf, /\(L8523 Meals\) Tj/);
  assert.match(pdf, /\(L9270 Phone\/util\) Tj/);
  assert.match(pdf, /\(Entity type: Foreign\/US LLC\) Tj/);
  assert.match(pdf, /\(Filing treatment: Confirm in Canada\) Tj/);
  assert.match(pdf, /\(Validation: Needs review\) Tj/);
  assert.match(pdf, /\(Fiscal year: 2025-12-31 to 2026-12-30 \| GST\/HST method: regular\) Tj/);
  assert.match(pdf, /\(Confirm fiscal year with preparer\.\) Tj/);
});

test("route generate stores nonzero page count metadata and saves only the redacted copy", async () => {
  const fixture = loadExportsRouter();
  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .post("/api/exports/generate")
      .buffer(true)
      .parse(parseBinaryResponse)
      .send({ grantToken: "grant_token_123", taxId_jwe: "encrypted_tax_id", certifiedByUser: true });

    assert.equal(response.status, 200);
    assert.equal(response.headers["content-type"], "application/pdf");
    assert.match(response.body.toString("latin1"), /^%PDF-/);
    assert.equal(fixture.state.vehicleCostQueryCount > 0, true);
    assert.ok(Array.isArray(fixture.state.insertedMetadata));
    const pageCountIndex = fixture.state.insertedMetadata.indexOf("page_count");
    assert.equal(pageCountIndex >= 0, true);
    assert.equal(Number(fixture.state.insertedMetadata[pageCountIndex + 1]) > 0, true);
    assert.ok(Buffer.isBuffer(fixture.state.savedRedacted.buffer));
    assert.doesNotMatch(fixture.state.savedRedacted.buffer.toString("latin1"), /\(Tax ID: 12-3456789\) Tj/);
    assert.equal(fixture.state.released, true);
  } finally {
    fixture.cleanup();
  }
});

test("route exposes backend-authoritative tax mapping rules", async () => {
  const fixture = loadExportsRouter();
  try {
    const app = buildApp(fixture.router);
    const response = await request(app).get("/api/exports/tax-mapping-rules");
    assert.equal(response.status, 200);
    assert.equal(response.body.source, "backend-authoritative");
    assert.ok(response.body.rules.jurisdiction_maps.US.sales_revenue);
    assert.ok(response.body.rules.jurisdiction_maps.CA.meals);
  } finally {
    fixture.cleanup();
  }
});

test("CSV grant route requires auth", async () => {
  const fixture = loadExportsRouter({ authDenied: true });
  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .post("/api/exports/request-grant")
      .send({ exportType: "csv_full", dateRange: { startDate: "2026-04-01", endDate: "2026-04-30" } });
    assert.equal(response.status, 401);
  } finally {
    fixture.cleanup();
  }
});

test("CSV grant route rejects invalid date ranges and includeTaxId", async () => {
  let fixture = loadExportsRouter();
  try {
    let app = buildApp(fixture.router);
    let response = await request(app)
      .post("/api/exports/request-grant")
      .send({ exportType: "csv_full", dateRange: { startDate: "2026-04-30", endDate: "2026-04-01" } });
    assert.equal(response.status, 400);
  } finally {
    fixture.cleanup();
  }

  fixture = loadExportsRouter();
  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .post("/api/exports/request-grant")
      .send({ exportType: "csv_full", includeTaxId: true, dateRange: { startDate: "2026-04-01", endDate: "2026-04-30" } });
    assert.equal(response.status, 400);
  } finally {
    fixture.cleanup();
  }
});

test("CSV generate route returns backend-authoritative CSV and records export history", async () => {
  const fixture = loadExportsRouter({
    grantPayload: {
      action: "generate_pdf",
      businessId: "biz_test",
      userId: "user_test",
      exportType: "csv_full",
      includeTaxId: false,
      jti: "grant_jti_csv",
      dateRange: { startDate: "2026-04-01", endDate: "2026-04-30" },
      metadata: { language: "en", currency: "USD" }
    }
  });
  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .post("/api/exports/generate")
      .buffer(true)
      .parse(parseBinaryResponse)
      .send({ grantToken: "grant_token_123" });

    const csv = response.body.toString("utf8");
    assert.equal(response.status, 200);
    assert.equal(response.headers["content-type"], "text/csv; charset=utf-8");
    assert.equal(csv.charCodeAt(0), 0xFEFF);
    assert.match(csv, /Transaction Nature,Included In P&L,Inclusion Status,Exclusion Code/);
    assert.match(csv, /CC PAY/);
    assert.doesNotMatch(csv, /Tax ID/i);
    assert.ok(Array.isArray(fixture.state.insertedExport));
    assert.equal(fixture.state.insertedExport[3], "csv_full");
    assert.ok(Array.isArray(fixture.state.insertedMetadata));
    const filenameIndex = fixture.state.insertedMetadata.indexOf("filename");
    assert.equal(filenameIndex >= 0, true);
    assert.match(String(fixture.state.insertedMetadata[filenameIndex + 1]), /cpa-workpaper/i);
  } finally {
    fixture.cleanup();
  }
});
