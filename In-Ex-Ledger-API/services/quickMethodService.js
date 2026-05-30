"use strict";

const { pool } = require("../db.js");

const QUICK_METHOD_REVENUE_LIMIT = 400000;
const QUICK_METHOD_EXCLUDED_NAICS = new Map([
  ["541110", "Legal services are excluded from the CRA Quick Method."],
  ["541191", "Legal services are excluded from the CRA Quick Method."],
  ["541199", "Legal services are excluded from the CRA Quick Method."],
  ["541211", "Accounting services are excluded from the CRA Quick Method."],
  ["541213", "Tax return preparation services are excluded from the CRA Quick Method."],
  ["541214", "Payroll services are excluded from the CRA Quick Method."],
  ["541215", "Bookkeeping services are excluded from the CRA Quick Method."],
  ["541219", "Accounting and related services are excluded from the CRA Quick Method."],
  ["524291", "Actuarial services are excluded from the CRA Quick Method."]
]);

// Maps a Canadian province code to its Quick Method rate group.
const PROVINCE_TO_GROUP_LEGACY = {
  ON:  "ON",
  NS:  "NS_NB_NL_PEI",
  NB:  "NS_NB_NL_PEI",
  NL:  "NS_NB_NL_PEI",
  PE:  "NS_NB_NL_PEI",
  BC:  "NON_HST",
  MB:  "NON_HST",
  SK:  "NON_HST",
  AB:  "NON_HST",
  QC:  "NON_HST",
  NT:  "NON_HST",
  NU:  "NON_HST",
  YT:  "NON_HST"
};

const PROVINCE_TO_GROUP_2026 = {
  ...PROVINCE_TO_GROUP_LEGACY,
  NS: "NS",
  NB: "NB_NL_PEI",
  NL: "NB_NL_PEI",
  PE: "NB_NL_PEI"
};

function resolveProvinceGroup(province, taxYear = null) {
  const year = Number(taxYear || 0);
  const normalizedProvince = String(province || "").toUpperCase();
  if (year >= 2026) {
    return PROVINCE_TO_GROUP_2026[normalizedProvince] || "NON_HST";
  }
  return PROVINCE_TO_GROUP_LEGACY[normalizedProvince] || "NON_HST";
}

function finalizeRateSelection(rateRow, taxYear) {
  if (!rateRow) return null;
  const effectiveYear = Number(rateRow.effective_year || 0);
  const requestedYear = Number(taxYear || 0);
  const isFallback = Number.isFinite(effectiveYear) && Number.isFinite(requestedYear) && effectiveYear < requestedYear;
  return {
    ...rateRow,
    effective_year: effectiveYear,
    is_fallback: isFallback,
    warning: isFallback
      ? `Quick Method rates for ${requestedYear} are not seeded; using ${effectiveYear} rates.`
      : null
  };
}

function normalizeNaicsCode(code) {
  const cleaned = String(code || "").replace(/\D+/g, "");
  return cleaned.length === 6 ? cleaned : "";
}

function getQuickMethodEligibility(options = {}) {
  const province = String(options.province || "").toUpperCase();
  const supplyType = String(options.supplyType || "").toLowerCase();
  const businessActivityCode = normalizeNaicsCode(options.businessActivityCode);
  const taxYear = Number(options.taxYear || 0);
  const grossSalesInclTax = Number(options.grossSalesInclTax || 0);

  if (!["services", "goods"].includes(supplyType)) {
    return {
      eligible: false,
      reason: "Quick Method supply type could not be verified from the current ledger data. Confirm whether the business uses the services or goods remittance rate before exporting this schedule."
    };
  }

  if (province === "NS" && taxYear === 2025) {
    return {
      eligible: false,
      reason: "Nova Scotia's HST rate changed on April 1, 2025. The current year-based Quick Method table cannot safely compute a 2025 Nova Scotia schedule."
    };
  }

  if (grossSalesInclTax > QUICK_METHOD_REVENUE_LIMIT) {
    return {
      eligible: false,
      reason: `Quick Method eligibility needs regular-method review because export-period taxable supplies exceed $${QUICK_METHOD_REVENUE_LIMIT.toLocaleString()}.`
    };
  }

  if (businessActivityCode && QUICK_METHOD_EXCLUDED_NAICS.has(businessActivityCode)) {
    return {
      eligible: false,
      reason: QUICK_METHOD_EXCLUDED_NAICS.get(businessActivityCode)
    };
  }

  return { eligible: true, reason: null };
}

// Fetch the remittance rate for a province group + supply type + year.
// Falls back to the most recent year if the exact year is not seeded.
async function getRemittanceRate(province, supplyType, taxYear) {
  const group = resolveProvinceGroup(province, taxYear);
  const result = await pool.query(
    `SELECT remittance_rate, hst_rate, effective_year
     FROM quick_method_rates
     WHERE province_group = $1
       AND supply_type = $2
       AND effective_year <= $3
     ORDER BY effective_year DESC
     LIMIT 1`,
    [group, supplyType, taxYear]
  );
  return finalizeRateSelection(result.rows[0] || null, taxYear);
}

// CRA Quick Method: 1% credit on the first $30,000 of eligible supplies per fiscal year.
// Source: CRA RC4058 "Quick Method of Accounting for GST/HST"
const QUICK_METHOD_CREDIT_RATE = 0.01;
const QUICK_METHOD_CREDIT_CAP = 30000;

// Compute Net Tax to Remit.
// Formula: (gross_sales_including_tax × remittance_rate) − 1% credit on first $30k
async function computeQuickMethodRemittance(options = {}) {
  const { province, supplyType, grossSalesInclTax, taxYear } = options;
  const rateRow = await getRemittanceRate(province, supplyType, taxYear);
  if (!rateRow) {
    throw new Error(`No Quick Method rate found for province=${province}, supplyType=${supplyType}, year=${taxYear}`);
  }

  const gross = Number(grossSalesInclTax || 0);
  const remittanceRate = Number(rateRow.remittance_rate);
  const hstRate = Number(rateRow.hst_rate);

  const grossRemittance = Number((gross * remittanceRate).toFixed(2));
  // 1% credit on the first $30,000 of eligible supplies (CRA RC4058)
  const itcCredit = Number((Math.min(gross, QUICK_METHOD_CREDIT_CAP) * QUICK_METHOD_CREDIT_RATE).toFixed(2));
  const netTaxToRemit = Number(Math.max(0, grossRemittance - itcCredit).toFixed(2));
  // Tax collected from customers (for schedule display)
  const taxCollected = Number((gross * (hstRate / (1 + hstRate))).toFixed(2));

  return {
    province,
    supplyType,
    taxYear,
    provinceGroup: resolveProvinceGroup(province, taxYear),
    rateEffectiveYear: rateRow.effective_year,
    rateFallbackUsed: rateRow.is_fallback,
    rateWarning: rateRow.warning,
    grossSalesInclTax: gross,
    hstRate,
    remittanceRate,
    grossRemittance,
    itcCredit,
    netTaxToRemit,
    taxCollected
  };
}

// Build the Quick Method sub-schedule data for a given business + tax year.
// Aggregates all included income transactions as gross revenues.
async function buildQuickMethodSchedule(options = {}) {
  const {
    businessId,
    province,
    supplyType,
    taxYear,
    grossSalesInclTax,
    businessActivityCode,
    supplyTypeSource = "unknown"
  } = options;
  const eligibility = getQuickMethodEligibility({
    province,
    supplyType,
    taxYear,
    grossSalesInclTax,
    businessActivityCode
  });
  if (!eligibility.eligible) {
    return {
      businessId,
      taxYear,
      province,
      supplyType: supplyType || "",
      supplyTypeSource,
      supported: false,
      grossSalesInclTax: Number(grossSalesInclTax || 0),
      unsupportedReason: eligibility.reason,
      note: eligibility.reason
    };
  }

  const remittance = await computeQuickMethodRemittance({
    province,
    supplyType,
    grossSalesInclTax,
    taxYear
  });

  if (remittance.rateFallbackUsed) {
    return {
      businessId,
      taxYear,
      province,
      supplyType,
      supplyTypeSource,
      supported: false,
      grossSalesInclTax: Number(grossSalesInclTax || 0),
      unsupportedReason: remittance.rateWarning,
      note: remittance.rateWarning
    };
  }

  return {
    businessId,
    taxYear,
    supplyTypeSource,
    supported: true,
    ...remittance,
    note: "Under the Quick Method, ITCs on business expenses (except capital property) are not claimed. The 1% credit on the first $30,000 of eligible supplies is applied separately."
  };
}

module.exports = {
  resolveProvinceGroup,
  finalizeRateSelection,
  getQuickMethodEligibility,
  getRemittanceRate,
  computeQuickMethodRemittance,
  buildQuickMethodSchedule,
  QUICK_METHOD_CREDIT_RATE,
  QUICK_METHOD_CREDIT_CAP,
  QUICK_METHOD_REVENUE_LIMIT
};
