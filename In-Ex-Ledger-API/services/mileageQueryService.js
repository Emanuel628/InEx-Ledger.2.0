"use strict";

// Pure SQL-fragment builders for the mileage table's dual date-column
// support (some deployments still have a legacy `date` column alongside
// `trip_date`, some only have one or the other). Side-effect-free so the
// fragment shapes can be tested directly without a database.

function mileageDateColumn(mode) {
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
  id,
  businessId,
  mileageDate,
  purpose,
  destination,
  miles,
  km,
  odometerStart,
  odometerEnd
) {
  const values = [id, businessId];
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

module.exports = {
  mileageDateColumn,
  buildMileageInsertSql,
  buildMileageInsertValues
};
