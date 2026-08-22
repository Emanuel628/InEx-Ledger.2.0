"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const SERVICE_PATH = require.resolve("../services/gstHstNumberService.js");

function captureWarns(fn) {
  const originalWarn = console.warn;
  const calls = [];
  console.warn = (...args) => calls.push(args);
  try {
    const result = fn();
    return { calls, result };
  } finally {
    console.warn = originalWarn;
  }
}

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

test("gstHstNumberService logs decrypt failures without leaking field values", () => {
  process.env.FIELD_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const { decryptGstHstNumber } = loadService();
  const badCiphertext = "enc:v1:not-a-valid-payload";

  const { calls, result } = captureWarns(() => decryptGstHstNumber(badCiphertext));

  assert.equal(result, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "[InEx][WARN] GST/HST number decrypt failed");
  assert.equal(JSON.stringify(calls).includes(badCiphertext), false);
});
