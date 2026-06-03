"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

function withEnv(overrides, fn) {
  const before = {};
  for (const key of Object.keys(overrides)) {
    before[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(before)) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  }
}

const {
  buildSupportReplyToken,
  parseSupportReplyToken,
  buildSupportReplyToAddress,
  getSupportToEmail,
  getSupportFromEmail
} = require("../services/supportEmailService.js");

test("support email helpers resolve from/to defaults", () => {
  withEnv({
    SUPPORT_TO_EMAIL: undefined,
    SUPPORT_FROM_EMAIL: undefined,
    RESEND_FROM_EMAIL: undefined,
    EMAIL_FROM: undefined
  }, () => {
    assert.equal(getSupportToEmail(), "support.inex@gmail.com");
    assert.match(getSupportFromEmail(), /support@inexledger\.com/i);
  });
});

test("buildSupportReplyToken + parseSupportReplyToken round-trip", () => {
  withEnv({
    SUPPORT_REPLY_HMAC_SECRET: "support-reply-secret-32-bytes-aaaa"
  }, () => {
    const token = buildSupportReplyToken("77777777-7777-4777-8777-777777777777");
    assert.equal(parseSupportReplyToken(token), "77777777-7777-4777-8777-777777777777");
  });
});

test("buildSupportReplyToAddress plus-addresses the configured support base", () => {
  withEnv({
    SUPPORT_REPLY_BASE_EMAIL: "support@inex.app",
    SUPPORT_REPLY_HMAC_SECRET: undefined,
    INVOICE_REPLY_HMAC_SECRET: undefined,
    CSRF_SECRET: undefined
  }, () => {
    const addr = buildSupportReplyToAddress("77777777-7777-4777-8777-777777777777");
    assert.equal(addr, "support+support-77777777777747778777777777777777@inex.app");
  });
});
