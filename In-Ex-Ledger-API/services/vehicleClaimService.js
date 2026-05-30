"use strict";

const { pool } = require("../db.js");
const { getIrsRate, getCraRate } = require("../utils/mileageRates.js");
const { logError } = require("../utils/logger.js");

const VALID_CLAIM_METHODS_BY_REGION = {
  US: new Set(["mileage", "actual"]),
  CA: new Set(["actual"])
};

function normalizeRegion(region) {
  return String(region || "US").toUpperCase() === "CA" ? "CA" : "US";
}

function validateClaimMethodForRegion(claimMethod, region) {
  const normalizedRegion = normalizeRegion(region);
  const method = String(claimMethod || "").toLowerCase();
  const allowedMethods = VALID_CLAIM_METHODS_BY_REGION[normalizedRegion] || VALID_CLAIM_METHODS_BY_REGION.US;
  if (!allowedMethods.has(method)) {
    if (normalizedRegion === "CA" && method === "mileage") {
      throw new Error("CRA self-employed vehicle deductions must use actual motor vehicle expenses with a business-use allocation. Mileage logs remain support only.");
    }
    throw new Error(`Claim method '${method}' is not allowed for region ${normalizedRegion}.`);
  }
  return { normalizedRegion, method };
}

async function assertConsistentClaimMethodForYear({ businessId, taxYear, claimMethod, transactionId }) {
  const result = await pool.query(
    `SELECT claim_method
       FROM vehicle_expense_details
      WHERE business_id = $1
        AND tax_year = $2
        AND transaction_id != $3
      LIMIT 1`,
    [businessId, taxYear, transactionId]
  );
  const existingMethod = String(result.rows[0]?.claim_method || "").toLowerCase();
  if (existingMethod && existingMethod !== String(claimMethod || "").toLowerCase()) {
    throw new Error(`Vehicle claim method conflict for tax year ${taxYear}. Use one method per business tax year until per-vehicle elections are supported.`);
  }
}

// Compute vehicle deduction variables without hitting the DB.
// Returns the calculated_deduction and the rate used (for audit storage).
function computeVehicleDeduction(options = {}) {
  const { claimMethod, region, taxYear, distance, distanceUnit, amount, businessUsePct } = options;
  const { normalizedRegion, method } = validateClaimMethodForRegion(claimMethod, region);
  const year = Number(taxYear);

  if (method === "mileage") {
    const dist = Number(distance || 0);
    let rate;
    let deduction;

    if (normalizedRegion === "CA") {
      const craRate = getCraRate(year);
      const unit = String(distanceUnit || "km").toLowerCase();
      // Normalize distance to km for CRA threshold calculation.
      const distKm = unit === "mi" ? dist * 1.60934 : dist;
      const priorKm = Number(options.priorYearKm || 0);
      // CRA tiered rate: first 5,000 km/year at higher rate, rest at lower rate.
      // priorYearKm = km already logged this tax year before this trip.
      const firstBandKm = Math.min(distKm, Math.max(0, 5000 - priorKm));
      const secondBandKm = distKm - firstBandKm;
      rate = craRate.first; // display/audit rate (first-band rate shown for reference)
      deduction = Number(((firstBandKm * craRate.first) + (secondBandKm * craRate.after)).toFixed(2));
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

  const { normalizedRegion, method } = validateClaimMethodForRegion(claimMethod, region);
  await assertConsistentClaimMethodForYear({ businessId, taxYear, claimMethod: method, transactionId });

  // For CRA mileage claims, accumulate km logged earlier this year so the
  // 5,000 km tier threshold is applied correctly across the full tax year.
  let priorYearKm = 0;
  if (normalizedRegion === "CA" && method === "mileage") {
    const priorRes = await pool.query(
      `SELECT COALESCE(SUM(
         CASE WHEN distance_unit = 'km' THEN distance
              WHEN distance_unit = 'mi' THEN distance * 1.60934
              ELSE 0 END
       ), 0)::numeric AS prior_km
       FROM vehicle_expense_details
      WHERE business_id = $1
        AND tax_year = $2
        AND claim_method = 'mileage'
        AND transaction_id != $3`,
      [businessId, taxYear, transactionId]
    );
    priorYearKm = Number(priorRes.rows[0]?.prior_km || 0);
  }

  const { calculatedDeduction, taxYearRate } = computeVehicleDeduction({
    claimMethod: method,
    region: normalizedRegion,
    taxYear,
    distance,
    distanceUnit,
    amount,
    businessUsePct,
    priorYearKm
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
      method,
      method === "mileage" ? distance : null,
      method === "mileage" ? (distanceUnit || "mi") : null,
      taxYearRate,
      method === "actual" ? businessUsePct : null,
      calculatedDeduction
    ]
  );
  return result.rows[0];
}

module.exports = {
  computeVehicleDeduction,
  getVehicleClaimDetail,
  upsertVehicleClaimDetail,
  validateClaimMethodForRegion,
  __private: {
    normalizeRegion,
    assertConsistentClaimMethodForYear
  }
};
