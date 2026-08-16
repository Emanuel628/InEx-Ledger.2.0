"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ACCOUNT_CATEGORIES,
  normalizeAccountCategory
} = require("../services/accountTypeService.js");

test("ACCOUNT_CATEGORIES is the closed account category set enforced by the database", () => {
  assert.deepEqual(ACCOUNT_CATEGORIES, ["checking", "savings", "credit_card", "cash", "loan", "custom"]);
});

test("normalizeAccountCategory preserves manual account categories", () => {
  for (const category of ACCOUNT_CATEGORIES) {
    assert.equal(normalizeAccountCategory(category), category);
  }
});

test("normalizeAccountCategory maps Plaid account types without losing raw subtype storage", () => {
  assert.equal(normalizeAccountCategory("credit card"), "credit_card");
  assert.equal(normalizeAccountCategory("mortgage"), "loan");
  assert.equal(normalizeAccountCategory("student"), "loan");
  assert.equal(normalizeAccountCategory("money market"), "savings");
  assert.equal(normalizeAccountCategory("depository"), "cash");
  assert.equal(normalizeAccountCategory("brokerage"), "custom");
});

test("normalizeAccountCategory falls back to custom for unknown or empty values", () => {
  assert.equal(normalizeAccountCategory(""), "custom");
  assert.equal(normalizeAccountCategory("crypto_wallet"), "custom");
  assert.equal(normalizeAccountCategory("crypto_wallet", "checking"), "checking");
});
