"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const ROUTE_PATH = require.resolve("../routes/homeOffice.routes.js");

function loadHomeOfficeRouterFixture() {
  const originalLoad = Module._load.bind(Module);
  const state = { queries: [] };

  Module._load = function (requestName, parent, isMain) {
    if (/db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql, params = []) {
            state.queries.push({ sql, params });
            if (/SELECT[\s\S]*FROM home_office_worksheets/i.test(sql)) {
              return {
                rows: [{
                  id: "ws_1", business_id: params[0], tax_year: params[1],
                  method: "actual", total_area_sqft: 1000, office_area_sqft: 200,
                  months_used: 12, notes: null
                }],
                rowCount: 1
              };
            }
            if (/INSERT INTO home_office_worksheets/i.test(sql)) {
              return {
                rows: [{
                  id: "ws_1", business_id: params[0], tax_year: params[1],
                  method: params[2], total_area_sqft: params[3], office_area_sqft: params[4],
                  months_used: params[5], notes: params[6]
                }],
                rowCount: 1
              };
            }
            if (/DELETE FROM home_office_worksheets/i.test(sql)) {
              return { rows: [], rowCount: 1 };
            }
            throw new Error(`Unhandled SQL: ${sql}`);
          }
        }
      };
    }
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
    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[ROUTE_PATH];
  delete require.cache[require.resolve("../services/homeOfficeService.js")];
  const router = require(ROUTE_PATH);
  Module._load = originalLoad;

  const app = express();
  app.use(express.json());
  app.use("/api/home-office-worksheet", router);
  return { app, state };
}

test("GET returns the worksheet for the requested tax year", async () => {
  const { app } = loadHomeOfficeRouterFixture();
  const response = await request(app).get("/api/home-office-worksheet?tax_year=2026");
  assert.equal(response.status, 200);
  assert.equal(response.body.taxYear, 2026);
  assert.equal(response.body.worksheet.method, "actual");
  assert.equal(response.body.worksheet.office_area_sqft, 200);
});

test("PUT upserts the worksheet inputs", async () => {
  const { app } = loadHomeOfficeRouterFixture();
  const response = await request(app)
    .put("/api/home-office-worksheet")
    .send({ tax_year: 2026, method: "actual", total_area_sqft: 1000, office_area_sqft: 250, months_used: 12 });
  assert.equal(response.status, 200);
  assert.equal(response.body.worksheet.office_area_sqft, 250);
});

test("PUT rejects an office area larger than the total area", async () => {
  const { app } = loadHomeOfficeRouterFixture();
  const response = await request(app)
    .put("/api/home-office-worksheet")
    .send({ tax_year: 2026, method: "actual", total_area_sqft: 100, office_area_sqft: 200 });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /cannot exceed total/i);
});

test("DELETE removes the worksheet for the tax year", async () => {
  const { app } = loadHomeOfficeRouterFixture();
  const response = await request(app).delete("/api/home-office-worksheet?tax_year=2026");
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
});
