"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { sanitizePayload } = require("../utils/logSanitizer.js");

test("sanitizePayload redacts camelCase and snake_case sensitive keys", () => {
  const sanitized = sanitizePayload({
    taxId: "12-3456789",
    taxIdJwe: "jwe-value",
    accessToken: "access-token",
    refresh_token: "refresh-token",
    privateKey: "secret-key",
    nested: {
      apiKey: "api-key",
      cardNumber: "4111111111111111"
    }
  });

  assert.equal(sanitized.taxId, "[REDACTED]");
  assert.equal(sanitized.taxIdJwe, "[REDACTED]");
  assert.equal(sanitized.accessToken, "[REDACTED]");
  assert.equal(sanitized.refresh_token, "[REDACTED]");
  assert.equal(sanitized.privateKey, "[REDACTED]");
  assert.equal(sanitized.nested.apiKey, "[REDACTED]");
  assert.equal(sanitized.nested.cardNumber, "[REDACTED]");
});
