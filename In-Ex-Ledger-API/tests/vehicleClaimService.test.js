"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  computeVehicleDeduction,
  validateClaimMethodForRegion
} = require("../services/vehicleClaimService.js");

test("validateClaimMethodForRegion rejects mileage deductions for Canadian self-employed claims", () => {
  assert.throws(
    () => validateClaimMethodForRegion("mileage", "CA"),
    /actual motor vehicle expenses/i
  );
});

test("computeVehicleDeduction still supports US mileage calculations", () => {
  const result = computeVehicleDeduction({
    claimMethod: "mileage",
    region: "US",
    taxYear: 2026,
    distance: 100,
    distanceUnit: "mi"
  });
  assert.equal(result.calculatedDeduction > 0, true);
  assert.equal(result.taxYearRate > 0, true);
});

test("computeVehicleDeduction supports actual-expense allocation for Canada", () => {
  const result = computeVehicleDeduction({
    claimMethod: "actual",
    region: "CA",
    taxYear: 2026,
    amount: 250,
    businessUsePct: 60
  });
  assert.equal(result.calculatedDeduction, 150);
  assert.equal(result.taxYearRate, null);
});
