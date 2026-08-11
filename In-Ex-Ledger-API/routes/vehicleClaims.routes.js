"use strict";

const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");
const { pool } = require("../db.js");
const {
  getVehicleClaimDetail,
  upsertVehicleClaimDetail,
  validateClaimMethodForRegion
} = require("../services/vehicleClaimService.js");
const { logError } = require("../utils/logger.js");
const { invalidateSnapshotsForBusiness } = require("../services/exportSnapshotService.js");
const { ApiError, asyncRoute } = require("../utils/apiError.js");

const router = express.Router();
router.use(requireAuth);
router.use(requireCsrfProtection);

const VALID_CLAIM_METHODS = new Set(["mileage", "actual"]);
const VALID_DISTANCE_UNITS = new Set(["mi", "km"]);

// GET /api/vehicle-claims/:transactionId
router.get("/:transactionId", asyncRoute(async (req, res) => {
  const businessId = await resolveBusinessIdForUser(req.user);
  const detail = await getVehicleClaimDetail(req.params.transactionId, businessId);
  if (!detail) {
    throw new ApiError(404, "No vehicle claim detail found.");
  }
  res.json(detail);
}));

// PUT /api/vehicle-claims/:transactionId
router.put("/:transactionId", asyncRoute(async (req, res) => {
  const body = req.body ?? {};
  const { claim_method, tax_year, distance, distance_unit, business_use_pct } = body;

  if (!claim_method || !VALID_CLAIM_METHODS.has(String(claim_method).toLowerCase())) {
    throw new ApiError(400, "claim_method must be 'mileage' or 'actual'.");
  }
  if (!tax_year || !Number.isInteger(Number(tax_year)) || Number(tax_year) < 2010) {
    throw new ApiError(400, "tax_year must be a valid year (2010+).");
  }

  const businessId = await resolveBusinessIdForUser(req.user);

  // Verify transaction belongs to this business
  const txCheck = await pool.query(
    `SELECT id FROM transactions WHERE id = $1 AND business_id = $2`,
    [req.params.transactionId, businessId]
  );
  if (!txCheck.rows.length) {
    throw new ApiError(404, "Transaction not found.");
  }

  // Fetch the transaction amount for actual-method deduction calculation
  const txRow = await pool.query(
    `SELECT amount FROM transactions WHERE id = $1`,
    [req.params.transactionId]
  );
  const amount = txRow.rows[0]?.amount;

  // Resolve business region for rate lookups
  const bizRow = await pool.query(
    `SELECT region FROM businesses WHERE id = $1`,
    [businessId]
  );
  const region = bizRow.rows[0]?.region || "US";
  const normalizedMethod = String(claim_method).toLowerCase();
  try {
    validateClaimMethodForRegion(normalizedMethod, region);
  } catch (err) {
    // Domain validation from the service layer -- not yet ApiError-shaped
    // (no .status), so translate by message the same way this route always has.
    if (String(err?.message || "").includes("CRA self-employed vehicle deductions")) {
      throw new ApiError(400, err.message);
    }
    throw err;
  }

  if (normalizedMethod === "mileage") {
    if (distance == null || Number(distance) <= 0) {
      throw new ApiError(400, "distance is required and must be positive for the mileage method.");
    }
    if (distance_unit && !VALID_DISTANCE_UNITS.has(distance_unit)) {
      throw new ApiError(400, "distance_unit must be 'mi' or 'km'.");
    }
  }
  if (normalizedMethod === "actual") {
    const pct = Number(business_use_pct);
    if (business_use_pct == null || !Number.isFinite(pct) || pct < 0 || pct > 100) {
      throw new ApiError(400, "business_use_pct must be a number between 0 and 100 for the actual method.");
    }
  }

  let detail;
  try {
    detail = await upsertVehicleClaimDetail(req.params.transactionId, businessId, {
      taxYear: Number(tax_year),
      claimMethod: normalizedMethod,
      distance: distance != null ? Number(distance) : null,
      distanceUnit: distance_unit || "mi",
      businessUsePct: business_use_pct != null ? Number(business_use_pct) : null,
      amount,
      region
    });
  } catch (err) {
    if (String(err?.message || "").includes("Vehicle claim method conflict")) {
      throw new ApiError(400, err.message);
    }
    throw err;
  }

  void invalidateSnapshotsForBusiness({
    businessId,
    reason: "Vehicle claim details changed after export."
  }).catch((error) => logError("Vehicle claim snapshot invalidation failed:", error));
  res.json(detail);
}));

module.exports = router;
