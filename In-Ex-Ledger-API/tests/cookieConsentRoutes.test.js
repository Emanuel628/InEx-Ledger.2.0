"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const cookieParser = require("cookie-parser");
const request = require("supertest");

const CONSENT_ROUTE_PATH = require.resolve("../routes/consent.routes.js");

function loadConsentRouterFixture(overrides = {}) {
  const originalLoad = Module._load.bind(Module);
  const state = {
    queries: [],
    inserted: null
  };

  Module._load = function (requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql, params) {
            state.queries.push({ sql, params });
            if (/FROM refresh_tokens/i.test(sql)) {
              if (overrides.refreshUserId === null) {
                return { rowCount: 0, rows: [] };
              }
              return { rowCount: 1, rows: [{ user_id: overrides.refreshUserId || "user_cookie_123" }] };
            }
            if (/SELECT decision, version, created_at\s+FROM cookie_consent_log/i.test(sql)) {
              if (overrides.latestRecord === null) {
                return { rowCount: 0, rows: [] };
              }
              return {
                rowCount: 1,
                rows: [overrides.latestRecord || {
                  decision: "declined",
                  version: "1",
                  created_at: "2026-05-04T12:00:00.000Z"
                }]
              };
            }
            if (/INSERT INTO cookie_consent_log/i.test(sql)) {
              state.inserted = params;
              return { rowCount: 1, rows: [] };
            }
            throw new Error(`Unhandled SQL in cookieConsentRoutes.test.js: ${sql}`);
          }
        }
      };
    }

    if (requestName === "../middleware/rate-limit.middleware.js" || /rate-limit\.middleware\.js$/.test(requestName)) {
      return {
        createRouteLimiter() {
          return (_req, _res, next) => next();
        }
      };
    }

    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        verifyToken(token) {
          if (token === "valid_access_token") {
            return { id: "user_access_123" };
          }
          throw new Error("invalid token");
        }
      };
    }

    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return {
        logError() {}
      };
    }

    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[CONSENT_ROUTE_PATH];
  const router = require("../routes/consent.routes.js");
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use("/api/consent", router);

  return {
    app,
    state,
    cleanup() {
      delete require.cache[CONSENT_ROUTE_PATH];
      Module._load = originalLoad;
    }
  };
}

test("POST /api/consent/cookie stores consent against the signed-in user resolved from refresh cookie and sets a consent cookie", async () => {
  const fixture = loadConsentRouterFixture();

  try {
    const response = await request(fixture.app)
      .post("/api/consent/cookie")
      .set("Cookie", ["refresh_token=refresh_cookie_value"])
      .send({ decision: "accepted", version: "1" });

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(response.headers["set-cookie"]));
    assert.ok(
      response.headers["set-cookie"].some((cookie) => cookie.startsWith("lb_cookie_consent=")),
      "consent cookie should be written back to the browser"
    );
    assert.ok(Array.isArray(fixture.state.inserted), "consent log insert should run");
    assert.equal(fixture.state.inserted[1], "user_cookie_123");
    assert.equal(fixture.state.inserted[2], "accepted");
    assert.equal(response.body?.record?.decision, "accepted");
  } finally {
    fixture.cleanup();
  }
});

test("GET /api/consent/cookie restores the latest saved database decision for the authenticated user", async () => {
  const fixture = loadConsentRouterFixture();

  try {
    const response = await request(fixture.app)
      .get("/api/consent/cookie")
      .set("Authorization", "Bearer valid_access_token");

    assert.equal(response.status, 200);
    assert.equal(response.body?.record?.decision, "declined");
    assert.equal(response.body?.record?.version, "1");
    assert.ok(Array.isArray(response.headers["set-cookie"]));
    assert.ok(
      response.headers["set-cookie"].some((cookie) => cookie.startsWith("lb_cookie_consent=")),
      "restored consent should refresh the browser cookie"
    );
  } finally {
    fixture.cleanup();
  }
});

test("GET /api/consent/cookie falls back to the existing browser cookie when no authenticated database record exists", async () => {
  const fixture = loadConsentRouterFixture({ refreshUserId: null, latestRecord: null });

  try {
    const response = await request(fixture.app)
      .get("/api/consent/cookie")
      .set("Cookie", ['lb_cookie_consent=%7B%22decision%22%3A%22accepted%22%2C%22version%22%3A%221%22%2C%22at%22%3A%222026-05-04T12%3A00%3A00.000Z%22%7D']);

    assert.equal(response.status, 200);
    assert.equal(response.body?.record?.decision, "accepted");
    assert.equal(response.body?.record?.version, "1");
  } finally {
    fixture.cleanup();
  }
});
