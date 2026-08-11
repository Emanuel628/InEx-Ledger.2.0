"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const { attachCentralErrorHandler } = require("./helpers/testPool.js");

const ROUTE_PATH = require.resolve("../routes/capitalAssets.routes.js");

const VALID_BODY = {
  name: "Delivery Van",
  purchase_date: "2026-01-15",
  original_cost: 25000,
  asset_category: "vehicle",
  tax_year: 2026
};

function loadFixture({ serviceImpl = {}, region = "US" } = {}) {
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
      return { pool: { query: async () => ({ rows: [{ region }], rowCount: 1 }) } };
    }
    if (/capitalAssetService\.js$/.test(requestName)) {
      return {
        listCapitalAssets: serviceImpl.listCapitalAssets || (async () => []),
        getCapitalAsset: serviceImpl.getCapitalAsset || (async () => null),
        createCapitalAsset: serviceImpl.createCapitalAsset || (async () => ({ id: "ca_1" })),
        updateCapitalAsset: serviceImpl.updateCapitalAsset || (async () => ({ id: "ca_1" })),
        disposeCapitalAsset: serviceImpl.disposeCapitalAsset || (async () => ({ id: "ca_1" })),
        getTotalDepreciationForYear: serviceImpl.getTotalDepreciationForYear || (async () => 0)
      };
    }
    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[ROUTE_PATH];
  const router = require(ROUTE_PATH);
  const app = express();
  app.use(express.json());
  app.use("/api/capital-assets", router);
  attachCentralErrorHandler(app);

  return {
    app,
    cleanup() {
      delete require.cache[ROUTE_PATH];
      Module._load = originalLoad;
    }
  };
}

test("GET / lists assets with total depreciation", async () => {
  const fixture = loadFixture({
    serviceImpl: {
      listCapitalAssets: async () => [{ id: "ca_1" }],
      getTotalDepreciationForYear: async () => 500
    }
  });
  try {
    const response = await request(fixture.app).get("/api/capital-assets?tax_year=2026");
    assert.equal(response.status, 200);
    assert.equal(response.body.assets.length, 1);
    assert.equal(response.body.totalDepreciation, 500);
    assert.equal(response.body.taxYear, 2026);
  } finally {
    fixture.cleanup();
  }
});

test("GET / returns a generic 500 for an unexpected failure", async () => {
  const fixture = loadFixture({
    serviceImpl: { listCapitalAssets: async () => { throw new Error("db exploded"); } }
  });
  try {
    const response = await request(fixture.app).get("/api/capital-assets");
    assert.equal(response.status, 500);
    assert.deepEqual(response.body, { error: "Internal server error" });
  } finally {
    fixture.cleanup();
  }
});

test("GET /:assetId returns 404 when the asset doesn't exist", async () => {
  const fixture = loadFixture();
  try {
    const response = await request(fixture.app).get("/api/capital-assets/ca_1");
    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Capital asset not found.");
  } finally {
    fixture.cleanup();
  }
});

test("GET /:assetId returns the asset when found", async () => {
  const fixture = loadFixture({
    serviceImpl: { getCapitalAsset: async () => ({ id: "ca_1", name: "Delivery Van" }) }
  });
  try {
    const response = await request(fixture.app).get("/api/capital-assets/ca_1");
    assert.equal(response.status, 200);
    assert.equal(response.body.name, "Delivery Van");
  } finally {
    fixture.cleanup();
  }
});

const POST_VALIDATION_CASES = [
  [{ name: "" }, "name is required."],
  [{ purchase_date: "" }, "purchase_date is required."],
  [{ original_cost: 0 }, "original_cost must be a positive number."],
  [{ asset_category: "boat" }, "asset_category must be one of: equipment, vehicle, computer, software, intangible, other."],
  [{ cca_class: "Class 99" }, "cca_class must be one of: Class 8, Class 10, Class 12, Class 50, Class 14.1."],
  [{ macrs_class: "3-year" }, "macrs_class must be one of: 5-year, 7-year."],
  [{ tax_year: 1999 }, "tax_year must be a valid year (2010+)."]
];

for (const [overrides, expectedMessage] of POST_VALIDATION_CASES) {
  test(`POST / rejects ${Object.keys(overrides)[0]} with 400: ${expectedMessage}`, async () => {
    const fixture = loadFixture();
    try {
      const response = await request(fixture.app)
        .post("/api/capital-assets")
        .send({ ...VALID_BODY, ...overrides });
      assert.equal(response.status, 400);
      assert.equal(response.body.error, expectedMessage);
    } finally {
      fixture.cleanup();
    }
  });
}

test("POST / creates the asset and returns 201", async () => {
  const fixture = loadFixture({
    serviceImpl: { createCapitalAsset: async () => ({ id: "ca_1", name: "Delivery Van" }) }
  });
  try {
    const response = await request(fixture.app).post("/api/capital-assets").send(VALID_BODY);
    assert.equal(response.status, 201);
    assert.equal(response.body.name, "Delivery Van");
  } finally {
    fixture.cleanup();
  }
});

test("POST / returns a generic 500 for an unexpected failure", async () => {
  const fixture = loadFixture({
    serviceImpl: { createCapitalAsset: async () => { throw new Error("db exploded"); } }
  });
  try {
    const response = await request(fixture.app).post("/api/capital-assets").send(VALID_BODY);
    assert.equal(response.status, 500);
    assert.deepEqual(response.body, { error: "Internal server error" });
  } finally {
    fixture.cleanup();
  }
});

test("PUT /:assetId rejects an invalid asset_category", async () => {
  const fixture = loadFixture();
  try {
    const response = await request(fixture.app)
      .put("/api/capital-assets/ca_1")
      .send({ asset_category: "boat" });
    assert.equal(response.status, 400);
    assert.match(response.body.error, /asset_category must be one of/);
  } finally {
    fixture.cleanup();
  }
});

test("PUT /:assetId returns 404 when the asset doesn't exist", async () => {
  const fixture = loadFixture({ serviceImpl: { updateCapitalAsset: async () => null } });
  try {
    const response = await request(fixture.app).put("/api/capital-assets/ca_1").send({ name: "New name" });
    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Capital asset not found.");
  } finally {
    fixture.cleanup();
  }
});

test("PUT /:assetId updates and returns the asset", async () => {
  const fixture = loadFixture({
    serviceImpl: { updateCapitalAsset: async () => ({ id: "ca_1", name: "New name" }) }
  });
  try {
    const response = await request(fixture.app).put("/api/capital-assets/ca_1").send({ name: "New name" });
    assert.equal(response.status, 200);
    assert.equal(response.body.name, "New name");
  } finally {
    fixture.cleanup();
  }
});

test("POST /:assetId/dispose requires disposed_date", async () => {
  const fixture = loadFixture();
  try {
    const response = await request(fixture.app).post("/api/capital-assets/ca_1/dispose").send({});
    assert.equal(response.status, 400);
    assert.equal(response.body.error, "disposed_date is required.");
  } finally {
    fixture.cleanup();
  }
});

test("POST /:assetId/dispose returns 404 when the asset doesn't exist", async () => {
  const fixture = loadFixture({ serviceImpl: { disposeCapitalAsset: async () => null } });
  try {
    const response = await request(fixture.app)
      .post("/api/capital-assets/ca_1/dispose")
      .send({ disposed_date: "2026-06-01" });
    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Capital asset not found.");
  } finally {
    fixture.cleanup();
  }
});

test("POST /:assetId/dispose disposes and returns the asset", async () => {
  const fixture = loadFixture({
    serviceImpl: { disposeCapitalAsset: async () => ({ id: "ca_1", disposed_date: "2026-06-01" }) }
  });
  try {
    const response = await request(fixture.app)
      .post("/api/capital-assets/ca_1/dispose")
      .send({ disposed_date: "2026-06-01" });
    assert.equal(response.status, 200);
    assert.equal(response.body.disposed_date, "2026-06-01");
  } finally {
    fixture.cleanup();
  }
});
