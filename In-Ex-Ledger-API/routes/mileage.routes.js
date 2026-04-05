const express = require("express");
const crypto = require("crypto");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { createDataApiLimiter } = require("../middleware/rate-limit.middleware.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");

const router = express.Router();
const MAX_DISTANCE_VALUE = 50000;
const MAX_ODOMETER_VALUE = 9999999.99;
router.use(requireAuth);
router.use(createDataApiLimiter());

function parseOptionalNumber(value, field, max) {
  if (value === undefined || value === null || value === "") {
    return { value: null };
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return { error: `${field} must be a valid number.` };
  }
  if (parsed < 0 || parsed > max) {
    return { error: `${field} must be between 0 and ${max}.` };
  }

  return { value: parsed };
}

/**
 * GET /api/mileage
 */
router.get("/", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 500);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const result = await pool.query(
      `SELECT id, trip_date, purpose, destination, miles, km,
              odometer_start, odometer_end, created_at
       FROM mileage
       WHERE business_id = $1
       ORDER BY trip_date DESC, created_at DESC
       LIMIT $2 OFFSET $3`,
      [businessId, limit, offset]
    );

    const countResult = await pool.query(
      "SELECT COUNT(*) FROM mileage WHERE business_id = $1",
      [businessId]
    );

    res.json({
      data: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit,
      offset
    });
  } catch (err) {
    console.error("GET /mileage error:", err.message);
    res.status(500).json({ error: "Failed to load mileage records." });
  }
});

/**
 * POST /api/mileage
 */
router.post("/", async (req, res) => {
  const { trip_date, purpose, destination, miles, km, odometer_start, odometer_end } = req.body ?? {};

  if (!trip_date || !purpose) {
    return res.status(400).json({ error: "trip_date and purpose are required" });
  }

  if (Number.isNaN(Date.parse(trip_date))) {
    return res.status(400).json({ error: "trip_date must be a valid date." });
  }

  const parsedMiles = parseOptionalNumber(miles, "miles", MAX_DISTANCE_VALUE);
  if (parsedMiles.error) {
    return res.status(400).json({ error: parsedMiles.error });
  }

  const parsedKm = parseOptionalNumber(km, "km", MAX_DISTANCE_VALUE);
  if (parsedKm.error) {
    return res.status(400).json({ error: parsedKm.error });
  }

  const parsedOdometerStart = parseOptionalNumber(odometer_start, "odometer_start", MAX_ODOMETER_VALUE);
  if (parsedOdometerStart.error) {
    return res.status(400).json({ error: parsedOdometerStart.error });
  }

  const parsedOdometerEnd = parseOptionalNumber(odometer_end, "odometer_end", MAX_ODOMETER_VALUE);
  if (parsedOdometerEnd.error) {
    return res.status(400).json({ error: parsedOdometerEnd.error });
  }

  const hasDistance =
    (parsedMiles.value !== null && parsedMiles.value > 0) ||
    (parsedKm.value !== null && parsedKm.value > 0);
  const hasOdometerRange =
    parsedOdometerStart.value !== null && parsedOdometerEnd.value !== null;

  if (!hasDistance && !hasOdometerRange) {
    return res.status(400).json({
      error: "Provide miles, kilometers, or both odometer values."
    });
  }

  if (hasOdometerRange && parsedOdometerEnd.value < parsedOdometerStart.value) {
    return res.status(400).json({
      error: "odometer_end must be greater than or equal to odometer_start."
    });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const result = await pool.query(
      `INSERT INTO mileage (id, business_id, trip_date, purpose, destination, miles, km, odometer_start, odometer_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        crypto.randomUUID(), businessId, trip_date, purpose,
        destination || null,
        parsedMiles.value,
        parsedKm.value,
        parsedOdometerStart.value,
        parsedOdometerEnd.value
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("POST /mileage error:", err.message);
    res.status(500).json({ error: "Failed to save mileage record." });
  }
});

/**
 * DELETE /api/mileage/:id
 */
router.delete("/:id", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const result = await pool.query(
      "DELETE FROM mileage WHERE id = $1 AND business_id = $2",
      [req.params.id, businessId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Mileage record not found." });
    }
    res.json({ message: "Mileage record deleted." });
  } catch (err) {
    console.error("DELETE /mileage/:id error:", err.message);
    res.status(500).json({ error: "Failed to delete mileage record." });
  }
});

module.exports = router;
