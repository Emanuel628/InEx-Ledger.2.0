"use strict";

const crypto = require("crypto");

const AUDIT_ACTIONS = Object.freeze({
  LOGIN_SUCCESS: "auth.login.success",
  LOGIN_FAILURE: "auth.login.failure",
  LOGOUT: "auth.logout",
  PASSWORD_RESET_REQUEST: "auth.password_reset.request",
  PASSWORD_RESET_COMPLETE: "auth.password_reset.complete",
  PASSWORD_CHANGED: "auth.password.changed",
  EMAIL_CHANGE_REQUEST: "auth.email_change.request",
  EMAIL_CHANGE_COMPLETE: "auth.email_change.complete",
  MFA_ENABLED: "auth.mfa.enabled",
  MFA_DISABLED: "auth.mfa.disabled",
  SESSION_REVOKED: "auth.session.revoked",
  ACCOUNT_DELETION_REQUESTED: "account.deletion.requested",
  ACCOUNT_DELETION_COMPLETED: "account.deletion.completed",
  TRANSACTION_CREATED: "transaction.created",
  TRANSACTION_UPDATED: "transaction.updated",
  TRANSACTION_DELETED: "transaction.deleted",
  TRANSACTION_RESTORED: "transaction.restored",
  TRANSACTION_BULK_DELETED: "transaction.bulk_deleted",
  RECEIPT_UPLOADED: "receipt.uploaded",
  RECEIPT_DELETED: "receipt.deleted",
  EXPORT_GENERATED: "export.generated",
  ACCOUNTING_PERIOD_LOCKED: "accounting_period.locked",
  ACCOUNTING_PERIOD_UNLOCKED: "accounting_period.unlocked",
  BILLING_SUBSCRIPTION_CHANGED: "billing.subscription.changed",
  BILLING_PAYMENT_FAILED: "billing.payment.failed",
  IMPORT_BATCH_CREATED: "import_batch.created",
  IMPORT_BATCH_REVERTED: "import_batch.reverted"
});

const MAX_USER_AGENT_LEN = 512;
const MAX_IP_LEN = 64;
const MAX_ACTION_LEN = 128;

function truncate(value, max) {
  if (value === null || value === undefined) return null;
  const str = String(value);
  return str.length > max ? str.slice(0, max) : str;
}

function extractRequestContext(req) {
  if (!req) return { ipAddress: null, userAgent: null };
  const xff = req.headers?.["x-forwarded-for"];
  const forwarded = typeof xff === "string" ? xff.split(",")[0].trim() : null;
  const ipAddress = forwarded || req.ip || req.connection?.remoteAddress || null;
  const userAgent = req.headers?.["user-agent"] || null;
  return {
    ipAddress: truncate(ipAddress, MAX_IP_LEN),
    userAgent: truncate(userAgent, MAX_USER_AGENT_LEN)
  };
}

/**
 * Insert an audit row. Best-effort: never throws — audit failures must not
 * break the caller's main flow. Returns the inserted id or null on error.
 */
async function recordAuditEvent(pool, {
  userId = null,
  businessId = null,
  action,
  ipAddress = null,
  userAgent = null,
  metadata = null
} = {}) {
  const trimmedAction = truncate(action, MAX_ACTION_LEN);
  if (!trimmedAction) return null;

  const payload = metadata && typeof metadata === "object" ? metadata : {};
  const id = crypto.randomUUID();

  try {
    await pool.query(
      `INSERT INTO audit_events
         (id, user_id, business_id, action, ip_address, user_agent, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        id,
        userId || null,
        businessId || null,
        trimmedAction,
        truncate(ipAddress, MAX_IP_LEN),
        truncate(userAgent, MAX_USER_AGENT_LEN),
        JSON.stringify(payload)
      ]
    );
    return id;
  } catch (_err) {
    return null;
  }
}

async function recordAuditEventForRequest(pool, req, { action, userId, businessId, metadata } = {}) {
  const ctx = extractRequestContext(req);
  return recordAuditEvent(pool, {
    userId: userId ?? req?.user?.id ?? null,
    businessId: businessId ?? null,
    action,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    metadata
  });
}

async function listAuditEventsForUser(pool, userId, { limit = 50 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const result = await pool.query(
    `SELECT id, action, business_id, ip_address, user_agent, metadata, created_at
       FROM audit_events
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [userId, safeLimit]
  );
  return result.rows;
}

async function listAuditEventsForBusiness(pool, businessId, { limit = 100, actions = null } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const params = [businessId, safeLimit];
  let actionFilter = "";
  if (Array.isArray(actions) && actions.length > 0) {
    params.push(actions.map((a) => truncate(a, MAX_ACTION_LEN)).filter(Boolean));
    actionFilter = ` AND action = ANY($${params.length}::text[])`;
  }
  const result = await pool.query(
    `SELECT id, user_id, action, ip_address, user_agent, metadata, created_at
       FROM audit_events
      WHERE business_id = $1${actionFilter}
      ORDER BY created_at DESC
      LIMIT $2`,
    params
  );
  return result.rows;
}

module.exports = {
  AUDIT_ACTIONS,
  recordAuditEvent,
  recordAuditEventForRequest,
  extractRequestContext,
  listAuditEventsForUser,
  listAuditEventsForBusiness,
  __private: { truncate, MAX_ACTION_LEN, MAX_IP_LEN, MAX_USER_AGENT_LEN }
};
