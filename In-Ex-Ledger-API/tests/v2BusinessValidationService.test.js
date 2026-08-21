"use strict";

/**
 * Unit coverage for services/v2BusinessValidationService.js -- the shared
 * validation helpers added for the V2/Business CRUD services (vendors,
 * customers, invoices, bills). Pure functions, no database involved.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  V2BusinessValidationError,
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
} = require("../services/v2BusinessValidationService");

function assertsAs400ValidationError(fn) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof V2BusinessValidationError);
    assert.equal(err.status, 400);
    assert.equal(err.statusCode, 400);
    return true;
  });
}

test("requireNonEmptyString rejects missing/blank values", () => {
  assertsAs400ValidationError(() => requireNonEmptyString(undefined, "name"));
  assertsAs400ValidationError(() => requireNonEmptyString(null, "name"));
  assertsAs400ValidationError(() => requireNonEmptyString("   ", "name"));
  assertsAs400ValidationError(() => requireNonEmptyString(42, "name"));
});

test("requireNonEmptyString rejects oversized strings and accepts trimmed valid ones", () => {
  assertsAs400ValidationError(() => requireNonEmptyString("a".repeat(300), "name", 200));
  assert.equal(requireNonEmptyString("  Acme Supplies  ", "name", 200), "Acme Supplies");
});

test("optionalString allows null/empty but rejects non-strings and oversized values", () => {
  assert.equal(optionalString(undefined, "phone", 50), null);
  assert.equal(optionalString(null, "phone", 50), null);
  assert.equal(optionalString("", "phone", 50), null);
  assertsAs400ValidationError(() => optionalString(12345, "phone", 50));
  assertsAs400ValidationError(() => optionalString("5".repeat(60), "phone", 50));
  assert.equal(optionalString(" 555-1234 ", "phone", 50), "555-1234");
});

test("optionalEmail rejects malformed addresses and accepts valid ones", () => {
  assertsAs400ValidationError(() => optionalEmail("not-an-email"));
  assertsAs400ValidationError(() => optionalEmail("missing-domain@"));
  assert.equal(optionalEmail(null), null);
  assert.equal(optionalEmail("owner@example.com"), "owner@example.com");
});

test("optionalJsonObject enforces the same bounds as the metadata validator", () => {
  assert.equal(optionalJsonObject(null, "address"), null);
  assertsAs400ValidationError(() => optionalJsonObject("not-an-object", "address"));
  assertsAs400ValidationError(() => optionalJsonObject({ street: "x".repeat(600) }, "address"));
  assert.deepEqual(optionalJsonObject({ city: "Toronto" }, "address"), { city: "Toronto" });
});

test("requireUuid rejects non-uuid strings", () => {
  assertsAs400ValidationError(() => requireUuid("not-a-uuid", "customer_id"));
  assertsAs400ValidationError(() => requireUuid(undefined, "customer_id"));
  assert.equal(
    requireUuid("00000000-0000-4000-8000-000000000251", "customer_id"),
    "00000000-0000-4000-8000-000000000251"
  );
});

test("requireFiniteNonNegativeAmount rejects negative, non-finite, and missing amounts", () => {
  assertsAs400ValidationError(() => requireFiniteNonNegativeAmount(-1));
  assertsAs400ValidationError(() => requireFiniteNonNegativeAmount(NaN));
  assertsAs400ValidationError(() => requireFiniteNonNegativeAmount(Infinity));
  assertsAs400ValidationError(() => requireFiniteNonNegativeAmount(undefined));
  assertsAs400ValidationError(() => requireFiniteNonNegativeAmount("not-a-number"));
  assertsAs400ValidationError(() => requireFiniteNonNegativeAmount(1e15));
});

test("requireFiniteNonNegativeAmount accepts zero and positive finite amounts", () => {
  assert.equal(requireFiniteNonNegativeAmount(0), 0);
  assert.equal(requireFiniteNonNegativeAmount(500.5), 500.5);
  assert.equal(requireFiniteNonNegativeAmount("250.00"), 250);
});

test("requireCurrency rejects anything that isn't a 3-letter code", () => {
  assertsAs400ValidationError(() => requireCurrency("us"));
  assertsAs400ValidationError(() => requireCurrency("usdollar"));
  assertsAs400ValidationError(() => requireCurrency(123));
  assert.equal(requireCurrency("usd"), "usd");
  assert.equal(requireCurrency("CAD"), "CAD");
});

test("requireDateOnly/optionalDateOnly enforce YYYY-MM-DD", () => {
  assertsAs400ValidationError(() => requireDateOnly("04/20/2026", "issue_date"));
  assertsAs400ValidationError(() => requireDateOnly("", "issue_date"));
  assert.equal(requireDateOnly("2026-04-20", "issue_date"), "2026-04-20");
  assert.equal(optionalDateOnly(undefined, "due_date"), null);
  assertsAs400ValidationError(() => optionalDateOnly("not-a-date", "due_date"));
});

test("requireDocumentStatus only allows the known status set", () => {
  assertsAs400ValidationError(() => requireDocumentStatus("cancelled"));
  assertsAs400ValidationError(() => requireDocumentStatus(undefined));
  assert.equal(requireDocumentStatus("DRAFT"), "draft");
  assert.equal(requireDocumentStatus(" paid "), "paid");
});

test("requireDocumentNumber rejects blank/oversized values", () => {
  assertsAs400ValidationError(() => requireDocumentNumber(""));
  assertsAs400ValidationError(() => requireDocumentNumber("N".repeat(150)));
  assert.equal(requireDocumentNumber(" INV-1001 "), "INV-1001");
});
