"use strict";

const { pool } = require("../db.js");
const { getIrsRate, getCraRate } = require("../utils/mileageRates.js");
const { logError } = require("../utils/logger.js");

// Compute vehicle deduction variables without hitting the DB.
// Returns the calculated_deduction and the rate used (for audit storage).
function computeVehicleDeduction(options = {}) {
  const { claimMethod, region, taxYear, distance, distanceUnit, amount, businessUsePct } = options;
  const method = String(claimMethod || "").toLowerCase();
  const normalizedRegion = String(region || "US").toUpperCase();
  const year = Number(taxYear);

  if (method === "mileage") {
    const dist = Number(distance || 0);
    let rate;
    let deduction;

    if (normalizedRegion === "CA") {
      const craRate = getCraRate(year);
      const unit = String(distanceUnit || "km").toLowerCase();
      // CRA tiered: first 5000 km at higher rate, remainder at lower rate.
      // Since this is per-transaction, we use the flat first rate.
      // Yearly total tiering is handled at the remittance schedule level.
      rate = unit === "mi"
        ? craRate.first * 1.60934  // convert to km-equivalent for display, but flag
        : craRate.first;
      deduction = Number((dist * rate).toFixed(2));
    } else {
      rate = getIrsRate(year);
      const distInMiles = String(distanceUnit || "mi").toLowerCase() === "km"
        ? dist / 1.60934
        : dist;
      deduction = Number((distInMiles * rate).toFixed(2));
    }

    return { calculatedDeduction: deduction, taxYearRate: rate };
  }

  if (method === "actual") {
    const gross = Number(amount || 0);
    const pct = Number(businessUsePct || 0);
    const deduction = Number((gross * (pct / 100)).toFixed(2));
    return { calculatedDeduction: deduction, taxYearRate: null };
  }

  throw new Error(`Unknown claim method: ${claimMethod}`);
}

async function getVehicleClaimDetail(transactionId, businessId) {
  const result = await pool.query(
    `SELECT * FROM vehicle_expense_details
     WHERE transaction_id = $1 AND business_id = $2`,
    [transactionId, businessId]
  );
  return result.rows[0] || null;
}

async function upsertVehicleClaimDetail(transactionId, businessId, data) {
  const {
    taxYear,
    claimMethod,
    distance,
    distanceUnit,
    businessUsePct,
    amount,
    region
  } = data;

  const { calculatedDeduction, taxYearRate } = computeVehicleDeduction({
    claimMethod,
    region,
    taxYear,
    distance,
    distanceUnit,
    amount,
    businessUsePct
  });

  const result = await pool.query(
    `INSERT INTO vehicle_expense_details
       (transaction_id, business_id, tax_year, claim_method,
        distance, distance_unit, tax_year_rate,
        business_use_pct, calculated_deduction, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (transaction_id) DO UPDATE SET
       tax_year              = EXCLUDED.tax_year,
       claim_method          = EXCLUDED.claim_method,
       distance              = EXCLUDED.distance,
       distance_unit         = EXCLUDED.distance_unit,
       tax_year_rate         = EXCLUDED.tax_year_rate,
       business_use_pct      = EXCLUDED.business_use_pct,
       calculated_deduction  = EXCLUDED.calculated_deduction,
       updated_at            = NOW()
     RETURNING *`,
    [
      transactionId,
      businessId,
      taxYear,
      claimMethod,
      claimMethod === "mileage" ? distance : null,
      claimMethod === "mileage" ? (distanceUnit || "mi") : null,
      taxYearRate,
      claimMethod === "actual" ? businessUsePct : null,
      calculatedDeduction
    ]
  );
  return result.rows[0];
}

module.exports = { computeVehicleDeduction, getVehicleClaimDetail, upsertVehicleClaimDetail };
