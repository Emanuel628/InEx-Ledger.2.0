"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeIpAddress,
  getTrustedClientIp,
  getForwardedForChain
} = require("../services/requestIpService.js");

test("normalizeIpAddress normalizes IPv6-mapped and loopback addresses", () => {
  assert.equal(normalizeIpAddress("::ffff:203.0.113.7"), "203.0.113.7");
  assert.equal(normalizeIpAddress("::1"), "127.0.0.1");
  assert.equal(normalizeIpAddress(" 203.0.113.8 "), "203.0.113.8");
});

test("getTrustedClientIp prefers trusted req.ip", () => {
  const req = {
    ip: "198.51.100.10",
    headers: { "x-forwarded-for": "10.0.0.1, 10.0.0.2" }
  };
  assert.equal(getTrustedClientIp(req), "198.51.100.10");
});

test("getTrustedClientIp falls back to socket remote address", () => {
  const req = {
    socket: { remoteAddress: "::ffff:203.0.113.5" }
  };
  assert.equal(getTrustedClientIp(req), "203.0.113.5");
});

test("getForwardedForChain returns normalized untrusted forwarded chain for diagnostics", () => {
  const req = {
    get(name) {
      if (name === "x-forwarded-for") return "198.51.100.9, ::ffff:10.0.0.1";
      return "";
    }
  };
  assert.deepEqual(getForwardedForChain(req), ["198.51.100.9", "10.0.0.1"]);
});
