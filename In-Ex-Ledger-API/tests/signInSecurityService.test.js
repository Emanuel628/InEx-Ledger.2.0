"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeIpAddress,
  extractClientIp,
  buildDeviceFingerprint,
  fetchIpLocation,
  resolveGeolocationApiUrl
} = require("../services/signInSecurityService.js");

test.afterEach(() => {
  delete process.env.GEOLOCATION_API_URL;
  delete process.env.GEOLOCATION_ALLOWED_HOSTS;
});

test("buildDeviceFingerprint is stable for same user-agent and IP", () => {
  const first = buildDeviceFingerprint({
    userId: "user_1",
    userAgent: "Mozilla/5.0",
    ipAddress: "203.0.113.42"
  });
  const second = buildDeviceFingerprint({
    userId: "user_1",
    userAgent: "Mozilla/5.0",
    ipAddress: "203.0.113.42"
  });
  assert.equal(first, second);
});

test("buildDeviceFingerprint changes when IP changes", () => {
  const first = buildDeviceFingerprint({
    userId: "user_1",
    userAgent: "Mozilla/5.0",
    ipAddress: "203.0.113.42"
  });
  const second = buildDeviceFingerprint({
    userId: "user_1",
    userAgent: "Mozilla/5.0",
    ipAddress: "203.0.113.99"
  });
  assert.notEqual(first, second);
});

test("extractClientIp uses x-forwarded-for first", () => {
  const req = {
    get(name) {
      if (name === "x-forwarded-for") return "198.51.100.9, 10.0.0.1";
      return "";
    },
    ip: "203.0.113.5"
  };
  assert.equal(extractClientIp(req), "198.51.100.9");
});

test("normalizeIpAddress strips IPv6-mapped prefix", () => {
  assert.equal(normalizeIpAddress("::ffff:203.0.113.7"), "203.0.113.7");
});

test("fetchIpLocation returns parsed city and country from API payload", async () => {
  const fakeFetch = async () => ({
    ok: true,
    async json() {
      return { city: "Paris", country_name: "France" };
    }
  });
  const location = await fetchIpLocation("203.0.113.99", { fetchImpl: fakeFetch });
  assert.deepEqual(location, { city: "Paris", country: "France" });
});

test("fetchIpLocation gracefully returns null when fetch fails", async () => {
  const fakeFetch = async () => {
    throw new Error("network down");
  };
  const location = await fetchIpLocation("203.0.113.99", { fetchImpl: fakeFetch });
  assert.equal(location, null);
});

test("fetchIpLocation skips lookup for private IP addresses", async () => {
  let called = false;
  const fakeFetch = async () => {
    called = true;
    return { ok: true, json: async () => ({ city: "X", country: "Y" }) };
  };
  const location = await fetchIpLocation("10.1.2.3", { fetchImpl: fakeFetch });
  assert.equal(location, null);
  assert.equal(called, false);
});

test("resolveGeolocationApiUrl rejects unsafe or unapproved endpoints", () => {
  process.env.GEOLOCATION_API_URL = "http://127.0.0.1/{ip}";
  assert.equal(resolveGeolocationApiUrl("203.0.113.10"), null);

  process.env.GEOLOCATION_API_URL = "https://evil.example/{ip}";
  assert.equal(resolveGeolocationApiUrl("203.0.113.10"), null);
});

test("resolveGeolocationApiUrl allows configured approved hosts", () => {
  process.env.GEOLOCATION_API_URL = "https://geo.example.test/lookup?ip={ip}";
  process.env.GEOLOCATION_ALLOWED_HOSTS = "geo.example.test";

  assert.equal(
    resolveGeolocationApiUrl("203.0.113.10"),
    "https://geo.example.test/lookup?ip=203.0.113.10"
  );
});
