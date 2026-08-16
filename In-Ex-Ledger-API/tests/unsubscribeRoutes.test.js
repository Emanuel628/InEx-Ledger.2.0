"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const { attachCentralErrorHandler } = require("./helpers/testPool.js");

const ROUTE_PATH = require.resolve("../routes/unsubscribe.routes.js");

function loadFixture({ verifyImpl, queryImpl } = {}) {
  const originalLoad = Module._load.bind(Module);

  Module._load = function patchedLoad(requestName, parent, isMain) {
    if (/emailPreferencesService\.js$/.test(requestName)) {
      return {
        verifyUnsubscribeToken: verifyImpl || (() => null)
      };
    }
    if (/db\.js$/.test(requestName)) {
      return {
        pool: {
          query: queryImpl || (async () => ({ rows: [], rowCount: 1 }))
        }
      };
    }
    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[ROUTE_PATH];
  const router = require(ROUTE_PATH);
  const app = express();
  app.use("/api/unsubscribe", router);
  attachCentralErrorHandler(app);

  return {
    app,
    cleanup() {
      delete require.cache[ROUTE_PATH];
      Module._load = originalLoad;
    }
  };
}

test("unsubscribe returns the invalid-link HTML page for bad tokens", async () => {
  const fixture = loadFixture();

  try {
    const response = await request(fixture.app).get("/api/unsubscribe?token=bad");

    assert.equal(response.status, 400);
    assert.match(response.headers["content-type"], /html/);
    assert.match(response.text, /Unsubscribe link invalid/);
  } finally {
    fixture.cleanup();
  }
});

test("unsubscribe persists the opt-out and returns the success HTML page", async () => {
  const queries = [];
  const fixture = loadFixture({
    verifyImpl: () => ({ u: "user_1" }),
    queryImpl: async (sql, params) => {
      queries.push({ sql, params });
      return { rows: [], rowCount: 1 };
    }
  });

  try {
    const response = await request(fixture.app).get("/api/unsubscribe?token=valid");

    assert.equal(response.status, 200);
    assert.match(response.headers["content-type"], /html/);
    assert.match(response.text, /Optional emails turned off/);
    assert.equal(queries.length, 1);
    assert.deepEqual(queries[0].params, ["user_1"]);
  } finally {
    fixture.cleanup();
  }
});

test("unsubscribe forwards unexpected database failures to the central handler", async () => {
  const fixture = loadFixture({
    verifyImpl: () => ({ u: "user_1" }),
    queryImpl: async () => {
      throw new Error("connection reset");
    }
  });

  try {
    const response = await request(fixture.app).get("/api/unsubscribe?token=valid");

    assert.equal(response.status, 500);
    assert.deepEqual(response.body, { error: "Internal server error" });
  } finally {
    fixture.cleanup();
  }
});
