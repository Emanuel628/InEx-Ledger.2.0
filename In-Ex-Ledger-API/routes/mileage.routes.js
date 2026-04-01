import express from "express";
import crypto from "node:crypto";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { resolveBusinessIdForUser } from "../api/utils/resolveBusinessIdForUser.js";

const router = express.Router();
router.use(requireAuth);

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

  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const result = await pool.query(
      `INSERT INTO mileage (id, business_id, trip_date, purpose, destination, miles, km, odometer_start, odometer_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        crypto.randomUUID(), businessId, trip_date, purpose,
        destination || null,
        miles != null ? parseFloat(miles) : null,
        km != null ? parseFloat(km) : null,
        odometer_start != null ? parseFloat(odometer_start) : null,
        odometer_end != null ? parseFloat(odometer_end) : null
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

export default router;
