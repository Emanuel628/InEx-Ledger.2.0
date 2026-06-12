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

test("sanitizePayload masks email-like strings and strips forwarded header chains", () => {
  const sanitized = sanitizePayload({
    email: "owner@example.com",
    recipients: ["billing@company.com", "Name <person@example.ca>"],
    forwardedFor: "203.0.113.9, 10.0.0.10",
    nested: {
      message: "Contact me at support@inexledger.com"
    }
  });

  assert.equal(sanitized.email, "ow***@ex***.com");
  assert.deepEqual(sanitized.recipients, ["bi***@co***.com", "Name <pe***@ex***.ca>"]);
  assert.equal(sanitized.forwardedFor, "[REDACTED]");
  assert.equal(sanitized.nested.message, "Contact me at su***@in***.com");
});
