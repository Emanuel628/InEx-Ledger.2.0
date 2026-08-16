"use strict";

const { Resend } = require("resend");
const { pool } = require("../db.js");
const { logWarn } = require("../utils/logger.js");
const {
  getPreferredLanguageForUser,
  buildInvoiceOwnerActivityEmail
} = require("./emailI18nService.js");
const {
  appendOptionalEmailFooter,
  getOptionalEmailRecipientForBusiness
} = require("./emailPreferencesService.js");
const {
  buildEmailDedupeKey,
  reserveEmailDelivery,
  markEmailDeliverySent,
  markEmailDeliveryFailed
} = require("./emailDeliveryDedupeService.js");

function getResendClient() {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) return null;
  try {
    return new Resend(apiKey);
  } catch (err) {
    logWarn("invoiceOwnerEmailService: Resend client unavailable", { message: err?.message });
    return null;
  }
}

function getFromEmail() {
  return (
    String(process.env.RESEND_FROM_EMAIL || "").trim() ||
    String(process.env.EMAIL_FROM || "").trim() ||
    "InEx Ledger <noreply@inexledger.com>"
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
  return getOptionalEmailRecipientForBusiness(businessId, db);
}

async function sendInvoiceOwnerActivityEmail({
  businessId,
  kind,
  details,
  actionUrl,
  userId
}, { db = pool, resendClient = getResendClient() } = {}) {
  try {
    if (!resendClient) return false;
    const owner = await loadBusinessOwner(businessId, db);
    if (!owner?.email || !owner.marketing_email_opt_in) return false;
    const lang = await getPreferredLanguageForUser(userId || owner.user_id);
    const emailContent = appendOptionalEmailFooter(buildInvoiceOwnerActivityEmail(lang, kind, {
      details,
      actionUrl: buildAppUrl(actionUrl || "/")
    }), owner.user_id);

    const dedupeKey = buildEmailDedupeKey("invoice-owner-activity", businessId, [
      kind,
      owner.email,
      emailContent.subject,
      JSON.stringify(details || []),
      actionUrl || ""
    ]);
    const reserved = await reserveEmailDelivery(db, {
      dedupeKey,
      category: "invoice.owner-activity",
      businessId,
      recipientEmail: owner.email,
      metadata: { kind, actionUrl: actionUrl || null }
    });
    if (!reserved) {
      logWarn("invoiceOwnerEmailService: owner activity email skipped by dedupe", {
        businessId,
        kind
      });
      return false;
    }

    try {
      const result = await resendClient.emails.send({
        from: getFromEmail(),
        to: owner.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text
      });
      if (result?.error) {
        throw new Error(result.error.message || "Invoice owner email send failed.");
      }
      await markEmailDeliverySent(db, dedupeKey, result?.data?.id || result?.id || null);
      return true;
    } catch (sendErr) {
      await markEmailDeliveryFailed(db, dedupeKey, sendErr);
      throw sendErr;
    }
  } catch (err) {
    logWarn("invoiceOwnerEmailService: owner activity email failed", {
      businessId,
      kind,
      message: err?.message
    });
    return false;
  }
}

module.exports = {
  sendInvoiceOwnerActivityEmail,
  buildInvoiceOwnerActionUrl: buildAppUrl
};
