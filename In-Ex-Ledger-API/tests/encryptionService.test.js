"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const ENCRYPTION_SERVICE_PATH = require.resolve("../services/encryptionService.js");

function loadEncryptionService() {
  delete require.cache[ENCRYPTION_SERVICE_PATH];
  return require("../services/encryptionService.js");
}

function decryptWithKey(ciphertext, rawKey) {
  const payload = String(ciphertext || "").slice("enc:v1:".length).split(":");
  const iv = Buffer.from(payload[0], "base64");
  const authTag = Buffer.from(payload[1], "base64");
  const encrypted = Buffer.from(payload[2], "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(rawKey, "hex"), iv, { authTagLength: 16 });
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted, undefined, "utf8") + decipher.final("utf8");
}

test.afterEach(() => {
  delete require.cache[ENCRYPTION_SERVICE_PATH];
});

test("encryptionService picks up FIELD_ENCRYPTION_KEY changes without a process restart", () => {
  const firstKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const secondKey = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
  process.env.FIELD_ENCRYPTION_KEY = firstKey;
  const { encrypt } = loadEncryptionService();

  const firstCiphertext = encrypt("first");
  assert.equal(decryptWithKey(firstCiphertext, firstKey), "first");

  process.env.FIELD_ENCRYPTION_KEY = secondKey;
  const secondCiphertext = encrypt("second");
  assert.equal(decryptWithKey(secondCiphertext, secondKey), "second");
  assert.throws(() => decryptWithKey(secondCiphertext, firstKey));
});
