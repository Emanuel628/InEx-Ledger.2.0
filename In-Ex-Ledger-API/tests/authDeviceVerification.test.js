"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");
const cookieParser = require("cookie-parser");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-auth-device-verification-secret";

const { signToken, verifyToken } = require("../middleware/auth.middleware.js");
const {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  generateCsrfToken
} = require("../middleware/csrf.middleware.js");

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
    hasRecognizedDeviceHistory: options.hasRecognizedDeviceHistory ?? true,
    recognizedDevice: !!options.recognizedDevice,
    trustedMfaTokenHash: null,
    pendingChallenges: new Map(),
    sentEmails: [],
    capturedQueries: []
  };

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql, params = []) {
            state.capturedQueries.push({ sql, params });

            if (/SELECT id,\s*email,\s*password_hash,\s*email_verified,\s*mfa_enabled,\s*mfa_enabled_at,\s*role,\s*created_at,[\s\S]*?FROM users[\s\S]*?WHERE email = \$1/i.test(sql)) {
              if (String(params[0] || "").toLowerCase() === state.user.email) {
                return { rows: [state.user], rowCount: 1 };
              }
              return { rows: [], rowCount: 0 };
            }

            if (/SELECT id,\s*email,\s*password_hash,\s*email_verified,\s*mfa_enabled,\s*mfa_enabled_at,\s*role,\s*created_at,[\s\S]*?FROM users[\s\S]*?WHERE id = \$1/i.test(sql)) {
              return params[0] === state.user.id
                ? { rows: [state.user], rowCount: 1 }
                : { rows: [], rowCount: 0 };
            }

            if (/SELECT id FROM users WHERE email = \$1/i.test(sql)) {
              return String(params[0] || "").toLowerCase() === state.user.email
                ? { rows: [{ id: state.user.id }], rowCount: 1 }
                : { rows: [], rowCount: 0 };
            }

            if (/SELECT email,\s*email_verified FROM users WHERE email = \$1/i.test(sql)) {
              return String(params[0] || "").toLowerCase() === state.user.email
                ? { rows: [{ email: state.user.email, email_verified: state.user.email_verified }], rowCount: 1 }
                : { rows: [], rowCount: 0 };
            }

            if (/DELETE FROM password_reset_tokens WHERE email = \$1/i.test(sql)) {
              return { rows: [], rowCount: 0 };
            }

            if (/INSERT INTO password_reset_tokens/i.test(sql)) {
              return { rows: [], rowCount: 1 };
            }

            if (/DELETE FROM verification_tokens WHERE email = \$1/i.test(sql)) {
              return { rows: [], rowCount: 0 };
            }

            if (/INSERT INTO verification_tokens/i.test(sql)) {
              return { rows: [], rowCount: 1 };
            }

            if (/SELECT 1 FROM recognized_signin_devices WHERE user_id = \$1 LIMIT 1/i.test(sql)) {
              return state.hasRecognizedDeviceHistory
                ? { rows: [{ "?column?": 1 }], rowCount: 1 }
                : { rows: [], rowCount: 0 };
            }

            if (/SELECT id\s+FROM recognized_signin_devices/i.test(sql)) {
              return state.recognizedDevice
                ? { rows: [{ id: "recognized-device-1" }], rowCount: 1 }
                : { rows: [], rowCount: 0 };
            }

            if (/UPDATE recognized_signin_devices\s+SET last_seen_at/i.test(sql)) {
              state.hasRecognizedDeviceHistory = true;
              state.recognizedDevice = true;
              return { rows: [], rowCount: 1 };
            }

            if (/INSERT INTO recognized_signin_devices/i.test(sql)) {
              state.hasRecognizedDeviceHistory = true;
              state.recognizedDevice = true;
              return { rows: [], rowCount: 1 };
            }

            if (/DELETE FROM mfa_email_challenges WHERE user_id = \$1 AND expires_at <= NOW\(\)/i.test(sql)) {
              return { rows: [], rowCount: 0 };
            }

            if (/INSERT INTO mfa_email_challenges/i.test(sql)) {
              state.pendingChallenges.set(params[0], {
                code_hash: params[2],
                attempt_count: 0,
                expires_at: new Date(Date.now() + 60_000).toISOString()
              });
              return { rows: [], rowCount: 1 };
            }

            if (/SELECT id, code_hash, attempt_count, expires_at\s+FROM mfa_email_challenges/i.test(sql)) {
              const challenge = state.pendingChallenges.get(params[0]);
              if (params[1] === state.user.id && challenge) {
                return {
                  rows: [{
                    id: params[0],
                    code_hash: challenge.code_hash,
                    attempt_count: challenge.attempt_count,
                    expires_at: challenge.expires_at
                  }],
                  rowCount: 1
                };
              }
              return { rows: [], rowCount: 0 };
            }

            if (/UPDATE mfa_email_challenges SET attempt_count = attempt_count \+ 1 WHERE id = \$1/i.test(sql)) {
              const challenge = state.pendingChallenges.get(params[0]);
              if (challenge) {
                challenge.attempt_count += 1;
                state.pendingChallenges.set(params[0], challenge);
              }
              return { rows: [], rowCount: 1 };
            }

            if (/UPDATE mfa_email_challenges SET consumed_at = NOW\(\) WHERE id = \$1/i.test(sql)) {
              state.pendingChallenges.delete(params[0]);
              return { rows: [], rowCount: 1 };
            }

            if (/UPDATE users\s+SET mfa_enabled = true/i.test(sql)) {
              state.user = {
                ...state.user,
                mfa_enabled: true,
                mfa_enabled_at: state.user.mfa_enabled_at || new Date().toISOString()
              };
              return { rows: [], rowCount: 1 };
            }

            if (/INSERT INTO refresh_tokens/i.test(sql)) {
              return { rows: [], rowCount: 1 };
            }

            if (/INSERT INTO mfa_trusted_devices/i.test(sql)) {
              state.trustedMfaTokenHash = params[2];
              return { rows: [], rowCount: 1 };
            }

            if (/SELECT id,\s*user_id,\s*expires_at\s+FROM mfa_trusted_devices/i.test(sql)) {
              return params[0] === state.trustedMfaTokenHash && params[1] === state.user.id
                ? {
                    rows: [{
                      id: "trusted-device-1",
                      user_id: state.user.id,
                      expires_at: new Date(Date.now() + 60_000).toISOString()
                    }],
                    rowCount: 1
                  }
                : { rows: [], rowCount: 0 };
            }

            if (/UPDATE mfa_trusted_devices SET last_used_at = NOW\(\) WHERE id = \$1/i.test(sql)) {
              return { rows: [], rowCount: 1 };
            }

            if (/DELETE FROM mfa_trusted_devices WHERE user_id = \$1/i.test(sql)) {
              state.trustedMfaTokenHash = null;
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
        },
        createTokenRefreshLimiter() {
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
        getSubscriptionSnapshotForBusiness: async () => ({ status: "active" }),
        getSubscriptionSnapshotForUser: async () => ({ status: "active" }),
        findBillingAnchorBusinessIdForUser: async () => state.businessId
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

function makeCsrfHeaders() {
  const token = generateCsrfToken();
  return {
    [CSRF_HEADER_NAME]: token,
    Cookie: `${CSRF_COOKIE_NAME}=${token}`
  };
}

test("send-verification does not leak whether an email exists", async () => {
  const fixture = loadAuthRouter({
    nodeEnv: "test",
    appBaseUrl: "https://app.inexledger.test"
  });

  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .post("/api/auth/send-verification")
      .send({ email: "unknown@example.com" });

    assert.equal(response.status, 200);
    assert.match(String(response.body?.message || ""), /if the email is registered/i);
    assert.equal(fixture.state.sentEmails.length, 0);
    assert.equal(response.body?.verification_state, undefined);
  } finally {
    fixture.cleanup();
  }
});

test("send-verification accepts a signed verification state for legitimate resend flow", async () => {
  const fixture = loadAuthRouter({
    nodeEnv: "test",
    appBaseUrl: "https://app.inexledger.test"
  });
  fixture.state.user.email_verified = false;

  try {
    const app = buildApp(fixture.router);
    const verificationState = signToken({
      purpose: "verify_email_status",
      email: fixture.state.user.email
    });

    const response = await request(app)
      .post("/api/auth/send-verification")
      .send({ verificationState });

    assert.equal(response.status, 200);
    assert.match(String(response.body?.message || ""), /if the email is registered/i);
    assert.equal(fixture.state.sentEmails.length, 1);
    assert.ok(response.body?.verification_state, "signed state should be rotated for the legitimate flow");

    const decoded = verifyToken(response.body.verification_state);
    assert.equal(decoded.purpose, "verify_email_status");
    assert.equal(decoded.email, fixture.state.user.email);
  } finally {
    fixture.cleanup();
  }
});

test("new-device sign-in succeeds directly when MFA is disabled", async () => {
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
    assert.ok(loginResponse.body?.token, "login should return an auth token");
    assert.equal(loginResponse.body?.mfa_required, undefined);
    assert.equal(loginResponse.body?.device_verification_required, undefined);
    assert.equal(fixture.state.sentEmails.length, 0);
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

test("login rejects unverified users before issuing any session", async () => {
  const fixture = loadAuthRouter({
    nodeEnv: "test",
    appBaseUrl: "https://app.inexledger.test"
  });
  fixture.state.user.email_verified = false;

  try {
    const app = buildApp(fixture.router);
    const loginResponse = await request(app)
      .post("/api/auth/login")
      .set("User-Agent", "TestBrowser/1.0")
      .send({ email: fixture.state.user.email, password: "CorrectPassword1!" });

    assert.equal(loginResponse.status, 403);
    assert.equal(loginResponse.body?.token, undefined);
    assert.equal(loginResponse.body?.mfa_token, undefined);
    assert.match(String(loginResponse.body?.error || ""), /verify your email/i);
  } finally {
    fixture.cleanup();
  }
});

test("mfa verification refuses to issue session when user becomes unverified", async () => {
  const fixture = loadAuthRouter({
    nodeEnv: "test",
    appBaseUrl: "https://app.inexledger.test"
  });
  fixture.state.user.mfa_enabled = true;
  fixture.state.user.mfa_enabled_at = new Date().toISOString();

  try {
    const app = buildApp(fixture.router);
    const loginResponse = await request(app)
      .post("/api/auth/login")
      .set("User-Agent", "TestBrowser/1.0")
      .send({ email: fixture.state.user.email, password: "CorrectPassword1!" });

    assert.equal(loginResponse.status, 200);
    assert.equal(loginResponse.body?.mfa_required, true);
    const verificationEmail = fixture.state.sentEmails[0];
    const codeMatch = String(verificationEmail.text || "").match(/Code:\s*(\d{6})/);
    assert.ok(codeMatch, "verification email should contain a 6-digit code");

    fixture.state.user.email_verified = false;

    const verifyResponse = await request(app)
      .post("/api/auth/mfa/verify")
      .set("User-Agent", "TestBrowser/1.0")
      .set(makeCsrfHeaders())
      .send({
        mfaToken: loginResponse.body.mfa_token,
        code: codeMatch[1],
        trustDevice: false
      });

    assert.equal(verifyResponse.status, 403);
    assert.equal(verifyResponse.body?.token, undefined);
    assert.match(String(verifyResponse.body?.error || ""), /verify your email/i);
  } finally {
    fixture.cleanup();
  }
});

test("mfa sign-in trusts the device and skips another code on the next login", async () => {
  const fixture = loadAuthRouter({
    nodeEnv: "test",
    appBaseUrl: "https://app.inexledger.test"
  });
  fixture.state.user.mfa_enabled = true;
  fixture.state.user.mfa_enabled_at = new Date().toISOString();

  try {
    const app = buildApp(fixture.router);
    const firstLogin = await request(app)
      .post("/api/auth/login")
      .set("User-Agent", "TestBrowser/1.0")
      .send({ email: fixture.state.user.email, password: "CorrectPassword1!" });

    assert.equal(firstLogin.status, 200);
    assert.equal(firstLogin.body?.mfa_required, true);
    const verificationEmail = fixture.state.sentEmails.at(-1);
    const codeMatch = String(verificationEmail?.text || "").match(/Code:\s*(\d{6})/);
    assert.ok(codeMatch, "verification email should contain a 6-digit code");

    const verifyResponse = await request(app)
      .post("/api/auth/mfa/verify")
      .set("User-Agent", "TestBrowser/1.0")
      .set(makeCsrfHeaders())
      .send({
        mfaToken: firstLogin.body.mfa_token,
        code: codeMatch[1],
        trustDevice: true
      });

    assert.equal(verifyResponse.status, 200);
    assert.ok(verifyResponse.body?.token, "successful verification should return auth token");
    const trustCookie = verifyResponse.headers["set-cookie"]?.find((cookie) => cookie.startsWith("mfa_trust="));
    assert.ok(trustCookie, "successful MFA verification should set an mfa_trust cookie");

    const secondLogin = await request(app)
      .post("/api/auth/login")
      .set("User-Agent", "TestBrowser/1.0")
      .set("Cookie", trustCookie.split(";")[0])
      .send({ email: fixture.state.user.email, password: "CorrectPassword1!" });

    assert.equal(secondLogin.status, 200);
    assert.ok(secondLogin.body?.token, "trusted device should log in directly");
    assert.equal(secondLogin.body?.mfa_required, undefined);
  } finally {
    fixture.cleanup();
  }
});

test("global MFA trust cookie can satisfy login without the middleware sidecar", async () => {
  const fixture = loadAuthRouter({
    nodeEnv: "test",
    appBaseUrl: "https://app.inexledger.test"
  });
  fixture.state.user.mfa_enabled = true;
  fixture.state.user.mfa_enabled_at = new Date().toISOString();

  try {
    const app = buildApp(fixture.router);
    const globalTrustCookie = signToken({
      purpose: "global_mfa_trust",
      user_agent_hash: makeHash("TestBrowser/1.0")
    });

    const loginResponse = await request(app)
      .post("/api/auth/login")
      .set("User-Agent", "TestBrowser/1.0")
      .set("Cookie", `mfa_global_trust=${globalTrustCookie}`)
      .send({ email: fixture.state.user.email, password: "CorrectPassword1!" });

    assert.equal(loginResponse.status, 200);
    assert.ok(loginResponse.body?.token, "global trust should allow the login route to issue a session directly");
    assert.equal(loginResponse.body?.mfa_required, undefined);
    const refreshedGlobalTrust = loginResponse.headers["set-cookie"]?.find((cookie) => cookie.startsWith("mfa_global_trust="));
    assert.ok(refreshedGlobalTrust, "trusted browser login should refresh the global MFA trust cookie");
  } finally {
    fixture.cleanup();
  }
});

test("mfa challenge token lasts at least as long as the emailed code window", async () => {
  const fixture = loadAuthRouter({
    nodeEnv: "test",
    appBaseUrl: "https://app.inexledger.test"
  });
  fixture.state.user.mfa_enabled = true;
  fixture.state.user.mfa_enabled_at = new Date().toISOString();

  try {
    const app = buildApp(fixture.router);
    const loginResponse = await request(app)
      .post("/api/auth/login")
      .set("User-Agent", "TestBrowser/1.0")
      .send({ email: fixture.state.user.email, password: "CorrectPassword1!" });

    assert.equal(loginResponse.status, 200);
    assert.equal(loginResponse.body?.mfa_required, true);
    const pending = verifyToken(loginResponse.body.mfa_token);
    assert.ok((pending.exp - pending.iat) >= 15 * 60, "pending MFA token should remain valid for at least 15 minutes");
  } finally {
    fixture.cleanup();
  }
});

test("mfa resend rotates the pending token and sends a fresh code", async () => {
  const fixture = loadAuthRouter({
    nodeEnv: "test",
    appBaseUrl: "https://app.inexledger.test"
  });
  fixture.state.user.mfa_enabled = true;
  fixture.state.user.mfa_enabled_at = new Date().toISOString();

  try {
    const app = buildApp(fixture.router);
    const loginResponse = await request(app)
      .post("/api/auth/login")
      .set("User-Agent", "TestBrowser/1.0")
      .send({ email: fixture.state.user.email, password: "CorrectPassword1!" });

    assert.equal(loginResponse.status, 200);
    assert.equal(loginResponse.body?.mfa_required, true);
    const firstToken = loginResponse.body.mfa_token;
    const sentBefore = fixture.state.sentEmails.length;

    const resendResponse = await request(app)
      .post("/api/auth/mfa/resend")
      .set("User-Agent", "TestBrowser/1.0")
      .set(makeCsrfHeaders())
      .send({ mfaToken: firstToken });

    assert.equal(resendResponse.status, 200);
    assert.equal(resendResponse.body?.success, true);
    assert.ok(resendResponse.body?.mfa_token, "resend should return a new pending token");
    assert.notEqual(resendResponse.body.mfa_token, firstToken);
    assert.equal(fixture.state.sentEmails.length, sentBefore + 1);
  } finally {
    fixture.cleanup();
  }
});

test("multiple MFA code requests do not immediately invalidate the earlier challenge", async () => {
  const fixture = loadAuthRouter({
    nodeEnv: "test",
    appBaseUrl: "https://app.inexledger.test"
  });
  fixture.state.user.mfa_enabled = true;
  fixture.state.user.mfa_enabled_at = new Date().toISOString();

  try {
    const app = buildApp(fixture.router);
    const firstLogin = await request(app)
      .post("/api/auth/login")
      .set("User-Agent", "TestBrowser/1.0")
      .send({ email: fixture.state.user.email, password: "CorrectPassword1!" });

    assert.equal(firstLogin.status, 200);
    assert.equal(firstLogin.body?.mfa_required, true);
    const firstCode = String(fixture.state.sentEmails.at(-1)?.text || "").match(/Code:\s*(\d{6})/);
    assert.ok(firstCode, "first MFA email should contain a 6-digit code");

    const secondLogin = await request(app)
      .post("/api/auth/login")
      .set("User-Agent", "TestBrowser/1.0")
      .send({ email: fixture.state.user.email, password: "CorrectPassword1!" });

    assert.equal(secondLogin.status, 200);
    assert.equal(secondLogin.body?.mfa_required, true);

    const verifyFirst = await request(app)
      .post("/api/auth/mfa/verify")
      .set("User-Agent", "TestBrowser/1.0")
      .set(makeCsrfHeaders())
      .send({
        mfaToken: firstLogin.body.mfa_token,
        code: firstCode[1]
      });

    assert.equal(verifyFirst.status, 200);
    assert.ok(verifyFirst.body?.token, "first challenge should still verify after a second code is issued");
  } finally {
    fixture.cleanup();
  }
});

test("mfa enable returns a fresh MFA-authenticated access token for subsequent protected actions", async () => {
  const fixture = loadAuthRouter({
    nodeEnv: "test",
    appBaseUrl: "https://app.inexledger.test"
  });

  try {
    const app = buildApp(fixture.router);
    const authToken = signToken({
      id: fixture.state.user.id,
      email: fixture.state.user.email,
      email_verified: true,
      business_id: fixture.state.businessId,
      mfa_enabled: false,
      mfa_authenticated: false
    });
    const csrfHeaders = makeCsrfHeaders();

    const startResponse = await request(app)
      .post("/api/auth/mfa/enable")
      .set("Authorization", `Bearer ${authToken}`)
      .set(csrfHeaders)
      .send({});

    assert.equal(startResponse.status, 200);
    assert.equal(startResponse.body?.pending_verification, true);
    assert.ok(startResponse.body?.mfa_token, "pending MFA token should be returned");

    const verificationEmail = fixture.state.sentEmails.at(-1);
    const codeMatch = String(verificationEmail?.text || "").match(/Code:\s*(\d{6})/);
    assert.ok(codeMatch, "verification email should contain a 6-digit code");

    const finishResponse = await request(app)
      .post("/api/auth/mfa/enable")
      .set("Authorization", `Bearer ${authToken}`)
      .set(csrfHeaders)
      .send({
        code: codeMatch[1],
        mfaToken: startResponse.body.mfa_token
      });

    assert.equal(finishResponse.status, 200);
    assert.equal(finishResponse.body?.success, true);
    assert.ok(finishResponse.body?.token, "completed MFA enable should return a fresh access token");

    const decoded = verifyToken(finishResponse.body.token);
    assert.equal(decoded.mfa_enabled, true);
    assert.equal(decoded.mfa_authenticated, true);
    assert.equal(fixture.state.user.mfa_enabled, true);
  } finally {
    fixture.cleanup();
  }
});

test("logout preserves only the browser-level MFA trust cookie for MFA-authenticated sessions", async () => {
  const fixture = loadAuthRouter({
    nodeEnv: "test",
    appBaseUrl: "https://app.inexledger.test"
  });

  try {
    const app = buildApp(fixture.router);
    const authToken = signToken({
      id: fixture.state.user.id,
      email: fixture.state.user.email,
      email_verified: true,
      business_id: fixture.state.businessId,
      mfa_enabled: true,
      mfa_authenticated: true
    });

    const response = await request(app)
      .post("/api/auth/logout")
      .set("User-Agent", "TestBrowser/1.0")
      .set("Authorization", `Bearer ${authToken}`)
      .set(makeCsrfHeaders())
      .send({});

    assert.equal(response.status, 204);
    const setCookies = response.headers["set-cookie"] || [];
    assert.ok(setCookies.some((cookie) => cookie.startsWith("mfa_global_trust=")), "logout should set the browser-level MFA trust cookie");
    assert.ok(setCookies.some((cookie) => cookie.startsWith("mfa_trust=;")), "logout should clear the per-device MFA trust cookie");
  } finally {
    fixture.cleanup();
  }
});

test("logout without MFA authentication does not rewrite the browser-level trust cookie", async () => {
  const fixture = loadAuthRouter({
    nodeEnv: "test",
    appBaseUrl: "https://app.inexledger.test"
  });

  try {
    const app = buildApp(fixture.router);
    const authToken = signToken({
      id: fixture.state.user.id,
      email: fixture.state.user.email,
      email_verified: true,
      business_id: fixture.state.businessId,
      mfa_enabled: true,
      mfa_authenticated: false
    });

    const response = await request(app)
      .post("/api/auth/logout")
      .set("User-Agent", "TestBrowser/1.0")
      .set("Authorization", `Bearer ${authToken}`)
      .set(makeCsrfHeaders())
      .send({});

    assert.equal(response.status, 204);
    const setCookies = response.headers["set-cookie"] || [];
    assert.equal(setCookies.some((cookie) => cookie.startsWith("mfa_global_trust=")), false);
    assert.ok(setCookies.some((cookie) => cookie.startsWith("mfa_trust=;")), "logout should still clear the per-device MFA trust cookie");
  } finally {
    fixture.cleanup();
  }
});

test("forgot-password route is reachable and validates missing email with 400", async () => {
  const fixture = loadAuthRouter({
    nodeEnv: "test",
    appBaseUrl: "https://app.inexledger.test"
  });

  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .post("/api/auth/forgot-password")
      .send({});

    assert.equal(response.status, 400);
    assert.match(String(response.body?.error || ""), /email is required/i);
  } finally {
    fixture.cleanup();
  }
});

test("account-recovery route is reachable and validates missing emails with 400", async () => {
  const fixture = loadAuthRouter({
    nodeEnv: "test",
    appBaseUrl: "https://app.inexledger.test"
  });

  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .post("/api/auth/account-recovery")
      .send({});

    assert.equal(response.status, 400);
    assert.match(String(response.body?.error || ""), /required/i);
  } finally {
    fixture.cleanup();
  }
});

test("reset-password route is reachable and validates mismatched passwords with 400", async () => {
  const fixture = loadAuthRouter({
    nodeEnv: "test",
    appBaseUrl: "https://app.inexledger.test"
  });

  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .post("/api/auth/reset-password")
      .send({
        token: "tok",
        password: "CorrectPassword1!",
        confirmPassword: "DifferentPassword1!"
      });

    assert.equal(response.status, 400);
    assert.match(String(response.body?.error || ""), /invalid input|passwords do not match/i);
  } finally {
    fixture.cleanup();
  }
});
