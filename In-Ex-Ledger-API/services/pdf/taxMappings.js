"use strict";

const SCHEDULE_C_LINE_MAP = {
  sales_revenue: "Line 1 - Gross receipts or sales",
  service_revenue: "Line 1 - Gross receipts or sales",
  other_business_income: "Line 6 - Other income",
  refunds_reimbursements: "Line 2 - Returns and allowances review",
  advertising: "Line 8 - Advertising",
  software_subscriptions: "Line 27a - Other expenses (software/subscriptions)",
  web_hosting_domain: "Line 27a - Other expenses (web hosting/domain)",
  merchant_fees: "Line 27a - Other expenses (merchant/platform fees)",
  bank_fees: "Line 27a - Other expenses (bank fees)",
  office_expense: "Line 18 - Office expense",
  office_supplies: "Line 18 - Office expense",
  business_supplies: "Line 22 - Supplies",
  materials_ingredients: "Line 22 - Supplies (materials/ingredients)",
  inventory_cogs: "Line 4 - Cost of goods sold",
  packaging: "Line 22 - Supplies (packaging)",
  professional_fees: "Line 17 - Legal and professional services",
  legal_accounting: "Line 17 - Legal and professional services",
  contract_labor: "Line 11 - Contract labor",
  insurance_business: "Line 15 - Insurance (other than health)",
  insurance_vehicle: "Line 9 - Car and truck expenses (insurance review)",
  phone_internet: "Line 25/27a - Phone and internet allocation review",
  utilities: "Line 25 - Utilities",
  rent_lease: "Line 20b - Rent/lease (other property)",
  repairs_maintenance: "Line 21 - Repairs and maintenance",
  vehicle_fuel: "Line 9 - Car and truck expenses (fuel review)",
  vehicle_maintenance: "Line 9 - Car and truck expenses (maintenance review)",
  vehicle_parking_tolls: "Line 9 - Car and truck expenses (parking/tolls review)",
  travel: "Line 24a - Travel",
  meals: "Line 24b - Meals (50% limit review)",
  wages: "Line 26 - Wages",
  taxes_licenses: "Line 23 - Taxes and licenses",
  equipment_capital_asset: "Line 13 - Depreciation / Section 179 review",
  home_office: "Line 30 - Home office review",
  other_expense: "Line 27a - Other expenses",
  needs_category: null
};

const T2125_LINE_MAP = {
  sales_revenue: "Line 8000 - Gross business income",
  service_revenue: "Line 8000 - Gross business income",
  other_business_income: "Line 8230 - Other income",
  refunds_reimbursements: "Line 8230 - Refund/reimbursement review",
  advertising: "Line 8520 - Advertising",
  software_subscriptions: "Line 8810 - Office expenses (software/subscriptions)",
  web_hosting_domain: "Line 8810 - Office expenses (web hosting/domain)",
  merchant_fees: "Line 9270 - Other expenses (merchant/platform fees)",
  bank_fees: "Line 8710 - Interest and bank charges",
  office_expense: "Line 8810 - Office expenses",
  office_supplies: "Line 8810 - Office expenses",
  business_supplies: "Line 8811 - Supplies",
  materials_ingredients: "Line 8811 - Supplies (materials/ingredients)",
  inventory_cogs: "Cost of goods sold / Purchases for resale",
  packaging: "Line 8811 - Supplies (packaging)",
  professional_fees: "Line 8860 - Legal, accounting, and professional fees",
  legal_accounting: "Line 8860 - Legal, accounting, and professional fees",
  contract_labor: "Line 9270 - Other expenses (subcontractors)",
  insurance_business: "Line 8690 - Insurance",
  insurance_vehicle: "Line 9281 - Motor vehicle expenses (insurance review)",
  phone_internet: "Line 9270 - Telephone and utilities allocation review",
  utilities: "Line 9220 - Utilities",
  rent_lease: "Line 8912 - Rent",
  repairs_maintenance: "Line 8960 - Repairs and maintenance",
  vehicle_fuel: "Line 9281 - Motor vehicle expenses (fuel review)",
  vehicle_maintenance: "Line 9281 - Motor vehicle expenses (maintenance review)",
  vehicle_parking_tolls: "Line 9281 - Motor vehicle expenses (parking/tolls review)",
  travel: "Line 9200 - Travel expenses",
  meals: "Line 8523 - Meals and entertainment (50% limit review)",
  wages: "Line 9060 - Salaries, wages, and benefits",
  taxes_licenses: "Line 8760 - Business taxes, fees, and licences",
  equipment_capital_asset: "Line 9936 - Capital cost allowance review",
  home_office: "Line 9945 - Business-use-of-home review",
  other_expense: "Line 9270 - Other expenses",
  needs_category: null
};

const CATEGORY_NAME_HINTS = [
  [/^sales|gross receipts|revenue|income$/i, "sales_revenue"],
  [/service/i, "service_revenue"],
  [/refund|reimburse/i, "refunds_reimbursements"],
  [/advertis|marketing/i, "advertising"],
  [/software|subscription|saas/i, "software_subscriptions"],
  [/hosting|domain|website/i, "web_hosting_domain"],
  [/merchant|stripe fee|processing fee|platform fee/i, "merchant_fees"],
  [/bank fee|service charge/i, "bank_fees"],
  [/office expense/i, "office_expense"],
  [/office supplies?/i, "office_supplies"],
  [/supplies?/i, "business_supplies"],
  [/materials?|ingredients?/i, "materials_ingredients"],
  [/inventory|cogs|cost of goods/i, "inventory_cogs"],
  [/packaging/i, "packaging"],
  [/legal|accounting/i, "legal_accounting"],
  [/professional/i, "professional_fees"],
  [/contract labor|subcontract/i, "contract_labor"],
  [/vehicle insurance|auto insurance/i, "insurance_vehicle"],
  [/insurance/i, "insurance_business"],
  [/phone|internet|telephone/i, "phone_internet"],
  [/utilities?|electric|water|heat/i, "utilities"],
  [/rent|lease/i, "rent_lease"],
  [/repair|maintenance/i, "repairs_maintenance"],
  [/fuel|gas/i, "vehicle_fuel"],
  [/parking|toll/i, "vehicle_parking_tolls"],
  [/travel|airfare|hotel|lodging/i, "travel"],
  [/meal|food|dining|restaurant/i, "meals"],
  [/wages?|payroll/i, "wages"],
  [/tax|license|licence|permit/i, "taxes_licenses"],
  [/equipment|asset|computer|machinery|camera|furniture/i, "equipment_capital_asset"],
  [/home office|business use of home/i, "home_office"],
  [/imported expense|imported income|uncategorized/i, "needs_category"]
];

function normalizeRegionCode(region) {
  return String(region || "").toUpperCase() === "CA" ? "CA" : "US";
}

function getLineMap(region) {
  return normalizeRegionCode(region) === "CA" ? T2125_LINE_MAP : SCHEDULE_C_LINE_MAP;
}

function normalizeTaxMapKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\/()-]+/g, " ")
    .replace(/\s+/g, "_");
}

function resolveCategorySlugFromName(name) {
  const text = String(name || "").trim();
  if (!text) return null;
  for (const [pattern, slug] of CATEGORY_NAME_HINTS) {
    if (pattern.test(text)) return slug;
  }
  return null;
}

function resolveTaxLineFromCategory({ categorySlug, category, region }) {
  const taxKey = normalizeRegionCode(region) === "CA" ? "tax_map_ca" : "tax_map_us";
  const direct = String(category?.[taxKey] || category?.taxLabel || category?.tax_label || "").trim();
  if (direct) {
    if (/^line\s+\d|^cost of goods/i.test(direct.toLowerCase())) return direct;
    const map = getLineMap(region);
    return map[normalizeTaxMapKey(direct)] || direct;
  }
  const map = getLineMap(region);
  return map[categorySlug] || null;
}

function getTaxMappingRules() {
  return {
    jurisdiction_maps: {
      US: SCHEDULE_C_LINE_MAP,
      CA: T2125_LINE_MAP
    },
    category_name_hints: CATEGORY_NAME_HINTS.map(([pattern, slug]) => ({
      pattern: pattern.source,
      flags: pattern.flags,
      category: slug
    }))
  };
}

module.exports = {
  SCHEDULE_C_LINE_MAP,
  T2125_LINE_MAP,
  normalizeRegionCode,
  getLineMap,
  normalizeTaxMapKey,
  resolveCategorySlugFromName,
  resolveTaxLineFromCategory,
  getTaxMappingRules
};
