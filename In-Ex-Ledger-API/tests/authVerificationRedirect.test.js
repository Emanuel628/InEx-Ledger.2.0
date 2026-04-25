"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-auth-verification-secret";

const { verifyToken } = require("../middleware/auth.middleware.js");
const AUTH_ROUTE_PATH = require.resolve("../routes/auth.routes.js");

function loadAuthRouter() {
  const originalLoad = Module._load.bind(Module);
  const state = {
    consumedToken: null,
    refreshTokenInsert: null,
    recognizedDeviceInsert: null
  };

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "resend") {
      return {
        Resend: class Resend {
          constructor() {}
          get emails() {
            return {
              send: async () => ({ id: "email_test" })
            };
          }
        }
      };
    }

    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql, params = []) {
            if (/DELETE FROM verification_tokens WHERE expires_at <= NOW\(\)/i.test(sql)) {
              return { rows: [], rowCount: 0 };
            }

            if (/DELETE FROM verification_tokens WHERE token = \$1 AND expires_at > NOW\(\) RETURNING email/i.test(sql)) {
              state.consumedToken = params[0];
              return params[0] === "verify_token_123"
                ? { rows: [{ email: "verified@example.com" }], rowCount: 1 }
                : { rows: [], rowCount: 0 };
            }

            if (/UPDATE users\s+SET email_verified = true/i.test(sql)) {
              return {
                rows: [{
                  id: "user_verified_1",
                  email: "verified@example.com",
                  email_verified: true,
                  mfa_enabled: false,
                  role: "user",
                  created_at: new Date("2026-04-16T12:00:00Z").toISOString(),
                  is_erased: false
                }],
                rowCount: 1
              };
            }

            if (/INSERT INTO refresh_tokens/i.test(sql)) {
              state.refreshTokenInsert = params;
              return { rows: [], rowCount: 1 };
            }

            if (/INSERT INTO recognized_signin_devices/i.test(sql)) {
              state.recognizedDeviceInsert = params;
              return { rows: [{ id: "recognized_device_1" }], rowCount: 1 };
            }

            throw new Error(`Unhandled SQL in test stub: ${sql}`);
          }
        }
      };
    }

    if (requestName === "../middleware/rateLimitTiers.js" || /rateLimitTiers\.js$/.test(requestName)) {
      return {
        createAuthLimiter() {
          return (_req, _res, next) => next();
        },
        createMfaVerifyLimiter() {
          return (_req, _res, next) => next();
        },
        createPasswordLimiter() {
          return (_req, _res, next) => next();
        },
        createTokenRefreshLimiter() {
          return (_req, _res, next) => next();
        }
      };
    }

    if (requestName === "../api/utils/resolveBusinessIdForUser.js" || /resolveBusinessIdForUser\.js$/.test(requestName)) {
      return {
        resolveBusinessIdForUser: async () => "biz_verified_1"
      };
    }

    if (requestName === "../services/subscriptionService.js" || /subscriptionService\.js$/.test(requestName)) {
      return {
        getSubscriptionSnapshotForBusiness: async () => ({
          effectiveTier: "trial",
          effectiveStatus: "trialing"
        })
      };
    }

    if (requestName === "../utils/authUtils.js" || /authUtils\.js$/.test(requestName)) {
      return {
        COOKIE_OPTIONS: { httpOnly: true, sameSite: "strict", secure: false, path: "/" },
        isLegacyScryptHash: () => false,
        verifyPassword: async () => ({ match: true, legacy: false })
      };
    }

    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return {
        logError() {},
        logWarn() {},
        logInfo() {}
      };
    }

    if (requestName === "../services/emailI18nService.js" || /emailI18nService\.js$/.test(requestName)) {
      return {
        getPreferredLanguageForUser: async () => "en",
        getPreferredLanguageForEmail: async () => "en",
        buildWelcomeVerificationEmail: () => ({ subject: "verify", html: "", text: "" }),
        buildVerificationEmail: () => ({ subject: "verify", html: "", text: "" }),
        buildPasswordResetEmail: () => ({ subject: "reset", html: "", text: "" }),
        buildEmailChangeEmail: () => ({ subject: "change", html: "", text: "" }),
        buildMfaEmailContent: () => ({ subject: "mfa", html: "", text: "" })
      };
    }

    if (requestName === "../services/signInSecurityService.js" || /signInSecurityService\.js$/.test(requestName)) {
      return {
        normalizeUserAgent: (value) => String(value || ""),
        extractClientIp: () => "203.0.113.42",
        hashValue: (value) => String(value || ""),
        buildDeviceFingerprint: () => "fingerprint_test",
        fetchIpLocation: async () => null
      };
    }

    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[AUTH_ROUTE_PATH];

  try {
    const router = require("../routes/auth.routes.js");
    return {
      router,
      state,
      cleanup() {
        delete require.cache[AUTH_ROUTE_PATH];
      }
    };
  } finally {
    Module._load = originalLoad;
  }
}

function buildApp(router) {
  const app = express();
  app.use("/api/auth", router);
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message });
  });
  return app;
}

test("verify-email marks the user verified and redirects into an authenticated session", async () => {
  const fixture = loadAuthRouter();

  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .get("/api/auth/verify-email?token=verify_token_123")
      .redirects(0);

    assert.equal(response.status, 302);
    assert.equal(fixture.state.consumedToken, "verify_token_123");
    assert.ok(Array.isArray(response.headers["set-cookie"]), "refresh cookie should be set");
    assert.ok(
      response.headers["set-cookie"].some((cookie) => cookie.startsWith("refresh_token=")),
      "refresh token cookie should be present"
    );

    const location = String(response.headers.location || "");
    assert.match(location, /^\/verify-email#/);

    const hash = location.split("#")[1] || "";
    const params = new URLSearchParams(hash);
    assert.equal(params.get("verified"), "true");
    assert.equal(params.get("next"), "/onboarding");

    const accessToken = params.get("token");
    assert.ok(accessToken, "redirect hash should contain an access token");

    const decoded = verifyToken(accessToken);
    assert.equal(decoded.id, "user_verified_1");
    assert.equal(decoded.email, "verified@example.com");
    assert.equal(decoded.email_verified, true);
    assert.equal(decoded.business_id, "biz_verified_1");
    assert.equal(decoded.mfa_enabled, false);
    assert.ok(Array.isArray(fixture.state.refreshTokenInsert), "refresh token should be persisted");
    assert.ok(Array.isArray(fixture.state.recognizedDeviceInsert), "verified-email sign-in should register the current device");
  } finally {
    fixture.cleanup();
  }
});
