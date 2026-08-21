"use strict";

// Shared input-validation helpers for the V2/Business CRUD services
// (vendorService, customerService, invoiceService, billService). These
// services previously passed request body fields straight into SQL params
// with no validation at the service layer -- the only checks lived in the
// route handlers, and a caller of the service functions directly (a script,
// a future route, a test) got none of that protection. These helpers give
// the service layer its own defense-in-depth validation, mirroring the
// conventions already used elsewhere in this codebase (see
// services/billingInputValidationService.js's BillingValidationError and
// services/recurringTransactionsService.js's RecurringTemplateValidationError).
//
// No database access here -- pure validation/normalization, directly
// testable without a pool.

const { isUuid } = require("../api/utils/v2HttpValidators");
const { normalizeV2Metadata } = require("../api/utils/v2MetadataValidator");

const MAX_NAME_LENGTH = 200;
const MAX_EMAIL_LENGTH = 320;
const MAX_PHONE_LENGTH = 50;
const MAX_DOCUMENT_NUMBER_LENGTH = 100;
// Matches the NUMERIC(14,2) column bound used by invoices/bills/payments in
// db/migrations/20260419_create_v2_business_tables.sql -- 12 digits before
// the decimal point, 2 after.
const MAX_TOTAL_AMOUNT = 999999999999.99;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CURRENCY_RE = /^[A-Za-z]{3}$/;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DOCUMENT_STATUS_VALUES = new Set(["draft", "open", "sent", "partial", "paid", "void"]);

class V2BusinessValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "V2BusinessValidationError";
    this.status = 400;
    this.statusCode = 400;
  }
}

function requireNonEmptyString(value, fieldName, maxLength = MAX_NAME_LENGTH) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new V2BusinessValidationError(`${fieldName} is required.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new V2BusinessValidationError(`${fieldName} must be ${maxLength} characters or fewer.`);
  }
  return trimmed;
}

function optionalString(value, fieldName, maxLength) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw new V2BusinessValidationError(`${fieldName} must be a string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > maxLength) {
    throw new V2BusinessValidationError(`${fieldName} must be ${maxLength} characters or fewer.`);
  }
  return trimmed;
}

function optionalEmail(value, fieldName = "email") {
  const normalized = optionalString(value, fieldName, MAX_EMAIL_LENGTH);
  if (normalized === null) {
    return null;
  }
  if (!EMAIL_RE.test(normalized)) {
    throw new V2BusinessValidationError(`${fieldName} must be a valid email address.`);
  }
  return normalized;
}

// Validates/bounds a JSON-object-shaped field (e.g. vendor/customer
// `address`, invoice/bill `metadata`) using the same size/depth/key rules
// routes already apply to invoice & bill `metadata` via
// api/utils/v2MetadataValidator.js -- reused here so the service layer
// enforces the same bound even if a caller bypasses the route.
function optionalJsonObject(value, fieldName) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = normalizeV2Metadata(value);
  if (!normalized.ok) {
    throw new V2BusinessValidationError(`${fieldName}: ${normalized.error}`);
  }
  return normalized.value;
}

function requireUuid(value, fieldName) {
  if (!isUuid(value)) {
    throw new V2BusinessValidationError(`${fieldName} must be a valid id.`);
  }
  return value;
}

function requireFiniteNonNegativeAmount(value, fieldName = "total_amount") {
  if (value === undefined || value === null || value === "") {
    throw new V2BusinessValidationError(`${fieldName} is required.`);
  }
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) {
    throw new V2BusinessValidationError(`${fieldName} must be a finite number.`);
  }
  if (amount < 0) {
    throw new V2BusinessValidationError(`${fieldName} must not be negative.`);
  }
  if (amount > MAX_TOTAL_AMOUNT) {
    throw new V2BusinessValidationError(`${fieldName} is too large.`);
  }
  return amount;
}

function requireCurrency(value, fieldName = "currency") {
  if (typeof value !== "string" || !CURRENCY_RE.test(value.trim())) {
    throw new V2BusinessValidationError(`${fieldName} must be a 3-letter currency code.`);
  }
  return value.trim();
}

function requireDateOnly(value, fieldName) {
  const str = String(value ?? "").trim();
  if (!DATE_ONLY_RE.test(str)) {
    throw new V2BusinessValidationError(`${fieldName} must be a valid date (YYYY-MM-DD).`);
  }
  return str;
}

function optionalDateOnly(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return requireDateOnly(value, fieldName);
}

function requireDocumentStatus(value, fieldName = "status") {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!DOCUMENT_STATUS_VALUES.has(normalized)) {
    throw new V2BusinessValidationError(
      `${fieldName} must be one of: ${Array.from(DOCUMENT_STATUS_VALUES).join(", ")}.`
    );
  }
  return normalized;
}

function requireDocumentNumber(value, fieldName = "number") {
  return requireNonEmptyString(value, fieldName, MAX_DOCUMENT_NUMBER_LENGTH);
}

module.exports = {
  V2BusinessValidationError,
  DOCUMENT_STATUS_VALUES,
  MAX_NAME_LENGTH,
  MAX_EMAIL_LENGTH,
  MAX_PHONE_LENGTH,
  MAX_DOCUMENT_NUMBER_LENGTH,
  MAX_TOTAL_AMOUNT,
  requireNonEmptyString,
  optionalString,
  optionalEmail,
  optionalJsonObject,
  requireUuid,
  requireFiniteNonNegativeAmount,
  requireCurrency,
  requireDateOnly,
  optionalDateOnly,
  requireDocumentStatus,
  requireDocumentNumber
};
