"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const TAX_ID_SERVICE_PATH = require.resolve("../services/taxIdService.js");
const ENCRYPTION_SERVICE_PATH = require.resolve("../services/encryptionService.js");

function loadTaxIdService() {
  delete require.cache[TAX_ID_SERVICE_PATH];
  delete require.cache[ENCRYPTION_SERVICE_PATH];
  return require("../services/taxIdService.js");
}

function encryptLegacyValue(plaintext, secret) {
  const key = crypto.createHash("sha256").update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `enc:${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

test.afterEach(() => {
  delete require.cache[TAX_ID_SERVICE_PATH];
  delete require.cache[ENCRYPTION_SERVICE_PATH];
});

test("taxIdService decrypts legacy tax ids only when TAX_ID_LEGACY_KEY is configured", () => {
  process.env.FIELD_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const legacySecret = "legacy-tax-secret";
  const ciphertext = encryptLegacyValue("12-3456789", legacySecret);

  process.env.TAX_ID_LEGACY_KEY = legacySecret;
  assert.equal(loadTaxIdService().decryptTaxId(ciphertext), "12-3456789");

  delete process.env.TAX_ID_LEGACY_KEY;
  assert.equal(loadTaxIdService().decryptTaxId(ciphertext), null);
});
