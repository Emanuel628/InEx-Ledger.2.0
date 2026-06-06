"use strict";

const crypto = require("crypto");
const { pool } = require("../db.js");

function getAppBaseUrl() {
  return String(process.env.APP_BASE_URL || process.env.FRONTEND_URL || "https://www.inexledger.com")
    .trim()
    .replace(/\/+$/, "");
}

function buildAppUrl(path) {
  const normalizedPath = String(path || "/").startsWith("/") ? String(path || "/") : `/${String(path || "")}`;
  return `${getAppBaseUrl()}${normalizedPath}`;
}

function getSigningSecret() {
  return (
    String(process.env.EMAIL_PREFERENCES_SECRET || "").trim()
    || String(process.env.SUPPORT_REPLY_HMAC_SECRET || "").trim()
    || String(process.env.JWT_SECRET || "").trim()
    || "inex-ledger-email-preferences"
  );
}

function base64UrlEncode(value) {
  return Buffer.from(String(value), "utf8").toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(String(value || ""), "base64url").toString("utf8");
}

function signPayload(serialized) {
  return crypto
    .createHmac("sha256", getSigningSecret())
    .update(serialized)
    .digest("base64url");
}

function createUnsubscribeToken({ userId, scope = "optional_emails", expiresInDays = 365 } = {}) {
  const payload = {
    u: String(userId || "").trim(),
    s: String(scope || "optional_emails").trim(),
    e: Date.now() + (Math.max(Number(expiresInDays) || 0, 1) * 86400000)
  };
  if (!payload.u) {
    return "";
  }
  const serialized = JSON.stringify(payload);
  return `${base64UrlEncode(serialized)}.${signPayload(serialized)}`;
}

function verifyUnsubscribeToken(token, expectedScope = "optional_emails") {
  const raw = String(token || "").trim();
  if (!raw.includes(".")) {
    return null;
  }
  const [encoded, providedSignature] = raw.split(".", 2);
  if (!encoded || !providedSignature) {
    return null;
  }
  let serialized = "";
  let payload = null;
  try {
    serialized = base64UrlDecode(encoded);
    payload = JSON.parse(serialized);
  } catch (_) {
    return null;
  }
  const expectedSignature = signPayload(serialized);
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    providedBuffer.length !== expectedBuffer.length
    || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }
  if (!payload?.u || payload?.s !== expectedScope || Number(payload?.e || 0) < Date.now()) {
    return null;
  }
  return payload;
}

async function getOptionalEmailPreferenceForUser(userId, db = pool) {
  if (!userId) return false;
  const result = await db.query(
    `SELECT marketing_email_opt_in
       FROM user_privacy_settings
      WHERE user_id = $1
      LIMIT 1`,
    [userId]
  );
  return Boolean(result.rows[0]?.marketing_email_opt_in);
}

async function getOptionalEmailRecipientForBusiness(businessId, db = pool) {
  if (!businessId) return null;
  const result = await db.query(
    `SELECT b.user_id,
            u.email,
            b.name AS business_name,
            COALESCE(ups.marketing_email_opt_in, FALSE) AS marketing_email_opt_in
       FROM businesses b
       JOIN users u ON u.id = b.user_id
       LEFT JOIN user_privacy_settings ups ON ups.user_id = u.id
      WHERE b.id = $1
        AND u.is_erased = FALSE
      LIMIT 1`,
    [businessId]
  );
  const row = result.rows[0];
  if (!row?.email) return null;
  return {
    user_id: row.user_id,
    email: row.email,
    business_name: row.business_name,
    marketing_email_opt_in: Boolean(row.marketing_email_opt_in)
  };
}

function buildOptionalEmailUnsubscribeUrl(userId) {
  const token = createUnsubscribeToken({ userId, scope: "optional_emails" });
  return token ? buildAppUrl(`/api/unsubscribe?token=${encodeURIComponent(token)}`) : "";
}

function appendOptionalEmailFooter(emailContent, userId) {
  if (!emailContent || !userId) {
    return emailContent;
  }
  const unsubscribeUrl = buildOptionalEmailUnsubscribeUrl(userId);
  if (!unsubscribeUrl) {
    return emailContent;
  }
  const footerHtml = `
    <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.6;">
      These are optional bookkeeping update emails. You can
      <a href="${unsubscribeUrl}" style="color:#0f766e;font-weight:600;text-decoration:none;">unsubscribe from optional emails</a>
      and still receive required security, billing, invoice, and support messages.
    </div>`;
  const footerText = `\n\nThese are optional bookkeeping update emails. Unsubscribe from optional emails: ${unsubscribeUrl}\nYou will still receive required security, billing, invoice, and support messages.`;
  return {
    ...emailContent,
    html: `${String(emailContent.html || "")}${footerHtml}`,
    text: `${String(emailContent.text || "")}${footerText}`
  };
}

module.exports = {
  createUnsubscribeToken,
  verifyUnsubscribeToken,
  getOptionalEmailPreferenceForUser,
  getOptionalEmailRecipientForBusiness,
  buildOptionalEmailUnsubscribeUrl,
  appendOptionalEmailFooter
};
