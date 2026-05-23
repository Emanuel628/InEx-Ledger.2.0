"use strict";

const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");
const { pool } = require("../db.js");
const {
  getVehicleClaimDetail,
  upsertVehicleClaimDetail
} = require("../services/vehicleClaimService.js");
const { logError } = require("../utils/logger.js");

const router = express.Router();
router.use(requireAuth);
router.use(requireCsrfProtection);

const VALID_CLAIM_METHODS = new Set(["mileage", "actual"]);
const VALID_DISTANCE_UNITS = new Set(["mi", "km"]);

// GET /api/vehicle-claims/:transactionId
router.get("/:transactionId", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const detail = await getVehicleClaimDetail(req.params.transactionId, businessId);
    if (!detail) return res.status(404).json({ error: "No vehicle claim detail found." });
    res.json(detail);
  } catch (err) {
    logError("GET /vehicle-claims/:transactionId error:", err.stack || err);
    res.status(500).json({ error: "Server error loading vehicle claim." });
  }
});

// PUT /api/vehicle-claims/:transactionId
router.put("/:transactionId", async (req, res) => {
  const body = req.body ?? {};
  const { claim_method, tax_year, distance, distance_unit, business_use_pct } = body;

  if (!claim_method || !VALID_CLAIM_METHODS.has(claim_method)) {
    return res.status(400).json({ error: "claim_method must be 'mileage' or 'actual'." });
  }
  if (!tax_year || !Number.isInteger(Number(tax_year)) || Number(tax_year) < 2010) {
    return res.status(400).json({ error: "tax_year must be a valid year (2010+)." });
  }
  if (claim_method === "mileage") {
    if (distance == null || Number(distance) <= 0) {
      return res.status(400).json({ error: "distance is required and must be positive for the mileage method." });
    }
    if (distance_unit && !VALID_DISTANCE_UNITS.has(distance_unit)) {
      return res.status(400).json({ error: "distance_unit must be 'mi' or 'km'." });
    }
  }
  if (claim_method === "actual") {
    const pct = Number(business_use_pct);
    if (business_use_pct == null || !Number.isFinite(pct) || pct < 0 || pct > 100) {
      return res.status(400).json({ error: "business_use_pct must be a number between 0 and 100 for the actual method." });
    }
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);

    // Verify transaction belongs to this business
    const txCheck = await pool.query(
      `SELECT id FROM transactions WHERE id = $1 AND business_id = $2`,
      [req.params.transactionId, businessId]
    );
    if (!txCheck.rows.length) {
      return res.status(404).json({ error: "Transaction not found." });
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

    const detail = await upsertVehicleClaimDetail(req.params.transactionId, businessId, {
      taxYear: Number(tax_year),
      claimMethod: claim_method,
      distance: distance != null ? Number(distance) : null,
      distanceUnit: distance_unit || "mi",
      businessUsePct: business_use_pct != null ? Number(business_use_pct) : null,
      amount,
      region
    });

    res.json(detail);
  } catch (err) {
    logError("PUT /vehicle-claims/:transactionId error:", err.stack || err);
    res.status(500).json({ error: "Server error saving vehicle claim." });
  }
});

module.exports = router;
