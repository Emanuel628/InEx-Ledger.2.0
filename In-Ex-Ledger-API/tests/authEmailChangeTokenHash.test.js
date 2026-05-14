"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const AUTH_ROUTE_PATH = require.resolve("../routes/auth.routes.js");

function loadAuthRouterFixture(options = {}) {
  const originalLoad = Module._load.bind(Module);
  const previousEnv = {
    APP_BASE_URL: process.env.APP_BASE_URL,
    RESEND_API_KEY: process.env.RESEND_API_KEY
  };

  process.env.APP_BASE_URL = "https://app.inexledger.test";
  process.env.RESEND_API_KEY = "resend_test_key";

  const state = {
    insertedEmailChangeParams: null,
    emailPayload: null,
    updatedEmail: null,
    revokedRefreshTokensForUserId: null,
    revokedMfaDevicesForUserId: null,
    consumedTokenHash: null,
    consumedRawToken: null
  };

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "resend") {
      return {
        Resend: class Resend {
          constructor() {
            this.emails = {
              send: async (payload) => {
                state.emailPayload = payload;
                return { id: "email_change_test_001" };
              }
            };
          }
        }
      };
    }

    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        requireAuth(req, _res, next) {
          req.user = {
            id: "user_email_change_001",
            email: "current@example.com",
            mfa_enabled: false
          };
          next();
        },
        requireMfaIfEnabled(_req, _res, next) {
          next();
        },
        signToken() {
          return "signed-token";
        },
        verifyToken() {
          return { id: "user_email_change_001" };
        }
      };
    }

    if (requestName === "../middleware/csrf.middleware.js" || /csrf\.middleware\.js$/.test(requestName)) {
      return {
        requireCsrfProtection(_req, _res, next) {
          next();
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
        resolveBusinessIdForUser: async () => "biz_email_change_001"
      };
    }

    if (requestName === "../services/subscriptionService.js" || /subscriptionService\.js$/.test(requestName)) {
      return {
        getSubscriptionSnapshotForUser: async () => ({ effectiveTier: "free" })
      };
    }

    if (requestName === "../utils/authUtils.js" || /authUtils\.js$/.test(requestName)) {
      return {
        COOKIE_OPTIONS: { httpOnly: true, sameSite: "strict", secure: false, path: "/" },
        isLegacyScryptHash: () => false,
        verifyPassword: async () => ({ match: true, legacy: false })
      };
    }

    if (requestName === "../services/emailI18nService.js" || /emailI18nService\.js$/.test(requestName)) {
      return {
        getPreferredLanguageForUser: async () => "en",
        getPreferredLanguageForEmail: async () => "en",
        buildWelcomeVerificationEmail: () => ({ subject: "", html: "", text: "" }),
        buildVerificationEmail: () => ({ subject: "", html: "", text: "" }),
        buildPasswordResetEmail: () => ({ subject: "", html: "", text: "" }),
        buildEmailChangeEmail: (_lang, confirmLink) => ({
          subject: "Confirm email change",
          html: confirmLink,
          text: confirmLink
        }),
        buildMfaEmailContent: () => ({ subject: "", html: "", text: "" })
      };
    }

    if (requestName === "../services/signInSecurityService.js" || /signInSecurityService\.js$/.test(requestName)) {
      return {
        normalizeUserAgent: (value) => String(value || ""),
        extractClientIp: () => "203.0.113.42",
        hashValue: (value) => `hashed:${String(value || "")}`,
        buildDeviceFingerprint: () => "fingerprint_test",
        fetchIpLocation: async () => null
      };
    }

    if (requestName === "../services/sessionContextService.js" || /sessionContextService\.js$/.test(requestName)) {
      return {
        extractRequestContext: () => ({ ipAddress: "203.0.113.42", userAgent: "UnitTestAgent/1.0" }),
        deriveDeviceLabel: () => "Unit test browser"
      };
    }

    if (requestName === "../services/auditEventService.js" || /auditEventService\.js$/.test(requestName)) {
      return {
        AUDIT_ACTIONS: {},
        recordAuditEventForRequest: async () => null
      };
    }

    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return {
        logError() {},
        logWarn() {},
        logInfo() {}
      };
    }

    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql, params = []) {
            if (/SELECT id, email, password_hash FROM users WHERE id = \$1/i.test(sql)) {
              return {
                rows: [{
                  id: "user_email_change_001",
                  email: "current@example.com",
                  password_hash: "$2b$12$placeholder"
                }],
                rowCount: 1
              };
            }

            if (/SELECT id FROM users WHERE email = \$1/i.test(sql)) {
              return { rows: [], rowCount: 0 };
            }

            if (/DELETE FROM email_change_requests WHERE user_id = \$1/i.test(sql)) {
              return { rows: [], rowCount: 1 };
            }

            if (/INSERT INTO email_change_requests \(user_id, new_email, expires_at, token_hash\)/i.test(sql)) {
              state.insertedEmailChangeParams = params;
              return { rows: [], rowCount: 1 };
            }

            if (/DELETE FROM email_change_requests WHERE expires_at <= NOW\(\)/i.test(sql)) {
              return { rows: [], rowCount: 0 };
            }

            if (/DELETE FROM email_change_requests\s+WHERE \(token_hash = \$1 OR token::text = \$2\)/i.test(sql)) {
              state.consumedTokenHash = params[0];
              state.consumedRawToken = params[1];
              if (options.confirmTokenValue && params[0] === `hashed:${options.confirmTokenValue}`) {
                return {
                  rows: [{ user_id: "user_email_change_001", new_email: "new@example.com" }],
                  rowCount: 1
                };
              }
              return { rows: [], rowCount: 0 };
            }

            if (/UPDATE users SET email = \$1 WHERE id = \$2/i.test(sql)) {
              state.updatedEmail = { email: params[0], userId: params[1] };
              return { rows: [], rowCount: 1 };
            }

            if (/UPDATE refresh_tokens SET revoked = true WHERE user_id = \$1/i.test(sql)) {
              state.revokedRefreshTokensForUserId = params[0];
              return { rows: [], rowCount: 1 };
            }

            if (/DELETE FROM mfa_trusted_devices WHERE user_id = \$1/i.test(sql)) {
              state.revokedMfaDevicesForUserId = params[0];
              return { rows: [], rowCount: 1 };
            }

            throw new Error(`Unhandled SQL in test stub: ${sql}`);
          }
        }
      };
    }

    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[AUTH_ROUTE_PATH];

  try {
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
        process.env.RESEND_API_KEY = previousEnv.RESEND_API_KEY;
      }
    };
  } catch (error) {
    Module._load = originalLoad;
    process.env.APP_BASE_URL = previousEnv.APP_BASE_URL;
    process.env.RESEND_API_KEY = previousEnv.RESEND_API_KEY;
    throw error;
  }
}

test("request-email-change stores only a token hash and emails the raw confirmation token", async () => {
  const fixture = loadAuthRouterFixture();

  try {
    const response = await request(fixture.app)
      .post("/api/auth/request-email-change")
      .send({ newEmail: "new@example.com", currentPassword: "CurrentPass123!" });

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(fixture.state.insertedEmailChangeParams));
    assert.equal(fixture.state.insertedEmailChangeParams[0], "user_email_change_001");
    assert.equal(fixture.state.insertedEmailChangeParams[1], "new@example.com");

    const storedHash = fixture.state.insertedEmailChangeParams[3];
    assert.match(storedHash, /^hashed:[a-f0-9]{64}$/);
    assert.ok(fixture.state.emailPayload, "email should be sent");

    const linkMatch = String(fixture.state.emailPayload.html || "").match(/token=([a-f0-9]{64})/i);
    assert.ok(linkMatch, "email link should contain the raw confirmation token");
    assert.equal(storedHash, `hashed:${linkMatch[1]}`);
    assert.deepEqual(fixture.state.emailPayload.to, ["current@example.com"]);
  } finally {
    fixture.cleanup();
  }
});

test("confirm-email-change consumes the hashed token path and revokes existing sessions", async () => {
  const rawToken = "b".repeat(64);
  const fixture = loadAuthRouterFixture({ confirmTokenValue: rawToken });

  try {
    const response = await request(fixture.app)
      .get(`/api/auth/confirm-email-change?token=${rawToken}`)
      .redirects(0);

    assert.equal(response.status, 302);
    assert.equal(response.headers.location, "/login?email_changed=true");
    assert.equal(fixture.state.consumedTokenHash, `hashed:${rawToken}`);
    assert.equal(fixture.state.consumedRawToken, rawToken);
    assert.deepEqual(fixture.state.updatedEmail, {
      email: "new@example.com",
      userId: "user_email_change_001"
    });
    assert.equal(fixture.state.revokedRefreshTokensForUserId, "user_email_change_001");
    assert.equal(fixture.state.revokedMfaDevicesForUserId, "user_email_change_001");
  } finally {
    fixture.cleanup();
  }
});
