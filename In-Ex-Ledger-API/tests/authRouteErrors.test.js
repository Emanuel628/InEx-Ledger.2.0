"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const { attachCentralErrorHandler } = require("./helpers/testPool.js");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-auth-route-errors-secret";

const AUTH_ROUTE_PATH = require.resolve("../routes/auth.routes.js");

function loadAuthRouterFixture(options = {}) {
  const originalLoad = Module._load.bind(Module);
  const originalResendKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "re_test_auth_route_errors";
  const state = { logWarnCalls: [] };

  const testUser = {
    id: "user_1",
    email: "user@example.com",
    password_hash: "hashed",
    is_erased: false,
    email_verified: true,
    mfa_enabled: false,
    failed_login_attempts: 0,
    login_locked_until: null,
    role: "user"
  };

  Module._load = function patchedLoad(requestName, parent, isMain) {
    if (requestName === "resend") {
      return { Resend: class Resend { get emails() { return { send: async () => ({ id: "email_test" }) } } } };
    }

    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return { pool: { query: options.queryImpl || (async () => ({ rows: [], rowCount: 0 })) } };
    }

    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        signToken: (payload) => `signed:${payload?.purpose || payload?.email || "token"}`,
        verifyToken: () => ({}),
        requireAuth: (_req, _res, next) => next(),
        requireMfaIfEnabled: (_req, _res, next) => next()
      };
    }

    if (requestName === "../middleware/csrf.middleware.js" || /csrf\.middleware\.js$/.test(requestName)) {
      return { requireCsrfProtection: (_req, _res, next) => next() };
    }

    if (requestName === "../middleware/rateLimitTiers.js" || /rateLimitTiers\.js$/.test(requestName)) {
      return {
        createAuthLimiter: () => (_req, _res, next) => next(),
        createMfaVerifyLimiter: () => (_req, _res, next) => next(),
        createPasswordLimiter: () => (_req, _res, next) => next(),
        createTokenRefreshLimiter: () => (_req, _res, next) => next()
      };
    }

    if (requestName === "../api/utils/resolveBusinessIdForUser.js" || /resolveBusinessIdForUser\.js$/.test(requestName)) {
      return { resolveBusinessIdForUser: async () => "business-1" };
    }

    if (requestName === "../services/subscriptionService.js" || /subscriptionService\.js$/.test(requestName)) {
      return {
        getSubscriptionSnapshotForUser: async () => ({ effectiveStatus: "free", effectiveTier: "free" }),
        getSubscriptionSnapshotForBusiness: async () => ({ effectiveStatus: "free", effectiveTier: "free" })
      };
    }

    if (requestName === "../utils/authUtils.js" || /authUtils\.js$/.test(requestName)) {
      return {
        ACCESS_TOKEN_COOKIE: "access_token",
        COOKIE_OPTIONS: {},
        isLegacyScryptHash: () => false,
        verifyPassword: options.verifyPasswordImpl || (async () => ({ match: true, legacy: false }))
      };
    }

    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return {
        logError() {},
        logWarn: (...args) => state.logWarnCalls.push(args),
        logInfo() {}
      };
    }

    if (requestName === "../services/auditEventService.js" || /auditEventService\.js$/.test(requestName)) {
      return {
        AUDIT_ACTIONS: { LOGIN_FAILURE: "login_failure", LOGIN_SUCCESS: "login_success" },
        recordAuditEvent: async () => "audit-1",
        recordAuditEventForRequest: async () => "audit-1"
      };
    }

    if (requestName === "../services/sessionContextService.js" || /sessionContextService\.js$/.test(requestName)) {
      return {
        extractRequestContext: () => ({ ipAddress: "203.0.113.20", userAgent: "test-agent" }),
        deriveDeviceLabel: () => "Test browser"
      };
    }

    if (requestName === "../services/emailI18nService.js" || /emailI18nService\.js$/.test(requestName)) {
      return {
        getPreferredLanguageForUser: async () => "en",
        getPreferredLanguageForEmail: async () => "en",
        buildWelcomeVerificationEmail: () => ({ subject: "verify", html: "", text: "" }),
        buildVerificationEmail: () => ({ subject: "verify", html: "", text: "" }),
        buildPasswordResetEmail: () => ({ subject: "reset", html: "", text: "" }),
        buildPasswordChangedEmail: () => ({ subject: "password", html: "", text: "" }),
        buildDuplicateSignupNoticeEmail: () => ({ subject: "duplicate", html: "", text: "" }),
        buildNewSignInAlertEmail: () => ({ subject: "signin", html: "", text: "" }),
        buildEmailChangeEmail: () => ({ subject: "change", html: "", text: "" }),
        buildEmailChangedConfirmationEmail: () => ({ subject: "changed", html: "", text: "" }),
        buildMfaEmailContent: () => ({ subject: "mfa", html: "", text: "" })
      };
    }

    if (requestName === "../services/signInSecurityService.js" || /signInSecurityService\.js$/.test(requestName)) {
      return {
        normalizeUserAgent: (value) => String(value || ""),
        extractClientIp: () => "203.0.113.20",
        hashValue: (value) => String(value || ""),
        buildDeviceFingerprint: () => "fingerprint-test",
        fetchIpLocation: async () => null
      };
    }

    if (requestName === "../services/deletedAccountService.js" || /deletedAccountService\.js$/.test(requestName)) {
      return {
        getDeletedAccountRecordByEmail: async () => null,
        markDeletedAccountReactivated: async () => {}
      };
    }

    if (requestName === "../services/authSecurityService.js" || /authSecurityService\.js$/.test(requestName)) {
      return {
        hashPassword: async (pw) => `hashed:${pw}`,
        isStrongPassword: () => true,
        isTransientLoginInfrastructureError: options.isTransientImpl || (() => false),
        buildPublicSessionPayload: () => ({ user: { id: testUser.id } }),
        ensureArrayValue: (v) => (Array.isArray(v) ? v : [v]),
        hashMfaEmailCode: (code) => `hashed:${code}`,
        generateMfaEmailCode: () => "123456",
        maskEmail: (email) => String(email || "").replace(/(.{2}).*(@.*)/, "$1***$2"),
        buildMfaStatusPayload: () => ({}),
        getLoginLockExpiry: (user) => (user?.login_locked_until ? new Date(user.login_locked_until) : null),
        isLoginLocked: (user) => Boolean(user?.login_locked_until && new Date(user.login_locked_until) > new Date()),
        hashRefreshToken: (token) => `hashed:${token}`,
        hashMfaTrustToken: (token) => `hashed:${token}`
      };
    }

    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[AUTH_ROUTE_PATH];

  try {
    const router = require(AUTH_ROUTE_PATH);
    const app = express();
    app.use(express.json());
    app.use(require("cookie-parser")());
    app.use("/api/auth", router);
    attachCentralErrorHandler(app);

    return {
      app,
      state,
      testUser,
      cleanup() {
        delete require.cache[AUTH_ROUTE_PATH];
        Module._load = originalLoad;
        if (originalResendKey === undefined) {
          delete process.env.RESEND_API_KEY;
        } else {
          process.env.RESEND_API_KEY = originalResendKey;
        }
      }
    };
  } catch (error) {
    Module._load = originalLoad;
    if (originalResendKey === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = originalResendKey;
    }
    throw error;
  }
}

// --- POST /login ---

test("login: missing email or password returns 400", async () => {
  const fixture = loadAuthRouterFixture();
  try {
    const res = await request(fixture.app).post("/api/auth/login").send({ email: "a@example.com" });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "Email and password are required");
  } finally {
    fixture.cleanup();
  }
});

test("login: unknown email returns 401 Invalid credentials, not a 500", async () => {
  const fixture = loadAuthRouterFixture({
    queryImpl: async () => ({ rows: [], rowCount: 0 })
  });
  try {
    const res = await request(fixture.app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "Whatever1!" });
    assert.equal(res.status, 401);
    assert.equal(res.body.error, "Invalid credentials");
  } finally {
    fixture.cleanup();
  }
});

test("login: erased account returns 401 Invalid credentials", async () => {
  const fixture = loadAuthRouterFixture({
    queryImpl: async (sql) => {
      if (/FROM users/i.test(sql) && /WHERE email = \$1/i.test(sql)) {
        return { rows: [{ ...fixture.testUser, is_erased: true }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
  });
  try {
    const res = await request(fixture.app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: "Whatever1!" });
    assert.equal(res.status, 401);
    assert.equal(res.body.error, "Invalid credentials");
  } finally {
    fixture.cleanup();
  }
});

test("login: wrong password without lockout returns 401 Invalid credentials", async () => {
  const fixture = loadAuthRouterFixture({
    queryImpl: async (sql) => {
      if (/FROM users/i.test(sql) && /WHERE email = \$1/i.test(sql)) {
        return { rows: [fixture.testUser], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
    verifyPasswordImpl: async () => ({ match: false, legacy: false })
  });
  try {
    const res = await request(fixture.app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: "WrongPassword1!" });
    assert.equal(res.status, 401);
    assert.equal(res.body.error, "Invalid credentials");
  } finally {
    fixture.cleanup();
  }
});

test("login: a transient infrastructure error becomes a 503, not a 500", async () => {
  const transientErr = Object.assign(new Error("connection failure"), { code: "08006" });
  const fixture = loadAuthRouterFixture({
    queryImpl: async () => { throw transientErr; },
    isTransientImpl: (err) => err === transientErr
  });
  try {
    const res = await request(fixture.app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: "Whatever1!" });
    assert.equal(res.status, 503);
    assert.equal(res.body.error, "Sign-in is temporarily unavailable. Please try again in a moment.");
  } finally {
    fixture.cleanup();
  }
});

test("login: an unexpected DB failure returns a generic 500, not a leaked message", async () => {
  const fixture = loadAuthRouterFixture({
    queryImpl: async () => { throw new Error("relation \"users\" does not exist"); }
  });
  try {
    const res = await request(fixture.app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: "Whatever1!" });
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { error: "Internal server error" });
  } finally {
    fixture.cleanup();
  }
});

// --- POST /refresh ---

test("refresh: missing refresh token cookie returns 401 and clears auth cookies", async () => {
  const fixture = loadAuthRouterFixture();
  try {
    const res = await request(fixture.app).post("/api/auth/refresh").send({});
    assert.equal(res.status, 401);
    assert.equal(res.body.error, "Missing refresh token");
    const setCookies = res.headers["set-cookie"] || [];
    assert.ok(setCookies.some((c) => c.startsWith("refresh_token=;") || c.includes("refresh_token=;")));
  } finally {
    fixture.cleanup();
  }
});

test("refresh: unknown/expired token returns 401 Invalid refresh token", async () => {
  const fixture = loadAuthRouterFixture({
    queryImpl: async () => ({ rows: [], rowCount: 0 })
  });
  try {
    const res = await request(fixture.app)
      .post("/api/auth/refresh")
      .set("Cookie", "refresh_token=some-token");
    assert.equal(res.status, 401);
    assert.equal(res.body.error, "Invalid refresh token");
  } finally {
    fixture.cleanup();
  }
});

test("refresh: unverified email returns 403", async () => {
  const fixture = loadAuthRouterFixture({
    queryImpl: async (sql) => {
      if (/FROM refresh_tokens/i.test(sql)) {
        return { rows: [{ user_id: "user_1", mfa_authenticated: false, email: "user@example.com", role: "user", email_verified: false, is_erased: false, mfa_enabled: false }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
  });
  try {
    const res = await request(fixture.app)
      .post("/api/auth/refresh")
      .set("Cookie", "refresh_token=some-token");
    assert.equal(res.status, 403);
    assert.equal(res.body.error, "Please verify your email before signing in.");
  } finally {
    fixture.cleanup();
  }
});

test("refresh: an unexpected DB failure returns a generic 500 and still clears cookies", async () => {
  const fixture = loadAuthRouterFixture({
    queryImpl: async (sql) => {
      if (/FROM refresh_tokens/i.test(sql)) {
        throw new Error("connection reset");
      }
      return { rows: [], rowCount: 0 };
    }
  });
  try {
    const res = await request(fixture.app)
      .post("/api/auth/refresh")
      .set("Cookie", "refresh_token=some-token");
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { error: "Internal server error" });
    const setCookies = res.headers["set-cookie"] || [];
    assert.ok(setCookies.some((c) => c.includes("refresh_token=;")));
  } finally {
    fixture.cleanup();
  }
});
