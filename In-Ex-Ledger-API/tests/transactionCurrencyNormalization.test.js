"use strict";

require("./helpers/testPool.js");

const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeCurrencyCode } = require("../routes/transactions.routes.js").__private;

test("normalizeCurrencyCode accepts a real ISO-4217 currency code in any case", () => {
  assert.equal(normalizeCurrencyCode("usd", "USD"), "USD");
  assert.equal(normalizeCurrencyCode("Cad", "USD"), "CAD");
  assert.equal(normalizeCurrencyCode("EUR", "USD"), "EUR");
  assert.equal(normalizeCurrencyCode("jpy", "USD"), "JPY");
});

test("normalizeCurrencyCode falls back for a missing value", () => {
  assert.equal(normalizeCurrencyCode(undefined, "USD"), "USD");
  assert.equal(normalizeCurrencyCode(null, "CAD"), "CAD");
  assert.equal(normalizeCurrencyCode("", "USD"), "USD");
  assert.equal(normalizeCurrencyCode("   ", "USD"), "USD");
});

test("normalizeCurrencyCode falls back for a syntactically 3-letter code that isn't a real currency", () => {
  // Regression: the old check was a bare /^[A-Z]{3}$/ regex, which let
  // nonexistent codes like "ZZZ" or "ABC" through unchanged instead of
  // falling back to the business's real currency.
  assert.equal(normalizeCurrencyCode("ZZZ", "USD"), "USD");
  assert.equal(normalizeCurrencyCode("ABC", "CAD"), "CAD");
  assert.equal(normalizeCurrencyCode("XXX", "USD"), "USD");
});

test("normalizeCurrencyCode falls back for non-3-letter or non-alphabetic input", () => {
  assert.equal(normalizeCurrencyCode("US", "USD"), "USD");
  assert.equal(normalizeCurrencyCode("USDD", "USD"), "USD");
  assert.equal(normalizeCurrencyCode("123", "USD"), "USD");
  assert.equal(normalizeCurrencyCode("<script>", "USD"), "USD");
});
