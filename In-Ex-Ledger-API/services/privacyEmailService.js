"use strict";

const { Resend } = require("resend");
const { logWarn } = require("../utils/logger.js");
const {
  getPreferredLanguageForUser,
  buildPrivacyActivityEmail
} = require("./emailI18nService.js");

function getResendClient() {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) return null;
  try {
    return new Resend(apiKey);
  } catch (err) {
    logWarn("privacyEmailService: Resend client unavailable", { message: err?.message });
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

async function sendPrivacyActivityEmail({
  userId,
  email,
  kind,
  details,
  actionPath
}, { resendClient = getResendClient() } = {}) {
  try {
    if (!resendClient) return false;
    if (!email || !String(email).includes("@")) return false;
    const lang = await getPreferredLanguageForUser(userId);
    const emailContent = buildPrivacyActivityEmail(lang, kind, {
      details,
      actionUrl: actionPath ? buildAppUrl(actionPath) : ""
    });
    const result = await resendClient.emails.send({
      from: getFromEmail(),
      to: email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text
    });
    if (result?.error) {
      throw new Error(result.error.message || "Privacy email send failed.");
    }
    return true;
  } catch (err) {
    logWarn("privacyEmailService: privacy activity email failed", {
      userId,
      kind,
      message: err?.message
    });
    return false;
  }
}

module.exports = {
  sendPrivacyActivityEmail
};
