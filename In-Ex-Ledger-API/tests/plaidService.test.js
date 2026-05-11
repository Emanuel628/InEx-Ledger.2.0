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
  isPlaidConfigured,
  getPlaidEnvironment,
  getCountryCodes,
  plaidTransactionToCanonical,
  plaidAccountToRow,
  describePlaidError,
  __private: { pickTransactionDate, pickPostedDate, VALID_ENVS }
} = require("../services/plaidService.js");

test("isPlaidConfigured is false when client id or secret is missing", () => {
  withEnv({ PLAID_CLIENT_ID: undefined, PLAID_SECRET: undefined }, () => {
    assert.equal(isPlaidConfigured(), false);
  });
  withEnv({ PLAID_CLIENT_ID: "abc", PLAID_SECRET: "" }, () => {
    assert.equal(isPlaidConfigured(), false);
  });
});

test("isPlaidConfigured is true when both client id and secret are set", () => {
  withEnv({ PLAID_CLIENT_ID: "abc", PLAID_SECRET: "xyz" }, () => {
    assert.equal(isPlaidConfigured(), true);
  });
});

test("getPlaidEnvironment defaults to sandbox and accepts known envs", () => {
  withEnv({ PLAID_ENV: undefined }, () => assert.equal(getPlaidEnvironment(), "sandbox"));
  withEnv({ PLAID_ENV: "production" }, () => assert.equal(getPlaidEnvironment(), "production"));
  withEnv({ PLAID_ENV: "bogus" }, () => assert.equal(getPlaidEnvironment(), "sandbox"));
  assert.ok(VALID_ENVS.has("sandbox"));
  assert.ok(VALID_ENVS.has("production"));
});

test("getCountryCodes parses comma-separated env, defaults to US", () => {
  withEnv({ PLAID_COUNTRY_CODES: undefined }, () => assert.deepEqual(getCountryCodes(), ["US"]));
  withEnv({ PLAID_COUNTRY_CODES: "us, ca, gb" }, () =>
    assert.deepEqual(getCountryCodes(), ["US", "CA", "GB"])
  );
  withEnv({ PLAID_COUNTRY_CODES: "   " }, () => assert.deepEqual(getCountryCodes(), ["US"]));
});

test("pickTransactionDate prefers authorized_date, falls back to date", () => {
  assert.equal(pickTransactionDate({ authorized_date: "2026-05-01", date: "2026-05-03" }), "2026-05-01");
  assert.equal(pickTransactionDate({ date: "2026-05-03" }), "2026-05-03");
  assert.equal(pickTransactionDate({}), null);
});

test("pickPostedDate uses date when it differs from authorized_date", () => {
  assert.equal(pickPostedDate({ authorized_date: "2026-05-01", date: "2026-05-03" }), "2026-05-03");
  assert.equal(pickPostedDate({ authorized_date: "2026-05-01", date: "2026-05-01" }), "2026-05-01");
  assert.equal(pickPostedDate({ date: "2026-05-03" }), "2026-05-03");
});

test("plaidTransactionToCanonical flips Plaid sign convention (positive=expense)", () => {
  const expense = plaidTransactionToCanonical(
    {
      transaction_id: "plaid-1",
      authorized_date: "2026-05-09",
      date: "2026-05-10",
      name: "STARBUCKS",
      merchant_name: "Starbucks",
      amount: 4.5,
      iso_currency_code: "usd",
      pending: false,
      category: ["Food and Drink", "Restaurants"]
    },
    { accountId: "acct-1" }
  );
  assert.equal(expense.source, "plaid");
  assert.equal(expense.external_id, "plaid-1");
  assert.equal(expense.account_id, "acct-1");
  assert.equal(expense.date, "2026-05-09");
  assert.equal(expense.posted_date, "2026-05-10");
  assert.equal(expense.merchant_name, "Starbucks");
  assert.equal(expense.amount, 4.5);
  assert.equal(expense.type, "expense");
  assert.equal(expense.currency, "USD");
  assert.equal(expense.pending, false);
  assert.equal(expense.category_guess, "Food and Drink");
});

test("plaidTransactionToCanonical maps negative amount to income", () => {
  const income = plaidTransactionToCanonical(
    {
      transaction_id: "plaid-2",
      date: "2026-05-10",
      name: "ACH Direct Deposit",
      amount: -2500,
      iso_currency_code: "USD"
    },
    { accountId: "acct-2" }
  );
  assert.equal(income.type, "income");
  assert.equal(income.amount, 2500);
});

test("plaidTransactionToCanonical returns null when amount is not finite", () => {
  assert.equal(plaidTransactionToCanonical({ amount: "not a number", date: "2026-05-10" }), null);
  assert.equal(plaidTransactionToCanonical(null), null);
});

test("plaidTransactionToCanonical defaults currency from option when missing", () => {
  const out = plaidTransactionToCanonical(
    { transaction_id: "x", date: "2026-05-10", amount: 10 },
    { accountId: "a", defaultCurrency: "CAD" }
  );
  assert.equal(out.currency, "CAD");
});

test("plaidAccountToRow returns the canonical accounts insert shape", () => {
  const row = plaidAccountToRow({
    account_id: "plaid-acct-1",
    name: "Plaid Checking",
    mask: "0000",
    subtype: "checking",
    type: "depository"
  });
  assert.deepEqual(row, {
    external_account_id: "plaid-acct-1",
    name: "Plaid Checking",
    account_mask: "0000",
    account_subtype: "checking",
    type: "checking"
  });
});

test("plaidAccountToRow falls back to official_name and type when subtype missing", () => {
  const row = plaidAccountToRow({
    account_id: "p2",
    official_name: "Premium Savings Account",
    mask: null,
    type: "depository"
  });
  assert.equal(row.name, "Premium Savings Account");
  assert.equal(row.account_subtype, "depository");
});

test("describePlaidError extracts message + code from response.data", () => {
  const detail = describePlaidError({
    response: {
      data: {
        error_message: "ITEM_LOGIN_REQUIRED",
        error_code: "ITEM_LOGIN_REQUIRED",
        error_type: "ITEM_ERROR",
        request_id: "req-1"
      }
    }
  });
  assert.equal(detail.message, "ITEM_LOGIN_REQUIRED");
  assert.equal(detail.code, "ITEM_LOGIN_REQUIRED");
  assert.equal(detail.type, "ITEM_ERROR");
  assert.equal(detail.request_id, "req-1");
});

test("describePlaidError handles plain Error", () => {
  const detail = describePlaidError(new Error("boom"));
  assert.equal(detail.message, "boom");
  assert.equal(detail.code, null);
});
