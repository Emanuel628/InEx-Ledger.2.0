"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  extractRequestContext,
  deriveDeviceLabel,
  decorateSessionRow,
  __private: { truncate, MAX_DEVICE_LABEL_LEN }
} = require("../services/sessionContextService.js");

test("truncate clamps strings to the given max", () => {
  assert.equal(truncate("hello", 3), "hel");
  assert.equal(truncate("hi", 10), "hi");
  assert.equal(truncate(null, 5), null);
});

test("extractRequestContext prefers x-forwarded-for first hop over req.ip", () => {
  const req = {
    headers: { "x-forwarded-for": "10.0.0.1, 10.0.0.2", "user-agent": "UA/1" },
    ip: "127.0.0.1"
  };
  const ctx = extractRequestContext(req);
  assert.equal(ctx.ipAddress, "10.0.0.1");
  assert.equal(ctx.userAgent, "UA/1");
});

test("extractRequestContext returns nulls when nothing is available", () => {
  assert.deepEqual(extractRequestContext(null), { ipAddress: null, userAgent: null });
  assert.deepEqual(extractRequestContext({ headers: {} }), { ipAddress: null, userAgent: null });
});

test("deriveDeviceLabel recognizes common browser + OS combos", () => {
  assert.equal(
    deriveDeviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/124.0.0.0 Safari/537.36"),
    "Chrome on Mac"
  );
  assert.equal(
    deriveDeviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Version/17.0 Mobile/15E148 Safari/604.1"),
    "Safari on iPhone"
  );
  assert.equal(
    deriveDeviceLabel("Mozilla/5.0 (X11; Linux x86_64) Firefox/115.0"),
    "Firefox on Linux"
  );
  assert.equal(
    deriveDeviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124 Edg/124.0"),
    "Edge on Windows"
  );
});

test("deriveDeviceLabel returns null on empty input", () => {
  assert.equal(deriveDeviceLabel(""), null);
  assert.equal(deriveDeviceLabel(null), null);
});

test("decorateSessionRow exposes safe fields and flags the current session", () => {
  const row = {
    id: "s1",
    token_hash: "abc",
    created_at: "2026-05-10T12:00:00Z",
    expires_at: "2026-05-17T12:00:00Z",
    last_used_at: "2026-05-11T08:00:00Z",
    ip_address: "1.2.3.4",
    user_agent: "Mozilla/5.0 (Macintosh) Chrome/124",
    device_label: null,
    mfa_authenticated: true
  };
  const out = decorateSessionRow(row, { currentTokenHash: "abc" });
  assert.equal(out.id, "s1");
  assert.equal(out.last_active_at, "2026-05-11T08:00:00Z");
  assert.equal(out.device_label, "Chrome on Mac");
  assert.equal(out.ip_address, "1.2.3.4");
  assert.equal(out.is_current, true);
  assert.equal(out.mfa_authenticated, true);
  // never leak the token hash
  assert.equal(out.token_hash, undefined);
});

test("decorateSessionRow falls back to created_at when last_used_at is null", () => {
  const out = decorateSessionRow({
    id: "s2",
    token_hash: "x",
    created_at: "2026-05-09T00:00:00Z",
    last_used_at: null,
    user_agent: null,
    device_label: null
  }, { currentTokenHash: null });
  assert.equal(out.last_active_at, "2026-05-09T00:00:00Z");
  assert.equal(out.is_current, false);
  assert.equal(out.device_label, null);
});

test("decorateSessionRow respects an explicit device_label", () => {
  const out = decorateSessionRow({
    id: "s3",
    token_hash: "x",
    created_at: "2026-05-09T00:00:00Z",
    last_used_at: null,
    user_agent: "anything",
    device_label: "Custom Label"
  });
  assert.equal(out.device_label, "Custom Label");
});
