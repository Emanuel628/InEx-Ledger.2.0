"use strict";

// Pure/near-pure helpers for routes/exports.routes.js: validating the
// requested date range and tax ID, building export filenames/metadata rows,
// inferring a CRA Quick Method supply type from ledger data, and shaping
// export history rows for the API response. No database access, no
// request/response objects -- kept side-effect-free (aside from
// crypto/decrypt calls) so they're directly testable without a database.

const crypto = require("crypto");
const { decryptJwe } = require("./jweDecryptService.js");
const { logError } = require("../utils/logger.js");

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SSN_RE = /^(\d{3}-\d{2}-\d{4}|\d{9})$/;
const EIN_RE = /^(\d{2}-\d{7}|\d{9})$/;
const SIN_RE = /^(\d{3}-\d{3}-\d{3}|\d{9})$/;
const BN_RE = /^(\d{9}|(?:\d{9}[A-Za-z]{2}\d{4})|(?:\d{9}\s?[A-Za-z]{2}\s?\d{4})|(?:\d{9}-[A-Za-z]{2}-\d{4}))$/;

function validateDateRange(range) {
  if (!range || typeof range !== "object") return null;
  const { startDate, endDate } = range;
  if (!startDate || !endDate) return null;
  if (!DATE_PATTERN.test(startDate) || !DATE_PATTERN.test(endDate)) return null;
  if (isNaN(new Date(startDate).getTime()) || isNaN(new Date(endDate).getTime())) return null;
  if (startDate > endDate) return null;
  return { startDate, endDate };
}

function isValidTaxId(value) {
  if (!value) return false;
  const trimmed = String(value).trim();
  return SSN_RE.test(trimmed) || EIN_RE.test(trimmed) || SIN_RE.test(trimmed) || BN_RE.test(trimmed);
}

function resolveSecureExportTaxId(body, includeTaxId) {
  if (!includeTaxId) {
    return "";
  }

  const encryptedTaxId = String(body?.taxId_jwe || "").trim();
  if (!encryptedTaxId) {
    const exportError = new Error("taxId_jwe is required when includeTaxId is true.");
    exportError.status = 400;
    throw exportError;
  }

  let decryptedTaxId = "";
  try {
    decryptedTaxId = decryptJwe(encryptedTaxId);
  } catch (error) {
    logError("Secure export JWE decrypt failed", { err: error.message });
    const exportError = new Error("Unable to decrypt Tax ID for secure export.");
    exportError.status = 400;
    throw exportError;
  }

  if (!isValidTaxId(decryptedTaxId)) {
    const exportError = new Error("Invalid Tax ID format.");
    exportError.status = 400;
    throw exportError;
  }

  return decryptedTaxId;
}

function buildExportMetadataRows(exportId, metadata) {
  return [
    ["start_date", metadata.startDate],
    ["end_date", metadata.endDate],
    ["include_tax_id", metadata.includeTaxId ? "true" : "false"],
    ["grant_jti", metadata.grantJti || ""],
    ["content_hash", metadata.contentHash || ""],
    ["file_path", metadata.filePath || ""],
    ["language", metadata.language || "en"],
    ["currency", metadata.currency || "USD"],
    ["page_count", String(Number(metadata.pageCount) || 0)],
    ["scope", metadata.scope || "active"],
    ["filename", metadata.filename || ""],
    ["notes", metadata.notes || ""],
    ["full_version_available", metadata.fullVersionAvailable ? "true" : "false"]
  ]
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => [crypto.randomUUID(), exportId, key, String(value)]);
}

function inferQuickMethodSupplyType(transactions = [], categories = [], businessActivityCode = "") {
  const categoriesById = new Map((categories || []).map((category) => [category.id, category]));
  const incomeTransactions = (transactions || []).filter((row) => String(row.type || "").toLowerCase() === "income");
  const detectedTypes = new Set();

  incomeTransactions.forEach((row) => {
    const category = categoriesById.get(row.category_id);
    const taxKey = String(category?.tax_map_ca || category?.tax_map_us || "").trim().toLowerCase();
    const name = String(category?.name || row.description || "").trim().toLowerCase();
    if (["t4a_20", "nonemployee_compensation", "service_revenue"].includes(taxKey) || /(service|consult|design|repair|freelance|commission)/i.test(name)) {
      detectedTypes.add("services");
    } else if (["sales", "sales_revenue", "gross_receipts_sales"].includes(taxKey) || /(sale|retail|shop|store|inventory|product)/i.test(name)) {
      detectedTypes.add("goods");
    }
  });

  if (detectedTypes.size === 1) {
    return {
      supplyType: Array.from(detectedTypes)[0],
      source: "income_category_mapping",
      warning: null
    };
  }

  const naicsSector = String(businessActivityCode || "").replace(/\D+/g, "").slice(0, 2);
  if (["11", "21", "22", "23", "31", "32", "33", "42", "44", "45"].includes(naicsSector)) {
    return {
      supplyType: "goods",
      source: "naics_inference",
      warning: "Supply type was inferred from the business activity code. Confirm the CRA Quick Method rate with your preparer."
    };
  }
  if (["48", "49", "51", "52", "53", "54", "55", "56", "61", "62", "71", "72", "81"].includes(naicsSector)) {
    return {
      supplyType: "services",
      source: "naics_inference",
      warning: "Supply type was inferred from the business activity code. Confirm the CRA Quick Method rate with your preparer."
    };
  }

  return {
    supplyType: null,
    source: "unknown",
    warning: "Supply type could not be safely inferred from the current ledger data."
  };
}

function createPdfReportId(rawDate = new Date()) {
  const date = rawDate instanceof Date ? rawDate : new Date(rawDate);
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("");
  return `EXP-${stamp}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}

function buildCsvFilename(exportType, startDate, endDate) {
  const suffixMap = {
    csv_basic: "basic-ledger",
    csv_full: "cpa-workpaper",
    csv_excluded: "excluded-items",
    csv_category_summary: "category-summary"
  };
  const suffix = suffixMap[exportType] || "export";
  return `inex-ledger-${suffix}-${startDate}_to_${endDate}.csv`;
}

function collectExportArtifactIds(sourceRows = {}) {
  const artifactIds = [];
  for (const receipt of sourceRows.receipts || []) {
    if (receipt?.id) artifactIds.push(receipt.id);
  }
  const supportArtifactMap = sourceRows.supportArtifactMap;
  if (supportArtifactMap instanceof Map) {
    for (const artifacts of supportArtifactMap.values()) {
      for (const artifact of artifacts || []) {
        if (artifact?.id) artifactIds.push(artifact.id);
      }
    }
  }
  return Array.from(new Set(artifactIds));
}

function normalizeExportHistoryEntry(entry) {
  return {
    id: entry.id,
    start_date: entry.start_date || null,
    end_date: entry.end_date || null,
    created_at: entry.created_at,
    export_type: entry.export_type || "pdf",
    include_tax_id: String(entry.include_tax_id || "").toLowerCase() === "true",
    content_hash: entry.content_hash || null,
    language: entry.language || "en",
    currency: entry.currency || "USD",
    page_count: Number(entry.page_count) || 0,
    scope: entry.scope || "active",
    filename: entry.filename || null,
    storage_type: "redacted-only",
    full_version_available: String(entry.full_version_available || "true").toLowerCase() !== "false",
    export_mode: entry.export_mode || "workpaper",
    snapshot_status: entry.snapshot_status || null,
    invalidated_at: entry.invalidated_at || null,
    invalidation_reason: entry.invalidation_reason || null
  };
}

module.exports = {
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
};
