"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const AUTH_ROUTE_PATH = require.resolve("../routes/auth.routes.js");

function loadAuthRouterFixture() {
  const originalLoad = Module._load.bind(Module);
  const previousEnv = {
    APP_BASE_URL: process.env.APP_BASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    RESEND_API_KEY: process.env.RESEND_API_KEY
  };
  const state = {
    resetEmailLink: null
  };

  process.env.APP_BASE_URL = "https://app.inexledger.test";
  process.env.NODE_ENV = "test";
  process.env.RESEND_API_KEY = "resend_test_key";

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "resend") {
      return {
        Resend: class Resend {
          constructor() {
            this.emails = {
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
            if (/SELECT id FROM users WHERE email = \$1/i.test(sql)) {
              return { rows: [{ id: "user_reset_001" }], rowCount: 1 };
            }
            if (/DELETE FROM password_reset_tokens WHERE email = \$1/i.test(sql)) {
              return { rows: [], rowCount: 1 };
            }
            if (/INSERT INTO password_reset_tokens/i.test(sql)) {
              return { rows: [], rowCount: 1 };
            }
            return { rows: [], rowCount: 0 };
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
        resolveBusinessIdForUser: async () => "biz_reset_001"
      };
    }

    if (requestName === "../services/subscriptionService.js" || /subscriptionService\.js$/.test(requestName)) {
      return {
        getSubscriptionSnapshotForUser: async () => ({ effectiveTier: "free" }),
        getSubscriptionSnapshotForBusiness: async () => ({ effectiveTier: "free" })
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
        buildWelcomeVerificationEmail: () => ({ subject: "", html: "", text: "" }),
        buildVerificationEmail: () => ({ subject: "", html: "", text: "" }),
        buildPasswordResetEmail: (_lang, resetLink) => {
          state.resetEmailLink = resetLink;
          return { subject: "Reset", html: resetLink, text: resetLink };
        },
        buildEmailChangeEmail: () => ({ subject: "", html: "", text: "" }),
        buildMfaEmailContent: () => ({ subject: "", html: "", text: "" })
      };
    }

    if (requestName === "../services/signInSecurityService.js" || /signInSecurityService\.js$/.test(requestName)) {
      return {
        normalizeUserAgent: (value) => String(value || ""),
        extractClientIp: () => "203.0.113.10",
        hashValue: (value) => String(value || ""),
        buildDeviceFingerprint: () => "fp",
        fetchIpLocation: async () => null
      };
    }

    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[AUTH_ROUTE_PATH];
  const router = require("../routes/auth.routes.js");
  const app = express();
  app.use(express.json());
  app.use("/api/auth", router);

  return {
    app,
    state,
    cleanup() {
      delete require.cache[AUTH_ROUTE_PATH];
      Module._load = originalLoad;
      process.env.APP_BASE_URL = previousEnv.APP_BASE_URL;
      process.env.NODE_ENV = previousEnv.NODE_ENV;
      process.env.RESEND_API_KEY = previousEnv.RESEND_API_KEY;
    }
  };
}

test("forgot-password emails a reset link that keeps the token in the URL hash", async () => {
  const fixture = loadAuthRouterFixture();

  try {
    const response = await request(fixture.app)
      .post("/api/auth/forgot-password")
      .send({ email: "person@example.com" });

    assert.equal(response.status, 200);
    assert.match(String(fixture.state.resetEmailLink || ""), /\/reset-password#token=/);
    assert.doesNotMatch(String(fixture.state.resetEmailLink || ""), /\?token=/);
  } finally {
    fixture.cleanup();
  }
});
