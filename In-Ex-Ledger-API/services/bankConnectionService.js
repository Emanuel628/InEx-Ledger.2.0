"use strict";

const crypto = require("crypto");
const { encrypt, decrypt } = require("./encryptionService.js");

const VALID_PROVIDERS = new Set(["plaid", "manual"]);
const VALID_STATUSES = new Set(["active", "reauth_required", "disconnected", "error"]);
const VALID_SOURCES = new Set(["manual", "csv", "plaid"]);

const MAX_INSTITUTION_LEN = 200;
const MAX_EXTERNAL_ID_LEN = 255;
const MAX_ERROR_LEN = 500;

function clamp(value, max) {
  if (value === null || value === undefined) return null;
  const s = String(value);
  return s.length > max ? s.slice(0, max) : s;
}

function normalizeProvider(value) {
  const v = String(value || "").toLowerCase();
  return VALID_PROVIDERS.has(v) ? v : null;
}

function normalizeStatus(value) {
  const v = String(value || "").toLowerCase();
  return VALID_STATUSES.has(v) ? v : "active";
}

function normalizeSource(value) {
  const v = String(value || "").toLowerCase();
  return VALID_SOURCES.has(v) ? v : "manual";
}

async function createBankConnection(pool, {
  businessId,
  provider,
  externalItemId = null,
  institutionName = null,
  institutionLogoUrl = null,
  accessToken = null,
  status = "active"
}) {
  const safeProvider = normalizeProvider(provider);
  if (!safeProvider) {
    const err = new Error("Unsupported provider.");
    err.status = 400;
    throw err;
  }
  if (!businessId) {
    const err = new Error("business_id is required.");
    err.status = 400;
    throw err;
  }

  const encryptedToken = accessToken ? encrypt(String(accessToken)) : null;
  const id = crypto.randomUUID();
  const result = await pool.query(
    `INSERT INTO bank_connections
       (id, business_id, provider, external_item_id, institution_name,
        institution_logo_url, access_token_encrypted, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, provider, external_item_id, institution_name,
               institution_logo_url, status, last_synced_at, created_at`,
    [
      id,
      businessId,
      safeProvider,
      clamp(externalItemId, MAX_EXTERNAL_ID_LEN),
      clamp(institutionName, MAX_INSTITUTION_LEN),
      clamp(institutionLogoUrl, 500),
      encryptedToken,
      normalizeStatus(status)
    ]
  );
  return result.rows[0];
}

async function listBankConnectionsForBusiness(pool, businessId) {
  const result = await pool.query(
    `SELECT id, provider, external_item_id, institution_name, institution_logo_url,
            status, last_synced_at, last_error, created_at, updated_at
       FROM bank_connections
      WHERE business_id = $1
      ORDER BY created_at DESC`,
    [businessId]
  );
  return result.rows;
}

async function getBankConnection(pool, businessId, connectionId) {
  const result = await pool.query(
    `SELECT id, business_id, provider, external_item_id, institution_name,
            institution_logo_url, access_token_encrypted, cursor, status,
            last_synced_at, last_error, created_at, updated_at
       FROM bank_connections
      WHERE id = $1 AND business_id = $2
      LIMIT 1`,
    [connectionId, businessId]
  );
  return result.rows[0] || null;
}

/**
 * Reads the decrypted Plaid access token for a stored connection.
 * Never log this value.
 */
function decryptAccessToken(connection) {
  if (!connection?.access_token_encrypted) return null;
  try {
    return decrypt(connection.access_token_encrypted);
  } catch (_) {
    return null;
  }
}

async function updateBankConnectionStatus(pool, businessId, connectionId, { status, lastError = null, cursor }) {
  const safeStatus = normalizeStatus(status);
  const params = [safeStatus, clamp(lastError, MAX_ERROR_LEN), connectionId, businessId];
  let cursorClause = "";
  if (cursor !== undefined) {
    params.push(cursor === null ? null : String(cursor).slice(0, 1024));
    cursorClause = `, cursor = $${params.length}`;
  }
  const result = await pool.query(
    `UPDATE bank_connections
        SET status = $1,
            last_error = $2,
            last_synced_at = CASE WHEN $1 = 'active' THEN NOW() ELSE last_synced_at END,
            updated_at = NOW()${cursorClause}
      WHERE id = $3 AND business_id = $4
      RETURNING id, status, last_synced_at, last_error`,
    params
  );
  return result.rows[0] || null;
}

async function disconnectBankConnection(pool, businessId, connectionId) {
  const result = await pool.query(
    `UPDATE bank_connections
        SET status = 'disconnected',
            access_token_encrypted = NULL,
            updated_at = NOW()
      WHERE id = $1 AND business_id = $2 AND status <> 'disconnected'
      RETURNING id`,
    [connectionId, businessId]
  );
  return result.rowCount > 0;
}

/**
 * Canonical shape every imported transaction must adopt before being
 * inserted into `transactions`. Plaid, CSV, manual API — all flow through
 * this function. Keeping one shape means future provider plug-ins don't
 * require new code paths in the import pipeline.
 */
function normalizeImportedTransaction(raw, { source = "manual", currency: defaultCurrency = "USD" } = {}) {
  if (!raw || typeof raw !== "object") return null;

  const safeSource = normalizeSource(source);
  const externalId = raw.external_id != null ? String(raw.external_id).slice(0, MAX_EXTERNAL_ID_LEN) : null;
  const accountId = raw.account_id || null;

  const date = raw.date ? String(raw.date).slice(0, 10) : null;
  const postedDate = raw.posted_date ? String(raw.posted_date).slice(0, 10) : null;

  const description = clamp(raw.description, 500);
  const merchantName = clamp(raw.merchant_name, 200);

  const amount = Number(raw.amount);
  if (!Number.isFinite(amount)) return null;

  const currency = String(raw.currency || defaultCurrency).slice(0, 3).toUpperCase();
  const pending = raw.pending === true;
  const categoryGuess = clamp(raw.category_guess, 120);
  const duplicateCandidate = raw.duplicate_candidate === true;

  let type = raw.type || null;
  if (!type) type = amount < 0 ? "expense" : "income";

  return {
    source: safeSource,
    external_id: externalId,
    account_id: accountId,
    date,
    posted_date: postedDate,
    description: description || merchantName || null,
    merchant_name: merchantName,
    amount: Math.abs(amount),
    currency,
    pending,
    category_guess: categoryGuess,
    type,
    duplicate_candidate: duplicateCandidate
  };
}

module.exports = {
  createBankConnection,
  listBankConnectionsForBusiness,
  getBankConnection,
  decryptAccessToken,
  updateBankConnectionStatus,
  disconnectBankConnection,
  normalizeImportedTransaction,
  VALID_PROVIDERS,
  VALID_STATUSES,
  VALID_SOURCES,
  __private: { clamp, normalizeProvider, normalizeStatus, normalizeSource }
};
