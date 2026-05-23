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

// Fetch the remittance rate for a province group + supply type + year.
// Falls back to the most recent year if the exact year is not seeded.
async function getRemittanceRate(province, supplyType, taxYear) {
  const group = resolveProvinceGroup(province);
  const result = await pool.query(
    `SELECT remittance_rate, hst_rate
     FROM quick_method_rates
     WHERE province_group = $1
       AND supply_type = $2
       AND effective_year <= $3
     ORDER BY effective_year DESC
     LIMIT 1`,
    [group, supplyType, taxYear]
  );
  return result.rows[0] || null;
}

// Compute Net Tax to Remit.
// Formula: gross_sales_including_tax × remittance_rate
// The 1% ITC credit on the first $30,000 of eligible supplies is applied automatically by CRA,
// so we store the gross remittance; the 1% reduction is noted in the PDF sub-schedule.
async function computeQuickMethodRemittance(options = {}) {
  const { province, supplyType, grossSalesInclTax, taxYear } = options;
  const rateRow = await getRemittanceRate(province, supplyType, taxYear);
  if (!rateRow) {
    throw new Error(`No Quick Method rate found for province=${province}, supplyType=${supplyType}, year=${taxYear}`);
  }

  const gross = Number(grossSalesInclTax || 0);
  const remittanceRate = Number(rateRow.remittance_rate);
  const hstRate = Number(rateRow.hst_rate);

  const netTaxToRemit = Number((gross * remittanceRate).toFixed(2));
  // Tax collected from customers (for schedule display)
  const taxCollected = Number((gross * (hstRate / (1 + hstRate))).toFixed(2));

  return {
    province,
    supplyType,
    taxYear,
    provinceGroup: resolveProvinceGroup(province),
    grossSalesInclTax: gross,
    hstRate,
    remittanceRate,
    taxCollected,
    netTaxToRemit
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
  getRemittanceRate,
  computeQuickMethodRemittance,
  buildQuickMethodSchedule
};
