"use strict";

const { Resend } = require("resend");
const { pool } = require("../db.js");
const { logWarn } = require("../utils/logger.js");
const { getPreferredLanguageForUser, buildExportLifecycleEmail } = require("./emailI18nService.js");
const {
  appendOptionalEmailFooter,
  getOptionalEmailRecipientForBusiness
} = require("./emailPreferencesService.js");

const EXPORT_STALE_REMINDER_KEY = "export_stale";
const INVALIDATION_LABELS = [
  { match: /transactions changed after export/i, label: "Transactions", nextStep: "Review edited, deleted, or newly imported transactions and regenerate the package." },
  { match: /receipt evidence changed after export/i, label: "Receipt evidence", nextStep: "Review receipt attachments on included transactions and regenerate the package." },
  { match: /support artifacts changed after export/i, label: "Support artifacts", nextStep: "Review linked support files or notes and regenerate the package." },
  { match: /category mappings changed after export/i, label: "Category mappings", nextStep: "Review category assignments or tax mappings and regenerate the package." },
  { match: /capital asset schedules changed after export/i, label: "Capital assets", nextStep: "Review capital asset schedules and regenerate the package." },
  { match: /business filing profile changed after export/i, label: "Business filing profile", nextStep: "Review filing profile details in Settings and regenerate the package." },
  { match: /mileage or vehicle support changed after export/i, label: "Mileage and vehicle support", nextStep: "Review mileage or vehicle support entries and regenerate the package." },
  { match: /vehicle claim details changed after export/i, label: "Vehicle claim details", nextStep: "Review vehicle claim details and regenerate the package." }
];

function getResendClient() {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) return null;
  try {
    return new Resend(apiKey);
  } catch (err) {
    logWarn("exportEmailService: Resend client unavailable", { message: err?.message });
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

function formatExportType(exportType) {
  const value = String(exportType || "pdf").trim().toLowerCase();
  if (value === "csv_basic") return "CSV basic ledger";
  if (value === "csv_full") return "CSV CPA workpaper";
  if (value === "csv_excluded") return "CSV excluded items";
  if (value === "csv_category_summary") return "CSV category summary";
  return "PDF";
}

function summarizeInvalidationReason(reason) {
  const text = String(reason || "").trim() || "Underlying source data changed after export.";
  const match = INVALIDATION_LABELS.find((entry) => entry.match.test(text));
  if (match) {
    return { label: match.label, nextStep: match.nextStep };
  }
  return {
    label: "Source data",
    nextStep: "Review the underlying source data changes and regenerate the package."
  };
}

async function loadBusinessOwner(businessId, db = pool) {
  return getOptionalEmailRecipientForBusiness(businessId, db);
}

async function sendEmailToUser({ userId, email, kind, details, actionUrl }, resendClient = getResendClient()) {
  if (!email || !resendClient) return false;
  const lang = await getPreferredLanguageForUser(userId);
  const emailContent = appendOptionalEmailFooter(buildExportLifecycleEmail(lang, kind, {
    details,
    actionUrl
  }), userId);
  const result = await resendClient.emails.send({
    from: getFromEmail(),
    to: email,
    subject: emailContent.subject,
    html: emailContent.html,
    text: emailContent.text
  });
  if (result?.error) {
    throw new Error(result.error.message || "Export email send failed.");
  }
  return true;
}

async function sendExportGeneratedEmail({
  businessId,
  userId,
  exportType,
  startDate,
  endDate
}, { db = pool, resendClient = getResendClient() } = {}) {
  try {
    const owner = await loadBusinessOwner(businessId, db);
    if (!owner?.email || !owner.marketing_email_opt_in) return false;
    return await sendEmailToUser({
      userId: userId || owner.user_id,
      email: owner.email,
      kind: "generated",
      details: [
        { label: "Format", value: formatExportType(exportType) },
        { label: "Date range", value: `${startDate} to ${endDate}` }
      ],
      actionUrl: buildAppUrl("/exports")
    }, resendClient);
  } catch (err) {
    logWarn("exportEmailService: generated email failed", { businessId, message: err?.message });
    return false;
  }
}

async function sendExportFailedEmail({
  businessId,
  userId,
  exportType,
  startDate,
  endDate,
  reason
}, { db = pool, resendClient = getResendClient() } = {}) {
  try {
    const owner = await loadBusinessOwner(businessId, db);
    if (!owner?.email || !owner.marketing_email_opt_in) return false;
    return await sendEmailToUser({
      userId: userId || owner.user_id,
      email: owner.email,
      kind: "failed",
      details: [
        { label: "Format", value: formatExportType(exportType) },
        ...(startDate && endDate ? [{ label: "Date range", value: `${startDate} to ${endDate}` }] : []),
        ...(reason ? [{ label: "Issue", value: String(reason).trim().slice(0, 300) }] : [])
      ],
      actionUrl: buildAppUrl("/exports")
    }, resendClient);
  } catch (err) {
    logWarn("exportEmailService: failed email failed", { businessId, message: err?.message });
    return false;
  }
}

async function clearExportStaleReminderState(businessId, db = pool) {
  await db.query(
    `DELETE FROM business_email_reminders
      WHERE business_id = $1
        AND reminder_key = $2`,
    [businessId, EXPORT_STALE_REMINDER_KEY]
  );
}

async function hasExportStaleReminderState(businessId, db = pool) {
  const result = await db.query(
    `SELECT 1
       FROM business_email_reminders
      WHERE business_id = $1
        AND reminder_key = $2
      LIMIT 1`,
    [businessId, EXPORT_STALE_REMINDER_KEY]
  );
  return result.rowCount > 0;
}

async function saveExportStaleReminderState(businessId, reason, db = pool) {
  await db.query(
    `INSERT INTO business_email_reminders (
       business_id, reminder_key, last_sent_at, last_count, metadata_json, updated_at
     ) VALUES ($1, $2, NOW(), 1, $3::jsonb, NOW())
     ON CONFLICT (business_id, reminder_key) DO UPDATE
       SET last_sent_at = NOW(),
           last_count = 1,
           metadata_json = EXCLUDED.metadata_json,
           updated_at = NOW()`,
    [businessId, EXPORT_STALE_REMINDER_KEY, JSON.stringify({ reason: reason || "" })]
  );
}

async function sendExportStaleEmail({
  businessId,
  reason
}, { db = pool, resendClient = getResendClient() } = {}) {
  try {
    if (await hasExportStaleReminderState(businessId, db)) {
      return false;
    }
    const owner = await loadBusinessOwner(businessId, db);
    if (!owner?.email || !owner.marketing_email_opt_in) return false;
    const invalidation = summarizeInvalidationReason(reason || "");
    await sendEmailToUser({
      userId: owner.user_id,
      email: owner.email,
      kind: "stale",
      details: [
        { label: "Area", value: invalidation.label },
        { label: "Next step", value: invalidation.nextStep }
      ],
      actionUrl: buildAppUrl("/exports")
    }, resendClient);
    await saveExportStaleReminderState(businessId, reason, db);
    return true;
  } catch (err) {
    logWarn("exportEmailService: stale email failed", { businessId, message: err?.message });
    return false;
  }
}

module.exports = {
  sendExportGeneratedEmail,
  sendExportFailedEmail,
  sendExportStaleEmail,
  clearExportStaleReminderState
};
