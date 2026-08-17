"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const { attachCentralErrorHandler } = require("./helpers/testPool.js");

const CRYPTO_ROUTE_PATH = require.resolve("../routes/crypto.routes.js");

function loadCryptoRouter() {
  const originalLoad = Module._load.bind(Module);
  const state = {
    limiterHits: 0,
    logErrors: []
  };

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../middleware/rate-limit.middleware.js" || /rate-limit\.middleware\.js$/.test(requestName)) {
      return {
        createDataApiLimiter() {
          return (req, res, next) => {
            state.limiterHits += 1;
            if (req.headers["x-test-rate-limit"] === "block") {
              return res.status(429).json({ error: "Too many requests." });
            }
            next();
          };
        }
      };
    }
    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return {
        logError(message, context) {
          state.logErrors.push({ message, context });
        }
      };
    }

    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[CRYPTO_ROUTE_PATH];
  const router = require("../routes/crypto.routes.js");
  const app = express();
  app.use("/api/crypto", router);
  attachCentralErrorHandler(app);

  return {
    app,
    state,
    cleanup() {
      delete require.cache[CRYPTO_ROUTE_PATH];
      Module._load = originalLoad;
      delete process.env.EXPORT_PUBLIC_KEY_JWK;
      delete process.env.EXPORT_PUBLIC_KEY_KID;
    }
  };
}

test("export public key route reparses the env key after rotation without a restart", async () => {
  const fixture = loadCryptoRouter();
  try {
    process.env.EXPORT_PUBLIC_KEY_JWK = JSON.stringify({ kty: "RSA", n: "first", e: "AQAB" });
    process.env.EXPORT_PUBLIC_KEY_KID = "kid-1";

    const first = await request(fixture.app).get("/api/crypto/export-public-key");
    assert.equal(first.status, 200);
    assert.equal(first.body.kid, "kid-1");
    assert.equal(first.body.jwk.n, "first");

    process.env.EXPORT_PUBLIC_KEY_JWK = JSON.stringify({ kty: "RSA", n: "second", e: "AQAB" });
    process.env.EXPORT_PUBLIC_KEY_KID = "kid-2";

    const second = await request(fixture.app).get("/api/crypto/export-public-key");
    assert.equal(second.status, 200);
    assert.equal(second.body.kid, "kid-2");
    assert.equal(second.body.jwk.n, "second");
    assert.equal(second.headers["cache-control"], "public, max-age=60, must-revalidate");
  } finally {
    fixture.cleanup();
  }
});

test("export public key route is protected by its rate limiter", async () => {
  const fixture = loadCryptoRouter();
  try {
    process.env.EXPORT_PUBLIC_KEY_JWK = JSON.stringify({ kty: "RSA", n: "first", e: "AQAB" });

    const response = await request(fixture.app)
      .get("/api/crypto/export-public-key")
      .set("x-test-rate-limit", "block");

    assert.equal(response.status, 429);
    assert.equal(fixture.state.limiterHits > 0, true);
  } finally {
    fixture.cleanup();
  }
});

test("export public key route logs parse failures and returns 503", async () => {
  const fixture = loadCryptoRouter();
  try {
    process.env.EXPORT_PUBLIC_KEY_JWK = "{not json";

    const response = await request(fixture.app).get("/api/crypto/export-public-key");

    assert.equal(response.status, 503);
    assert.equal(fixture.state.logErrors.length, 1);
    assert.match(fixture.state.logErrors[0].message, /Failed to parse EXPORT_PUBLIC_KEY_JWK/);
  } finally {
    fixture.cleanup();
  }
});

test("export public key route returns its real 503 message, not the central handler's generic one", async () => {
  const fixture = loadCryptoRouter();
  try {
    // No EXPORT_PUBLIC_KEY_JWK set at all -- distinct from the parse-failure
    // case above, and the path where it would be easiest to silently regress
    // into a thrown 5xx ApiError, whose message the central handler replaces
    // with "Internal server error" (it hides all 5xx detail by design).
    const response = await request(fixture.app).get("/api/crypto/export-public-key");

    assert.equal(response.status, 503);
    assert.deepEqual(response.body, { error: "Export public key not configured." });
  } finally {
    fixture.cleanup();
  }
});
