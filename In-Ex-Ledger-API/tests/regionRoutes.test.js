"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");

const ROUTE_PATH = require.resolve("../routes/region.routes.js");

function loadRegionRouter(env = {}) {
  const previous = process.env.TRUST_EDGE_REGION_HEADERS;
  if (env.TRUST_EDGE_REGION_HEADERS === undefined) {
    delete process.env.TRUST_EDGE_REGION_HEADERS;
  } else {
    process.env.TRUST_EDGE_REGION_HEADERS = env.TRUST_EDGE_REGION_HEADERS;
  }

  delete require.cache[ROUTE_PATH];
  const router = require("../routes/region.routes.js");
  const app = express();
  app.use("/api/region", router);

  return {
    app,
    cleanup() {
      delete require.cache[ROUTE_PATH];
      if (previous === undefined) delete process.env.TRUST_EDGE_REGION_HEADERS;
      else process.env.TRUST_EDGE_REGION_HEADERS = previous;
    }
  };
}

test("region detect ignores spoofable edge headers by default", async () => {
  const fixture = loadRegionRouter();

  try {
    const response = await request(fixture.app)
      .get("/api/region/detect")
      .set("cf-ipcountry", "CA");

    assert.equal(response.status, 200);
    assert.equal(response.body.region, "US");
    assert.equal(response.body.source, "default");
    assert.equal(response.body.persisted, false);
  } finally {
    fixture.cleanup();
  }
});

test("region detect can trust edge headers only when explicitly enabled", async () => {
  const fixture = loadRegionRouter({ TRUST_EDGE_REGION_HEADERS: "true" });

  try {
    const response = await request(fixture.app)
      .get("/api/region/detect")
      .set("cf-ipcountry", "CA");

    assert.equal(response.status, 200);
    assert.equal(response.body.region, "CA");
    assert.equal(response.body.source, "edge_header");
    assert.equal(response.body.persisted, false);
  } finally {
    fixture.cleanup();
  }
});
