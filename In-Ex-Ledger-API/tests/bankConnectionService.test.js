"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

// Stub the encryption service so tests don't require FIELD_ENCRYPTION_KEY.
const Module = require("node:module");
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "./encryptionService.js" || /encryptionService\.js$/.test(request)) {
    return {
      encrypt: (v) => `enc:${v}`,
      decrypt: (v) => String(v || "").replace(/^enc:/, "")
    };
  }
  return originalLoad(request, parent, isMain);
};

const {
  createBankConnection,
  normalizeImportedTransaction,
  decryptAccessToken,
  __private: { clamp, normalizeProvider, normalizeStatus, normalizeSource }
} = require("../services/bankConnectionService.js");

function makePool(rowsByCall = []) {
  let i = 0;
  return {
    queries: [],
    async query(sql, params) {
      this.queries.push({ sql, params });
      const rows = Array.isArray(rowsByCall) ? (rowsByCall[i++] || []) : rowsByCall;
      return { rows, rowCount: rows.length };
    }
  };
}

test("clamp truncates strings to max length", () => {
  assert.equal(clamp("abcdef", 3), "abc");
  assert.equal(clamp("ok", 5), "ok");
  assert.equal(clamp(null, 5), null);
});

test("normalizeProvider rejects unknown providers", () => {
  assert.equal(normalizeProvider("plaid"), "plaid");
  assert.equal(normalizeProvider("Manual"), "manual");
  assert.equal(normalizeProvider("teller"), null);
});

test("normalizeStatus falls back to active on garbage", () => {
  assert.equal(normalizeStatus("error"), "error");
  assert.equal(normalizeStatus("reauth_required"), "reauth_required");
  assert.equal(normalizeStatus("nonsense"), "active");
});

test("normalizeSource defaults to manual for unknown source", () => {
  assert.equal(normalizeSource("plaid"), "plaid");
  assert.equal(normalizeSource("csv"), "csv");
  assert.equal(normalizeSource(undefined), "manual");
});

test("createBankConnection encrypts the access token before insert", async () => {
  const pool = makePool([[{ id: "bc1", provider: "plaid" }]]);
  await createBankConnection(pool, {
    businessId: "biz",
    provider: "plaid",
    accessToken: "secret-token",
    institutionName: "Chase",
    externalItemId: "item_123"
  });
  const params = pool.queries[0].params;
  assert.equal(params[2], "plaid");
  assert.equal(params[3], "item_123");
  assert.equal(params[4], "Chase");
  assert.equal(params[6], "enc:secret-token", "access token must be encrypted");
});

test("createBankConnection rejects unknown providers", async () => {
  const pool = makePool([]);
  await assert.rejects(
    () => createBankConnection(pool, { businessId: "b", provider: "teller" }),
    /Unsupported provider/
  );
});

test("createBankConnection rejects when business_id missing", async () => {
  const pool = makePool([]);
  await assert.rejects(
    () => createBankConnection(pool, { provider: "plaid" }),
    /business_id is required/
  );
});

test("decryptAccessToken returns null when no token stored", () => {
  assert.equal(decryptAccessToken(null), null);
  assert.equal(decryptAccessToken({}), null);
  assert.equal(decryptAccessToken({ access_token_encrypted: "enc:hello" }), "hello");
});

test("normalizeImportedTransaction produces canonical shape from Plaid-style payload", () => {
  const norm = normalizeImportedTransaction({
    external_id: "plaid_txn_001",
    account_id: "acct-1",
    date: "2026-05-09",
    posted_date: "2026-05-10",
    description: "STRIPE PAYOUT",
    merchant_name: "Stripe",
    amount: -45.67,
    currency: "usd",
    pending: false,
    category_guess: "Software"
  }, { source: "plaid" });

  assert.equal(norm.source, "plaid");
  assert.equal(norm.external_id, "plaid_txn_001");
  assert.equal(norm.account_id, "acct-1");
  assert.equal(norm.date, "2026-05-09");
  assert.equal(norm.posted_date, "2026-05-10");
  assert.equal(norm.amount, 45.67);
  assert.equal(norm.type, "expense");
  assert.equal(norm.currency, "USD");
  assert.equal(norm.merchant_name, "Stripe");
  assert.equal(norm.pending, false);
});

test("normalizeImportedTransaction infers income when amount is positive", () => {
  const norm = normalizeImportedTransaction({
    date: "2026-05-09",
    amount: 100.5,
    description: "Client invoice"
  }, { source: "csv" });
  assert.equal(norm.type, "income");
  assert.equal(norm.source, "csv");
});

test("normalizeImportedTransaction returns null when amount is invalid", () => {
  const norm = normalizeImportedTransaction({
    date: "2026-05-09",
    amount: "garbage",
    description: "x"
  });
  assert.equal(norm, null);
});

test("normalizeImportedTransaction falls back to merchant_name when description missing", () => {
  const norm = normalizeImportedTransaction({
    date: "2026-05-09",
    amount: -10,
    merchant_name: "Costco"
  });
  assert.equal(norm.description, "Costco");
});

test("normalizeImportedTransaction trims string fields to safe lengths", () => {
  const big = "x".repeat(800);
  const norm = normalizeImportedTransaction({
    date: "2026-05-09",
    amount: 10,
    description: big,
    merchant_name: big,
    external_id: big
  });
  assert.ok(norm.description.length <= 500);
  assert.ok(norm.merchant_name.length <= 200);
  assert.ok(norm.external_id.length <= 255);
});
