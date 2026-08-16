"use strict";

const ACCOUNT_CATEGORIES = Object.freeze(["checking", "savings", "credit_card", "cash", "loan", "custom"]);
const ACCOUNT_CATEGORY_SET = new Set(ACCOUNT_CATEGORIES);

const CREDIT_VALUES = new Set(["credit", "credit card", "credit_card", "paypal"]);
const LOAN_VALUES = new Set(["loan", "mortgage", "student", "auto", "commercial", "construction"]);
const SAVINGS_VALUES = new Set(["savings", "money market", "cd"]);
const CASH_VALUES = new Set(["cash", "depository", "prepaid"]);

function normalizeAccountCategory(value, fallback = "custom") {
  const normalized = String(value || "").trim().toLowerCase().replace(/-/g, "_");
  if (ACCOUNT_CATEGORY_SET.has(normalized)) {
    return normalized;
  }
  if (CREDIT_VALUES.has(normalized)) {
    return "credit_card";
  }
  if (LOAN_VALUES.has(normalized)) {
    return "loan";
  }
  if (SAVINGS_VALUES.has(normalized)) {
    return "savings";
  }
  if (CASH_VALUES.has(normalized)) {
    return "cash";
  }
  return ACCOUNT_CATEGORY_SET.has(fallback) ? fallback : "custom";
}

module.exports = {
  ACCOUNT_CATEGORIES,
  normalizeAccountCategory
};
