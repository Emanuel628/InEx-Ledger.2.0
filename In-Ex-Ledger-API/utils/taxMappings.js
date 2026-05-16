"use strict";

const CATEGORY_TAX_OPTIONS = {
  US: {
    income: [
      "gross_receipts_sales",
      "returns_allowances",
      "interest_income",
      "other_income",
      "nonemployee_compensation",
      "payment_card_income",
      "misc_income",
      "cash_unreported_income"
    ],
    expense: [
      "advertising",
      "car_truck",
      "commissions_fees",
      "contract_labor",
      "depletion",
      "depreciation_section179",
      "employee_benefit_programs",
      "insurance_other_than_health",
      "interest_mortgage",
      "interest_other",
      "legal_professional",
      "office_expense",
      "pension_profit_sharing",
      "rent_lease_vehicles",
      "rent_lease_other",
      "repairs_maintenance",
      "supplies",
      "taxes_licenses",
      "travel",
      "meals",
      "utilities",
      "wages",
      "home_office",
      "bank_fees",
      "software_subscriptions",
      "other_expense"
    ]
  },
  CA: {
    income: [
      "sales",
      "gst_hst_collected",
      "subsidies_grants",
      "other_income",
      "t4a_20",
      "t4a_28",
      "cash_income"
    ],
    expense: [
      "advertising",
      "meals_entertainment",
      "delivery_freight",
      "insurance",
      "interest_bank_charges",
      "legal_accounting",
      "office_expense",
      "business_tax_fees_licenses_memberships",
      "property_taxes",
      "salaries_wages_benefits",
      "rent",
      "maintenance_repairs",
      "utilities",
      "travel",
      "motor_vehicle",
      "home_office",
      "gst_hst_paid",
      "other_expense"
    ]
  }
};

const LEGACY_TAX_VALUE_LABELS = [
  "t2125_8000",
  "t2125_8290",
  "ca_8810",
  "ca_8820",
  "ca_8860",
  "ca_8871",
  "ca_8910",
  "ca_8960",
  "ca_9060",
  "ca_9130",
  "ca_9140",
  "ca_9180",
  "ca_9200",
  "ca_9220",
  "ca_9270",
  "ca_9281",
  "ca_9936",
  "ca_9943"
];

const VALID_US_TAX_MAPS = new Set([
  ...CATEGORY_TAX_OPTIONS.US.income,
  ...CATEGORY_TAX_OPTIONS.US.expense
]);

const VALID_CA_TAX_MAPS = new Set([
  ...CATEGORY_TAX_OPTIONS.CA.income,
  ...CATEGORY_TAX_OPTIONS.CA.expense,
  ...LEGACY_TAX_VALUE_LABELS
]);

function normalizeCategoryTaxMap(value, region) {
  if (value === undefined) {
    return { valid: true, value: undefined };
  }

  if (value === null) {
    return { valid: true, value: null };
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return { valid: true, value: null };
  }

  const allowed = String(region || "").toUpperCase() === "CA"
    ? VALID_CA_TAX_MAPS
    : VALID_US_TAX_MAPS;

  if (!allowed.has(normalized)) {
    return {
      valid: false,
      error: `Invalid ${String(region || "").toUpperCase() === "CA" ? "tax_map_ca" : "tax_map_us"} value.`
    };
  }

  return { valid: true, value: normalized };
}

module.exports = {
  normalizeCategoryTaxMap,
  VALID_US_TAX_MAPS,
  VALID_CA_TAX_MAPS
};
