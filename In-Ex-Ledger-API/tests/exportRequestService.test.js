"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const {
  DATE_PATTERN,
  validateDateRange,
  isValidTaxId,
  resolveSecureExportTaxId,
  buildExportMetadataRows,
  inferQuickMethodSupplyType,
  createPdfReportId,
  buildCsvFilename,
  collectExportArtifactIds,
  normalizeExportHistoryEntry
} = require("../services/exportRequestService.js");

test("DATE_PATTERN matches only YYYY-MM-DD", () => {
  assert.equal(DATE_PATTERN.test("2026-08-10"), true);
  assert.equal(DATE_PATTERN.test("2026/08/10"), false);
  assert.equal(DATE_PATTERN.test("26-08-10"), false);
});

test("validateDateRange accepts a well-formed range and rejects malformed/reversed/missing input", () => {
  assert.deepEqual(validateDateRange({ startDate: "2026-01-01", endDate: "2026-01-31" }), {
    startDate: "2026-01-01",
    endDate: "2026-01-31"
  });
  assert.equal(validateDateRange(null), null);
  assert.equal(validateDateRange({}), null);
  assert.equal(validateDateRange({ startDate: "2026-01-01" }), null);
  assert.equal(validateDateRange({ startDate: "not-a-date", endDate: "2026-01-31" }), null);
  assert.equal(validateDateRange({ startDate: "2026-13-99", endDate: "2026-01-31" }), null);
  assert.equal(validateDateRange({ startDate: "2026-02-01", endDate: "2026-01-01" }), null);
});

test("isValidTaxId recognizes SSN/EIN/SIN/BN shapes and rejects everything else", () => {
  assert.equal(isValidTaxId("123-45-6789"), true);
  assert.equal(isValidTaxId("123456789"), true);
  assert.equal(isValidTaxId("12-3456789"), true);
  assert.equal(isValidTaxId("123-456-789"), true);
  assert.equal(isValidTaxId("123456789AB1234"), true);
  assert.equal(isValidTaxId(""), false);
  assert.equal(isValidTaxId(null), false);
  assert.equal(isValidTaxId("not-a-tax-id"), false);
});

test("resolveSecureExportTaxId returns empty string when includeTaxId is falsy", () => {
  assert.equal(resolveSecureExportTaxId({ taxId_jwe: "irrelevant" }, false), "");
});

test("resolveSecureExportTaxId throws a 400 when includeTaxId is true but taxId_jwe is missing", () => {
  assert.throws(
    () => resolveSecureExportTaxId({}, true),
    (error) => error.status === 400 && /taxId_jwe is required/.test(error.message)
  );
});

test("resolveSecureExportTaxId throws a 400 when decryption fails", () => {
  assert.throws(
    () => resolveSecureExportTaxId({ taxId_jwe: "not-a-real-jwe" }, true),
    (error) => error.status === 400 && /Unable to decrypt Tax ID/.test(error.message)
  );
});

test("resolveSecureExportTaxId throws a 400 when the decrypted value is not a valid tax id", () => {
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (/jweDecryptService\.js$/.test(request)) {
      return { decryptJwe: () => "not-a-valid-tax-id" };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve("../services/exportRequestService.js")];
    const { resolveSecureExportTaxId: patchedResolve } = require("../services/exportRequestService.js");
    assert.throws(
      () => patchedResolve({ taxId_jwe: "encrypted" }, true),
      (error) => error.status === 400 && /Invalid Tax ID format/.test(error.message)
    );
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../services/exportRequestService.js")];
  }
});

test("resolveSecureExportTaxId returns the decrypted tax id on success", () => {
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (/jweDecryptService\.js$/.test(request)) {
      return { decryptJwe: () => "123-45-6789" };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve("../services/exportRequestService.js")];
    const { resolveSecureExportTaxId: patchedResolve } = require("../services/exportRequestService.js");
    assert.equal(patchedResolve({ taxId_jwe: "encrypted" }, true), "123-45-6789");
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../services/exportRequestService.js")];
  }
});

test("buildExportMetadataRows drops empty/undefined fields and keeps the rest as [uuid, exportId, key, value] rows", () => {
  const rows = buildExportMetadataRows("export_1", {
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    includeTaxId: true,
    grantJti: "",
    contentHash: "hash123",
    filePath: undefined,
    language: "en",
    currency: "USD",
    pageCount: 3,
    scope: "active",
    filename: "report.pdf",
    notes: "",
    fullVersionAvailable: false
  });

  const keys = rows.map(([, , key]) => key);
  assert.deepEqual(keys.sort(), [
    "content_hash",
    "currency",
    "end_date",
    "filename",
    "full_version_available",
    "include_tax_id",
    "language",
    "page_count",
    "scope",
    "start_date"
  ].sort());

  for (const row of rows) {
    assert.equal(row.length, 4);
    assert.equal(row[1], "export_1");
    assert.match(row[0], /^[0-9a-f-]{36}$/);
  }

  const includeTaxIdRow = rows.find(([, , key]) => key === "include_tax_id");
  assert.equal(includeTaxIdRow[3], "true");
  const fullVersionRow = rows.find(([, , key]) => key === "full_version_available");
  assert.equal(fullVersionRow[3], "false");
});

test("inferQuickMethodSupplyType detects a single supply type from income category mapping", () => {
  const categories = [{ id: "cat_1", name: "Consulting", tax_map_us: "service_revenue" }];
  const transactions = [{ type: "income", category_id: "cat_1" }];
  const result = inferQuickMethodSupplyType(transactions, categories, "");
  assert.equal(result.supplyType, "services");
  assert.equal(result.source, "income_category_mapping");
  assert.equal(result.warning, null);
});

test("inferQuickMethodSupplyType falls back to NAICS goods/services inference from the business activity code", () => {
  const goods = inferQuickMethodSupplyType([], [], "445110");
  assert.equal(goods.supplyType, "goods");
  assert.equal(goods.source, "naics_inference");
  assert.match(goods.warning, /inferred/);

  const services = inferQuickMethodSupplyType([], [], "541110");
  assert.equal(services.supplyType, "services");
  assert.equal(services.source, "naics_inference");
});

test("inferQuickMethodSupplyType returns unknown when nothing can be inferred", () => {
  const result = inferQuickMethodSupplyType([], [], "");
  assert.equal(result.supplyType, null);
  assert.equal(result.source, "unknown");
  assert.match(result.warning, /could not be safely inferred/);
});

test("createPdfReportId encodes the given date and a random suffix into the id", () => {
  const id = createPdfReportId(new Date("2026-08-10T12:00:00Z"));
  assert.match(id, /^EXP-20260810-[0-9A-F]{4}$/);
});

test("buildCsvFilename maps each export type to its documented suffix and falls back to 'export'", () => {
  assert.equal(buildCsvFilename("csv_basic", "2026-01-01", "2026-01-31"), "inex-ledger-basic-ledger-2026-01-01_to_2026-01-31.csv");
  assert.equal(buildCsvFilename("csv_full", "2026-01-01", "2026-01-31"), "inex-ledger-cpa-workpaper-2026-01-01_to_2026-01-31.csv");
  assert.equal(buildCsvFilename("csv_excluded", "2026-01-01", "2026-01-31"), "inex-ledger-excluded-items-2026-01-01_to_2026-01-31.csv");
  assert.equal(buildCsvFilename("csv_category_summary", "2026-01-01", "2026-01-31"), "inex-ledger-category-summary-2026-01-01_to_2026-01-31.csv");
  assert.equal(buildCsvFilename("something_else", "2026-01-01", "2026-01-31"), "inex-ledger-export-2026-01-01_to_2026-01-31.csv");
});

test("collectExportArtifactIds merges receipt ids and supportArtifactMap ids with de-duplication", () => {
  const sourceRows = {
    receipts: [{ id: "r1" }, { id: "r2" }, { id: "r1" }],
    supportArtifactMap: new Map([
      ["tx_1", [{ id: "a1" }, { id: "r2" }]],
      ["tx_2", [{ id: "a2" }]]
    ])
  };
  const ids = collectExportArtifactIds(sourceRows);
  assert.deepEqual(ids.sort(), ["a1", "a2", "r1", "r2"].sort());
});

test("collectExportArtifactIds tolerates missing receipts/supportArtifactMap", () => {
  assert.deepEqual(collectExportArtifactIds({}), []);
  assert.deepEqual(collectExportArtifactIds(), []);
});

test("normalizeExportHistoryEntry shapes a raw DB row into the history API response format", () => {
  const entry = normalizeExportHistoryEntry({
    id: "exp_1",
    start_date: "2026-01-01",
    end_date: "2026-01-31",
    created_at: "2026-02-01T00:00:00Z",
    export_type: "pdf",
    include_tax_id: "true",
    content_hash: "hash123",
    language: "en",
    currency: "USD",
    page_count: "5",
    scope: "active",
    filename: "report.pdf",
    full_version_available: "false",
    export_mode: "workpaper",
    snapshot_status: "ready",
    invalidated_at: null,
    invalidation_reason: null
  });

  assert.equal(entry.include_tax_id, true);
  assert.equal(entry.page_count, 5);
  assert.equal(entry.storage_type, "redacted-only");
  assert.equal(entry.full_version_available, false);
});

test("normalizeExportHistoryEntry defaults missing fields sensibly", () => {
  const entry = normalizeExportHistoryEntry({ id: "exp_2", created_at: "2026-02-01T00:00:00Z" });
  assert.equal(entry.export_type, "pdf");
  assert.equal(entry.include_tax_id, false);
  assert.equal(entry.language, "en");
  assert.equal(entry.currency, "USD");
  assert.equal(entry.page_count, 0);
  assert.equal(entry.scope, "active");
  assert.equal(entry.full_version_available, true);
  assert.equal(entry.export_mode, "workpaper");
});
