"use strict";

const express = require("express");
const crypto = require("crypto");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { createDataApiLimiter } = require("../middleware/rate-limit.middleware.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");
const { logError, logInfo, logWarn } = require("../utils/logger.js");
const {
  isPlaidConfigured,
  getPlaidClient,
  getCountryCodes,
  plaidTransactionToCanonical,
  plaidAccountToRow,
  describePlaidError
} = require("../services/plaidService.js");
const {
  createBankConnection,
  getBankConnection,
  decryptAccessToken,
  updateBankConnectionStatus
} = require("../services/bankConnectionService.js");
const {
  createImportBatch,
  finalizeImportBatch
} = require("../services/transactionImportService.js");
const {
  AUDIT_ACTIONS,
  recordAuditEventForRequest
} = require("../services/auditEventService.js");

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLAID_WEBHOOK_VERIFICATION_HEADER = "plaid-verification";
const PLAID_WEBHOOK_MAX_AGE_SECONDS = 5 * 60;
const plaidWebhookKeyCache = new Map();

function timingSafeStringEqual(a, b) {
  const ab = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  if (ab.length !== bb.length) return false;
  try {
    return crypto.timingSafeEqual(ab, bb);
  } catch (_) {
    return false;
  }
}

function decodeBase64Url(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, "base64");
}

function decodeJsonSegment(segment) {
  return JSON.parse(decodeBase64Url(segment).toString("utf8"));
}

function parseJwtSegments(jwt) {
  const parts = String(jwt || "").split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed Plaid verification token.");
  }
  return {
    headerSegment: parts[0],
    payloadSegment: parts[1],
    signatureSegment: parts[2]
  };
}

async function getPlaidWebhookVerificationKey(kid) {
  const cached = plaidWebhookKeyCache.get(kid);
  if (cached?.expiredAt && cached.expiredAt > Date.now()) {
    return cached.key;
  }

  const client = getPlaidClient();
  const response = await client.webhookVerificationKeyGet({ key_id: kid });
  const key = response?.data?.key || null;
  if (!key) {
    throw new Error("Plaid webhook verification key lookup returned no key.");
  }

  const expiredAt = Number(key.expired_at || 0) * 1000;
  plaidWebhookKeyCache.set(kid, {
    key,
    expiredAt: Number.isFinite(expiredAt) && expiredAt > Date.now()
      ? expiredAt
      : Date.now() + (15 * 60 * 1000)
  });
  return key;
}

async function verifyPlaidWebhook(rawBody, signedJwt) {
  const { headerSegment, payloadSegment, signatureSegment } = parseJwtSegments(signedJwt);
  const header = decodeJsonSegment(headerSegment);

  if (header?.alg !== "ES256") {
    throw new Error("Unsupported Plaid webhook verification algorithm.");
  }
  if (!header?.kid) {
    throw new Error("Missing Plaid webhook verification key id.");
  }

  const key = await getPlaidWebhookVerificationKey(header.kid);
  const publicKey = crypto.createPublicKey({ key, format: "jwk" });
  const signingInput = Buffer.from(`${headerSegment}.${payloadSegment}`, "utf8");
  const signature = decodeBase64Url(signatureSegment);
  const verified = crypto.verify(
    "sha256",
    signingInput,
    { key: publicKey, dsaEncoding: "ieee-p1363" },
    signature
  );

  if (!verified) {
    throw new Error("Invalid Plaid webhook signature.");
  }

  const payload = decodeJsonSegment(payloadSegment);
  const issuedAtSeconds = Number(payload?.iat);
  if (!Number.isFinite(issuedAtSeconds)) {
    throw new Error("Missing Plaid webhook issued-at timestamp.");
  }

  const nowSeconds = Date.now() / 1000;
  if (
    issuedAtSeconds > nowSeconds + PLAID_WEBHOOK_MAX_AGE_SECONDS ||
    nowSeconds - issuedAtSeconds > PLAID_WEBHOOK_MAX_AGE_SECONDS
  ) {
    throw new Error("Expired Plaid webhook verification token.");
  }

  const expectedHash = String(payload?.request_body_sha256 || "").trim().toLowerCase();
  const actualHash = crypto.createHash("sha256").update(rawBody).digest("hex");
  if (!timingSafeStringEqual(actualHash, expectedHash)) {
    throw new Error("Plaid webhook body hash mismatch.");
  }

  return payload;
}

/**
 * Every authenticated route is gated on Plaid being configured. The webhook
 * is the only public route — it's mounted after this guard and uses its own
 * configuration check.
 */
const authedRouter = express.Router();
authedRouter.use(requireAuth);
authedRouter.use(requireCsrfProtection);
authedRouter.use(createDataApiLimiter({ max: 30 }));
authedRouter.use((req, res, next) => {
  if (!isPlaidConfigured()) {
    return res.status(503).json({
      error: "Plaid is not configured on this deployment.",
      code: "plaid_not_configured"
    });
  }
  next();
});

/**
 * POST /api/plaid/link-token
 * Creates a Plaid Link token the frontend can use to launch the Link flow.
 */
authedRouter.post("/link-token", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const { Products } = require("plaid");
    const client = getPlaidClient();
    const response = await client.linkTokenCreate({
      user: { client_user_id: String(req.user.id) },
      client_name: "InEx Ledger",
      products: [Products.Transactions],
      country_codes: getCountryCodes(),
      language: "en"
    });
    res.json({
      link_token: response.data.link_token,
      expiration: response.data.expiration,
      business_id: businessId
    });
  } catch (err) {
    const detail = describePlaidError(err);
    logError("POST /plaid/link-token error:", detail);
    res.status(502).json({ error: detail.message, code: detail.code });
  }
});

/**
 * POST /api/plaid/exchange-public-token
 * Exchanges the public_token returned by Plaid Link for an access_token
 * and creates a bank_connections row + seeds the accounts table.
 */
authedRouter.post("/exchange-public-token", async (req, res) => {
  const publicToken = String(req.body?.public_token || "").trim();
  if (!publicToken) {
    return res.status(400).json({ error: "public_token is required." });
  }

  const client = getPlaidClient();
  let exchangeResponse;
  let institutionResponse;
  let accountsResponse;
  try {
    exchangeResponse = await client.itemPublicTokenExchange({ public_token: publicToken });
  } catch (err) {
    const detail = describePlaidError(err);
    logError("plaid item exchange error:", detail);
    return res.status(502).json({ error: detail.message, code: detail.code });
  }

  const accessToken = exchangeResponse.data.access_token;
  const itemId = exchangeResponse.data.item_id;

  try {
    accountsResponse = await client.accountsGet({ access_token: accessToken });
  } catch (err) {
    const detail = describePlaidError(err);
    logError("plaid accounts get error:", detail);
    return res.status(502).json({ error: detail.message, code: detail.code });
  }

  const institutionId = accountsResponse.data?.item?.institution_id || null;
  let institutionName = null;
  let institutionLogo = null;
  if (institutionId) {
    try {
      institutionResponse = await client.institutionsGetById({
        institution_id: institutionId,
        country_codes: getCountryCodes(),
        options: { include_optional_metadata: true }
      });
      institutionName = institutionResponse.data?.institution?.name || null;
      institutionLogo = institutionResponse.data?.institution?.logo
        ? `data:image/png;base64,${institutionResponse.data.institution.logo}`
        : null;
    } catch (err) {
      // Non-fatal — keep going without institution metadata.
      logWarn("plaid institutions getById failed:", describePlaidError(err));
    }
  }

  const businessId = await resolveBusinessIdForUser(req.user);

  let connection;
  try {
    connection = await createBankConnection(pool, {
      businessId,
      provider: "plaid",
      externalItemId: itemId,
      institutionName,
      institutionLogoUrl: institutionLogo,
      accessToken,
      status: "active"
    });
  } catch (err) {
    logError("plaid createBankConnection failed:", err.message);
    return res.status(500).json({ error: "Failed to store bank connection." });
  }

  // Seed accounts table from Plaid's account list.
  const inserted = [];
  for (const raw of accountsResponse.data?.accounts || []) {
    const row = plaidAccountToRow(raw);
    if (!row) continue;
    try {
      const insertResult = await pool.query(
        `INSERT INTO accounts (id, business_id, name, type, bank_connection_id, external_account_id,
                                account_mask, account_subtype, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'plaid')
         ON CONFLICT (bank_connection_id, external_account_id)
           WHERE bank_connection_id IS NOT NULL AND external_account_id IS NOT NULL
           DO UPDATE SET name = EXCLUDED.name,
                         account_mask = EXCLUDED.account_mask,
                         account_subtype = EXCLUDED.account_subtype
         RETURNING id, name, account_mask`,
        [
          crypto.randomUUID(),
          businessId,
          row.name,
          row.type,
          connection.id,
          row.external_account_id,
          row.account_mask,
          row.account_subtype
        ]
      );
      if (insertResult.rows[0]) inserted.push(insertResult.rows[0]);
    } catch (err) {
      logWarn("plaid seed account failed:", err.message);
    }
  }

  await recordAuditEventForRequest(pool, req, {
    userId: req.user.id,
    businessId,
    action: "bank_connection.created",
    metadata: {
      provider: "plaid",
      institution_name: institutionName,
      account_count: inserted.length
    }
  });

  res.json({
    connection_id: connection.id,
    institution_name: institutionName,
    accounts: inserted
  });
});

/**
 * POST /api/plaid/connections/:id/sync
 * Pulls /transactions/sync results for the given connection, normalizes each
 * row through the canonical import shape, and inserts new ones. Idempotent
 * via the (account_id, external_id) unique index from PR #205.
 */
authedRouter.post("/connections/:id/sync", async (req, res) => {
  const connectionId = String(req.params.id || "").trim();
  if (!UUID_RE.test(connectionId)) {
    return res.status(400).json({ error: "Invalid connection id." });
  }

  const businessId = await resolveBusinessIdForUser(req.user);
  const connection = await getBankConnection(pool, businessId, connectionId);
  if (!connection || connection.provider !== "plaid") {
    return res.status(404).json({ error: "Connection not found." });
  }
  const accessToken = decryptAccessToken(connection);
  if (!accessToken) {
    return res.status(409).json({ error: "Connection has no usable access token." });
  }

  const client = getPlaidClient();
  let cursor = connection.cursor || null;
  let added = [];
  let modified = [];
  let removed = [];
  let hasMore = true;
  let safetyIterations = 0;
  try {
    while (hasMore) {
      safetyIterations += 1;
      if (safetyIterations > 20) break; // Plaid recommends a soft cap; one batch covers ~500 rows.
      const response = await client.transactionsSync({
        access_token: accessToken,
        cursor: cursor || undefined,
        count: 500
      });
      const data = response.data || {};
      added = added.concat(data.added || []);
      modified = modified.concat(data.modified || []);
      removed = removed.concat(data.removed || []);
      cursor = data.next_cursor || cursor;
      hasMore = Boolean(data.has_more);
    }
  } catch (err) {
    const detail = describePlaidError(err);
    await updateBankConnectionStatus(pool, businessId, connectionId, {
      status: detail.code === "ITEM_LOGIN_REQUIRED" ? "reauth_required" : "error",
      lastError: detail.message
    });
    logError("plaid /transactions/sync error:", detail);
    return res.status(502).json({ error: detail.message, code: detail.code });
  }

  // Map Plaid account_id -> our accounts.id for inserts.
  const accountMapResult = await pool.query(
    `SELECT id, external_account_id, currency
       FROM accounts
      WHERE business_id = $1 AND bank_connection_id = $2`,
    [businessId, connectionId]
  );
  const accountMap = new Map();
  for (const row of accountMapResult.rows) {
    if (row.external_account_id) accountMap.set(row.external_account_id, row);
  }

  const batch = await createImportBatch(pool, {
    businessId,
    accountId: null, // multiple accounts can be touched by one Plaid sync
    source: "plaid",
    filename: connection.institution_name || "Plaid sync",
    importedByUserId: req.user.id
  });

  let inserted = 0;
  let skippedUnknownAccount = 0;
  let duplicates = 0;
  for (const raw of added) {
    const internalAccount = accountMap.get(raw.account_id);
    if (!internalAccount) {
      skippedUnknownAccount += 1;
      continue;
    }
    const canonical = plaidTransactionToCanonical(raw, {
      accountId: internalAccount.id,
      defaultCurrency: internalAccount.currency || "USD"
    });
    if (!canonical || !canonical.date) continue;

    try {
      const insertResult = await pool.query(
        `INSERT INTO transactions
           (id, business_id, account_id, amount, type, cleared, description,
            date, posted_date, merchant_name, pending, currency, external_id,
            import_source, import_batch_id, review_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7,
                 $8, $9, $10, $11, $12, $13,
                 'plaid', $14, 'needs_review')
         ON CONFLICT (account_id, external_id)
           WHERE external_id IS NOT NULL DO NOTHING
         RETURNING id`,
        [
          crypto.randomUUID(),
          businessId,
          internalAccount.id,
          canonical.amount,
          canonical.type,
          !canonical.pending,
          canonical.description,
          canonical.date,
          canonical.posted_date,
          canonical.merchant_name,
          canonical.pending,
          canonical.currency,
          canonical.external_id,
          batch.id
        ]
      );
      if (insertResult.rowCount) inserted += 1;
      else duplicates += 1;
    } catch (err) {
      logWarn("plaid insert transaction failed:", err.message);
    }
  }

  // Apply modifications (pending -> posted, amount changes, etc.).
  let modifiedApplied = 0;
  for (const raw of modified) {
    if (!raw?.transaction_id) continue;
    try {
      const upd = await pool.query(
        `UPDATE transactions
            SET amount        = $1,
                pending       = $2,
                cleared       = $3,
                posted_date   = $4,
                description   = COALESCE($5, description),
                merchant_name = COALESCE($6, merchant_name)
          WHERE business_id = $7
            AND external_id = $8`,
        [
          Math.abs(Number(raw.amount) || 0),
          raw.pending === true,
          raw.pending !== true,
          raw.authorized_date && raw.date && raw.date !== raw.authorized_date ? raw.date : (raw.date || null),
          raw.name || null,
          raw.merchant_name || null,
          businessId,
          raw.transaction_id
        ]
      );
      modifiedApplied += upd.rowCount;
    } catch (err) {
      logWarn("plaid modify transaction failed:", err.message);
    }
  }

  // Removed transactions: soft-delete.
  let removedApplied = 0;
  for (const rem of removed) {
    if (!rem?.transaction_id) continue;
    try {
      const del = await pool.query(
        `UPDATE transactions
            SET deleted_at = NOW(),
                is_void = true,
                voided_at = NOW(),
                deleted_reason = COALESCE(deleted_reason, 'plaid_removed')
          WHERE business_id = $1
            AND external_id = $2
            AND deleted_at IS NULL`,
        [businessId, rem.transaction_id]
      );
      removedApplied += del.rowCount;
    } catch (err) {
      logWarn("plaid remove transaction failed:", err.message);
    }
  }

  await finalizeImportBatch(pool, batch.id, {
    imported: inserted,
    duplicate: duplicates,
    failed: 0,
    totalRows: added.length + modified.length + removed.length
  });

  await updateBankConnectionStatus(pool, businessId, connectionId, {
    status: "active",
    lastError: null,
    cursor
  });

  res.json({
    connection_id: connectionId,
    batch_id: batch.id,
    inserted,
    duplicates,
    modified: modifiedApplied,
    removed: removedApplied,
    skipped_unknown_account: skippedUnknownAccount,
    has_more: false
  });
});

/**
 * Public webhook endpoint. Plaid posts JSON with no auth header; verification
 * is by webhook secret on the body if configured (PLAID_WEBHOOK_SECRET).
 * The webhook never returns anything sensitive — only a 200 ack so Plaid
 * doesn't retry the same event indefinitely.
 */
router.post("/webhook", express.json({
  limit: "100kb",
  verify(req, _res, buf) {
    req.rawBody = Buffer.from(buf);
  }
}), async (req, res) => {
  if (!isPlaidConfigured()) {
    return res.status(503).json({ ok: false });
  }
  const signedJwt = String(req.get(PLAID_WEBHOOK_VERIFICATION_HEADER) || "").trim();
  if (!signedJwt) {
    logWarn("plaid webhook rejected: missing Plaid-Verification header");
    return res.status(401).json({ ok: false, error: "Missing Plaid verification header." });
  }

  try {
    await verifyPlaidWebhook(req.rawBody || Buffer.from(JSON.stringify(req.body || {})), signedJwt);
  } catch (err) {
    logWarn("plaid webhook rejected:", err.message);
    return res.status(401).json({ ok: false, error: "Invalid Plaid webhook signature." });
  }
  const event = req.body || {};
  try {
    logInfo("plaid webhook received", {
      webhook_type: event.webhook_type || null,
      webhook_code: event.webhook_code || null,
      item_id: event.item_id || null
    });
    // We don't trigger sync from the webhook to keep this PR minimal —
    // the frontend or a scheduled job will call POST /connections/:id/sync.
    res.json({ ok: true });
  } catch (err) {
    logError("plaid webhook error:", err.message);
    res.json({ ok: true });
  }
});

router.use("/", authedRouter);

module.exports = router;
