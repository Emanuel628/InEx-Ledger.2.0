"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const ME_ROUTE_PATH = require.resolve("../routes/me.routes.js");

function loadMeRouter(options = {}) {
  const originalLoad = Module._load.bind(Module);
  const state = {
    queries: [],
    userId: "00000000-0000-4000-8000-0000000000u1",
    email: "delete-me@example.com",
    passwordHash: "hash",
    receiptPaths: options.receiptPaths || [],
    businessIds: options.businessIds || ["00000000-0000-4000-8000-0000000000b1"],
    userDeleteCount: options.userDeleteCount ?? 1,
    passwordMatches: options.passwordMatches ?? true,
    unlinkCalls: [],
    clearedCookie: null,
    mfaEnabled: options.mfaEnabled ?? false,
    validMfaReauthToken: options.validMfaReauthToken || "valid-delete-reauth-token",
    deleteError: options.deleteError || null,
    legacyConstraints: options.legacyConstraints || [],
    constraintDropError: options.constraintDropError || null
  };

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async connect() {
            return {
              async query(sql, params) {
                state.queries.push({ sql, params });

                if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
                  return { rows: [], rowCount: 0 };
                }
                if (/ALTER TABLE IF EXISTS cpa_audit_logs/i.test(sql)) {
                  if (state.constraintDropError) {
                    const error = new Error(state.constraintDropError.message || "alter table failed");
                    if (state.constraintDropError.code) error.code = state.constraintDropError.code;
                    throw error;
                  }
                  return { rows: [], rowCount: 0 };
                }
                if (/SELECT EXISTS\(\s*SELECT 1\s+FROM pg_constraint/i.test(sql)) {
                  return {
                    rows: [{ has_legacy_constraints: state.legacyConstraints.length > 0 }],
                    rowCount: 1
                  };
                }
                if (/SELECT id, email, password_hash FROM users/i.test(sql)) {
                  return {
                    rows: [{ id: state.userId, email: state.email, password_hash: state.passwordHash }],
                    rowCount: 1
                  };
                }
                if (/SELECT r\.storage_path/i.test(sql)) {
                  return {
                    rows: state.receiptPaths.map((storage_path) => ({ storage_path })),
                    rowCount: state.receiptPaths.length
                  };
                }
                if (/SELECT id FROM businesses WHERE user_id = \$1/i.test(sql)) {
                  return {
                    rows: state.businessIds.map((id) => ({ id })),
                    rowCount: state.businessIds.length
                  };
                }
                if (/DELETE FROM users WHERE id = \$1 RETURNING id/i.test(sql)) {
                  if (state.deleteError) {
                    const error = new Error(state.deleteError.message || "delete failed");
                    if (state.deleteError.code) error.code = state.deleteError.code;
                    if (state.deleteError.constraint) error.constraint = state.deleteError.constraint;
                    throw error;
                  }
                  return {
                    rows: state.userDeleteCount ? [{ id: state.userId }] : [],
                    rowCount: state.userDeleteCount
                  };
                }
                return { rows: [], rowCount: 0 };
              },
              release() {}
            };
          }
        }
      };
    }

    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        requireAuth(req, _res, next) {
          req.user = { id: state.userId, mfa_enabled: state.mfaEnabled };
          next();
        },
        requireMfa(_req, _res, next) {
          next();
        },
        verifyToken(token) {
          if (token === state.validMfaReauthToken) {
            return {
              purpose: "mfa_sensitive_reauth",
              reason: "account_delete",
              id: state.userId
            };
          }
          const error = new Error("invalid token");
          error.code = "TOKEN_INVALID";
          throw error;
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

    if (requestName === "../api/utils/resolveBusinessIdForUser.js" || /resolveBusinessIdForUser\.js$/.test(requestName)) {
      return {
        resolveBusinessIdForUser: async () => state.businessIds[0] || null,
        listBusinessesForUser: async () => [],
        setActiveBusinessForUser: async () => null,
        createBusinessForUser: async () => null
      };
    }

    if (requestName === "../services/subscriptionService.js" || /subscriptionService\.js$/.test(requestName)) {
      return {
        getSubscriptionSnapshotForBusiness: async () => ({})
      };
    }

    if (requestName === "../services/cpaAccessService.js" || /cpaAccessService\.js$/.test(requestName)) {
      return {
        listAssignedCpaGrants: async () => [],
        listAccessibleBusinessScopeForUser: async () => []
      };
    }

    if (requestName === "../utils/authUtils.js" || /authUtils\.js$/.test(requestName)) {
      return {
        COOKIE_OPTIONS: { path: "/", httpOnly: true },
        isLegacyScryptHash: () => false,
        verifyPassword: async () => ({ match: state.passwordMatches })
      };
    }

    if (requestName === "../middleware/rate-limit.middleware.js" || /rate-limit\.middleware\.js$/.test(requestName)) {
      return {
        createDataApiLimiter() {
          return (_req, _res, next) => next();
        }
      };
    }

    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return {
        logError() {},
        logWarn() {},
        logInfo() {}
      };
    }

    if (requestName === "../services/receiptStorage.js" || /receiptStorage\.js$/.test(requestName)) {
      return {
        isManagedReceiptPath(filePath) {
          return String(filePath || "").startsWith("C:\\managed\\");
        }
      };
    }

    if (requestName === "express-rate-limit") {
      return function rateLimit() {
        return (_req, _res, next) => next();
      };
    }

    if (requestName === "bcrypt") {
      return {
        compare: async () => state.passwordMatches
      };
    }

    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[ME_ROUTE_PATH];

  const originalUnlink = fs.promises.unlink;
  fs.promises.unlink = async (filePath) => {
    state.unlinkCalls.push(filePath);
    if (options.unlinkError && filePath === options.unlinkError.path) {
      const error = new Error(options.unlinkError.message || "unlink failed");
      error.code = options.unlinkError.code;
      throw error;
    }
  };

  try {
    const router = require("../routes/me.routes.js");
    return {
      router,
      state,
      cleanup() {
        delete require.cache[ME_ROUTE_PATH];
        Module._load = originalLoad;
        fs.promises.unlink = originalUnlink;
      }
    };
  } catch (error) {
    Module._load = originalLoad;
    fs.promises.unlink = originalUnlink;
    throw error;
  }
}

function buildApp(router, state) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    const originalClearCookie = res.clearCookie.bind(res);
    res.clearCookie = (name, options) => {
      state.clearedCookie = { name, options };
      return originalClearCookie(name, options);
    };
    next();
  });
  app.use("/api/me", router);
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message });
  });
  return app;
}

test("account deletion executes the hard delete and returns success", async () => {
  const fixture = loadMeRouter({
    receiptPaths: ["C:\\managed\\receipt-1.pdf"]
  });

  try {
    const app = buildApp(fixture.router, fixture.state);
    const response = await request(app)
      .delete("/api/me")
      .send({ password: "CorrectHorseBatteryStaple1!" });

    assert.equal(response.status, 200);
    assert.match(response.body.message, /deleted/i);
    assert.ok(
      fixture.state.queries.some(({ sql }) => /DELETE FROM users WHERE id = \$1 RETURNING id/i.test(sql)),
      "route must issue a hard DELETE against users"
    );
    assert.ok(
      fixture.state.queries.some(({ sql }) => /DELETE FROM businesses WHERE user_id = \$1/i.test(sql)),
      "route must delete owned businesses before deleting the user"
    );
    assert.ok(
      fixture.state.queries.some(({ sql }) => /DELETE FROM vehicle_costs WHERE business_id = ANY\(\$1::uuid\[\]\)/i.test(sql)),
      "route must delete vehicle costs before deleting the business"
    );
    assert.deepEqual(fixture.state.unlinkCalls, ["C:\\managed\\receipt-1.pdf"]);
    assert.equal(fixture.state.clearedCookie?.name, "refresh_token");
  } finally {
    fixture.cleanup();
  }
});

test("account deletion still returns success when receipt cleanup fails after commit", async () => {
  const fixture = loadMeRouter({
    receiptPaths: ["C:\\managed\\receipt-2.pdf"],
    unlinkError: {
      path: "C:\\managed\\receipt-2.pdf",
      code: "EPERM",
      message: "permission denied"
    }
  });

  try {
    const app = buildApp(fixture.router, fixture.state);
    const response = await request(app)
      .delete("/api/me")
      .send({ password: "CorrectHorseBatteryStaple1!" });

    assert.equal(response.status, 200);
    assert.ok(
      fixture.state.queries.some(({ sql }) => sql === "COMMIT"),
      "database transaction must commit before file cleanup"
    );
  } finally {
    fixture.cleanup();
  }
});

test("account deletion deletes transactions before accounts and categories (ON DELETE RESTRICT)", async () => {
  const fixture = loadMeRouter({});

  try {
    const app = buildApp(fixture.router, fixture.state);
    const response = await request(app)
      .delete("/api/me")
      .send({ password: "CorrectHorseBatteryStaple1!" });

    assert.equal(response.status, 200);

    const deleteSqls = fixture.state.queries
      .filter(({ sql }) => /^\s*DELETE/i.test(sql))
      .map(({ sql }) => sql.trim());

    const txIdx = deleteSqls.findIndex((sql) => /DELETE FROM transactions\b/i.test(sql));
    const accIdx = deleteSqls.findIndex((sql) => /DELETE FROM accounts\b/i.test(sql));
    const catIdx = deleteSqls.findIndex((sql) => /DELETE FROM categories\b/i.test(sql));
    const bizIdx = deleteSqls.findIndex((sql) => /DELETE FROM businesses\b/i.test(sql));
    const userIdx = deleteSqls.findIndex((sql) => /DELETE FROM users\b/i.test(sql));

    assert.ok(txIdx !== -1, "route must DELETE transactions");
    assert.ok(accIdx !== -1, "route must DELETE accounts");
    assert.ok(catIdx !== -1, "route must DELETE categories");
    assert.ok(bizIdx !== -1, "route must DELETE businesses");
    assert.ok(userIdx !== -1, "route must DELETE users");

    assert.ok(
      txIdx < accIdx,
      "transactions must be deleted before accounts to avoid ON DELETE RESTRICT violation"
    );
    assert.ok(
      txIdx < catIdx,
      "transactions must be deleted before categories to avoid ON DELETE RESTRICT violation"
    );
    assert.ok(
      bizIdx < userIdx,
      "businesses must be deleted before the user row"
    );
  } finally {
    fixture.cleanup();
  }
});

test("account deletion returns 400 when password is missing", async () => {
  const fixture = loadMeRouter({});

  try {
    const app = buildApp(fixture.router, fixture.state);
    const response = await request(app)
      .delete("/api/me")
      .send({});

    assert.equal(response.status, 400);
    assert.ok(response.body.error, "response must include error message");
  } finally {
    fixture.cleanup();
  }
});

test("account deletion returns 401 when password is incorrect", async () => {
  const fixture = loadMeRouter({ passwordMatches: false });

  try {
    const app = buildApp(fixture.router, fixture.state);
    const response = await request(app)
      .delete("/api/me")
      .send({ password: "WrongPassword1!" });

    assert.equal(response.status, 401);
    assert.ok(response.body.error, "response must include error message");
  } finally {
    fixture.cleanup();
  }
});

test("account deletion returns 403 when MFA reauthentication token is missing", async () => {
  const fixture = loadMeRouter({ mfaEnabled: true });

  try {
    const app = buildApp(fixture.router, fixture.state);
    const response = await request(app)
      .delete("/api/me")
      .send({ password: "CorrectHorseBatteryStaple1!" });

    assert.equal(response.status, 403);
    assert.equal(response.body?.mfa_required, true);
    assert.equal(response.body?.reauthenticate, true);
  } finally {
    fixture.cleanup();
  }
});

test("account deletion succeeds for MFA-enabled users when mfaReauthToken is provided", async () => {
  const fixture = loadMeRouter({ mfaEnabled: true });

  try {
    const app = buildApp(fixture.router, fixture.state);
    const response = await request(app)
      .delete("/api/me")
      .send({
        password: "CorrectHorseBatteryStaple1!",
        mfaReauthToken: fixture.state.validMfaReauthToken
      });

    assert.equal(response.status, 200);
    assert.match(response.body.message, /deleted/i);
  } finally {
    fixture.cleanup();
  }
});

test("account deletion returns 403 when MFA reauthentication token is invalid", async () => {
  const fixture = loadMeRouter({ mfaEnabled: true });

  try {
    const app = buildApp(fixture.router, fixture.state);
    const response = await request(app)
      .delete("/api/me")
      .send({
        password: "CorrectHorseBatteryStaple1!",
        mfaReauthToken: "invalid-token"
      });

    assert.equal(response.status, 403);
    assert.equal(response.body?.mfa_required, true);
    assert.equal(response.body?.reauthenticate, true);
  } finally {
    fixture.cleanup();
  }
});

test("account deletion returns migration hint when cpa_audit_logs foreign key blocks deletion", async () => {
  const fixture = loadMeRouter({
    deleteError: {
      code: "23503",
      constraint: "cpa_audit_logs_owner_user_id_fkey",
      message: "insert or update on table violates foreign key constraint"
    }
  });

  try {
    const app = buildApp(fixture.router, fixture.state);
    const response = await request(app)
      .delete("/api/me")
      .send({ password: "CorrectHorseBatteryStaple1!" });

    assert.equal(response.status, 500);
    assert.match(response.body?.detail || "", /045_drop_cpa_audit_user_fks\.sql/i);
  } finally {
    fixture.cleanup();
  }
});

test("account deletion returns 500 with database error code when XX000 internal error occurs", async () => {
  const fixture = loadMeRouter({
    deleteError: {
      code: "XX000",
      message: "internal error"
    }
  });

  try {
    const app = buildApp(fixture.router, fixture.state);
    const response = await request(app)
      .delete("/api/me")
      .send({ password: "CorrectHorseBatteryStaple1!" });

    assert.equal(response.status, 500);
    assert.match(response.body?.detail || "", /XX000/i);
  } finally {
    fixture.cleanup();
  }
});

test("account deletion does not issue UPDATE to cpa_audit_logs (DO INSTEAD NOTHING rule blocks it)", async () => {
  const fixture = loadMeRouter({});

  try {
    const app = buildApp(fixture.router, fixture.state);
    await request(app)
      .delete("/api/me")
      .send({ password: "CorrectHorseBatteryStaple1!" });

    assert.ok(
      !fixture.state.queries.some(({ sql }) => /UPDATE cpa_audit_logs/i.test(sql)),
      "route must not attempt to UPDATE cpa_audit_logs (immutable table with DO INSTEAD NOTHING rule)"
    );
  } finally {
    fixture.cleanup();
  }
});

test("account deletion fails fast when legacy cpa_audit_logs constraints still exist", async () => {
  const fixture = loadMeRouter({
    legacyConstraints: ["cpa_audit_logs_owner_user_id_fkey"]
  });

  try {
    const app = buildApp(fixture.router, fixture.state);
    const response = await request(app)
      .delete("/api/me")
      .send({ password: "CorrectHorseBatteryStaple1!" });

    assert.equal(response.status, 500);
    assert.match(response.body?.detail || "", /045_drop_cpa_audit_user_fks\.sql/i);
    assert.ok(
      !fixture.state.queries.some(({ sql }) => /DELETE FROM users WHERE id = \$1 RETURNING id/i.test(sql)),
      "route must stop before deleting users when legacy constraints still exist"
    );
  } finally {
    fixture.cleanup();
  }
});
