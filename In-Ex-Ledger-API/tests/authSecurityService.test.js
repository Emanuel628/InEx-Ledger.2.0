"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  hashPassword,
  isStrongPassword,
  isTransientLoginInfrastructureError,
  buildPublicSessionPayload,
  ensureArrayValue,
  hashMfaEmailCode,
  generateMfaEmailCode,
  maskEmail,
  buildMfaStatusPayload,
  getLoginLockExpiry,
  isLoginLocked,
  hashRefreshToken,
  hashMfaTrustToken
} = require("../services/authSecurityService.js");

test("hashPassword produces a bcrypt hash that verifies against the original password", async () => {
  const hash = await hashPassword("Correct-Horse-1!");
  assert.match(hash, /^\$2[aby]\$/);
  const bcrypt = require("bcrypt");
  assert.equal(await bcrypt.compare("Correct-Horse-1!", hash), true);
  assert.equal(await bcrypt.compare("wrong-password", hash), false);
});

test("isStrongPassword requires length, a digit, an uppercase letter, and a symbol (lowercase is not required)", () => {
  assert.equal(isStrongPassword("Weak1!"), false); // too short
  assert.equal(isStrongPassword("weakpassword1!"), false); // no uppercase
  assert.equal(isStrongPassword("Weakpassword1"), false); // no symbol
  assert.equal(isStrongPassword("Weakpassword!"), false); // no digit
  assert.equal(isStrongPassword("WEAKPASSWORD1!"), true); // no lowercase, but that's not required
  assert.equal(isStrongPassword("Strongpass1!"), true);
});

test("isTransientLoginInfrastructureError classifies connection/timeout codes as transient", () => {
  assert.equal(isTransientLoginInfrastructureError({ code: "08006" }), true);
  assert.equal(isTransientLoginInfrastructureError({ code: "ETIMEDOUT" }), true);
  assert.equal(isTransientLoginInfrastructureError({ code: "ECONNRESET" }), true);
  assert.equal(isTransientLoginInfrastructureError({ code: "57P01" }), true);
  assert.equal(isTransientLoginInfrastructureError({ code: "23505" }), false); // unique violation, not transient
  assert.equal(isTransientLoginInfrastructureError({}), false);
  assert.equal(isTransientLoginInfrastructureError(null), false);
});

test("buildPublicSessionPayload strips the token field and passes the rest through", () => {
  assert.deepEqual(
    buildPublicSessionPayload({ token: "secret", userId: "u1", expiresAt: "2026-01-01" }),
    { userId: "u1", expiresAt: "2026-01-01" }
  );
  assert.deepEqual(buildPublicSessionPayload(null), {});
  assert.deepEqual(buildPublicSessionPayload("not-an-object"), {});
});

test("ensureArrayValue passes arrays through and coerces anything else to an empty array", () => {
  assert.deepEqual(ensureArrayValue([1, 2]), [1, 2]);
  assert.deepEqual(ensureArrayValue(null), []);
  assert.deepEqual(ensureArrayValue(undefined), []);
  assert.deepEqual(ensureArrayValue("x"), []);
});

test("hashMfaEmailCode is a deterministic sha256 hex digest", () => {
  const hash = hashMfaEmailCode("123456");
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash, hashMfaEmailCode("123456"));
  assert.notEqual(hash, hashMfaEmailCode("654321"));
});

test("generateMfaEmailCode returns a zero-padded 6-digit string", () => {
  for (let i = 0; i < 20; i++) {
    const code = generateMfaEmailCode();
    assert.match(code, /^\d{6}$/);
  }
});

test("maskEmail masks the local part and domain name while preserving the TLD", () => {
  assert.equal(maskEmail("alice@example.com"), "al***@ex*****.com");
  assert.equal(maskEmail("a@b.co"), "a@b*.co");
  assert.equal(maskEmail(""), "");
  assert.equal(maskEmail(null), "");
});

test("buildMfaStatusPayload shapes MFA status and masks the recovery email", () => {
  const payload = buildMfaStatusPayload({
    mfa_enabled: true,
    mfa_enabled_at: "2026-01-01T00:00:00.000Z",
    recovery_email: "recovery@example.com",
    recovery_email_verified: true
  });

  assert.deepEqual(payload, {
    enabled: true,
    enabled_at: "2026-01-01T00:00:00.000Z",
    delivery: "email",
    recovery_email_masked: "re******@ex*****.com",
    recovery_email_verified: true
  });

  assert.deepEqual(buildMfaStatusPayload(null), {
    enabled: false,
    enabled_at: null,
    delivery: "email",
    recovery_email_masked: "",
    recovery_email_verified: false
  });
});

test("getLoginLockExpiry parses a valid lock timestamp and returns null otherwise", () => {
  const expiry = getLoginLockExpiry({ login_locked_until: "2026-06-01T00:00:00.000Z" });
  assert.ok(expiry instanceof Date);
  assert.equal(expiry.toISOString(), "2026-06-01T00:00:00.000Z");
  assert.equal(getLoginLockExpiry({ login_locked_until: null }), null);
  assert.equal(getLoginLockExpiry({ login_locked_until: "not-a-date" }), null);
  assert.equal(getLoginLockExpiry({}), null);
});

test("isLoginLocked is true only while the lock timestamp is in the future", () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  const past = new Date(Date.now() - 60_000).toISOString();
  assert.equal(isLoginLocked({ login_locked_until: future }), true);
  assert.equal(isLoginLocked({ login_locked_until: past }), false);
  assert.equal(isLoginLocked({}), false);
});

test("hashRefreshToken and hashMfaTrustToken each produce a deterministic sha256 hex digest", () => {
  assert.match(hashRefreshToken("token-a"), /^[0-9a-f]{64}$/);
  assert.equal(hashRefreshToken("token-a"), hashRefreshToken("token-a"));
  assert.notEqual(hashRefreshToken("token-a"), hashRefreshToken("token-b"));

  assert.match(hashMfaTrustToken("token-a"), /^[0-9a-f]{64}$/);
  assert.equal(hashMfaTrustToken("token-a"), hashMfaTrustToken("token-a"));
  assert.notEqual(hashMfaTrustToken("token-a"), hashMfaTrustToken("token-b"));
});
