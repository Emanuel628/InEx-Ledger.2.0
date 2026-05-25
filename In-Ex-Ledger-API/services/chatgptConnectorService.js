"use strict";

const crypto = require("crypto");
const { pool } = require("../db.js");
const { resolveBusinessIdForUser, listBusinessesForUser } = require("../api/utils/resolveBusinessIdForUser.js");
const { extractRequestContext } = require("./sessionContextService.js");
const { recordAuditEventForRequest } = require("./auditEventService.js");
const { getQuarterlyReminders } = require("./quarterlyTaxReminderService.js");
const { buildNormalizedExportDataset } = require("./exportDatasetService.js");
const { deriveFinalizationDecision } = require("./exportSnapshotService.js");
const { logError } = require("../utils/logger.js");

const CONNECTOR_CLIENT_ID = String(process.env.CHATGPT_CONNECTOR_CLIENT_ID || "").trim();
const CONNECTOR_REDIRECT_URIS = String(process.env.CHATGPT_CONNECTOR_REDIRECT_URIS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const CONNECTOR_TOKEN_TTL_SECONDS = Number(process.env.CHATGPT_CONNECTOR_TOKEN_TTL_SECONDS || 60 * 60 * 24 * 30);
const PERSONAL_TOKEN_TTL_SECONDS = Number(process.env.CHATGPT_PERSONAL_TOKEN_TTL_SECONDS || 60 * 60 * 24 * 90);
const AUTH_CODE_TTL_SECONDS = Number(process.env.CHATGPT_CONNECTOR_AUTH_CODE_TTL_SECONDS || 10 * 60);
const REFRESH_TOKEN_COOKIE = "refresh_token";

const SUPPORTED_SCOPES = Object.freeze([
  "read:businesses",
  "read:bookkeeping",
  "read:transactions",
  "read:receipts",
  "read:exports",
  "read:invoices",
  "read:messages",
  "read:tax"
]);

const DEFAULT_SCOPE = SUPPORTED_SCOPES.join(" ");

const MCP_TOOLS = Object.freeze([
  {
    name: "get_businesses",
    description: "List every business tied to the connected account.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} }
  },
  {
    name: "get_active_business",
    description: "Return the currently active business and high-level profile.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} }
  },
  {
    name: "get_business_profile",
    description: "Return tax and bookkeeping profile fields for the active business.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} }
  },
  {
    name: "get_bookkeeping_summary",
    description: "Summarize income, expense, uncategorized, and receipt-gap counts for a date range.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        start_date: { type: "string" },
        end_date: { type: "string" }
      }
    }
  },
  {
    name: "search_transactions",
    description: "Search transactions by description, note, payer name, or amount.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string" },
        limit: { type: "number" }
      }
    }
  },
  {
    name: "list_uncategorized_transactions",
    description: "List transactions still missing a category.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        limit: { type: "number" }
      }
    }
  },
  {
    name: "list_missing_receipts",
    description: "List expense transactions missing receipt or support attachments.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        limit: { type: "number" }
      }
    }
  },
  {
    name: "get_export_readiness",
    description: "Return export readiness counts and finalization state for the active business.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} }
  },
  {
    name: "list_export_blockers",
    description: "List hard blockers and warnings currently affecting finalized exports.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} }
  },
  {
    name: "get_tax_installment_reminders",
    description: "Return estimated tax installment reminders for the active business region.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} }
  },
  {
    name: "list_invoices",
    description: "List invoices for the active business.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        limit: { type: "number" },
        status: { type: "string" }
      }
    }
  },
  {
    name: "list_unpaid_invoices",
    description: "List sent or draft invoices that are not marked paid or void.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        limit: { type: "number" }
      }
    }
  },
  {
    name: "list_invoice_messages",
    description: "List invoice-related messages and replies for an invoice or recent activity.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        invoice_id: { type: "string" },
        limit: { type: "number" }
      }
    }
  },
  {
    name: "get_receipt_coverage",
    description: "Return receipt and support coverage counts for expense transactions.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} }
  },
  {
    name: "get_cpa_handoff_summary",
    description: "Return a compact summary of what a CPA or tax preparer would see today.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} }
  }
]);

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function generateOpaqueToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function normalizeScope(scope) {
  const requested = Array.isArray(scope)
    ? scope
    : String(scope || DEFAULT_SCOPE).split(/\s+/);
  const unique = Array.from(new Set(requested.map((value) => String(value || "").trim()).filter(Boolean)));
  const invalid = unique.filter((value) => !SUPPORTED_SCOPES.includes(value));
  if (invalid.length > 0) {
    const error = new Error(`Unsupported scope: ${invalid.join(", ")}`);
    error.status = 400;
    throw error;
  }
  return unique.length ? unique.join(" ") : DEFAULT_SCOPE;
}

function isOauthConnectorConfigured() {
  return Boolean(CONNECTOR_CLIENT_ID && CONNECTOR_REDIRECT_URIS.length);
}

function validateOauthClient(clientId, redirectUri) {
  if (!isOauthConnectorConfigured()) {
    const error = new Error("ChatGPT OAuth connector is not configured.");
    error.status = 503;
    throw error;
  }
  if (clientId !== CONNECTOR_CLIENT_ID) {
    const error = new Error("Unsupported OAuth client.");
    error.status = 400;
    throw error;
  }
  if (!CONNECTOR_REDIRECT_URIS.includes(String(redirectUri || "").trim())) {
    const error = new Error("Redirect URI is not allowed.");
    error.status = 400;
    throw error;
  }
}

function buildAppOrigin(req) {
  const configured = String(process.env.APP_BASE_URL || "").trim().replace(/\/+$/, "");
  if (configured) {
    return configured;
  }
  const protocol = req?.protocol || "https";
  const host = req?.get?.("host") || req?.headers?.host || "localhost:8080";
  return `${protocol}://${host}`;
}

async function getAuthorizedUserFromRefreshCookie(req) {
  const rawToken = String(req?.cookies?.[REFRESH_TOKEN_COOKIE] || "").trim();
  if (!rawToken) {
    return null;
  }
  const tokenHash = hashValue(rawToken);
  const result = await pool.query(
    `SELECT u.id, u.email, u.role, u.email_verified, u.mfa_enabled, u.active_business_id,
            rt.mfa_authenticated
       FROM refresh_tokens rt
       JOIN users u
         ON u.id = rt.user_id
      WHERE rt.token_hash = $1
        AND rt.revoked = false
        AND rt.expires_at > NOW()
      LIMIT 1`,
    [tokenHash]
  );
  return result.rows[0] || null;
}

async function createConsent({ userId, businessId, clientId, scope, consentType = "oauth" }) {
  const normalizedScope = normalizeScope(scope);
  const result = await pool.query(
    `INSERT INTO chatgpt_connector_consents
       (user_id, business_id, client_id, scope, consent_type)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, businessId, clientId, normalizedScope, consentType]
  );
  return result.rows[0];
}

async function revokeConnectorAccess({ userId, businessId }) {
  await pool.query(
    `UPDATE chatgpt_connector_consents
        SET status = 'revoked',
            revoked_at = NOW()
      WHERE user_id = $1
        AND business_id = $2
        AND status = 'active'`,
    [userId, businessId]
  );
  await pool.query(
    `UPDATE chatgpt_connector_access_tokens
        SET revoked_at = NOW()
      WHERE user_id = $1
        AND business_id = $2
        AND revoked_at IS NULL`,
    [userId, businessId]
  );
}

async function createAuthCode({ consentId, clientId, userId, businessId, redirectUri, scope, codeChallenge, codeChallengeMethod = "S256" }) {
  const rawCode = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000);
  await pool.query(
    `INSERT INTO chatgpt_connector_auth_codes
       (consent_id, client_id, user_id, business_id, redirect_uri, scope, code_hash, code_challenge, code_challenge_method, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      consentId,
      clientId,
      userId,
      businessId,
      redirectUri,
      normalizeScope(scope),
      hashValue(rawCode),
      String(codeChallenge || "").trim(),
      codeChallengeMethod === "plain" ? "plain" : "S256",
      expiresAt
    ]
  );
  return { code: rawCode, expiresAt };
}

function verifyPkceCodeVerifier(codeVerifier, codeChallenge, method) {
  const verifier = String(codeVerifier || "");
  const expected = String(codeChallenge || "");
  if (!verifier || !expected) {
    return false;
  }
  if (method === "plain") {
    return verifier === expected;
  }
  const digest = crypto.createHash("sha256").update(verifier).digest("base64url");
  return digest === expected;
}

async function consumeAuthCode({ code, clientId, redirectUri, codeVerifier }) {
  const codeHash = hashValue(code);
  const result = await pool.query(
    `SELECT *
       FROM chatgpt_connector_auth_codes
      WHERE code_hash = $1
        AND client_id = $2
        AND redirect_uri = $3
        AND consumed_at IS NULL
        AND expires_at > NOW()
      LIMIT 1`,
    [codeHash, clientId, redirectUri]
  );
  const row = result.rows[0] || null;
  if (!row) {
    return null;
  }
  if (!verifyPkceCodeVerifier(codeVerifier, row.code_challenge, row.code_challenge_method)) {
    return null;
  }
  await pool.query(
    `UPDATE chatgpt_connector_auth_codes
        SET consumed_at = NOW()
      WHERE id = $1`,
    [row.id]
  );
  return row;
}

async function issueConnectorAccessToken({ consentId, clientId, userId, businessId, scope, tokenKind = "oauth_access", label = null, ttlSeconds = CONNECTOR_TOKEN_TTL_SECONDS }) {
  const rawToken = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  const result = await pool.query(
    `INSERT INTO chatgpt_connector_access_tokens
       (consent_id, client_id, user_id, business_id, scope, token_kind, token_hash, label, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, expires_at`,
    [consentId, clientId, userId, businessId, normalizeScope(scope), tokenKind, hashValue(rawToken), label, expiresAt]
  );
  return {
    accessToken: rawToken,
    expiresAt: result.rows[0]?.expires_at || expiresAt,
    tokenId: result.rows[0]?.id || null
  };
}

async function authenticateConnectorToken(rawToken) {
  const tokenHash = hashValue(rawToken);
  const result = await pool.query(
    `SELECT t.id,
            t.user_id,
            t.business_id,
            t.scope,
            t.token_kind,
            t.client_id,
            t.expires_at,
            c.status AS consent_status
       FROM chatgpt_connector_access_tokens t
       JOIN chatgpt_connector_consents c
         ON c.id = t.consent_id
      WHERE t.token_hash = $1
        AND t.revoked_at IS NULL
        AND t.expires_at > NOW()
      LIMIT 1`,
    [tokenHash]
  );
  const row = result.rows[0] || null;
  if (!row || row.consent_status !== "active") {
    return null;
  }
  await pool.query(
    `UPDATE chatgpt_connector_access_tokens
        SET last_used_at = NOW()
      WHERE id = $1`,
    [row.id]
  );
  return row;
}

async function getConnectorStatusForUser(user) {
  const businessId = await resolveBusinessIdForUser(user);
  const configuredOrigin = String(process.env.APP_BASE_URL || "").trim().replace(/\/+$/, "") || "https://www.inexledger.com";
  const consentResult = await pool.query(
    `SELECT c.id, c.client_id, c.scope, c.consent_type, c.created_at,
            t.token_kind, t.expires_at, t.last_used_at
       FROM chatgpt_connector_consents c
       LEFT JOIN chatgpt_connector_access_tokens t
         ON t.consent_id = c.id
        AND t.revoked_at IS NULL
      WHERE c.user_id = $1
        AND c.business_id = $2
        AND c.status = 'active'
      ORDER BY c.created_at DESC, t.created_at DESC
      LIMIT 1`,
    [user.id, businessId]
  );
  const current = consentResult.rows[0] || null;
  return {
    businessId,
    oauthConfigured: isOauthConnectorConfigured(),
    clientId: CONNECTOR_CLIENT_ID || null,
    mcpUrl: `${configuredOrigin}/mcp`,
    connected: !!current,
    current: current
      ? {
          consentType: current.consent_type,
          clientId: current.client_id,
          scope: current.scope,
          tokenKind: current.token_kind || null,
          createdAt: current.created_at,
          expiresAt: current.expires_at || null,
          lastUsedAt: current.last_used_at || null
        }
      : null
  };
}

function buildMcpServerInfo(req) {
  return {
    name: "InEx Ledger MCP",
    version: "1.0.0",
    website: buildAppOrigin(req)
  };
}

function normalizeDateInput(value) {
  const raw = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function normalizeLimit(value, fallback = 25, max = 100) {
  return Math.min(Math.max(Number(value) || fallback, 1), max);
}

async function fetchBusinessRecord(businessId) {
  const result = await pool.query(
    `SELECT id, name, region, province, language, business_type, operating_name,
            business_activity_code, accounting_method, material_participation,
            gst_hst_registered, gst_hst_number, gst_hst_method, fiscal_year_start, address
       FROM businesses
      WHERE id = $1
      LIMIT 1`,
    [businessId]
  );
  return result.rows[0] || null;
}

async function fetchTransactionsForDataset(businessId, startDate, endDate) {
  const accountResult = await pool.query(`SELECT id, name, type FROM accounts WHERE business_id = $1`, [businessId]);
  const categoryResult = await pool.query(`SELECT id, name, kind, tax_map_us, tax_map_ca FROM categories WHERE business_id = $1`, [businessId]);
  const txResult = await pool.query(
    `SELECT id, business_id, account_id, category_id, amount, type, description, date, note,
            currency, review_status, review_notes, payer_name, tax_form_type
       FROM transactions
      WHERE business_id = $1
        AND date >= $2
        AND date <= $3
        AND (deleted_at IS NULL OR deleted_at IS NULL)
      ORDER BY date ASC, created_at ASC`,
    [businessId, startDate, endDate]
  );
  const receiptResult = await pool.query(
    `SELECT id, transaction_id, filename
       FROM receipts
      WHERE business_id = $1`,
    [businessId]
  );
  const supportArtifactResult = await pool.query(
    `SELECT id, transaction_id, artifact_type, review_status, notes
       FROM support_artifacts
      WHERE business_id = $1`,
    [businessId]
  );
  const reviewStateResult = await pool.query(
    `SELECT transaction_id, issue_code, issue_severity, issue_status, reviewer_note
       FROM transaction_review_states
      WHERE business_id = $1`,
    [businessId]
  );
  return {
    transactions: txResult.rows,
    accounts: accountResult.rows,
    categories: categoryResult.rows,
    receipts: receiptResult.rows,
    supportArtifacts: supportArtifactResult.rows,
    reviewStates: reviewStateResult.rows
  };
}

function buildSupportArtifactMap(artifacts) {
  const map = new Map();
  for (const artifact of artifacts || []) {
    if (!artifact?.transaction_id) continue;
    const existing = map.get(artifact.transaction_id) || [];
    existing.push(artifact);
    map.set(artifact.transaction_id, existing);
  }
  return map;
}

function buildReviewIssueMap(reviewStates) {
  const map = new Map();
  for (const row of reviewStates || []) {
    if (!row?.transaction_id) continue;
    const existing = map.get(row.transaction_id) || [];
    existing.push({
      code: row.issue_code,
      severity: row.issue_severity,
      status: row.issue_status,
      note: row.reviewer_note || ""
    });
    map.set(row.transaction_id, existing);
  }
  return map;
}

async function buildExportReadinessSummary(businessId) {
  const startDate = "2000-01-01";
  const endDate = "2099-12-31";
  const business = await fetchBusinessRecord(businessId);
  const source = await fetchTransactionsForDataset(businessId, startDate, endDate);
  const dataset = buildNormalizedExportDataset({
    business,
    transactions: source.transactions,
    accounts: source.accounts,
    categories: source.categories,
    receipts: source.receipts,
    supportArtifactMap: buildSupportArtifactMap(source.supportArtifacts),
    reviewStateMap: buildReviewIssueMap(source.reviewStates),
    language: business?.language || "en"
  });
  const finalization = deriveFinalizationDecision({ dataset, requestedMode: "finalized" });
  return { dataset, finalization };
}

async function executeTool(toolName, args, auth) {
  const businessId = auth.business_id || auth.businessId;
  const limit = normalizeLimit(args?.limit);

  if (toolName === "get_businesses") {
    const businesses = await listBusinessesForUser(auth.user_id || auth.userId);
    return { businesses };
  }

  if (toolName === "get_active_business") {
    const business = await fetchBusinessRecord(businessId);
    return { business };
  }

  if (toolName === "get_business_profile") {
    const business = await fetchBusinessRecord(businessId);
    return { profile: business };
  }

  if (toolName === "get_bookkeeping_summary") {
    const startDate = normalizeDateInput(args?.start_date) || "2000-01-01";
    const endDate = normalizeDateInput(args?.end_date) || "2099-12-31";
    const result = await pool.query(
      `SELECT
          COUNT(*) FILTER (WHERE type = 'income') AS income_count,
          COUNT(*) FILTER (WHERE type = 'expense') AS expense_count,
          COALESCE(SUM(amount) FILTER (WHERE type = 'income'), 0) AS income_total,
          COALESCE(SUM(amount) FILTER (WHERE type = 'expense'), 0) AS expense_total,
          COUNT(*) FILTER (WHERE category_id IS NULL) AS uncategorized_count
       FROM transactions
      WHERE business_id = $1
        AND date >= $2
        AND date <= $3
        AND deleted_at IS NULL`,
      [businessId, startDate, endDate]
    );
    const missingReceipts = await pool.query(
      `SELECT COUNT(*)
         FROM transactions t
         LEFT JOIN receipts r
           ON r.transaction_id = t.id
         LEFT JOIN support_artifacts s
           ON s.transaction_id = t.id
          AND s.artifact_type IN ('receipt', 'review_note', 'allocation_worksheet', 'mileage_log')
        WHERE t.business_id = $1
          AND t.type = 'expense'
          AND t.date >= $2
          AND t.date <= $3
          AND t.deleted_at IS NULL
        GROUP BY t.id
        HAVING COUNT(r.id) = 0 AND COUNT(s.id) = 0`,
      [businessId, startDate, endDate]
    ).catch(() => ({ rowCount: 0 }));
    return {
      startDate,
      endDate,
      summary: {
        incomeCount: Number(result.rows[0]?.income_count || 0),
        expenseCount: Number(result.rows[0]?.expense_count || 0),
        incomeTotal: Number(result.rows[0]?.income_total || 0),
        expenseTotal: Number(result.rows[0]?.expense_total || 0),
        uncategorizedCount: Number(result.rows[0]?.uncategorized_count || 0),
        missingReceiptCount: Number(missingReceipts.rowCount || 0)
      }
    };
  }

  if (toolName === "search_transactions") {
    const query = `%${String(args?.query || "").trim()}%`;
    const result = await pool.query(
      `SELECT id, date, description, note, payer_name, amount, type
         FROM transactions
        WHERE business_id = $1
          AND deleted_at IS NULL
          AND (
            description ILIKE $2 OR
            note ILIKE $2 OR
            payer_name ILIKE $2 OR
            CAST(amount AS TEXT) ILIKE $2
          )
        ORDER BY date DESC, created_at DESC
        LIMIT $3`,
      [businessId, query, limit]
    );
    return { transactions: result.rows };
  }

  if (toolName === "list_uncategorized_transactions") {
    const result = await pool.query(
      `SELECT id, date, description, amount, type
         FROM transactions
        WHERE business_id = $1
          AND deleted_at IS NULL
          AND category_id IS NULL
        ORDER BY date DESC, created_at DESC
        LIMIT $2`,
      [businessId, limit]
    );
    return { transactions: result.rows };
  }

  if (toolName === "list_missing_receipts") {
    const result = await pool.query(
      `SELECT t.id, t.date, t.description, t.amount
         FROM transactions t
         LEFT JOIN receipts r ON r.transaction_id = t.id
         LEFT JOIN support_artifacts s
           ON s.transaction_id = t.id
          AND s.artifact_type IN ('receipt', 'allocation_worksheet', 'mileage_log', 'review_note')
        WHERE t.business_id = $1
          AND t.type = 'expense'
          AND t.deleted_at IS NULL
        GROUP BY t.id
        HAVING COUNT(r.id) = 0 AND COUNT(s.id) = 0
        ORDER BY t.date DESC
        LIMIT $2`,
      [businessId, limit]
    );
    return { transactions: result.rows };
  }

  if (toolName === "get_export_readiness" || toolName === "list_export_blockers" || toolName === "get_cpa_handoff_summary") {
    const { dataset, finalization } = await buildExportReadinessSummary(businessId);
    if (toolName === "get_export_readiness") {
      return {
        totals: dataset.totals,
        metadata: dataset.metadata,
        finalization: {
          eligibleForFinalization: finalization.eligibleForFinalization,
          resolvedMode: finalization.resolvedMode,
          hardBlockers: finalization.hardBlockers,
          warnings: finalization.warnings
        }
      };
    }
    if (toolName === "list_export_blockers") {
      return {
        hardBlockers: finalization.hardBlockers,
        warnings: finalization.warnings
      };
    }
    return {
      businessId,
      includedRows: dataset.rows.length,
      uncategorizedRows: dataset.rows.filter((row) => row.readiness?.bookkeepingStatus !== "booked").length,
      hardBlockerCount: finalization.hardBlockers.length,
      warningCount: finalization.warnings.length,
      receiptCoverage: dataset.receiptCoverage || null,
      excludedCount: Array.isArray(dataset.excludedRows) ? dataset.excludedRows.length : 0
    };
  }

  if (toolName === "get_tax_installment_reminders") {
    const business = await fetchBusinessRecord(businessId);
    const reminders = getQuarterlyReminders(business?.region || "US");
    return { reminders };
  }

  if (toolName === "list_invoices" || toolName === "list_unpaid_invoices") {
    const statuses = toolName === "list_unpaid_invoices"
      ? ["draft", "sent"]
      : (args?.status ? [String(args.status)] : null);
    const query = statuses
      ? `SELECT id, invoice_number, customer_name, customer_email, issue_date, due_date, status, currency, total_amount
           FROM invoices_v1
          WHERE business_id = $1
            AND status = ANY($2::text[])
          ORDER BY issue_date DESC, created_at DESC
          LIMIT $3`
      : `SELECT id, invoice_number, customer_name, customer_email, issue_date, due_date, status, currency, total_amount
           FROM invoices_v1
          WHERE business_id = $1
          ORDER BY issue_date DESC, created_at DESC
          LIMIT $2`;
    const params = statuses ? [businessId, statuses, limit] : [businessId, limit];
    const result = await pool.query(query, params).catch(() => ({ rows: [] }));
    return { invoices: result.rows };
  }

  if (toolName === "list_invoice_messages") {
    const invoiceId = String(args?.invoice_id || "").trim();
    const result = invoiceId
      ? await pool.query(
          `SELECT id, invoice_id, message_type, subject, body, external_sender_email, external_sender_name, created_at
             FROM messages
            WHERE invoice_id = $1
            ORDER BY created_at DESC
            LIMIT $2`,
          [invoiceId, limit]
        )
      : await pool.query(
          `SELECT id, invoice_id, message_type, subject, body, external_sender_email, external_sender_name, created_at
             FROM messages
            WHERE invoice_id IS NOT NULL
            ORDER BY created_at DESC
            LIMIT $1`,
          [limit]
        );
    return { messages: result.rows };
  }

  if (toolName === "get_receipt_coverage") {
    const summary = await pool.query(
      `SELECT
          COUNT(*) FILTER (WHERE t.type = 'expense') AS expense_transactions,
          COUNT(DISTINCT t.id) FILTER (WHERE t.type = 'expense' AND (r.id IS NOT NULL OR s.id IS NOT NULL)) AS supported_expense_transactions,
          COUNT(r.id) AS receipt_file_count,
          COUNT(s.id) FILTER (WHERE s.artifact_type <> 'review_note') AS support_file_count
       FROM transactions t
       LEFT JOIN receipts r ON r.transaction_id = t.id
       LEFT JOIN support_artifacts s ON s.transaction_id = t.id
      WHERE t.business_id = $1
        AND t.deleted_at IS NULL`,
      [businessId]
    );
    return {
      coverage: {
        expenseTransactions: Number(summary.rows[0]?.expense_transactions || 0),
        supportedExpenseTransactions: Number(summary.rows[0]?.supported_expense_transactions || 0),
        receiptFileCount: Number(summary.rows[0]?.receipt_file_count || 0),
        supportFileCount: Number(summary.rows[0]?.support_file_count || 0)
      }
    };
  }

  throw new Error(`Unknown tool: ${toolName}`);
}

function buildMcpToolResult(structuredContent) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(structuredContent, null, 2)
      }
    ],
    structuredContent
  };
}

async function handleMcpRequest(body, auth, req) {
  const id = body?.id ?? null;
  const method = body?.method;
  const params = body?.params || {};

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: {
          tools: {}
        },
        serverInfo: buildMcpServerInfo(req)
      }
    };
  }

  if (method === "ping") {
    return { jsonrpc: "2.0", id, result: { ok: true } };
  }

  if (!auth) {
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32001, message: "Authentication required." }
    };
  }

  if (method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        tools: MCP_TOOLS
      }
    };
  }

  if (method === "tools/call") {
    try {
      const toolName = String(params?.name || "");
      const args = params?.arguments || {};
      const result = await executeTool(toolName, args, auth);
      return {
        jsonrpc: "2.0",
        id,
        result: buildMcpToolResult(result)
      };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32002, message: error.message || "Tool call failed." }
      };
    }
  }

  return {
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: "Method not found." }
  };
}

module.exports = {
  CONNECTOR_CLIENT_ID,
  CONNECTOR_REDIRECT_URIS,
  SUPPORTED_SCOPES,
  DEFAULT_SCOPE,
  MCP_TOOLS,
  AUTH_CODE_TTL_SECONDS,
  CONNECTOR_TOKEN_TTL_SECONDS,
  PERSONAL_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_COOKIE,
  normalizeScope,
  isOauthConnectorConfigured,
  validateOauthClient,
  buildAppOrigin,
  getAuthorizedUserFromRefreshCookie,
  createConsent,
  revokeConnectorAccess,
  createAuthCode,
  consumeAuthCode,
  issueConnectorAccessToken,
  authenticateConnectorToken,
  getConnectorStatusForUser,
  handleMcpRequest,
  recordConnectorAudit: async (req, payload) => {
    try {
      await recordAuditEventForRequest(pool, req, payload);
    } catch (error) {
      logError("ChatGPT connector audit failure", { err: error.message });
    }
  }
};
