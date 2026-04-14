"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");
const cookieParser = require("cookie-parser");

const AUTH_ROUTE_PATH = require.resolve("../routes/auth.routes.js");

function makeHash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function loadAuthRouter(options = {}) {
  const originalLoad = Module._load.bind(Module);
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAppBaseUrl = process.env.APP_BASE_URL;
  const originalFrontendUrl = process.env.FRONTEND_URL;
  const originalResendApiKey = process.env.RESEND_API_KEY;
  const originalResendFrom = process.env.RESEND_FROM_EMAIL;

  process.env.NODE_ENV = options.nodeEnv || "test";
  if (Object.prototype.hasOwnProperty.call(options, "appBaseUrl")) {
    process.env.APP_BASE_URL = options.appBaseUrl;
  } else {
    delete process.env.APP_BASE_URL;
  }
  if (Object.prototype.hasOwnProperty.call(options, "frontendUrl")) {
    process.env.FRONTEND_URL = options.frontendUrl;
  } else {
    delete process.env.FRONTEND_URL;
  }
  process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "test-resend-api-key";
  process.env.RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "InEx Ledger <noreply@example.com>";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-auth-device-verification-secret";

  const state = {
    user: {
      id: "00000000-0000-4000-8000-0000000000u1",
      email: "integration@example.com",
      password_hash: "$2b$12$placeholder",
      email_verified: true,
      mfa_enabled: false,
      mfa_enabled_at: null,
      role: "user",
      created_at: new Date().toISOString(),
      is_erased: false
    },
    businessId: "00000000-0000-4000-8000-0000000000b1",
    recognizedDevice: !!options.recognizedDevice,
    pendingChallengeId: null,
    pendingChallengeCodeHash: null,
    sentEmails: [],
    capturedQueries: []
  };

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql, params = []) {
            state.capturedQueries.push({ sql, params });

            if (/SELECT id, email, password_hash, email_verified, mfa_enabled, mfa_enabled_at, role, created_at, is_erased FROM users WHERE email = \$1/i.test(sql)) {
              if (String(params[0] || "").toLowerCase() === state.user.email) {
                return { rows: [state.user], rowCount: 1 };
              }
              return { rows: [], rowCount: 0 };
            }

            if (/SELECT id, email, password_hash, email_verified, mfa_enabled, mfa_enabled_at, role, created_at, is_erased FROM users WHERE id = \$1/i.test(sql)) {
              return params[0] === state.user.id
                ? { rows: [state.user], rowCount: 1 }
                : { rows: [], rowCount: 0 };
            }

            if (/SELECT id FROM users WHERE email = \$1/i.test(sql)) {
              return String(params[0] || "").toLowerCase() === state.user.email
                ? { rows: [{ id: state.user.id }], rowCount: 1 }
                : { rows: [], rowCount: 0 };
            }

            if (/DELETE FROM password_reset_tokens WHERE email = \$1/i.test(sql)) {
              return { rows: [], rowCount: 0 };
            }

            if (/INSERT INTO password_reset_tokens/i.test(sql)) {
              return { rows: [], rowCount: 1 };
            }

            if (/SELECT id\s+FROM recognized_signin_devices/i.test(sql)) {
              return state.recognizedDevice
                ? { rows: [{ id: "recognized-device-1" }], rowCount: 1 }
                : { rows: [], rowCount: 0 };
            }

            if (/UPDATE recognized_signin_devices\s+SET last_seen_at/i.test(sql)) {
              state.recognizedDevice = true;
              return { rows: [], rowCount: 1 };
            }

            if (/INSERT INTO recognized_signin_devices/i.test(sql)) {
              state.recognizedDevice = true;
              return { rows: [], rowCount: 1 };
            }

            if (/DELETE FROM mfa_email_challenges WHERE user_id = \$1 AND consumed_at IS NULL/i.test(sql)) {
              state.pendingChallengeId = null;
              state.pendingChallengeCodeHash = null;
              return { rows: [], rowCount: 0 };
            }

            if (/INSERT INTO mfa_email_challenges/i.test(sql)) {
              state.pendingChallengeId = params[0];
              state.pendingChallengeCodeHash = params[2];
              return { rows: [], rowCount: 1 };
            }

            if (/SELECT id, code_hash, attempt_count, expires_at\s+FROM mfa_email_challenges/i.test(sql)) {
              if (params[0] === state.pendingChallengeId && params[1] === state.user.id && state.pendingChallengeCodeHash) {
                return {
                  rows: [{
                    id: state.pendingChallengeId,
                    code_hash: state.pendingChallengeCodeHash,
                    attempt_count: 0,
                    expires_at: new Date(Date.now() + 60_000).toISOString()
                  }],
                  rowCount: 1
                };
              }
              return { rows: [], rowCount: 0 };
            }

            if (/UPDATE mfa_email_challenges SET consumed_at = NOW\(\) WHERE id = \$1/i.test(sql)) {
              state.pendingChallengeCodeHash = null;
              return { rows: [], rowCount: 1 };
            }

            if (/INSERT INTO refresh_tokens/i.test(sql)) {
              return { rows: [], rowCount: 1 };
            }

            if (/DELETE FROM mfa_trusted_devices WHERE user_id = \$1/i.test(sql)) {
              return { rows: [], rowCount: 0 };
            }

            if (/UPDATE refresh_tokens SET revoked = true WHERE user_id = \$1/i.test(sql)) {
              return { rows: [], rowCount: 0 };
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
        }
      };
    }

    if (requestName === "../api/utils/resolveBusinessIdForUser.js" || /resolveBusinessIdForUser\.js$/.test(requestName)) {
      return {
        resolveBusinessIdForUser: async () => state.businessId
      };
    }

    if (requestName === "../services/subscriptionService.js" || /subscriptionService\.js$/.test(requestName)) {
      return {
        getSubscriptionSnapshotForBusiness: async () => ({ status: "active" })
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

    if (requestName === "../services/signInSecurityService.js" || /signInSecurityService\.js$/.test(requestName)) {
      return {
        normalizeUserAgent: (ua) => String(ua || "").trim(),
        extractClientIp: () => "203.0.113.42",
        hashValue: (value) => makeHash(value),
        buildDeviceFingerprint: ({ userId, userAgent, ipAddress }) => makeHash(`${userId}|${userAgent}|${ipAddress}`),
        fetchIpLocation: async () => ({ city: "Montreal", country: "Canada" })
      };
    }

    if (requestName === "../services/emailI18nService.js" || /emailI18nService\.js$/.test(requestName)) {
      return {
        getPreferredLanguageForUser: async () => "en",
        getPreferredLanguageForEmail: async () => "en",
        buildWelcomeVerificationEmail: (_lang, verificationLink) => ({
          subject: "verify",
          html: `<a href="${verificationLink}">${verificationLink}</a>`,
          text: verificationLink
        }),
        buildVerificationEmail: (_lang, verificationLink) => ({
          subject: "verify",
          html: `<a href="${verificationLink}">${verificationLink}</a>`,
          text: verificationLink
        }),
        buildPasswordResetEmail: (_lang, resetLink) => ({
          subject: "reset",
          html: `<a href="${resetLink}">${resetLink}</a>`,
          text: resetLink
        }),
        buildEmailChangeEmail: (_lang, confirmLink) => ({
          subject: "confirm",
          html: `<a href="${confirmLink}">${confirmLink}</a>`,
          text: confirmLink
        }),
        buildMfaEmailContent: () => ({
          subject: "sign-in code",
          heading: "Your sign-in verification code",
          body: "Enter this code to finish signing in.",
          footer: "If this was not you, change your password immediately."
        })
      };
    }

    if (requestName === "resend") {
      return {
        Resend: class FakeResend {
          constructor() {
            this.emails = {
              send: async (payload) => {
                state.sentEmails.push(payload);
                return { id: "email_1" };
              }
            };
          }
        }
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
        Module._load = originalLoad;
        process.env.NODE_ENV = originalNodeEnv;
        if (typeof originalAppBaseUrl === "undefined") {
          delete process.env.APP_BASE_URL;
        } else {
          process.env.APP_BASE_URL = originalAppBaseUrl;
        }
        if (typeof originalFrontendUrl === "undefined") {
          delete process.env.FRONTEND_URL;
        } else {
          process.env.FRONTEND_URL = originalFrontendUrl;
        }
        if (typeof originalResendApiKey === "undefined") {
          delete process.env.RESEND_API_KEY;
        } else {
          process.env.RESEND_API_KEY = originalResendApiKey;
        }
        if (typeof originalResendFrom === "undefined") {
          delete process.env.RESEND_FROM_EMAIL;
        } else {
          process.env.RESEND_FROM_EMAIL = originalResendFrom;
        }
      }
    };
  } catch (error) {
    Module._load = originalLoad;
    process.env.NODE_ENV = originalNodeEnv;
    if (typeof originalAppBaseUrl === "undefined") {
      delete process.env.APP_BASE_URL;
    } else {
      process.env.APP_BASE_URL = originalAppBaseUrl;
    }
    if (typeof originalFrontendUrl === "undefined") {
      delete process.env.FRONTEND_URL;
    } else {
      process.env.FRONTEND_URL = originalFrontendUrl;
    }
    if (typeof originalResendApiKey === "undefined") {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = originalResendApiKey;
    }
    if (typeof originalResendFrom === "undefined") {
      delete process.env.RESEND_FROM_EMAIL;
    } else {
      process.env.RESEND_FROM_EMAIL = originalResendFrom;
    }
    throw error;
  }
}

function buildApp(router) {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use("/api/auth", router);
  app.use((err, _req, res, _next) => {
    res.status(500).json({ error: err?.message || "error" });
  });
  return app;
}

test("forgot-password does not trust Host header when APP_BASE_URL is unset", async () => {
  const fixture = loadAuthRouter({
    nodeEnv: "development"
  });

  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .post("/api/auth/forgot-password")
      .set("Host", "attacker.example")
      .set("X-Forwarded-Host", "attacker.example")
      .send({ email: fixture.state.user.email });

    assert.equal(response.status, 200);
    assert.equal(fixture.state.sentEmails.length, 1);
    const payload = fixture.state.sentEmails[0];
    assert.ok(payload.html.includes("http://localhost:8080/reset-password?token="));
    assert.ok(payload.text.includes("http://localhost:8080/reset-password?token="));
    assert.equal(payload.html.includes("attacker.example"), false);
    assert.equal(payload.text.includes("attacker.example"), false);
  } finally {
    fixture.cleanup();
  }
});

test("new-device sign-in requires 6-digit email verification before issuing session", async () => {
  const fixture = loadAuthRouter({
    nodeEnv: "test",
    appBaseUrl: "https://app.inexledger.test"
  });

  try {
    const app = buildApp(fixture.router);
    const loginResponse = await request(app)
      .post("/api/auth/login")
      .set("User-Agent", "TestBrowser/1.0")
      .send({ email: fixture.state.user.email, password: "CorrectPassword1!" });

    assert.equal(loginResponse.status, 200);
    assert.equal(loginResponse.body?.mfa_required, true);
    assert.equal(loginResponse.body?.device_verification_required, true);
    assert.ok(loginResponse.body?.mfa_token, "mfa_token should be returned");
    assert.equal(fixture.state.sentEmails.length, 1);

    const verificationEmail = fixture.state.sentEmails[0];
    const codeMatch = String(verificationEmail.text || "").match(/Code:\s*(\d{6})/);
    assert.ok(codeMatch, "verification email should contain a 6-digit code");

    const verifyResponse = await request(app)
      .post("/api/auth/mfa/verify")
      .set("User-Agent", "TestBrowser/1.0")
      .send({
        mfaToken: loginResponse.body.mfa_token,
        code: codeMatch[1],
        trustDevice: false
      });

    assert.equal(verifyResponse.status, 200);
    assert.ok(verifyResponse.body?.token, "successful verification should return auth token");
    assert.equal(fixture.state.recognizedDevice, true);

    const secondLogin = await request(app)
      .post("/api/auth/login")
      .set("User-Agent", "TestBrowser/1.0")
      .send({ email: fixture.state.user.email, password: "CorrectPassword1!" });

    assert.equal(secondLogin.status, 200);
    assert.ok(secondLogin.body?.token, "recognized device should log in directly");
    assert.equal(secondLogin.body?.mfa_required, undefined);
  } finally {
    fixture.cleanup();
  }
});
