"use strict";

const crypto = require("crypto");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMPACT_UUID_RE = /^[0-9a-f]{32}$/i;

function compactUuid(value) {
  return String(value || "").replace(/-/g, "").toLowerCase();
}

function expandCompactUuid(value) {
  const hex = String(value || "").toLowerCase();
  if (!COMPACT_UUID_RE.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function normalizeEmailAddress(value) {
  const raw = String(value || "").trim();
  const bracketMatch = raw.match(/<([^>]+)>/);
  const email = (bracketMatch ? bracketMatch[1] : raw).trim();
  return email.replace(/[<>]/g, "").trim();
}

function getSupportFromEmail() {
  return (
    String(process.env.SUPPORT_FROM_EMAIL || "").trim() ||
    String(process.env.RESEND_FROM_EMAIL || "").trim() ||
    String(process.env.EMAIL_FROM || "").trim() ||
    "InEx Ledger Support <support@inexledger.com>"
  );
}

function getSupportToEmail() {
  return String(process.env.SUPPORT_TO_EMAIL || "support.inex@gmail.com").trim();
}

function getSupportReplyBaseEmail() {
  return String(process.env.SUPPORT_REPLY_BASE_EMAIL || "").trim() || null;
}

function getSupportReplyHmacSecret() {
  return String(
    process.env.SUPPORT_REPLY_HMAC_SECRET ||
    process.env.CSRF_SECRET ||
    ""
  ).trim() || null;
}

function buildSupportReplyToken(messageId) {
  if (!messageId) return null;

  const id = String(messageId).trim();
  if (!UUID_RE.test(id)) return null;

  const compactId = compactUuid(id);
  const secret = getSupportReplyHmacSecret();

  if (!secret) return compactId;

  const sig = crypto
    .createHmac("sha256", secret)
    .update(`support:${compactId}`)
    .digest("base64url")
    .slice(0, 16);

  return `${compactId}.${sig}`;
}

function parseSupportReplyToken(token) {
  if (typeof token !== "string" || !token) return null;

  const parts = token.split(".");
  const rawId = parts[0];

  let compactId = null;
  let messageId = null;

  if (UUID_RE.test(rawId)) {
    messageId = rawId.toLowerCase();
    compactId = compactUuid(messageId);
  } else if (COMPACT_UUID_RE.test(rawId)) {
    compactId = rawId.toLowerCase();
    messageId = expandCompactUuid(compactId);
  }

  if (!messageId || !compactId) return null;

  const secret = getSupportReplyHmacSecret();
  if (!secret) return messageId;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`support:${compactId}`)
    .digest("base64url")
    .slice(0, 16);

  const provided = parts[1] || "";
  if (provided.length !== expected.length) return null;

  try {
    if (!crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return null;
  } catch (_) {
    return null;
  }

  return messageId;
}

function buildSupportReplyToAddress(messageId) {
  const rawBase = getSupportReplyBaseEmail();
  if (!rawBase) return null;

  const base = normalizeEmailAddress(rawBase);
  const token = buildSupportReplyToken(messageId);
  if (!token) return base;

  const at = base.lastIndexOf("@");
  if (at < 1) return base;

  const local = base.slice(0, at).replace(/[<>]/g, "").trim();
  const domain = base.slice(at).replace(/[<>]/g, "").trim();

  if (!local || !domain.startsWith("@")) return base;

  return `${local}+${token}${domain}`;
}

module.exports = {
  buildSupportReplyToAddress,
  buildSupportReplyToken,
  parseSupportReplyToken,
  getSupportFromEmail,
  getSupportToEmail
};