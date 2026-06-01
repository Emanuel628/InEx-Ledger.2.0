"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const ROUTE_PATH = require.resolve("../routes/mileage.routes.js");
const VALID_UUID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

class FakeAccountingPeriodLockedError extends Error {
  constructor() {
    super("Accounting period is locked.");
    this.name = "AccountingPeriodLockedError";
    this.status = 409;
    this.code = "accounting_period_locked";
    this.lockedThroughDate = "2026-01-01";
    this.transactionDate = "2026-01-01";
  }
}

function loadMileageRouterFixture(options = {}) {
  const originalLoad = Module._load.bind(Module);
  const tier = options.tier || "pro";
  const state = {
    queries: [],
    logErrors: []
  };

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql, params = []) {
            state.queries.push({ sql, params });
            if (/information_schema\.columns/i.test(sql)) {
              return { rows: [{ column_name: "date" }, { column_name: "trip_date" }], rowCount: 2 };
            }
            if (/INSERT INTO mileage/i.test(sql)) {
              return { rows: [{ id: "mileage_created", params }], rowCount: 1 };
            }
            if (/INSERT INTO vehicle_costs/i.test(sql)) {
              return {
                rows: [{
                  id: "cost_created",
                  business_id: params[1],
                  entry_type: params[2],
                  entry_date: params[3],
                  title: params[4],
                  vendor: params[5],
                  amount: params[6],
                  notes: params[7],
                  created_at: new Date().toISOString()
                }],
                rowCount: 1
              };
            }
            if (/SELECT COUNT\(\*\) FROM mileage/i.test(sql)) {
              return { rows: [{ count: "2" }], rowCount: 1 };
            }
            if (/FROM mileage\s+WHERE business_id/i.test(sql) || /AS trip_date,\s+purpose/i.test(sql)) {
              return {
                rows: [
                  { id: "m1", trip_date: "2026-05-02", purpose: "Client visit", destination: "Office", miles: 20, km: 32.19 }
                ],
                rowCount: 1
              };
            }
            if (/AS trip_date FROM mileage WHERE id/i.test(sql)) {
              return options.missingTrip
                ? { rows: [], rowCount: 0 }
                : { rows: [{ id: params[0], trip_date: "2026-05-02" }], rowCount: 1 };
            }
            if (/DELETE FROM mileage/i.test(sql)) {
              return { rows: [], rowCount: 1 };
            }
            if (/FROM vehicle_costs/i.test(sql)) {
              return { rows: [{ id: "c1", entry_type: "expense", amount: 40 }], rowCount: 1 };
            }
            return { rows: [], rowCount: 0 };
          }
        }
      };
    }

    if (/auth\.middleware\.js$/.test(requestName)) {
      return {
        requireAuth(req, _res, next) {
          req.user = { id: "user_1" };
          next();
        }
      };
    }

    if (/csrf\.middleware\.js$/.test(requestName)) {
      return { requireCsrfProtection: (_req, _res, next) => next() };
    }

    if (/rate-limit\.middleware\.js$/.test(requestName)) {
      return { createDataApiLimiter: () => (_req, _res, next) => next() };
    }

    if (/resolveBusinessIdForUser\.js$/.test(requestName)) {
      return { resolveBusinessIdForUser: async () => "biz_1" };
    }

    if (/subscriptionService\.js$/.test(requestName)) {
      return { getSubscriptionSnapshotForBusiness: async () => ({ effectiveTier: tier }) };
    }

    if (/accountingLockService\.js$/.test(requestName)) {
      return {
        AccountingPeriodLockedError: FakeAccountingPeriodLockedError,
        loadAccountingLockState: async () => ({}),
        assertDateUnlocked() {
          if (options.locked) {
            throw new FakeAccountingPeriodLockedError();
          }
        }
      };
    }

    if (/exportSnapshotService\.js$/.test(requestName)) {
      return { invalidateSnapshotsForBusiness: async () => {} };
    }

    if (/utils\/logger\.js$/.test(requestName)) {
      return {
        logError: (...args) => state.logErrors.push(args),
        logWarn() {},
        logInfo() {}
      };
    }

    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[ROUTE_PATH];
  const router = require(ROUTE_PATH);
  Module._load = originalLoad;

  const app = express();
  app.use(express.json());
  app.use("/api/mileage", router);

  return { app, state };
}

function findInsertMileageParams(state) {
  const entry = state.queries.find((item) => /INSERT INTO mileage/i.test(item.sql));
  return entry ? entry.params : null;
}

test("POST /api/mileage rejects a trip with no date or purpose", async () => {
  const { app } = loadMileageRouterFixture();
  const response = await request(app).post("/api/mileage").send({ miles: 10 });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /purpose/i);
});

test("POST /api/mileage rejects an invalid trip date", async () => {
  const { app } = loadMileageRouterFixture();
  const response = await request(app)
    .post("/api/mileage")
    .send({ trip_date: "not-a-date", purpose: "Client", miles: 10 });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /valid date/i);
});

test("POST /api/mileage requires distance or an odometer range", async () => {
  const { app } = loadMileageRouterFixture();
  const response = await request(app)
    .post("/api/mileage")
    .send({ trip_date: "2026-05-02", purpose: "Client" });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /miles, kilometers, or both odometer/i);
});

test("POST /api/mileage rejects an odometer range that ends before it starts", async () => {
  const { app } = loadMileageRouterFixture();
  const response = await request(app)
    .post("/api/mileage")
    .send({ trip_date: "2026-05-02", purpose: "Client", odometer_start: 100, odometer_end: 50 });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /odometer_end must be greater/i);
});

test("POST /api/mileage derives kilometers from a miles-only trip", async () => {
  const { app, state } = loadMileageRouterFixture();
  const response = await request(app)
    .post("/api/mileage")
    .send({ trip_date: "2026-05-02", purpose: "Client", miles: 100 });
  assert.equal(response.status, 201);
  const params = findInsertMileageParams(state);
  // [uuid, businessId, date, trip_date, purpose, destination, miles, km, odoStart, odoEnd]
  assert.equal(params[6], 100);
  assert.equal(params[7], 160.93);
});

test("POST /api/mileage derives miles from a kilometers-only trip", async () => {
  const { app, state } = loadMileageRouterFixture();
  const response = await request(app)
    .post("/api/mileage")
    .send({ trip_date: "2026-05-02", purpose: "Client", km: 100 });
  assert.equal(response.status, 201);
  const params = findInsertMileageParams(state);
  assert.equal(params[7], 100);
  assert.equal(params[6], 62.14);
});

test("POST /api/mileage returns 409 when the trip date is in a locked period", async () => {
  const { app } = loadMileageRouterFixture({ locked: true });
  const response = await request(app)
    .post("/api/mileage")
    .send({ trip_date: "2026-05-02", purpose: "Client", miles: 10 });
  assert.equal(response.status, 409);
  assert.equal(response.body.code, "accounting_period_locked");
});

test("GET /api/mileage lists trips with a total count", async () => {
  const { app } = loadMileageRouterFixture();
  const response = await request(app).get("/api/mileage");
  assert.equal(response.status, 200);
  assert.equal(response.body.total, 2);
  assert.equal(response.body.data.length, 1);
  assert.equal(response.body.data[0].purpose, "Client visit");
});

test("POST /api/mileage/costs gates vehicle cost tracking behind Pro", async () => {
  const { app } = loadMileageRouterFixture({ tier: "free" });
  const response = await request(app)
    .post("/api/mileage/costs")
    .send({ entry_type: "expense", entry_date: "2026-05-02", title: "Fuel", amount: 60 });
  assert.equal(response.status, 402);
  assert.equal(response.body.code, "pro_feature_required");
});

test("POST /api/mileage/costs rejects an invalid entry type", async () => {
  const { app } = loadMileageRouterFixture();
  const response = await request(app)
    .post("/api/mileage/costs")
    .send({ entry_type: "groceries", entry_date: "2026-05-02", title: "Fuel", amount: 60 });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /expense or maintenance/i);
});

test("POST /api/mileage/costs rejects a non-positive amount", async () => {
  const { app } = loadMileageRouterFixture();
  const response = await request(app)
    .post("/api/mileage/costs")
    .send({ entry_type: "expense", entry_date: "2026-05-02", title: "Fuel", amount: 0 });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /greater than 0/i);
});

test("POST /api/mileage/costs saves a valid Pro vehicle cost", async () => {
  const { app } = loadMileageRouterFixture();
  const response = await request(app)
    .post("/api/mileage/costs")
    .send({ entry_type: "maintenance", entry_date: "2026-05-02", title: "Oil change", vendor: "Shop", amount: 89.5, notes: "Synthetic" });
  assert.equal(response.status, 201);
  assert.equal(response.body.entry_type, "maintenance");
  assert.equal(response.body.amount, 89.5);
  assert.equal(response.body.title, "Oil change");
});

test("GET /api/mileage/costs rejects an invalid type filter", async () => {
  const { app } = loadMileageRouterFixture();
  const response = await request(app).get("/api/mileage/costs?type=bogus");
  assert.equal(response.status, 400);
  assert.match(response.body.error, /Invalid vehicle cost type/i);
});

test("DELETE /api/mileage/:id rejects a malformed id", async () => {
  const { app } = loadMileageRouterFixture();
  const response = await request(app).delete("/api/mileage/not-a-uuid");
  assert.equal(response.status, 400);
  assert.match(response.body.error, /Invalid mileage record ID/i);
});

test("DELETE /api/mileage/:id returns 404 when the trip is missing", async () => {
  const { app } = loadMileageRouterFixture({ missingTrip: true });
  const response = await request(app).delete(`/api/mileage/${VALID_UUID}`);
  assert.equal(response.status, 404);
});

test("DELETE /api/mileage/:id removes an existing trip", async () => {
  const { app } = loadMileageRouterFixture();
  const response = await request(app).delete(`/api/mileage/${VALID_UUID}`);
  assert.equal(response.status, 200);
  assert.match(response.body.message, /deleted/i);
});
