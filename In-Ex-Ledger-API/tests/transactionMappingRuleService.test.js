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

  assert.deepEqual(
    rules.map((rule) => [rule.matchField, rule.matchValueNormalized, rule.categoryId]),
    [
      ["merchant_name", "openai", "cat-soft"],
      ["category_guess", "internet software", "cat-soft"],
      ["description", "openai api may", "cat-soft"]
    ]
  );
});
