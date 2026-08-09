"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeRuleValue,
  buildCandidateRulesFromTransaction
} = require("../services/transactionMappingRuleService.js");

test("normalizeRuleValue canonicalizes merchant/category strings for durable matching", () => {
  assert.equal(normalizeRuleValue("OPENAI, INC. #1234"), "openai inc 1234");
  assert.equal(normalizeRuleValue(" FOOD_AND_DRINK_FAST_FOOD "), "food and drink fast food");
});

test("buildCandidateRulesFromTransaction generates usable rule candidates from imported review outcomes", () => {
  const rules = buildCandidateRulesFromTransaction(
    {
      type: "expense",
      merchant_name: "OpenAI",
      category_guess: "INTERNET_SOFTWARE",
      description: "OPENAI API MAY"
    },
    {
      categoryId: "cat-soft",
      userId: "user-1"
    }
  );

  // category_guess is deliberately never learned -- it's the bank/Plaid raw
  // guess field, not something the merchant chose, so a rule keyed to its
  // text would silently reapply this one edit to any unrelated merchant that
  // happens to share the same raw bank guess.
  assert.deepEqual(
    rules.map((rule) => [rule.matchField, rule.matchValueNormalized, rule.categoryId]),
    [
      ["merchant_name", "openai", "cat-soft"],
      ["description", "openai api may", "cat-soft"]
    ]
  );
});

test("buildCandidateRulesFromTransaction never learns a rule for an ambiguous multi-product retailer", () => {
  const rules = buildCandidateRulesFromTransaction(
    {
      type: "expense",
      merchant_name: "Walmart Supercenter",
      category_guess: "GENERAL_MERCHANDISE",
      description: "WAL-MART #1234 GROCERY"
    },
    {
      categoryId: "cat-office",
      userId: "user-1"
    }
  );

  assert.deepEqual(rules, []);
});

test("buildCandidateRulesFromTransaction still learns a fuel-qualified ambiguous-retailer purchase", () => {
  const rules = buildCandidateRulesFromTransaction(
    {
      type: "expense",
      merchant_name: "Costco Gas",
      description: "COSTCO GAS #1234"
    },
    {
      categoryId: "cat-car",
      userId: "user-1"
    }
  );

  assert.equal(rules.length, 2);
  assert.equal(rules[0].matchField, "merchant_name");
});
