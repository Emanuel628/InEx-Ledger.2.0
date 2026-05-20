"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const SERVICE_PATH = require.resolve("../services/gstHstNumberService.js");

function loadService() {
  delete require.cache[SERVICE_PATH];
  return require("../services/gstHstNumberService.js");
}

test("gstHstNumberService encrypts and decrypts current values", () => {
  process.env.FIELD_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const { encryptGstHstNumber, decryptGstHstNumber } = loadService();
  const ciphertext = encryptGstHstNumber("123456789RT0001");
  assert.notEqual(ciphertext, "123456789RT0001");
  assert.equal(decryptGstHstNumber(ciphertext), "123456789RT0001");
});

test("gstHstNumberService preserves legacy plaintext rows on read", () => {
  const { decryptGstHstNumber } = loadService();
  assert.equal(decryptGstHstNumber("123456789RT0001"), "123456789RT0001");
});
