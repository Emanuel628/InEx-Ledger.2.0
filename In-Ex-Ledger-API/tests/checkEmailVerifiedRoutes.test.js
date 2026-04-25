"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-check-email-verified-secret";

const { signToken } = require("../middleware/auth.middleware.js");

const ROUTE_PATH = require.resolve("../routes/check-email-verified.routes.js");

function loadRoute({ verified = false } = {}) {
  const originalLoad = Module._load.bind(Module);

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql, params = []) {
            if (/SELECT email_verified FROM users WHERE email = \$1 LIMIT 1/i.test(sql)) {
              if (String(params[0] || "").toLowerCase() === "person@example.com") {
                return { rows: [{ email_verified: verified }], rowCount: 1 };
              }
              return { rows: [], rowCount: 0 };
            }
            throw new Error(`Unhandled SQL in test stub: ${sql}`);
          }
        }
      };
    }

    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[ROUTE_PATH];

  try {
    const router = require("../routes/check-email-verified.routes.js");
    const app = express();
    app.use("/api/check-email-verified", router);
    return {
      app,
      cleanup() {
        delete require.cache[ROUTE_PATH];
        Module._load = originalLoad;
      }
    };
  } catch (error) {
    Module._load = originalLoad;
    throw error;
  }
}

function makeState(email) {
  return signToken({
    purpose: "verify_email_status",
    email
  });
}

test("check-email-verified returns status only for a signed verification state", async () => {
  const fixture = loadRoute({ verified: true });

  try {
    const response = await request(fixture.app)
      .get("/api/check-email-verified")
      .query({ state: makeState("person@example.com") });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { verified: true });
  } finally {
    fixture.cleanup();
  }
});

test("check-email-verified rejects invalid verification state tokens", async () => {
  const fixture = loadRoute({ verified: false });

  try {
    const response = await request(fixture.app)
      .get("/api/check-email-verified")
      .query({ state: "not-a-valid-state" });

    assert.equal(response.status, 401);
    assert.match(String(response.body?.error || ""), /invalid verification state/i);
  } finally {
    fixture.cleanup();
  }
});
