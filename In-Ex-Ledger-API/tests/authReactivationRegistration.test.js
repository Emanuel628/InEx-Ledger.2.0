"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-auth-reactivation-secret";

const AUTH_ROUTE_PATH = require.resolve("../routes/auth.routes.js");

function loadAuthRouterFixture() {
  const originalLoad = Module._load.bind(Module);
  const state = {
    insertedUserParams: null,
    markReactivatedCalls: []
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
          async connect() {
            return {
              async query(sql, params = []) {
                if (/^BEGIN$/i.test(sql) || /^COMMIT$/i.test(sql) || /^ROLLBACK$/i.test(sql)) {
                  return { rows: [], rowCount: 0 };
                }
                if (/SELECT id FROM users WHERE email = \$1/i.test(sql)) {
                  return { rows: [], rowCount: 0 };
                }
                if (/INSERT INTO users .*trial_eligible/i.test(sql)) {
                  state.insertedUserParams = params;
                  return {
                    rows: [{
                      id: "user_reactivated_1",
                      email: params[1],
                      full_name: params[3],
                      display_name: params[4],
                      trial_eligible: params[7]
                    }],
                    rowCount: 1
                  };
                }
                if (/INSERT INTO user_privacy_settings/i.test(sql)) {
                  return { rows: [], rowCount: 1 };
                }
                throw new Error(`Unhandled client SQL: ${sql}`);
              },
              release() {}
            };
          },
          async query(sql) {
            if (/DELETE FROM verification_tokens WHERE email = \$1/i.test(sql)) {
              return { rows: [], rowCount: 0 };
            }
            if (/INSERT INTO verification_tokens/i.test(sql)) {
              return { rows: [], rowCount: 1 };
            }
            throw new Error(`Unhandled pool SQL: ${sql}`);
          }
        }
      };
    }

    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        signToken(payload) {
          return `signed:${payload?.purpose || payload?.email || "token"}`;
        },
        verifyToken() {
          return {};
        },
        requireAuth(_req, _res, next) {
          next();
        },
        requireMfaIfEnabled(_req, _res, next) {
          next();
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
        resolveBusinessIdForUser: async () => "business-1"
      };
    }

    if (requestName === "../services/subscriptionService.js" || /subscriptionService\.js$/.test(requestName)) {
      return {
        getSubscriptionSnapshotForUser: async () => ({ effectiveStatus: "free", effectiveTier: "free" }),
        getSubscriptionSnapshotForBusiness: async () => ({ effectiveStatus: "free", effectiveTier: "free" })
      };
    }

    if (requestName === "../utils/authUtils.js" || /authUtils\.js$/.test(requestName)) {
      return {
        COOKIE_OPTIONS: {},
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

    if (requestName === "../services/auditEventService.js" || /auditEventService\.js$/.test(requestName)) {
      return {
        AUDIT_ACTIONS: {},
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
        getDeletedAccountRecordByEmail: async () => ({
          email: "returning@example.com",
          had_trial: true,
          had_paid_subscription: false
        }),
        markDeletedAccountReactivated: async (_db, email, metadata) => {
          state.markReactivatedCalls.push({ email, metadata });
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
      }
    };
  } catch (error) {
    Module._load = originalLoad;
    throw error;
  }
}

function buildApp(router) {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", router);
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message });
  });
  return app;
}

test("POST /api/auth/register reopens a deleted account without granting a new trial", async () => {
  const fixture = loadAuthRouterFixture();

  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        email: "returning@example.com",
        password: "StrongPass1!",
        first_name: "Returning",
        last_name: "User",
        country: "US",
        tos_consent: true
      });

    assert.equal(response.status, 201);
    assert.equal(response.body?.reactivated_without_trial, true);
    assert.match(String(response.body?.message || ""), /new free trial is not available/i);
    assert.equal(fixture.state.insertedUserParams?.[7], false);
    assert.equal(fixture.state.markReactivatedCalls.length, 1);
    assert.equal(fixture.state.markReactivatedCalls[0]?.email, "returning@example.com");
  } finally {
    fixture.cleanup();
  }
});
