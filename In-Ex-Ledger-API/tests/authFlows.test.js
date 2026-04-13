/**
 * Auth Flows Tests
 *
 * Covers:
 *   1. JWT token lifecycle — signToken, verifyToken (happy path, expiry, tampering)
 *   2. requireAuth middleware — 401 on missing/invalid/expired tokens; passes valid tokens
 *   3. requireMfa middleware — 403 with mfa_required flag when MFA not enabled; 401 without user
 *   4. Password verification — bcrypt and legacy scrypt hashes (correct / wrong passwords)
 *   5. COOKIE_OPTIONS security flags
 */

"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const crypto = require("crypto");
const bcrypt = require("bcrypt");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-auth-flows";

const {
  signToken,
  verifyToken,
  requireAuth,
  requireMfa
} = require("../middleware/auth.middleware.js");

const {
  verifyPassword,
  isLegacyScryptHash,
  COOKIE_OPTIONS
} = require("../utils/authUtils.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Crafts a JWT with a past exp claim so it is already expired when verifyToken
 * is called.  Replicates the same signing algorithm as auth.middleware.js so
 * the signature is valid and only the expiry fails.
 */
function makeExpiredToken(payload) {
  const secret = process.env.JWT_SECRET;
  const encode = (v) =>
    Buffer.from(typeof v === "string" ? v : JSON.stringify(v ?? {}), "utf8").toString("base64url");
  const sign = (msg) =>
    crypto.createHmac("sha256", secret).update(msg).digest("base64url");

  const header = encode({ alg: "HS256", typ: "JWT" });
  const pastTs = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
  const body = encode({ ...payload, iat: pastTs - 60, exp: pastTs });
  const signature = sign(`${header}.${body}`);
  return `${header}.${body}.${signature}`;
}

/**
 * Creates a minimal response double compatible with Express response interface.
 */
function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

/**
 * Creates a minimal req double with an Authorization header.
 */
function createReq({ authHeader = null, user = null } = {}) {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
    user
  };
}

// ---------------------------------------------------------------------------
// 1. JWT Token Lifecycle
// ---------------------------------------------------------------------------

test("signToken produces a three-part JWT", () => {
  const token = signToken({ id: "user_1", email: "a@b.com" });
  const parts = token.split(".");
  assert.equal(parts.length, 3, "JWT must have header.body.signature format");
});

test("verifyToken decodes a freshly signed token correctly", () => {
  const payload = { id: "user_abc", email: "test@example.com", mfa_enabled: false };
  const token = signToken(payload);
  const decoded = verifyToken(token);
  assert.equal(decoded.id, payload.id);
  assert.equal(decoded.email, payload.email);
  assert.equal(decoded.mfa_enabled, payload.mfa_enabled);
});

test("verifyToken includes iat and exp claims", () => {
  const token = signToken({ id: "u1" }, 60);
  const decoded = verifyToken(token);
  const now = Math.floor(Date.now() / 1000);
  assert.ok(typeof decoded.iat === "number", "iat must be a number");
  assert.ok(typeof decoded.exp === "number", "exp must be a number");
  assert.ok(decoded.iat <= now + 1, "iat must not be in the future");
  assert.ok(decoded.exp > now, "exp must be in the future for a fresh token");
});

test("verifyToken throws on an expired token", () => {
  const token = makeExpiredToken({ id: "user_exp" });
  assert.throws(
    () => verifyToken(token),
    (err) => {
      assert.ok(err.message.toLowerCase().includes("expired"), "error must mention expiry");
      return true;
    }
  );
});

test("verifyToken throws on a tampered signature", () => {
  const token = signToken({ id: "user_tamper" });
  const [header, body] = token.split(".");
  const tampered = `${header}.${body}.invalidsignature`;
  assert.throws(
    () => verifyToken(tampered),
    (err) => {
      assert.ok(
        err.message.toLowerCase().includes("invalid"),
        "error must mention invalid token"
      );
      return true;
    }
  );
});

test("verifyToken throws on a token with fewer than three parts", () => {
  assert.throws(() => verifyToken("onlytwoparts.here"), /invalid token format/i);
});

test("verifyToken throws on an empty string", () => {
  assert.throws(() => verifyToken(""));
});

// ---------------------------------------------------------------------------
// 2. requireAuth Middleware
// ---------------------------------------------------------------------------

test("requireAuth calls next() and sets req.user for a valid token", () => {
  const payload = { id: "user_ok", email: "ok@test.com", mfa_enabled: true };
  const token = signToken(payload);
  const req = createReq({ authHeader: `Bearer ${token}` });
  const res = createRes();
  let called = false;

  requireAuth(req, res, () => {
    called = true;
  });

  assert.ok(called, "next() must be called");
  assert.equal(req.user.id, payload.id);
  assert.equal(req.user.email, payload.email);
});

test("requireAuth returns 401 when Authorization header is absent", () => {
  const req = createReq();
  const res = createRes();
  let called = false;

  requireAuth(req, res, () => {
    called = true;
  });

  assert.ok(!called, "next() must not be called");
  assert.equal(res.statusCode, 401);
  assert.ok(res.body?.error, "error field must be present");
});

test("requireAuth returns 401 when Authorization header does not start with Bearer", () => {
  const req = createReq({ authHeader: "Token abc123" });
  const res = createRes();
  let called = false;

  requireAuth(req, res, () => {
    called = true;
  });

  assert.ok(!called);
  assert.equal(res.statusCode, 401);
});

test("requireAuth returns 401 for an expired token", () => {
  const token = makeExpiredToken({ id: "user_exp2" });
  const req = createReq({ authHeader: `Bearer ${token}` });
  const res = createRes();
  let called = false;

  requireAuth(req, res, () => {
    called = true;
  });

  assert.ok(!called);
  assert.equal(res.statusCode, 401);
});

test("requireAuth returns 401 for a malformed token", () => {
  const req = createReq({ authHeader: "Bearer not.a.realtoken" });
  const res = createRes();
  let called = false;

  requireAuth(req, res, () => {
    called = true;
  });

  assert.ok(!called);
  assert.equal(res.statusCode, 401);
});

// ---------------------------------------------------------------------------
// 3. requireMfa Middleware
// ---------------------------------------------------------------------------

test("requireMfa calls next() when MFA is enabled and verified for this session", () => {
  const req = createReq({
    user: { id: "user_mfa", mfa_enabled: true, mfa_authenticated: true }
  });
  req.headers = {};
  const res = createRes();
  let called = false;

  requireMfa(req, res, () => {
    called = true;
  });

  assert.ok(called, "next() must be called when MFA is enabled and session is MFA-authenticated");
  assert.equal(res.statusCode, 200);
});

test("requireMfa returns 403 with mfa_required flag when mfa_enabled is false", () => {
  const req = { headers: {}, user: { id: "user_no_mfa", mfa_enabled: false } };
  const res = createRes();
  let called = false;

  requireMfa(req, res, () => {
    called = true;
  });

  assert.ok(!called, "next() must not be called");
  assert.equal(res.statusCode, 403);
  assert.equal(res.body?.mfa_required, true);
  assert.ok(res.body?.setup_url, "setup_url must be present in the response");
});

test("requireMfa returns 403 with mfa_required flag when MFA is enabled but session is not MFA-authenticated", () => {
  const req = { headers: {}, user: { id: "user_no_session_mfa", mfa_enabled: true } };
  const res = createRes();
  let called = false;

  requireMfa(req, res, () => {
    called = true;
  });

  assert.ok(!called, "next() must not be called");
  assert.equal(res.statusCode, 403);
  assert.equal(res.body?.mfa_required, true);
  assert.equal(res.body?.reauthenticate, true);
});

test("requireMfa returns 401 when req.user is absent", () => {
  const req = { headers: {} };
  const res = createRes();
  let called = false;

  requireMfa(req, res, () => {
    called = true;
  });

  assert.ok(!called);
  assert.equal(res.statusCode, 401);
});

// ---------------------------------------------------------------------------
// 4. Password Verification
// ---------------------------------------------------------------------------

test("verifyPassword matches a correct bcrypt hash", async () => {
  const password = "correct-horse-battery-staple";
  const hash = await bcrypt.hash(password, 10);
  const result = await verifyPassword(password, hash);
  assert.equal(result.match, true);
  assert.equal(result.legacy, false);
});

test("verifyPassword rejects a wrong password against a bcrypt hash", async () => {
  const hash = await bcrypt.hash("correct-password", 10);
  const result = await verifyPassword("wrong-password", hash);
  assert.equal(result.match, false);
  assert.equal(result.legacy, false);
});

test("verifyPassword returns match:false for an empty stored hash", async () => {
  const result = await verifyPassword("any-password", "");
  assert.equal(result.match, false);
});

test("verifyPassword returns match:false for a null stored hash", async () => {
  const result = await verifyPassword("any-password", null);
  assert.equal(result.match, false);
});

test("verifyPassword verifies a correct legacy scrypt hash", async () => {
  // Build a legacy scrypt hash using the same algorithm as authUtils
  const password = "legacy-secret";
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  const stored = `${salt}$${hash}`;

  const result = await verifyPassword(password, stored);
  assert.equal(result.match, true);
  assert.equal(result.legacy, true);
});

test("verifyPassword rejects a wrong password against a legacy scrypt hash", async () => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync("correct-password", salt, 64).toString("hex");
  const stored = `${salt}$${hash}`;

  const result = await verifyPassword("wrong-password", stored);
  assert.equal(result.match, false);
});

// ---------------------------------------------------------------------------
// 5. isLegacyScryptHash
// ---------------------------------------------------------------------------

test("isLegacyScryptHash returns true for salt$hash format", () => {
  assert.equal(isLegacyScryptHash("somesalt$somehash"), true);
});

test("isLegacyScryptHash returns false for bcrypt hashes", () => {
  // bcrypt hashes start with $2b$ — three dollar signs
  assert.equal(isLegacyScryptHash("$2b$10$somebcrypthashabcd"), false);
});

test("isLegacyScryptHash returns false for non-string values", () => {
  assert.equal(isLegacyScryptHash(null), false);
  assert.equal(isLegacyScryptHash(undefined), false);
  assert.equal(isLegacyScryptHash(42), false);
});

// ---------------------------------------------------------------------------
// 6. COOKIE_OPTIONS Security Properties
// ---------------------------------------------------------------------------

test("COOKIE_OPTIONS sets httpOnly to true", () => {
  assert.equal(COOKIE_OPTIONS.httpOnly, true, "cookies must be inaccessible to JS (httpOnly)");
});

test("COOKIE_OPTIONS sets path to /", () => {
  assert.equal(COOKIE_OPTIONS.path, "/");
});
