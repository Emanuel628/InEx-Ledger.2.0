"use strict";

const SCHEDULE_C_LINE_MAP = {
  // Internal category slugs
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
  rent_lease: "Line 20b - Rent or lease (other business property)",
  repairs_maintenance: "Line 21 - Repairs and maintenance",
  vehicle_fuel: "Line 9 - Car and truck expenses (fuel review)",
  vehicle_maintenance: "Line 9 - Car and truck expenses (maintenance review)",
  vehicle_parking_tolls: "Line 9 - Car and truck expenses (parking/tolls review)",
  travel: "Line 24a - Travel",
  meals: "Line 24b - Meals (50% limit review)",
  wages: "Line 26 - Wages",
  taxes_licenses: "Line 23 - Taxes and licenses",
  equipment_capital_asset: "Line 13 - Depreciation and Section 179 review",
  home_office: "Line 30 - Home office (Form 8829) review",
  other_expense: "Line 27a - Other expenses",
  needs_category: null,
  // tax_map_us values from CATEGORY_TAX_OPTIONS (income)
  gross_receipts_sales: "Line 1 - Gross receipts or sales",
  returns_allowances: "Line 2 - Returns and allowances",
  interest_income: "Line 6 - Other income (interest income)",
  other_income: "Line 6 - Other income",
  nonemployee_compensation: "Line 1 - Gross receipts or sales (1099-NEC income)",
  payment_card_income: "Line 1 - Gross receipts or sales (1099-K income)",
  misc_income: "Line 6 - Other income (1099-MISC)",
  cash_unreported_income: "Line 1 - Gross receipts or sales",
  // tax_map_us values from CATEGORY_TAX_OPTIONS (expense)
  car_truck: "Line 9 - Car and truck expenses",
  commissions_fees: "Line 10 - Commissions and fees",
  depletion: "Line 12 - Depletion",
  depreciation_section179: "Line 13 - Depreciation and Section 179 expense",
  employee_benefit_programs: "Line 14 - Employee benefit programs",
  insurance_other_than_health: "Line 15 - Insurance (other than health)",
  interest_mortgage: "Line 16a - Mortgage interest (paid to banks)",
  interest_other: "Line 16b - Other interest",
  legal_professional: "Line 17 - Legal and professional services",
  pension_profit_sharing: "Line 19 - Pension and profit-sharing plans",
  rent_lease_vehicles: "Line 20a - Rent or lease (vehicles, machinery, equipment)",
  rent_lease_other: "Line 20b - Rent or lease (other business property)",
  supplies: "Line 22 - Supplies",
  taxes_and_licenses: "Line 23 - Taxes and licenses"
};

const T2125_LINE_MAP = {
  // Internal category slugs
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
  phone_internet: "Line 9270 - Other expenses (telephone and internet — allocation review)",
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
  needs_category: null,
  // tax_map_ca values from CATEGORY_TAX_OPTIONS (income)
  sales: "Line 8000 - Gross business income",
  gst_hst_collected: "Line 8000 - Gross business income (GST/HST collected — report gross revenue)",
  subsidies_grants: "Line 8230 - Other income (subsidies, grants, rebates)",
  other_income: "Line 8230 - Other income",
  t4a_20: "T4A Box 20 - Self-employment commissions (include in Line 8000 gross)",
  t4a_28: "T4A Box 28 - Other income (T4A)",
  cash_income: "Line 8000 - Gross business income",
  // tax_map_ca values from CATEGORY_TAX_OPTIONS (expense)
  meals_entertainment: "Line 8523 - Meals and entertainment (50% limit review)",
  delivery_freight: "Line 8870 - Delivery, freight and express",
  insurance: "Line 8690 - Insurance",
  interest_bank_charges: "Line 8710 - Interest and bank charges",
  legal_accounting_ca: "Line 8860 - Legal, accounting, and professional fees",
  business_tax_fees_licenses_memberships: "Line 8760 - Business taxes, fees, and licences",
  property_taxes: "Line 8760 - Business taxes, fees, and licences (property taxes)",
  salaries_wages_benefits: "Line 9060 - Salaries, wages, and benefits",
  rent: "Line 8912 - Rent",
  maintenance_repairs: "Line 8960 - Repairs and maintenance",
  motor_vehicle: "Line 9281 - Motor vehicle expenses",
  gst_hst_paid: "Line 9270 - Other expenses (GST/HST paid — verify ITC claim separately)"
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

const NORMALIZED_TAX_MAP_ALIASES = {
  gross_receipts_or_sales: "sales_revenue",
  gross_receipts_sales: "gross_receipts_sales",
  gross_business_income: "sales_revenue",
  other_income: "other_income",
  returns_and_allowances: "refunds_reimbursements",
  returns_allowances: "returns_allowances",
  refund_reimbursement_review: "refunds_reimbursements",
  advertising: "advertising",
  office_expense: "office_expense",
  supplies: "business_supplies",
  legal_and_professional_services: "legal_accounting",
  legal_professional: "legal_professional",
  legal_accounting_and_professional_fees: "legal_accounting",
  insurance_other_than_health: "insurance_other_than_health",
  insurance: "insurance",
  car_and_truck_expenses: "vehicle_fuel",
  car_truck: "car_truck",
  motor_vehicle_expenses: "vehicle_fuel",
  motor_vehicle: "motor_vehicle",
  taxes_and_licenses: "taxes_licenses",
  business_taxes_fees_and_licences: "taxes_licenses",
  business_tax_fees_licenses_memberships: "business_tax_fees_licenses_memberships",
  utilities: "utilities",
  telephone_and_utilities: "phone_internet",
  phone_and_internet: "phone_internet",
  rent: "rent",
  rent_lease: "rent_lease",
  repairs_and_maintenance: "repairs_maintenance",
  maintenance_repairs: "maintenance_repairs",
  travel_expenses: "travel",
  travel: "travel",
  meals: "meals",
  meals_and_entertainment: "meals",
  meals_entertainment: "meals_entertainment",
  wages: "wages",
  salaries_wages_and_benefits: "wages",
  salaries_wages_benefits: "salaries_wages_benefits",
  depreciation: "equipment_capital_asset",
  depreciation_section179: "depreciation_section179",
  capital_cost_allowance_review: "equipment_capital_asset",
  business_use_of_home: "home_office",
  home_office: "home_office",
  other_expenses: "other_expense",
  interest_and_bank_charges: "bank_fees",
  interest_bank_charges: "interest_bank_charges",
  delivery_freight: "delivery_freight",
  property_taxes: "property_taxes",
  nonemployee_compensation: "nonemployee_compensation",
  payment_card_income: "payment_card_income",
  misc_income: "misc_income",
  cash_unreported_income: "cash_unreported_income",
  cash_income: "cash_income",
  gst_hst_collected: "gst_hst_collected",
  gst_hst_paid: "gst_hst_paid",
  subsidies_grants: "subsidies_grants",
  t4a_20: "t4a_20",
  t4a_28: "t4a_28",
  sales: "sales",
  interest_income: "interest_income",
  interest_mortgage: "interest_mortgage",
  interest_other: "interest_other",
  commissions_fees: "commissions_fees",
  depletion: "depletion",
  employee_benefit_programs: "employee_benefit_programs",
  pension_profit_sharing: "pension_profit_sharing",
  rent_lease_vehicles: "rent_lease_vehicles",
  rent_lease_other: "rent_lease_other"
};

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
    const normalizedKey = normalizeTaxMapKey(direct);
    const aliasKey = NORMALIZED_TAX_MAP_ALIASES[normalizedKey] || normalizedKey;
    if (map[aliasKey]) return map[aliasKey];
    return direct
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b[a-z]/g, (char) => char.toUpperCase());
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
