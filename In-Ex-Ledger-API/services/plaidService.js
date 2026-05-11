"use strict";

/**
 * Plaid service — a thin wrapper around the Plaid SDK that is fully
 * env-gated. If PLAID_CLIENT_ID / PLAID_SECRET / PLAID_ENV are not set,
 * isPlaidConfigured() returns false and routes return 503 "not configured"
 * instead of importing the SDK or crashing.
 *
 * Sandbox is the default environment; production / development can be
 * enabled later by setting PLAID_ENV=production or PLAID_ENV=development.
 */

const VALID_ENVS = new Set(["sandbox", "development", "production"]);

let cachedClient = null;
let cachedClientKey = null;

function isPlaidConfigured() {
  return Boolean(
    String(process.env.PLAID_CLIENT_ID || "").trim() &&
    String(process.env.PLAID_SECRET || "").trim()
  );
}

function getPlaidEnvironment() {
  const requested = String(process.env.PLAID_ENV || "sandbox").toLowerCase();
  return VALID_ENVS.has(requested) ? requested : "sandbox";
}

function getPlaidClient() {
  if (!isPlaidConfigured()) return null;
  const clientId = String(process.env.PLAID_CLIENT_ID || "").trim();
  const secret = String(process.env.PLAID_SECRET || "").trim();
  const env = getPlaidEnvironment();
  const key = `${clientId}:${env}`;

  if (cachedClient && cachedClientKey === key) {
    return cachedClient;
  }

  // Lazy require so the SDK isn't loaded in test/dev environments that
  // never use Plaid.
  // eslint-disable-next-line global-require
  const { PlaidApi, PlaidEnvironments, Configuration } = require("plaid");

  const config = new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
        "Plaid-Version": "2020-09-14"
      }
    }
  });
  cachedClient = new PlaidApi(config);
  cachedClientKey = key;
  return cachedClient;
}

/**
 * Map Plaid country codes from env. PLAID_COUNTRY_CODES is comma-separated
 * (e.g. "US,CA"). Defaults to ["US"].
 */
function getCountryCodes() {
  const raw = String(process.env.PLAID_COUNTRY_CODES || "US")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  return raw.length ? raw : ["US"];
}

/**
 * Map an authorized + posted date pair from a Plaid transaction to the
 * fields our canonical shape expects.
 */
function pickTransactionDate(plaidTxn) {
  return plaidTxn?.authorized_date || plaidTxn?.date || null;
}

function pickPostedDate(plaidTxn) {
  if (plaidTxn?.authorized_date && plaidTxn?.date && plaidTxn.date !== plaidTxn.authorized_date) {
    return plaidTxn.date;
  }
  return plaidTxn?.date || null;
}

/**
 * Normalize a Plaid /transactions/sync row into the canonical shape used
 * by transactionImportService and the rest of the import pipeline.
 *
 * In Plaid's API, positive amounts mean money flowing *out* (expense) and
 * negative amounts mean money flowing *in* (income). We flip that so the
 * canonical shape's `amount` is always non-negative and `type` carries the
 * direction.
 */
function plaidTransactionToCanonical(plaidTxn, { accountId, defaultCurrency = "USD" } = {}) {
  if (!plaidTxn) return null;
  const rawAmount = Number(plaidTxn.amount);
  if (!Number.isFinite(rawAmount)) return null;
  const type = rawAmount > 0 ? "expense" : "income";
  return {
    source: "plaid",
    external_id: plaidTxn.transaction_id || null,
    account_id: accountId || null,
    date: pickTransactionDate(plaidTxn),
    posted_date: pickPostedDate(plaidTxn),
    description: plaidTxn.name || plaidTxn.merchant_name || null,
    merchant_name: plaidTxn.merchant_name || null,
    amount: Math.abs(rawAmount),
    currency: String(plaidTxn.iso_currency_code || plaidTxn.unofficial_currency_code || defaultCurrency).toUpperCase(),
    pending: plaidTxn.pending === true,
    category_guess: Array.isArray(plaidTxn.category) && plaidTxn.category.length
      ? plaidTxn.category[0]
      : null,
    type,
    duplicate_candidate: false
  };
}

/**
 * Map a Plaid account from /accounts/get into the shape we insert into the
 * accounts table (joined with bank_connection_id at the call site).
 */
function plaidAccountToRow(plaidAccount) {
  if (!plaidAccount) return null;
  return {
    external_account_id: plaidAccount.account_id || null,
    name: plaidAccount.name || plaidAccount.official_name || "Bank account",
    account_mask: plaidAccount.mask || null,
    account_subtype: plaidAccount.subtype || plaidAccount.type || null,
    type: plaidAccount.subtype || plaidAccount.type || "depository"
  };
}

/**
 * Wraps a Plaid API error into a flat shape suitable for logging / surfacing
 * to the client (never leaks the secret or full headers).
 */
function describePlaidError(err) {
  if (!err) return { message: "unknown", code: null };
  const data = err.response?.data || {};
  return {
    message: data.error_message || err.message || "Plaid request failed",
    code: data.error_code || err.code || null,
    type: data.error_type || null,
    request_id: data.request_id || null
  };
}

module.exports = {
  isPlaidConfigured,
  getPlaidClient,
  getPlaidEnvironment,
  getCountryCodes,
  plaidTransactionToCanonical,
  plaidAccountToRow,
  describePlaidError,
  __private: { pickTransactionDate, pickPostedDate, VALID_ENVS }
};
