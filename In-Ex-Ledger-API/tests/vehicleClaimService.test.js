"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const {
  computeVehicleDeduction,
  validateClaimMethodForRegion
} = require("../services/vehicleClaimService.js");

function loadVehicleClaimServiceWithPool(fakePool) {
  const servicePath = require.resolve("../services/vehicleClaimService.js");
  const originalLoad = Module._load;
  Module._load = function patchedLoad(requestName, parent, isMain) {
    if (requestName === "../db.js" || /[\\/]db\.js$/.test(requestName)) {
      return { pool: fakePool };
    }
    return originalLoad.call(this, requestName, parent, isMain);
  };
  delete require.cache[servicePath];
  try {
    return require("../services/vehicleClaimService.js");
  } finally {
    Module._load = originalLoad;
    delete require.cache[servicePath];
  }
}

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

test("upsertVehicleClaimDetail locks the business-year election before conflict check and upsert", async () => {
  const queries = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql: String(sql), params });
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rows: [], rowCount: 0 };
      }
      if (/pg_advisory_xact_lock/.test(sql)) {
        return { rows: [], rowCount: 1 };
      }
      if (/SELECT claim_method/.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      if (/INSERT INTO vehicle_expense_details/.test(sql)) {
        return { rows: [{ id: "detail-1", claim_method: params[3] }], rowCount: 1 };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    releaseCalled: false,
    release() {
      this.releaseCalled = true;
    }
  };
  const service = loadVehicleClaimServiceWithPool({
    async connect() {
      return client;
    }
  });

  const row = await service.upsertVehicleClaimDetail("tx-1", "biz-1", {
    taxYear: 2026,
    claimMethod: "actual",
    amount: 500,
    businessUsePct: 40,
    region: "US"
  });

  assert.deepEqual(row, { id: "detail-1", claim_method: "actual" });
  assert.equal(queries[0].sql, "BEGIN");
  assert.match(queries[1].sql, /pg_advisory_xact_lock/);
  assert.deepEqual(queries[1].params, ["vehicle-claim-election:biz-1:2026"]);
  assert.match(queries[2].sql, /SELECT claim_method/);
  assert.match(queries[3].sql, /INSERT INTO vehicle_expense_details/);
  assert.equal(queries.at(-1).sql, "COMMIT");
  assert.equal(client.releaseCalled, true);
});
