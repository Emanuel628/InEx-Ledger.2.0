"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const { attachCentralErrorHandler } = require("./helpers/testPool.js");

const ROUTE_PATH = require.resolve("../routes/vehicleClaims.routes.js");

function loadFixture({ queryImpl, serviceImpl = {} } = {}) {
  const originalLoad = Module._load.bind(Module);

  Module._load = function patchedLoad(requestName, parent, isMain) {
    if (/auth\.middleware\.js$/.test(requestName)) {
      return { requireAuth(req, _res, next) { req.user = { id: "user_1" }; next(); } };
    }
    if (/csrf\.middleware\.js$/.test(requestName)) {
      return { requireCsrfProtection: (_req, _res, next) => next() };
    }
    if (/resolveBusinessIdForUser\.js$/.test(requestName)) {
      return { resolveBusinessIdForUser: async () => "biz_1" };
    }
    if (/exportSnapshotService\.js$/.test(requestName)) {
      return { invalidateSnapshotsForBusiness: async () => {} };
    }
    if (/utils\/logger\.js$/.test(requestName)) {
      return { logError() {}, logWarn() {}, logInfo() {} };
    }
    if (/db\.js$/.test(requestName)) {
      return { pool: { query: queryImpl } };
    }
    if (/vehicleClaimService\.js$/.test(requestName)) {
      return {
        getVehicleClaimDetail: serviceImpl.getVehicleClaimDetail || (async () => null),
        upsertVehicleClaimDetail: serviceImpl.upsertVehicleClaimDetail || (async () => ({ id: "vc_1" })),
        validateClaimMethodForRegion: serviceImpl.validateClaimMethodForRegion || (() => {})
      };
    }
    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[ROUTE_PATH];
  const router = require(ROUTE_PATH);
  const app = express();
  app.use(express.json());
  app.use("/api/vehicle-claims", router);
  attachCentralErrorHandler(app);

  return {
    app,
    cleanup() {
      delete require.cache[ROUTE_PATH];
      Module._load = originalLoad;
    }
  };
}

const VALID_BODY = { claim_method: "mileage", tax_year: 2026, distance: 100, distance_unit: "mi" };

function txFoundQuery({ region = "US" } = {}) {
  return async (sql) => {
    if (/SELECT id FROM transactions/i.test(sql)) return { rows: [{ id: "tx_1" }], rowCount: 1 };
    if (/SELECT amount FROM transactions/i.test(sql)) return { rows: [{ amount: "50.00" }], rowCount: 1 };
    if (/SELECT region FROM businesses/i.test(sql)) return { rows: [{ region }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
}

test("GET returns the vehicle claim detail", async () => {
  const fixture = loadFixture({
    serviceImpl: { getVehicleClaimDetail: async () => ({ id: "vc_1", claim_method: "mileage" }) }
  });
  try {
    const response = await request(fixture.app).get("/api/vehicle-claims/tx_1");
    assert.equal(response.status, 200);
    assert.equal(response.body.id, "vc_1");
  } finally {
    fixture.cleanup();
  }
});

test("GET returns 404 when there is no claim detail", async () => {
  const fixture = loadFixture();
  try {
    const response = await request(fixture.app).get("/api/vehicle-claims/tx_1");
    assert.equal(response.status, 404);
    assert.equal(response.body.error, "No vehicle claim detail found.");
  } finally {
    fixture.cleanup();
  }
});

test("GET returns a generic 500 for an unexpected failure", async () => {
  const fixture = loadFixture({
    serviceImpl: { getVehicleClaimDetail: async () => { throw new Error("db exploded"); } }
  });
  try {
    const response = await request(fixture.app).get("/api/vehicle-claims/tx_1");
    assert.equal(response.status, 500);
    assert.deepEqual(response.body, { error: "Internal server error" });
  } finally {
    fixture.cleanup();
  }
});

test("PUT rejects a missing/invalid claim_method", async () => {
  const fixture = loadFixture();
  try {
    const response = await request(fixture.app)
      .put("/api/vehicle-claims/tx_1")
      .send({ ...VALID_BODY, claim_method: "airmiles" });
    assert.equal(response.status, 400);
    assert.equal(response.body.error, "claim_method must be 'mileage' or 'actual'.");
  } finally {
    fixture.cleanup();
  }
});

test("PUT rejects an invalid tax_year", async () => {
  const fixture = loadFixture();
  try {
    const response = await request(fixture.app)
      .put("/api/vehicle-claims/tx_1")
      .send({ ...VALID_BODY, tax_year: 1999 });
    assert.equal(response.status, 400);
    assert.equal(response.body.error, "tax_year must be a valid year (2010+).");
  } finally {
    fixture.cleanup();
  }
});

test("PUT returns 404 when the transaction doesn't belong to the business", async () => {
  const fixture = loadFixture({ queryImpl: async () => ({ rows: [], rowCount: 0 }) });
  try {
    const response = await request(fixture.app).put("/api/vehicle-claims/tx_1").send(VALID_BODY);
    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Transaction not found.");
  } finally {
    fixture.cleanup();
  }
});

test("PUT translates the CRA mileage-method-for-Canada domain error to a 400", async () => {
  const fixture = loadFixture({
    queryImpl: txFoundQuery({ region: "CA" }),
    serviceImpl: {
      validateClaimMethodForRegion: () => {
        throw new Error("CRA self-employed vehicle deductions must use actual motor vehicle expenses with a business-use allocation. Mileage logs remain support only.");
      }
    }
  });
  try {
    const response = await request(fixture.app).put("/api/vehicle-claims/tx_1").send(VALID_BODY);
    assert.equal(response.status, 400);
    assert.match(response.body.error, /CRA self-employed vehicle deductions/);
  } finally {
    fixture.cleanup();
  }
});

test("PUT requires a positive distance for the mileage method", async () => {
  const fixture = loadFixture({ queryImpl: txFoundQuery() });
  try {
    const response = await request(fixture.app)
      .put("/api/vehicle-claims/tx_1")
      .send({ ...VALID_BODY, distance: 0 });
    assert.equal(response.status, 400);
    assert.equal(response.body.error, "distance is required and must be positive for the mileage method.");
  } finally {
    fixture.cleanup();
  }
});

test("PUT rejects an invalid distance_unit", async () => {
  const fixture = loadFixture({ queryImpl: txFoundQuery() });
  try {
    const response = await request(fixture.app)
      .put("/api/vehicle-claims/tx_1")
      .send({ ...VALID_BODY, distance_unit: "furlongs" });
    assert.equal(response.status, 400);
    assert.equal(response.body.error, "distance_unit must be 'mi' or 'km'.");
  } finally {
    fixture.cleanup();
  }
});

test("PUT requires business_use_pct between 0 and 100 for the actual method", async () => {
  const fixture = loadFixture({ queryImpl: txFoundQuery() });
  try {
    const response = await request(fixture.app)
      .put("/api/vehicle-claims/tx_1")
      .send({ claim_method: "actual", tax_year: 2026, business_use_pct: 150 });
    assert.equal(response.status, 400);
    assert.equal(response.body.error, "business_use_pct must be a number between 0 and 100 for the actual method.");
  } finally {
    fixture.cleanup();
  }
});

test("PUT translates a vehicle claim method conflict to a 400", async () => {
  const fixture = loadFixture({
    queryImpl: txFoundQuery(),
    serviceImpl: {
      upsertVehicleClaimDetail: async () => {
        throw new Error("Vehicle claim method conflict for tax year 2026. Use one method per business tax year until per-vehicle elections are supported.");
      }
    }
  });
  try {
    const response = await request(fixture.app).put("/api/vehicle-claims/tx_1").send(VALID_BODY);
    assert.equal(response.status, 400);
    assert.match(response.body.error, /Vehicle claim method conflict/);
  } finally {
    fixture.cleanup();
  }
});

test("PUT succeeds and returns the saved detail", async () => {
  const fixture = loadFixture({
    queryImpl: txFoundQuery(),
    serviceImpl: { upsertVehicleClaimDetail: async () => ({ id: "vc_1", claim_method: "mileage" }) }
  });
  try {
    const response = await request(fixture.app).put("/api/vehicle-claims/tx_1").send(VALID_BODY);
    assert.equal(response.status, 200);
    assert.equal(response.body.id, "vc_1");
  } finally {
    fixture.cleanup();
  }
});

test("PUT returns a generic 500 for an unmapped service failure", async () => {
  const fixture = loadFixture({
    queryImpl: txFoundQuery(),
    serviceImpl: {
      upsertVehicleClaimDetail: async () => { throw new Error("connection reset"); }
    }
  });
  try {
    const response = await request(fixture.app).put("/api/vehicle-claims/tx_1").send(VALID_BODY);
    assert.equal(response.status, 500);
    assert.deepEqual(response.body, { error: "Internal server error" });
  } finally {
    fixture.cleanup();
  }
});
