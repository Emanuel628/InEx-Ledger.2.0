const express = require("express");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { createDataApiLimiter } = require("../middleware/rate-limit.middleware.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");
const { getSubscriptionSnapshotForBusiness, PLAN_PRO, PLAN_BUSINESS } = require("../services/subscriptionService.js");
const { logError } = require("../utils/logger.js");

const router = express.Router();
const MILEAGE_SCHEMA_CACHE_MS = 5 * 60 * 1000;
let cachedMileageColumnMode = null;
let cachedMileageColumnFetchedAt = 0;
let cachedMileageColumnModePromise = null;

router.use(requireAuth);
router.use(requireCsrfProtection);
router.use(createDataApiLimiter());

function canViewMileageAnalytics(subscription) {
  return subscription?.effectiveTier === PLAN_PRO || subscription?.effectiveTier === PLAN_BUSINESS;
}

async function getMileageColumnMode() {
  if (cachedMileageColumnMode && Date.now() - cachedMileageColumnFetchedAt < MILEAGE_SCHEMA_CACHE_MS) {
    return cachedMileageColumnMode;
  }
  if (cachedMileageColumnModePromise) {
    return cachedMileageColumnModePromise;
  }

  cachedMileageColumnModePromise = pool.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'mileage'
        AND column_name IN ('date', 'trip_date')`
  ).then(({ rows }) => {
    const columns = new Set(rows.map((row) => row.column_name));
    cachedMileageColumnMode = {
      hasDate: columns.has("date"),
      hasTripDate: columns.has("trip_date")
    };
    cachedMileageColumnFetchedAt = Date.now();
    return cachedMileageColumnMode;
  }).finally(() => {
    cachedMileageColumnModePromise = null;
  });

  return cachedMileageColumnModePromise;
}

function mileageDateSelect(mode) {
  if (mode.hasTripDate && mode.hasDate) {
    return "COALESCE(trip_date, date)";
  }
  if (mode.hasTripDate) {
    return "trip_date";
  }
  if (mode.hasDate) {
    return "date";
  }
  throw new Error("Mileage table is missing both date and trip_date columns.");
}

router.get("/mileage", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const subscription = await getSubscriptionSnapshotForBusiness(businessId);
    if (!canViewMileageAnalytics(subscription)) {
      return res.status(404).json({ error: "Not found" });
    }

    const mileageColumns = await getMileageColumnMode();
    const dateSelect = mileageDateSelect(mileageColumns);

    const mileageResult = await pool.query(
      `SELECT COUNT(*) AS trip_count,
              COALESCE(SUM(COALESCE(miles, 0)), 0) AS total_miles,
              COALESCE(SUM(COALESCE(km, 0)), 0) AS total_km,
              MAX(${dateSelect}) AS last_trip_date
         FROM mileage
        WHERE business_id = $1`,
      [businessId]
    );

    const costsResult = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN entry_type = 'expense' THEN amount ELSE 0 END), 0) AS vehicle_expense_total,
              COALESCE(SUM(CASE WHEN entry_type = 'maintenance' THEN amount ELSE 0 END), 0) AS maintenance_total,
              COUNT(*) AS cost_count,
              MAX(entry_date) AS last_cost_date
         FROM vehicle_costs
        WHERE business_id = $1`,
      [businessId]
    );

    const mileageRow = mileageResult.rows[0] || {};
    const costRow = costsResult.rows[0] || {};
    const totalMiles = Number(mileageRow.total_miles || 0);
    const totalKm = Number(mileageRow.total_km || 0);
    const vehicleExpenseTotal = Number(costRow.vehicle_expense_total || 0);
    const maintenanceTotal = Number(costRow.maintenance_total || 0);
    const totalVehicleCost = vehicleExpenseTotal + maintenanceTotal;

    return res.json({
      summary: {
        trip_count: Number(mileageRow.trip_count || 0),
        total_miles: Number(totalMiles.toFixed(2)),
        total_km: Number(totalKm.toFixed(2)),
        vehicle_expense_total: Number(vehicleExpenseTotal.toFixed(2)),
        maintenance_total: Number(maintenanceTotal.toFixed(2)),
        total_vehicle_cost: Number(totalVehicleCost.toFixed(2)),
        cost_count: Number(costRow.cost_count || 0),
        cost_per_mile: totalMiles > 0 ? Number((totalVehicleCost / totalMiles).toFixed(2)) : null,
        cost_per_km: totalKm > 0 ? Number((totalVehicleCost / totalKm).toFixed(2)) : null,
        last_trip_date: mileageRow.last_trip_date || null,
        last_cost_date: costRow.last_cost_date || null
      }
    });
  } catch (err) {
    logError("GET /analytics/mileage error:", err.stack || err);
    return res.status(500).json({ error: "Failed to load mileage analytics." });
  }
});

module.exports = router;
