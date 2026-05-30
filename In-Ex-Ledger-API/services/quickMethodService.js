"use strict";

const { pool } = require("../db.js");

// Maps a Canadian province code to its Quick Method rate group.
const PROVINCE_TO_GROUP = {
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

function resolveProvinceGroup(province) {
  return PROVINCE_TO_GROUP[String(province || "").toUpperCase()] || "NON_HST";
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

// Fetch the remittance rate for a province group + supply type + year.
// Falls back to the most recent year if the exact year is not seeded.
async function getRemittanceRate(province, supplyType, taxYear) {
  const group = resolveProvinceGroup(province);
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
    provinceGroup: resolveProvinceGroup(province),
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
  const { businessId, province, supplyType, taxYear, grossSalesInclTax } = options;
  const remittance = await computeQuickMethodRemittance({
    province,
    supplyType: supplyType || "services",
    grossSalesInclTax,
    taxYear
  });

  return {
    businessId,
    taxYear,
    ...remittance,
    note: "Under the Quick Method, ITCs on business expenses (except capital property) are not claimed. The 1% credit on the first $30,000 of eligible supplies is applied separately."
  };
}

module.exports = {
  resolveProvinceGroup,
  finalizeRateSelection,
  getRemittanceRate,
  computeQuickMethodRemittance,
  buildQuickMethodSchedule,
  QUICK_METHOD_CREDIT_RATE,
  QUICK_METHOD_CREDIT_CAP
};
