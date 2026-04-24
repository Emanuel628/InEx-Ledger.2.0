const express = require("express");
const crypto = require("crypto");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { createDataApiLimiter } = require("../middleware/rate-limit.middleware.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");
const { logError, logWarn, logInfo } = require("../utils/logger.js");
const {
  AccountingPeriodLockedError,
  loadAccountingLockState,
  assertDateUnlocked
} = require("../services/accountingLockService.js");

const router = express.Router();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89abAB][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MILES_TO_KM = 1.609344;
const MAX_DISTANCE_VALUE = 50000;
const MAX_ODOMETER_VALUE = 9999999.99;
const MAX_COST_AMOUNT = 1000000;
const VALID_VEHICLE_COST_TYPES = new Set(["expense", "maintenance"]);
const MILEAGE_SCHEMA_CACHE_MS = 5 * 60 * 1000;
let cachedMileageColumnMode = null;
let cachedMileageColumnFetchedAt = 0;
let cachedMileageColumnModePromise = null;
router.use(requireAuth);
router.use(requireCsrfProtection);
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

function normalizeVehicleCostType(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeVehicleCostPayload(body = {}) {
  const entryType = normalizeVehicleCostType(body.entry_type);
  const entryDate = typeof body.entry_date === "string" ? body.entry_date.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const vendor = typeof body.vendor === "string" ? body.vendor.trim() : "";
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  const parsedAmount = parseOptionalNumber(body.amount, "amount", MAX_COST_AMOUNT);

  if (!VALID_VEHICLE_COST_TYPES.has(entryType)) {
    return { error: "entry_type must be expense or maintenance." };
  }

  if (!entryDate || Number.isNaN(Date.parse(entryDate))) {
    return { error: "entry_date must be a valid date." };
  }

  if (!title) {
    return { error: "title is required." };
  }

  if (parsedAmount.error) {
    return { error: parsedAmount.error };
  }

  if (parsedAmount.value === null || parsedAmount.value <= 0) {
    return { error: "amount must be greater than 0." };
  }

  return {
    value: {
      entryType,
      entryDate,
      title,
      vendor: vendor || null,
      notes: notes || null,
      amount: Number(parsedAmount.value.toFixed(2))
    }
  };
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
    logError("GET /mileage error:", err.message);
    res.status(500).json({ error: "Failed to load mileage records." });
  }
});

router.get("/summary", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const mileageColumns = await getMileageColumnMode();
    const dateSelect = mileageDateSelect(mileageColumns);

    const [mileageResult, costsResult] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS trip_count,
                COALESCE(SUM(COALESCE(miles, 0)), 0) AS total_miles,
                COALESCE(SUM(COALESCE(km, 0)), 0) AS total_km,
                MAX(${dateSelect}) AS last_trip_date
           FROM mileage
          WHERE business_id = $1`,
        [businessId]
      ),
      pool.query(
        `SELECT COALESCE(SUM(CASE WHEN entry_type = 'expense' THEN amount ELSE 0 END), 0) AS expense_total,
                COALESCE(SUM(CASE WHEN entry_type = 'maintenance' THEN amount ELSE 0 END), 0) AS maintenance_total,
                COUNT(*) AS cost_count,
                MAX(entry_date) AS last_cost_date
           FROM vehicle_costs
          WHERE business_id = $1`,
        [businessId]
      )
    ]);

    const mileageRow = mileageResult.rows[0] || {};
    const costRow = costsResult.rows[0] || {};
    return res.json({
      trip_count: Number(mileageRow.trip_count || 0),
      total_miles: Number(mileageRow.total_miles || 0),
      total_km: Number(mileageRow.total_km || 0),
      vehicle_expense_total: Number(costRow.expense_total || 0),
      maintenance_total: Number(costRow.maintenance_total || 0),
      cost_count: Number(costRow.cost_count || 0),
      last_trip_date: mileageRow.last_trip_date || null,
      last_cost_date: costRow.last_cost_date || null
    });
  } catch (err) {
    logError("GET /mileage/summary error:", err.message);
    return res.status(500).json({ error: "Failed to load mileage summary." });
  }
});

router.get("/costs", async (req, res) => {
  const typeFilter = normalizeVehicleCostType(req.query.type);
  if (typeFilter && !VALID_VEHICLE_COST_TYPES.has(typeFilter)) {
    return res.status(400).json({ error: "Invalid vehicle cost type." });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 500);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const values = [businessId];
    let whereSql = "WHERE business_id = $1";

    if (typeFilter) {
      values.push(typeFilter);
      whereSql += ` AND entry_type = $${values.length}`;
    }

    values.push(limit, offset);
    const result = await pool.query(
      `SELECT id, business_id, entry_type, entry_date, title, vendor, amount, notes, created_at
         FROM vehicle_costs
         ${whereSql}
        ORDER BY entry_date DESC, created_at DESC
        LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );

    return res.json({ data: result.rows, limit, offset });
  } catch (err) {
    logError("GET /mileage/costs error:", err.message);
    return res.status(500).json({ error: "Failed to load vehicle costs." });
  }
});

router.post("/costs", async (req, res) => {
  const normalized = normalizeVehicleCostPayload(req.body);
  if (normalized.error) {
    return res.status(400).json({ error: normalized.error });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const lockState = await loadAccountingLockState(pool, businessId);
    assertDateUnlocked(lockState, normalized.value.entryDate.slice(0, 10));
    const result = await pool.query(
      `INSERT INTO vehicle_costs (id, business_id, entry_type, entry_date, title, vendor, amount, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, business_id, entry_type, entry_date, title, vendor, amount, notes, created_at`,
      [
        crypto.randomUUID(),
        businessId,
        normalized.value.entryType,
        normalized.value.entryDate,
        normalized.value.title,
        normalized.value.vendor,
        normalized.value.amount,
        normalized.value.notes
      ]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err instanceof AccountingPeriodLockedError) {
      return res.status(err.status).json({
        error: err.message,
        code: err.code,
        locked_through_date: err.lockedThroughDate,
        transaction_date: err.transactionDate
      });
    }
    logError("POST /mileage/costs error:", err.message);
    return res.status(500).json({ error: "Failed to save vehicle cost." });
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
    const lockState = await loadAccountingLockState(pool, businessId);
    assertDateUnlocked(lockState, mileageDate.slice(0, 10));
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
    if (err instanceof AccountingPeriodLockedError) {
      return res.status(err.status).json({
        error: err.message,
        code: err.code,
        locked_through_date: err.lockedThroughDate,
        transaction_date: err.transactionDate
      });
    }
    logError("POST /mileage error:", err);
    res.status(500).json({ error: "Failed to save mileage record." });
  }
});

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

router.delete("/costs/:id", async (req, res) => {
  if (!UUID_REGEX.test(req.params.id)) {
    return res.status(400).json({ error: "Invalid vehicle cost ID." });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const existing = await pool.query(
      `SELECT id, entry_date
         FROM vehicle_costs
        WHERE id = $1 AND business_id = $2
        LIMIT 1`,
      [req.params.id, businessId]
    );

    if (existing.rowCount === 0) {
      return res.status(404).json({ error: "Vehicle cost not found." });
    }

    const lockState = await loadAccountingLockState(pool, businessId);
    assertDateUnlocked(lockState, existing.rows[0].entry_date);

    await pool.query(
      "DELETE FROM vehicle_costs WHERE id = $1 AND business_id = $2",
      [req.params.id, businessId]
    );
    return res.json({ message: "Vehicle cost deleted." });
  } catch (err) {
    if (err instanceof AccountingPeriodLockedError) {
      return res.status(err.status).json({
        error: err.message,
        code: err.code,
        locked_through_date: err.lockedThroughDate,
        transaction_date: err.transactionDate
      });
    }
    logError("DELETE /mileage/costs/:id error:", err.message);
    return res.status(500).json({ error: "Failed to delete vehicle cost." });
  }
});

/**
 * PUT /api/mileage/:id
 */
router.put("/:id", async (req, res) => {
  if (!UUID_REGEX.test(req.params.id)) {
    return res.status(400).json({ error: "Invalid mileage record ID." });
  }
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
    const dateCol = mileageDateSelect(mileageColumns);

    const existing = await pool.query(
      `SELECT id, ${dateCol} AS trip_date FROM mileage WHERE id = $1 AND business_id = $2`,
      [req.params.id, businessId]
    );

    if (existing.rowCount === 0) {
      return res.status(404).json({ error: "Mileage record not found." });
    }

    // Check lock: block editing a record whose original date falls in a locked period,
    // and also block moving a record into a locked period.
    const existingDate = existing.rows[0].trip_date;
    const lockState = await loadAccountingLockState(pool, businessId);
    assertDateUnlocked(lockState, existingDate);
    if (mileageDate !== undefined) {
      assertDateUnlocked(lockState, mileageDate.slice(0, 10));
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
    if (err instanceof AccountingPeriodLockedError) {
      return res.status(err.status).json({
        error: err.message,
        code: err.code,
        locked_through_date: err.lockedThroughDate,
        transaction_date: err.transactionDate
      });
    }
    logError("PUT /mileage/:id error:", err.message);
    res.status(500).json({ error: "Failed to update mileage record." });
  }
});

/**
 * DELETE /api/mileage/:id
 */
router.delete("/:id", async (req, res) => {
  if (!UUID_REGEX.test(req.params.id)) {
    return res.status(400).json({ error: "Invalid mileage record ID." });
  }
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const mileageColumns = await getMileageColumnMode();
    const dateCol = mileageDateSelect(mileageColumns);

    const existing = await pool.query(
      `SELECT id, ${dateCol} AS trip_date FROM mileage WHERE id = $1 AND business_id = $2 LIMIT 1`,
      [req.params.id, businessId]
    );

    if (existing.rowCount === 0) {
      return res.status(404).json({ error: "Mileage record not found." });
    }

    const lockState = await loadAccountingLockState(pool, businessId);
    assertDateUnlocked(lockState, existing.rows[0].trip_date);

    await pool.query(
      "DELETE FROM mileage WHERE id = $1 AND business_id = $2",
      [req.params.id, businessId]
    );
    res.json({ message: "Mileage record deleted." });
  } catch (err) {
    if (err instanceof AccountingPeriodLockedError) {
      return res.status(err.status).json({
        error: err.message,
        code: err.code,
        locked_through_date: err.lockedThroughDate,
        transaction_date: err.transactionDate
      });
    }
    logError("DELETE /mileage/:id error:", err.message);
    res.status(500).json({ error: "Failed to delete mileage record." });
  }
});

module.exports = router;
