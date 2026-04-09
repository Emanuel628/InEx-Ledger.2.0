/**
 * Unit tests for mileage PUT /:id route validation logic.
 * Tests the parseOptionalNumber helper and update-field validation rules.
 */

function assert(condition, message) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
  console.log(`  PASS: ${message}`);
}

console.log("Running mileage PUT validation tests");

// ── Constants mirrored from mileage.routes.js ────────────────────────────────
const MILES_TO_KM = 1.609344;
const MAX_DISTANCE_VALUE = 50000;
const MAX_ODOMETER_VALUE = 9999999.99;

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

function validateMileageUpdate(body) {
  const { trip_date, date, miles, km, odometer_start, odometer_end } = body ?? {};

  const mileageDate = typeof trip_date === "string" && trip_date.trim()
    ? trip_date.trim()
    : typeof date === "string" && date.trim()
    ? date.trim()
    : undefined;

  if (mileageDate !== undefined && Number.isNaN(Date.parse(mileageDate))) {
    return { status: 400, error: "trip_date must be a valid date." };
  }

  const parsedMiles = miles !== undefined ? parseOptionalNumber(miles, "miles", MAX_DISTANCE_VALUE) : { value: undefined };
  if (parsedMiles.error) return { status: 400, error: parsedMiles.error };

  const parsedKm = km !== undefined ? parseOptionalNumber(km, "km", MAX_DISTANCE_VALUE) : { value: undefined };
  if (parsedKm.error) return { status: 400, error: parsedKm.error };

  const parsedOdometerStart = odometer_start !== undefined
    ? parseOptionalNumber(odometer_start, "odometer_start", MAX_ODOMETER_VALUE)
    : { value: undefined };
  if (parsedOdometerStart.error) return { status: 400, error: parsedOdometerStart.error };

  const parsedOdometerEnd = odometer_end !== undefined
    ? parseOptionalNumber(odometer_end, "odometer_end", MAX_ODOMETER_VALUE)
    : { value: undefined };
  if (parsedOdometerEnd.error) return { status: 400, error: parsedOdometerEnd.error };

  if (
    parsedOdometerStart.value !== undefined &&
    parsedOdometerEnd.value !== undefined &&
    parsedOdometerEnd.value < parsedOdometerStart.value
  ) {
    return { status: 400, error: "odometer_end must be greater than or equal to odometer_start." };
  }

  const purpose = typeof body?.purpose === "string" ? body.purpose.trim() : undefined;
  const destination = typeof body?.destination === "string" ? body.destination.trim() : undefined;

  // Reject if no recognized field was provided
  const hasAnyField =
    mileageDate !== undefined ||
    purpose !== undefined ||
    destination !== undefined ||
    parsedMiles.value !== undefined ||
    parsedKm.value !== undefined ||
    parsedOdometerStart.value !== undefined ||
    parsedOdometerEnd.value !== undefined;

  if (!hasAnyField) {
    return { status: 400, error: "No valid fields provided for update." };
  }

  return { status: 200, error: null };
}

// ── Test suite ───────────────────────────────────────────────────────────────

console.log("\n[1] Invalid date — should reject");
{
  const result = validateMileageUpdate({ trip_date: "not-a-date" });
  assert(result.status === 400, "Returns 400 for invalid date");
  assert(result.error.includes("valid date"), "Error mentions valid date");
}

console.log("\n[2] Valid date string — should pass");
{
  const result = validateMileageUpdate({ trip_date: "2026-01-15" });
  assert(result.status === 200, "Returns 200 for valid date");
}

console.log("\n[3] Negative miles — should reject");
{
  const result = validateMileageUpdate({ miles: -5 });
  assert(result.status === 400, "Returns 400 for negative miles");
}

console.log("\n[4] Exceeds max distance — should reject");
{
  const result = validateMileageUpdate({ miles: MAX_DISTANCE_VALUE + 1 });
  assert(result.status === 400, "Returns 400 when miles exceeds max");
}

console.log("\n[5] Non-numeric miles — should reject");
{
  const result = validateMileageUpdate({ miles: "abc" });
  assert(result.status === 400, "Returns 400 for non-numeric miles");
}

console.log("\n[6] Valid miles — should pass");
{
  const result = validateMileageUpdate({ miles: 12.5 });
  assert(result.status === 200, "Returns 200 for valid miles");
}

console.log("\n[7] Odometer end < start — should reject");
{
  const result = validateMileageUpdate({ odometer_start: 1000, odometer_end: 500 });
  assert(result.status === 400, "Returns 400 when end < start");
  assert(result.error.includes("odometer_end"), "Error mentions odometer_end");
}

console.log("\n[8] Valid odometer range — should pass");
{
  const result = validateMileageUpdate({ odometer_start: 1000, odometer_end: 1100 });
  assert(result.status === 200, "Returns 200 for valid odometer range");
}

console.log("\n[9] Equal odometer values — should pass");
{
  const result = validateMileageUpdate({ odometer_start: 1000, odometer_end: 1000 });
  assert(result.status === 200, "Returns 200 when start equals end");
}

console.log("\n[10] Exceeds max odometer — should reject");
{
  const result = validateMileageUpdate({ odometer_start: MAX_ODOMETER_VALUE + 1 });
  assert(result.status === 400, "Returns 400 when odometer exceeds max");
}

console.log("\n[11] Empty body — should reject (no fields to update)");
{
  const result = validateMileageUpdate({});
  assert(result.status === 400, "Empty body returns 400");
  assert(result.error.includes("No valid fields"), "Error mentions no valid fields");
}

console.log("\n[12] Purpose update — should pass");
{
  const result = validateMileageUpdate({ purpose: "Client visit" });
  assert(result.status === 200, "Returns 200 for purpose-only update");
}

console.log("\nAll mileage PUT validation tests passed.");
