"use strict";

const { pool } = require("../db.js");

// US simplified method: $5 per square foot, capped at 300 sq ft (IRS Rev. Proc. 2013-13).
const SIMPLIFIED_RATE_PER_SQFT = 5;
const SIMPLIFIED_MAX_SQFT = 300;
const HOME_OFFICE_NAME_PATTERN = /home office|business[- ]use[- ]of[- ]home|work[- ]space[- ]in[- ]home/i;
const HOME_OFFICE_ELIGIBLE_NAME_PATTERNS = [
  HOME_OFFICE_NAME_PATTERN,
  /^rent$/i,
  /^utilities?$/i,
  /^insurance$/i,
  /^property taxes?$/i,
  /^repairs? ?& ?maintenance$/i,
  /^phone ?& ?internet$/i,
  /^mortgage interest$/i
];
const HOME_OFFICE_ELIGIBLE_TAX_MAPS = {
  US: new Set([
    "home_office",
    "rent_lease_other",
    "utilities",
    "insurance_other_than_health",
    "repairs_maintenance",
    "interest_mortgage"
  ]),
  CA: new Set([
    "home_office",
    "rent",
    "utilities",
    "insurance",
    "property_taxes",
    "maintenance_repairs"
  ])
};

function round2(value) {
  return Number((Number(value) || 0).toFixed(2));
}

function normalizeRegion(region) {
  return String(region || "").trim().toUpperCase() === "CA" ? "CA" : "US";
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value));
}

// Pure deduction math so it is easy to unit-test and reason about.
function computeHomeOfficeDeduction(input = {}) {
  const region = normalizeRegion(input.region);
  const method = String(input.method || "actual").toLowerCase() === "simplified" ? "simplified" : "actual";
  const totalArea = Number(input.totalAreaSqft) > 0 ? Number(input.totalAreaSqft) : null;
  const officeArea = Number.isFinite(Number(input.officeAreaSqft)) && Number(input.officeAreaSqft) >= 0
    ? Number(input.officeAreaSqft)
    : null;
  const monthsUsed = Math.max(1, Math.min(12, Number(input.monthsUsed) || 12));
  const eligibleExpensesTotal = round2(input.eligibleExpensesTotal);

  const businessUsePct = totalArea && officeArea !== null
    ? clampPercent((officeArea / totalArea) * 100)
    : null;
  const proration = monthsUsed / 12;

  // The simplified method is US-only.
  if (method === "simplified" && region === "CA") {
    return {
      supported: false,
      region,
      method,
      unsupportedReason: "Canada does not offer the US simplified ($5/sq ft) method. Use the actual work-space-in-home method (Form T2125 line 9945)."
    };
  }

  if (method === "simplified") {
    if (officeArea === null || officeArea <= 0) {
      return {
        supported: false,
        region,
        method,
        unsupportedReason: "The simplified method needs the home-office area in square feet."
      };
    }
    const cappedArea = Math.min(officeArea, SIMPLIFIED_MAX_SQFT);
    const deduction = round2(cappedArea * SIMPLIFIED_RATE_PER_SQFT * proration);
    return {
      supported: true,
      region,
      method,
      officeAreaSqft: officeArea,
      cappedAreaSqft: cappedArea,
      capApplied: officeArea > SIMPLIFIED_MAX_SQFT,
      ratePerSqft: SIMPLIFIED_RATE_PER_SQFT,
      monthsUsed,
      deduction,
      note: `Simplified method: $${SIMPLIFIED_RATE_PER_SQFT}/sq ft x ${cappedArea} sq ft${officeArea > SIMPLIFIED_MAX_SQFT ? ` (capped at ${SIMPLIFIED_MAX_SQFT})` : ""}${monthsUsed < 12 ? `, prorated for ${monthsUsed} month(s)` : ""}. Eligible home expenses are not used under this method.`
    };
  }

  // Actual method (US actual / CA work-space-in-home): business-use % of eligible expenses.
  if (businessUsePct === null) {
    return {
      supported: false,
      region,
      method,
      eligibleExpensesTotal,
      unsupportedReason: "The actual method needs both the total home area and the home-office area in square feet to derive the business-use percentage."
    };
  }

  const deduction = round2(eligibleExpensesTotal * (businessUsePct / 100) * proration);
  return {
    supported: true,
    region,
    method,
    totalAreaSqft: totalArea,
    officeAreaSqft: officeArea,
    businessUsePct: round2(businessUsePct),
    monthsUsed,
    eligibleExpensesTotal,
    deduction,
    note: region === "CA"
      ? "Work-space-in-home expenses are limited to net business income; any excess carries forward (ITA s. 18(12))."
      : "Actual method: business-use percent of eligible home expenses (IRS Form 8829)."
  };
}

// Sum home-office-eligible ledger expense amounts as the eligible pool.
function isEligibleHomeOfficeCategory(category, region) {
  const normalizedRegion = normalizeRegion(region);
  const name = String(category?.name || "").trim();
  const taxMapKey = normalizedRegion === "CA" ? "tax_map_ca" : "tax_map_us";
  const taxMap = String(category?.[taxMapKey] || "").trim().toLowerCase();

  if (HOME_OFFICE_ELIGIBLE_TAX_MAPS[normalizedRegion]?.has(taxMap)) {
    return true;
  }

  return HOME_OFFICE_ELIGIBLE_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

function sumEligibleHomeOfficeExpenses(transactions = [], categories = [], options = {}) {
  const region = normalizeRegion(options.region);
  const homeOfficeCategoryIds = new Set(
    (categories || [])
      .filter((cat) => isEligibleHomeOfficeCategory(cat, region))
      .map((cat) => cat.id)
  );
  let total = 0;
  let count = 0;
  for (const txn of transactions || []) {
    if (String(txn?.type || "").toLowerCase() !== "expense") continue;
    const categoryId = txn?.category_id || txn?.categoryId;
    if (!homeOfficeCategoryIds.has(categoryId)) continue;
    total += Math.abs(Number(txn?.amount) || 0);
    count += 1;
  }
  return { total: round2(total), count };
}

// Build the export schedule object (mirrors the quick/regular method schedules).
function buildHomeOfficeWorksheet(options = {}) {
  const worksheet = options.worksheet || null;
  if (!worksheet) return null;

  const region = normalizeRegion(options.region);
  const taxYear = options.taxYear || worksheet.tax_year || null;
  const { total: eligibleExpensesTotal, count: eligibleExpenseCount } = sumEligibleHomeOfficeExpenses(
    options.transactions,
    options.categories,
    { region }
  );

  const computed = computeHomeOfficeDeduction({
    region,
    method: worksheet.method,
    totalAreaSqft: worksheet.total_area_sqft,
    officeAreaSqft: worksheet.office_area_sqft,
    monthsUsed: worksheet.months_used,
    eligibleExpensesTotal
  });

  return {
    taxYear,
    eligibleExpenseCount,
    ...computed,
    notes: worksheet.notes || ""
  };
}

async function getHomeOfficeWorksheet(businessId, taxYear) {
  const result = await pool.query(
    `SELECT id, business_id, tax_year, method, total_area_sqft, office_area_sqft, months_used, notes, created_at, updated_at
       FROM home_office_worksheets
      WHERE business_id = $1 AND tax_year = $2
      LIMIT 1`,
    [businessId, taxYear]
  );
  return result.rows[0] || null;
}

async function upsertHomeOfficeWorksheet(businessId, taxYear, data = {}) {
  const method = String(data.method || "actual").toLowerCase() === "simplified" ? "simplified" : "actual";
  const totalArea = data.total_area_sqft === null || data.total_area_sqft === undefined || data.total_area_sqft === ""
    ? null
    : Number(data.total_area_sqft);
  const officeArea = data.office_area_sqft === null || data.office_area_sqft === undefined || data.office_area_sqft === ""
    ? null
    : Number(data.office_area_sqft);
  const monthsUsed = Math.max(1, Math.min(12, Number(data.months_used) || 12));
  const notes = data.notes ? String(data.notes).slice(0, 2000) : null;

  if (totalArea !== null && !(totalArea > 0)) {
    throw Object.assign(new Error("total_area_sqft must be greater than 0."), { status: 400 });
  }
  if (officeArea !== null && !(officeArea >= 0)) {
    throw Object.assign(new Error("office_area_sqft must be 0 or greater."), { status: 400 });
  }
  if (totalArea !== null && officeArea !== null && officeArea > totalArea) {
    throw Object.assign(new Error("office_area_sqft cannot exceed total_area_sqft."), { status: 400 });
  }

  const result = await pool.query(
    `INSERT INTO home_office_worksheets
       (business_id, tax_year, method, total_area_sqft, office_area_sqft, months_used, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (business_id, tax_year) DO UPDATE SET
       method = EXCLUDED.method,
       total_area_sqft = EXCLUDED.total_area_sqft,
       office_area_sqft = EXCLUDED.office_area_sqft,
       months_used = EXCLUDED.months_used,
       notes = EXCLUDED.notes,
       updated_at = NOW()
     RETURNING id, business_id, tax_year, method, total_area_sqft, office_area_sqft, months_used, notes, created_at, updated_at`,
    [businessId, taxYear, method, totalArea, officeArea, monthsUsed, notes]
  );
  return result.rows[0];
}

async function deleteHomeOfficeWorksheet(businessId, taxYear) {
  const result = await pool.query(
    `DELETE FROM home_office_worksheets WHERE business_id = $1 AND tax_year = $2`,
    [businessId, taxYear]
  );
  return result.rowCount > 0;
}

module.exports = {
  computeHomeOfficeDeduction,
  sumEligibleHomeOfficeExpenses,
  buildHomeOfficeWorksheet,
  isEligibleHomeOfficeCategory,
  getHomeOfficeWorksheet,
  upsertHomeOfficeWorksheet,
  deleteHomeOfficeWorksheet,
  SIMPLIFIED_RATE_PER_SQFT,
  SIMPLIFIED_MAX_SQFT
};
