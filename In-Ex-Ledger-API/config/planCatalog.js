"use strict";

// Canonical source of truth for Basic/Pro plan entitlements. Every other
// module (subscriptionService, basicPlanUsageService, entitlements routes,
// requirePlanFeature middleware, the React plan provider) reads from this
// catalog instead of hardcoding feature lists or limits of its own.
//
// Internal database plan codes are kept for backward compatibility -- do not
// rename them without a migration:
//   free     = Basic
//   v1       = Pro
//   business = reserved for a future tier; inherits Pro's feature set today.

const PLAN_CODES = {
  BASIC: "free",
  PRO: "v1",
  BUSINESS: "business"
};

const SUBSCRIPTION_STATUS_VALUES = [
  "free",
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "paused"
];

const PLAN_NAMES = {
  [PLAN_CODES.BASIC]: "Basic",
  [PLAN_CODES.PRO]: "Pro",
  [PLAN_CODES.BUSINESS]: "Pro"
};

const FEATURE_KEYS = {
  TRANSACTIONS: "transactions",
  RECEIPTS: "receipts",
  CSV_IMPORTS: "csv_imports",
  ACCOUNTS: "accounts",
  CATEGORIES: "categories",
  MILEAGE: "mileage",
  INVOICES: "invoices",
  BASIC_ANALYTICS: "basic_analytics",
  BASIC_CSV_EXPORT: "basic_csv_export",
  RECURRING_TRANSACTIONS: "recurring_transactions",
  TAX_ESTIMATES: "tax_estimates",
  PDF_EXPORTS: "pdf_exports",
  ADVANCED_EXPORTS: "advanced_exports",
  EXPORT_HISTORY: "export_history",
  EDGE_CASE_TOOLS: "edge_case_tools",
  ADDITIONAL_BUSINESSES: "additional_businesses"
};

const ALL_FEATURE_KEYS = new Set(Object.values(FEATURE_KEYS));

// Plain-language labels for the "X requires Pro" style API/UI messages.
const FEATURE_LABELS = {
  [FEATURE_KEYS.TRANSACTIONS]: "Transactions",
  [FEATURE_KEYS.RECEIPTS]: "Receipt uploads",
  [FEATURE_KEYS.CSV_IMPORTS]: "CSV imports",
  [FEATURE_KEYS.ACCOUNTS]: "Accounts",
  [FEATURE_KEYS.CATEGORIES]: "Categories",
  [FEATURE_KEYS.MILEAGE]: "Mileage tracking",
  [FEATURE_KEYS.INVOICES]: "Invoicing",
  [FEATURE_KEYS.BASIC_ANALYTICS]: "Analytics",
  [FEATURE_KEYS.BASIC_CSV_EXPORT]: "CSV export",
  [FEATURE_KEYS.RECURRING_TRANSACTIONS]: "Recurring transactions",
  [FEATURE_KEYS.TAX_ESTIMATES]: "Tax estimates",
  [FEATURE_KEYS.PDF_EXPORTS]: "PDF exports",
  [FEATURE_KEYS.ADVANCED_EXPORTS]: "Advanced exports",
  [FEATURE_KEYS.EXPORT_HISTORY]: "Export history",
  [FEATURE_KEYS.EDGE_CASE_TOOLS]: "Advanced tools",
  [FEATURE_KEYS.ADDITIONAL_BUSINESSES]: "Additional businesses"
};

// Every plan must explicitly list every known feature -- no default-allow.
const PLAN_FEATURES = {
  [PLAN_CODES.BASIC]: {
    [FEATURE_KEYS.TRANSACTIONS]: true,
    [FEATURE_KEYS.RECEIPTS]: true,
    [FEATURE_KEYS.CSV_IMPORTS]: true,
    [FEATURE_KEYS.ACCOUNTS]: true,
    [FEATURE_KEYS.CATEGORIES]: true,
    [FEATURE_KEYS.MILEAGE]: true,
    [FEATURE_KEYS.INVOICES]: true,
    [FEATURE_KEYS.BASIC_ANALYTICS]: true,
    [FEATURE_KEYS.BASIC_CSV_EXPORT]: true,
    [FEATURE_KEYS.RECURRING_TRANSACTIONS]: false,
    [FEATURE_KEYS.TAX_ESTIMATES]: false,
    [FEATURE_KEYS.PDF_EXPORTS]: false,
    [FEATURE_KEYS.ADVANCED_EXPORTS]: false,
    [FEATURE_KEYS.EXPORT_HISTORY]: false,
    [FEATURE_KEYS.EDGE_CASE_TOOLS]: false,
    [FEATURE_KEYS.ADDITIONAL_BUSINESSES]: false
  },
  [PLAN_CODES.PRO]: {
    [FEATURE_KEYS.TRANSACTIONS]: true,
    [FEATURE_KEYS.RECEIPTS]: true,
    [FEATURE_KEYS.CSV_IMPORTS]: true,
    [FEATURE_KEYS.ACCOUNTS]: true,
    [FEATURE_KEYS.CATEGORIES]: true,
    [FEATURE_KEYS.MILEAGE]: true,
    [FEATURE_KEYS.INVOICES]: true,
    [FEATURE_KEYS.BASIC_ANALYTICS]: true,
    [FEATURE_KEYS.BASIC_CSV_EXPORT]: true,
    [FEATURE_KEYS.RECURRING_TRANSACTIONS]: true,
    [FEATURE_KEYS.TAX_ESTIMATES]: true,
    [FEATURE_KEYS.PDF_EXPORTS]: true,
    [FEATURE_KEYS.ADVANCED_EXPORTS]: true,
    [FEATURE_KEYS.EXPORT_HISTORY]: true,
    [FEATURE_KEYS.EDGE_CASE_TOOLS]: true,
    [FEATURE_KEYS.ADDITIONAL_BUSINESSES]: true
  }
};
// business currently inherits Pro's feature set in full.
PLAN_FEATURES[PLAN_CODES.BUSINESS] = { ...PLAN_FEATURES[PLAN_CODES.PRO] };

// Metered Basic-tier limits, reset on the UTC calendar month boundary.
// Pro/Business are not subject to these at all (limit: null == no cap).
const PLAN_LIMITS = {
  [PLAN_CODES.BASIC]: {
    transactions: 50,
    receipts: 25
  },
  [PLAN_CODES.PRO]: {
    transactions: null,
    receipts: null
  }
};
PLAN_LIMITS[PLAN_CODES.BUSINESS] = { ...PLAN_LIMITS[PLAN_CODES.PRO] };

function normalizePlanCode(code) {
  return code === PLAN_CODES.PRO || code === PLAN_CODES.BUSINESS ? code : PLAN_CODES.BASIC;
}

function getPlanDefinition(planCode) {
  const normalized = normalizePlanCode(planCode);
  return {
    code: normalized,
    name: PLAN_NAMES[normalized],
    features: { ...PLAN_FEATURES[normalized] },
    limits: { ...PLAN_LIMITS[normalized] }
  };
}

/**
 * Looks up whether `planCode` has `featureKey`. Unknown feature keys fail
 * closed (return false) rather than defaulting to allowed, and are logged so
 * a typo'd or newly-added feature key doesn't silently grant free access.
 */
function planHasFeature(planCode, featureKey) {
  if (!ALL_FEATURE_KEYS.has(featureKey)) {
    const message = `[planCatalog] Unknown feature key "${featureKey}" checked -- treating as unavailable. Add it to FEATURE_KEYS and every plan's feature map.`;
    if (process.env.NODE_ENV !== "production") {
      throw new Error(message);
    }
    // eslint-disable-next-line no-console
    console.error(message);
    return false;
  }
  const definition = getPlanDefinition(planCode);
  return definition.features[featureKey] === true;
}

function getPlanLimit(planCode, limitKey) {
  const definition = getPlanDefinition(planCode);
  return Object.prototype.hasOwnProperty.call(definition.limits, limitKey)
    ? definition.limits[limitKey]
    : null;
}

module.exports = {
  PLAN_CODES,
  PLAN_NAMES,
  SUBSCRIPTION_STATUS_VALUES,
  FEATURE_KEYS,
  FEATURE_LABELS,
  ALL_FEATURE_KEYS,
  PLAN_FEATURES,
  PLAN_LIMITS,
  normalizePlanCode,
  getPlanDefinition,
  planHasFeature,
  getPlanLimit
};
