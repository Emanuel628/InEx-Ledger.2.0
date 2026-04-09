/**
 * Unit tests for getMileageColumnMode caching and mileageDateSelect/OrderBy helpers.
 * Verifies that the cached mode returns correct SQL expressions.
 */

function assert(condition, message) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
  console.log(`  PASS: ${message}`);
}

// ── Helpers mirrored from mileage.routes.js ──────────────────────────────────
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

// Simulate getMileageColumnMode with cache
let _mileageColumnModeCache = null;
let introspectionCallCount = 0;

async function getMileageColumnMode(simulatedColumns) {
  if (_mileageColumnModeCache) {
    return _mileageColumnModeCache;
  }
  introspectionCallCount++;
  const columns = new Set(simulatedColumns);
  _mileageColumnModeCache = {
    hasDate: columns.has("date"),
    hasTripDate: columns.has("trip_date")
  };
  return _mileageColumnModeCache;
}

console.log("\nRunning mileage column mode caching tests\n");

// ── Test: only trip_date column ───────────────────────────────────────────────
{
  _mileageColumnModeCache = null;
  introspectionCallCount = 0;
  const mode = await getMileageColumnMode(["trip_date"]);
  assert(mode.hasTripDate === true, "hasTripDate=true when trip_date column exists");
  assert(mode.hasDate === false, "hasDate=false when only trip_date exists");
  assert(mileageDateSelect(mode) === "trip_date", "SELECT uses trip_date only");
  assert(mileageDateOrderBy(mode) === "trip_date", "ORDER BY uses trip_date only");
}

// ── Test: both columns ────────────────────────────────────────────────────────
{
  _mileageColumnModeCache = null;
  introspectionCallCount = 0;
  const mode = await getMileageColumnMode(["date", "trip_date"]);
  assert(mode.hasTripDate === true, "hasTripDate=true when both columns exist");
  assert(mode.hasDate === true, "hasDate=true when both columns exist");
  assert(mileageDateSelect(mode) === "COALESCE(trip_date, date)", "SELECT uses COALESCE when both exist");
  assert(mileageDateOrderBy(mode) === "COALESCE(trip_date, date)", "ORDER BY uses COALESCE when both exist");
}

// ── Test: only legacy date column ────────────────────────────────────────────
{
  _mileageColumnModeCache = null;
  introspectionCallCount = 0;
  const mode = await getMileageColumnMode(["date"]);
  assert(mode.hasDate === true, "hasDate=true when only date column exists");
  assert(mode.hasTripDate === false, "hasTripDate=false when only date column exists");
  assert(mileageDateSelect(mode) === "date", "SELECT uses date only");
  assert(mileageDateOrderBy(mode) === "date", "ORDER BY uses date only");
}

// ── Test: cache prevents repeated introspection ───────────────────────────────
{
  _mileageColumnModeCache = null;
  introspectionCallCount = 0;
  await getMileageColumnMode(["trip_date"]);
  await getMileageColumnMode(["trip_date"]);
  await getMileageColumnMode(["trip_date"]);
  assert(introspectionCallCount === 1, "DB introspection called exactly once across 3 getMileageColumnMode calls");
}

console.log("\nAll mileage column mode caching tests passed.\n");
