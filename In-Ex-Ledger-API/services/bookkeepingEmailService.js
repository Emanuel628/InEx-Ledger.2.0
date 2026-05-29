"use strict";

const { Resend } = require("resend");
const { pool } = require("../db.js");
const { logWarn } = require("../utils/logger.js");
const {
  getPreferredLanguageForUser,
  buildBookkeepingActivityEmail
} = require("./emailI18nService.js");

function getResendClient() {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) return null;
  try {
    return new Resend(apiKey);
  } catch (err) {
    logWarn("bookkeepingEmailService: Resend client unavailable", { message: err?.message });
    return null;
  }
}

function getFromEmail() {
  return (
    String(process.env.RESEND_FROM_EMAIL || "").trim()
    || String(process.env.EMAIL_FROM || "").trim()
    || "InEx Ledger <noreply@inexledger.com>"
  );
}

function buildAppUrl(path) {
  const base = String(process.env.APP_BASE_URL || process.env.FRONTEND_URL || "https://www.inexledger.com")
    .trim()
    .replace(/\/+$/, "");
  const normalizedPath = String(path || "/").startsWith("/") ? String(path || "/") : `/${String(path || "")}`;
  return `${base}${normalizedPath}`;
}

async function loadBusinessOwner(businessId, db = pool) {
  const result = await db.query(
    `SELECT b.user_id, u.email
       FROM businesses b
       JOIN users u ON u.id = b.user_id
      WHERE b.id = $1
        AND u.is_erased = FALSE
      LIMIT 1`,
    [businessId]
  );
  return result.rows[0] || null;
}

async function sendBookkeepingActivityEmail({
  businessId,
  kind,
  details,
  actionPath,
  userId
}, { db = pool, resendClient = getResendClient() } = {}) {
  try {
    if (!resendClient) return false;
    const owner = await loadBusinessOwner(businessId, db);
    if (!owner?.email) return false;
    const lang = await getPreferredLanguageForUser(userId || owner.user_id);
    const emailContent = buildBookkeepingActivityEmail(lang, kind, {
      details,
      actionUrl: buildAppUrl(actionPath || "/")
    });
    const result = await resendClient.emails.send({
      from: getFromEmail(),
      to: owner.email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text
    });
    if (result?.error) {
      throw new Error(result.error.message || "Bookkeeping activity email send failed.");
    }
    return true;
  } catch (err) {
    logWarn("bookkeepingEmailService: activity email failed", {
      businessId,
      kind,
      message: err?.message
    });
    return false;
  }
}

module.exports = {
  sendBookkeepingActivityEmail
};
