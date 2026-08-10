"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  mileageDateColumn,
  buildMileageInsertSql,
  buildMileageInsertValues
} = require("../services/mileageQueryService.js");

test("mileageDateColumn coalesces when both date and trip_date exist", () => {
  assert.equal(mileageDateColumn({ hasDate: true, hasTripDate: true }), "COALESCE(trip_date, date)");
});

test("mileageDateColumn uses trip_date alone when only trip_date exists", () => {
  assert.equal(mileageDateColumn({ hasDate: false, hasTripDate: true }), "trip_date");
});

test("mileageDateColumn falls back to date when only date exists", () => {
  assert.equal(mileageDateColumn({ hasDate: true, hasTripDate: false }), "date");
});

test("buildMileageInsertSql includes both date columns and shifts later positional params when both exist", () => {
  const sql = buildMileageInsertSql({ hasDate: true, hasTripDate: true });
  assert.match(sql, /INSERT INTO mileage \(id, business_id, date, trip_date, purpose, destination, miles, km, odometer_start, odometer_end\)/);
  assert.match(sql, /VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9, \$10\)/);
});

test("buildMileageInsertSql includes only trip_date when date is absent", () => {
  const sql = buildMileageInsertSql({ hasDate: false, hasTripDate: true });
  assert.match(sql, /INSERT INTO mileage \(id, business_id, trip_date, purpose, destination, miles, km, odometer_start, odometer_end\)/);
  assert.match(sql, /VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9\)/);
});

test("buildMileageInsertSql includes only date when trip_date is absent", () => {
  const sql = buildMileageInsertSql({ hasDate: true, hasTripDate: false });
  assert.match(sql, /INSERT INTO mileage \(id, business_id, date, purpose, destination, miles, km, odometer_start, odometer_end\)/);
  assert.match(sql, /VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9\)/);
});

test("buildMileageInsertSql throws when neither date column exists", () => {
  assert.throws(() => buildMileageInsertSql({ hasDate: false, hasTripDate: false }), /missing both date and trip_date/);
});

test("buildMileageInsertValues writes the same mileage date into both columns when both exist", () => {
  const values = buildMileageInsertValues(
    { hasDate: true, hasTripDate: true },
    "id-1",
    "biz-1",
    "2026-06-15",
    "Client visit",
    "Downtown",
    10,
    16.09,
    100,
    110
  );
  assert.deepEqual(values, ["id-1", "biz-1", "2026-06-15", "2026-06-15", "Client visit", "Downtown", 10, 16.09, 100, 110]);
});

test("buildMileageInsertValues writes the mileage date once when only trip_date exists", () => {
  const values = buildMileageInsertValues(
    { hasDate: false, hasTripDate: true },
    "id-1",
    "biz-1",
    "2026-06-15",
    "Client visit",
    "",
    10,
    16.09,
    null,
    null
  );
  assert.deepEqual(values, ["id-1", "biz-1", "2026-06-15", "Client visit", null, 10, 16.09, null, null]);
});
