const express = require("express");
const crypto = require("crypto");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { createDataApiLimiter } = require("../middleware/rate-limit.middleware.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");

const router = express.Router();
const MILES_TO_KM = 1.609344;
const MAX_DISTANCE_VALUE = 50000;
const MAX_ODOMETER_VALUE = 9999999.99;
const MILEAGE_SCHEMA_CACHE_MS = 5 * 60 * 1000;
let cachedMileageColumnMode = null;
let cachedMileageColumnFetchedAt = 0;
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
    const mileageColumns = await getMileageColumnMode();
    const dateSelect = mileageDateSelect(mileageColumns);
    const dateOrderBy = mileageDateOrderBy(mileageColumns);

    const result = await pool.query(
      `SELECT id, ${dateSelect} AS trip_date, purpose, destination, miles, km,
              odometer_start, odometer_end, created_at
       FROM mileage
       WHERE business_id = $1
       ORDER BY ${dateOrderBy} DESC, created_at DESC
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
  const { trip_date, date, miles, km, odometer_start, odometer_end } = req.body ?? {};
  const purpose = typeof req.body?.purpose === "string" ? req.body.purpose.trim() : "";
  const destination = typeof req.body?.destination === "string" ? req.body.destination.trim() : "";
  const mileageDate = typeof trip_date === "string" && trip_date.trim()
    ? trip_date.trim()
    : typeof date === "string" && date.trim()
    ? date.trim()
    : "";

  if (!mileageDate || purpose.length === 0) {
    return res.status(400).json({ error: "trip_date/date and purpose are required" });
  }

  if (Number.isNaN(Date.parse(mileageDate))) {
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

  let normalizedDistances = { miles: null, km: null };
  if (parsedMiles.value !== null || parsedKm.value !== null) {
    const normalized = normalizeMileageDistances(parsedMiles.value, parsedKm.value);
    if (normalized.error) {
      return res.status(400).json({ error: normalized.error });
    }
    normalizedDistances = normalized;
  }

  const hasDistance =
    (normalizedDistances.miles !== null && normalizedDistances.miles > 0) ||
    (normalizedDistances.km !== null && normalizedDistances.km > 0);
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
    const mileageColumns = await getMileageColumnMode();
    const insertSql = buildMileageInsertSql(mileageColumns);
    const insertValues = buildMileageInsertValues(
      mileageColumns,
      businessId,
      mileageDate,
      purpose,
      destination,
      normalizedDistances.miles,
      normalizedDistances.km,
      parsedOdometerStart.value,
      parsedOdometerEnd.value
    );
    const result = await pool.query(
      insertSql,
      insertValues
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("POST /mileage error:", err);
    res.status(500).json({ error: "Failed to save mileage record." });
  }
});

async function getMileageColumnMode() {
  if (cachedMileageColumnMode && Date.now() - cachedMileageColumnFetchedAt < MILEAGE_SCHEMA_CACHE_MS) {
    return cachedMileageColumnMode;
  }
  const { rows } = await pool.query(
    `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'mileage'
         AND column_name IN ('date', 'trip_date')`
  );

  const columns = new Set(rows.map((row) => row.column_name));
  cachedMileageColumnMode = {
    hasDate: columns.has("date"),
    hasTripDate: columns.has("trip_date")
  };
  cachedMileageColumnFetchedAt = Date.now();
  return cachedMileageColumnMode;
}

function mileageDateSelect(mode) {
  if (mode.hasTripDate && mode.hasDate) {
    return "COALESCE(trip_date, date)";
  }

  if (mode.hasTripDate) {
    return "trip_date";
  }

  return "date";
}

function mileageDateOrderBy(mode) {
  if (mode.hasTripDate && mode.hasDate) {
    return "COALESCE(trip_date, date)";
  }

  if (mode.hasTripDate) {
    return "trip_date";
  }

  return "date";
}

function buildMileageInsertSql(mode) {
  const dateColumns = [];
  if (mode.hasDate) {
    dateColumns.push("date");
  }
  if (mode.hasTripDate) {
    dateColumns.push("trip_date");
  }

  if (!dateColumns.length) {
    throw new Error("Mileage table is missing both date and trip_date columns.");
  }

  const valuePositions = [
    "$1",
    "$2",
    ...dateColumns.map((_, index) => `$${index + 3}`),
    `$${dateColumns.length + 3}`,
    `$${dateColumns.length + 4}`,
    `$${dateColumns.length + 5}`,
    `$${dateColumns.length + 6}`,
    `$${dateColumns.length + 7}`,
    `$${dateColumns.length + 8}`
  ];

  const columns = ["id", "business_id", ...dateColumns, "purpose", "destination", "miles", "km", "odometer_start", "odometer_end"];
  return `INSERT INTO mileage (${columns.join(", ")})
       VALUES (${valuePositions.join(", ")})
       RETURNING *`;
}

function buildMileageInsertValues(
  mode,
  businessId,
  mileageDate,
  purpose,
  destination,
  miles,
  km,
  odometerStart,
  odometerEnd
) {
  const values = [crypto.randomUUID(), businessId];
  if (mode.hasDate) {
    values.push(mileageDate);
  }
  if (mode.hasTripDate) {
    values.push(mileageDate);
  }
  values.push(
    purpose,
    destination || null,
    miles,
    km,
    odometerStart,
    odometerEnd
  );
  return values;
}

function normalizeMileageDistances(miles, km) {
  if (miles === null && km === null) {
    return {
      error: "Provide miles, kilometers, or both odometer values."
    };
  }

  if (miles === null && km !== null) {
    return {
      miles: Number((km / MILES_TO_KM).toFixed(2)),
      km
    };
  }

  if (km === null && miles !== null) {
    return {
      miles,
      km: Number((miles * MILES_TO_KM).toFixed(2))
    };
  }

  return {
    miles,
    km
  };
}

/**
 * PUT /api/mileage/:id
 */
router.put("/:id", async (req, res) => {
  const { trip_date, date, miles, km, odometer_start, odometer_end } = req.body ?? {};
  const purpose = typeof req.body?.purpose === "string" ? req.body.purpose.trim() : undefined;
  const destination = typeof req.body?.destination === "string" ? req.body.destination.trim() : undefined;

  const mileageDate = typeof trip_date === "string" && trip_date.trim()
    ? trip_date.trim()
    : typeof date === "string" && date.trim()
    ? date.trim()
    : undefined;

  if (mileageDate !== undefined && Number.isNaN(Date.parse(mileageDate))) {
    return res.status(400).json({ error: "trip_date must be a valid date." });
  }

  const parsedMiles = miles !== undefined ? parseOptionalNumber(miles, "miles", MAX_DISTANCE_VALUE) : { value: undefined };
  if (parsedMiles.error) {
    return res.status(400).json({ error: parsedMiles.error });
  }

  const parsedKm = km !== undefined ? parseOptionalNumber(km, "km", MAX_DISTANCE_VALUE) : { value: undefined };
  if (parsedKm.error) {
    return res.status(400).json({ error: parsedKm.error });
  }

  const parsedOdometerStart = odometer_start !== undefined
    ? parseOptionalNumber(odometer_start, "odometer_start", MAX_ODOMETER_VALUE)
    : { value: undefined };
  if (parsedOdometerStart.error) {
    return res.status(400).json({ error: parsedOdometerStart.error });
  }

  const parsedOdometerEnd = odometer_end !== undefined
    ? parseOptionalNumber(odometer_end, "odometer_end", MAX_ODOMETER_VALUE)
    : { value: undefined };
  if (parsedOdometerEnd.error) {
    return res.status(400).json({ error: parsedOdometerEnd.error });
  }

  // Validate odometer range only when both are being supplied in this request
  if (
    parsedOdometerStart.value !== undefined &&
    parsedOdometerEnd.value !== undefined &&
    parsedOdometerEnd.value < parsedOdometerStart.value
  ) {
    return res.status(400).json({
      error: "odometer_end must be greater than or equal to odometer_start."
    });
  }

  // Recalculate the complementary distance unit when one side is explicitly provided
  let normalizedMiles = parsedMiles.value;
  let normalizedKm = parsedKm.value;
  if (normalizedMiles !== undefined && normalizedKm === undefined) {
    normalizedKm = normalizedMiles !== null ? Number((normalizedMiles * MILES_TO_KM).toFixed(2)) : null;
  } else if (normalizedKm !== undefined && normalizedMiles === undefined) {
    normalizedMiles = normalizedKm !== null ? Number((normalizedKm / MILES_TO_KM).toFixed(2)) : null;
  }

  // Reject immediately if no recognized field was provided
  const hasAnyField =
    mileageDate !== undefined ||
    purpose !== undefined ||
    destination !== undefined ||
    parsedMiles.value !== undefined ||
    parsedKm.value !== undefined ||
    parsedOdometerStart.value !== undefined ||
    parsedOdometerEnd.value !== undefined;

  if (!hasAnyField) {
    return res.status(400).json({ error: "No valid fields provided for update." });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const mileageColumns = await getMileageColumnMode();

    const existing = await pool.query(
      "SELECT id FROM mileage WHERE id = $1 AND business_id = $2",
      [req.params.id, businessId]
    );

    if (existing.rowCount === 0) {
      return res.status(404).json({ error: "Mileage record not found." });
    }

    // Build dynamic SET clause
    const setClauses = [];
    const values = [];
    let idx = 1;

    if (mileageDate !== undefined) {
      if (mileageColumns.hasTripDate) {
        setClauses.push(`trip_date = $${idx++}`);
        values.push(mileageDate);
      }
      if (mileageColumns.hasDate) {
        setClauses.push(`date = $${idx++}`);
        values.push(mileageDate);
      }
    }

    if (purpose !== undefined) {
      setClauses.push(`purpose = $${idx++}`);
      values.push(purpose);
    }

    if (destination !== undefined) {
      setClauses.push(`destination = $${idx++}`);
      values.push(destination || null);
    }

    if (normalizedMiles !== undefined) {
      setClauses.push(`miles = $${idx++}`);
      values.push(normalizedMiles);
    }

    if (normalizedKm !== undefined) {
      setClauses.push(`km = $${idx++}`);
      values.push(normalizedKm);
    }

    if (parsedOdometerStart.value !== undefined) {
      setClauses.push(`odometer_start = $${idx++}`);
      values.push(parsedOdometerStart.value);
    }

    if (parsedOdometerEnd.value !== undefined) {
      setClauses.push(`odometer_end = $${idx++}`);
      values.push(parsedOdometerEnd.value);
    }

    values.push(req.params.id, businessId);
    const result = await pool.query(
      `UPDATE mileage SET ${setClauses.join(", ")} WHERE id = $${idx++} AND business_id = $${idx++} RETURNING *`,
      values
    );

    const dateSelect = mileageDateSelect(mileageColumns);
    const row = result.rows[0];
    // Normalize the trip_date field in the response
    row.trip_date = row.trip_date ?? row.date ?? null;
    res.json(row);
  } catch (err) {
    console.error("PUT /mileage/:id error:", err.message);
    res.status(500).json({ error: "Failed to update mileage record." });
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
