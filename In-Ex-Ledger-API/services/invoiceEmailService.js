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

/**
 * Returns the configured "from" address for invoice emails.
 * Falls back through INVOICE_FROM_EMAIL -> RESEND_FROM_EMAIL -> EMAIL_FROM.
 */
function getInvoiceFromEmail() {
  return (
    String(process.env.INVOICE_FROM_EMAIL || "").trim() ||
    String(process.env.RESEND_FROM_EMAIL || "").trim() ||
    String(process.env.EMAIL_FROM || "").trim() ||
    "InEx Ledger <invoices@inexledger.com>"
  );
}

/**
 * Returns the reply-to address pattern used for inbound replies.
 * If INVOICE_REPLY_BASE_EMAIL is "invoices@yourdomain.com", we plus-address
 * it with a signed token: "invoices+<token>@yourdomain.com".
 *
 * INVOICE_REPLY_BASE_EMAIL is optional: when unset, replies still work but
 * use a query-style suffix and inbound parsing relies on the To header only.
 */
function getInvoiceReplyBaseEmail() {
  return String(process.env.INVOICE_REPLY_BASE_EMAIL || "").trim() || null;
}

function getReplyHmacSecret() {
  return String(process.env.INVOICE_REPLY_HMAC_SECRET || process.env.CSRF_SECRET || "").trim() || null;
}

/**
 * Build a stable token that encodes an invoice id. If the env provides an
 * HMAC secret, the token is `<invoiceId>.<base64url(hmac)>` so the inbound
 * route can reject forged addresses. Without a secret, the token is just
 * the invoice id (still useful for routing, less useful for verification).
 */
function buildReplyToken(invoiceId) {
  if (!invoiceId) return null;

  const id = String(invoiceId).trim();
  if (!UUID_RE.test(id)) return null;

  const compactId = compactUuid(id);
  const secret = getReplyHmacSecret();

  if (!secret) return compactId;

  const sig = crypto
    .createHmac("sha256", secret)
    .update(compactId)
    .digest("base64url")
    .slice(0, 16);

  return `${compactId}.${sig}`;
}

/**
 * Verify and extract an invoice id from a reply token. Returns the invoice
 * id when valid, or null when the token is malformed, signature mismatches,
 * or the embedded id is not a UUID.
 */
function parseReplyToken(token) {
  if (typeof token !== "string" || !token) return null;

  const parts = token.split(".");
  const rawId = parts[0];

  let compactId = null;
  let invoiceId = null;

  if (UUID_RE.test(rawId)) {
    invoiceId = rawId.toLowerCase();
    compactId = compactUuid(invoiceId);
  } else if (COMPACT_UUID_RE.test(rawId)) {
    compactId = rawId.toLowerCase();
    invoiceId = expandCompactUuid(compactId);
  }

  if (!invoiceId || !compactId) return null;

  const secret = getReplyHmacSecret();
  if (!secret) return invoiceId;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(compactId)
    .digest("base64url")
    .slice(0, 16);

  const provided = parts[1] || "";
  if (provided.length !== expected.length) return null;

  try {
    if (!crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return null;
  } catch (_) {
    return null;
  }

  return invoiceId;
}

/**
 * Build a reply-to address. Returns null when no INVOICE_REPLY_BASE_EMAIL
 * is configured (the caller should fall back to the From address).
 */
function buildReplyToAddress(invoiceId) {
  const base = getInvoiceReplyBaseEmail();
  if (!base) return null;
  const token = buildReplyToken(invoiceId);
  if (!token) return base;
  const at = base.lastIndexOf("@");
  if (at < 1) return base;
  const local = base.slice(0, at);
  const domain = base.slice(at);
  return `${local}+${token}${domain}`;
}

/**
 * Extract a reply token from an inbound recipient address. Handles both
 * plus-addressed inbound (To: invoices+<token>@domain.com) and the bare
 * form (To: invoices@domain.com) — the latter cannot be routed.
 */
function extractTokenFromRecipient(recipient) {
  const raw = String(recipient || "");
  // Pull the address out of "Display Name <user+token@domain>"
  const match = raw.match(/<([^>]+)>/);
  const address = (match ? match[1] : raw).trim();
  const at = address.lastIndexOf("@");
  if (at < 1) return null;
  // RFC 5321: local-part is case-sensitive. The signature in the token uses
  // base64url which is mixed-case, so we must not lowercase here.
  const local = address.slice(0, at);
  const plus = local.indexOf("+");
  if (plus < 0) return null;
  return local.slice(plus + 1);
}

function formatCurrency(amount, currency) {
  const n = Number(amount) || 0;
  const cur = String(currency || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: cur,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(n);
  } catch (_) {
    return `${cur} ${n.toFixed(2)}`;
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Builds the email body for an invoice. Returns { subject, html, text }.
 */
function buildInvoiceEmailBody({ invoice, businessName, senderName, customMessage }) {
  const number = invoice.invoice_number || "INV";
  const total = formatCurrency(invoice.total_amount, invoice.currency);
  const due = invoice.due_date ? new Date(invoice.due_date).toISOString().slice(0, 10) : null;
  const subject = `Invoice ${number} from ${businessName || "InEx Ledger"} — ${total}`;

  const items = Array.isArray(invoice.line_items)
    ? invoice.line_items
    : (() => {
        try { return JSON.parse(invoice.line_items || "[]"); } catch { return []; }
      })();

  const customLine = customMessage
    ? `<p style="margin:0 0 16px;">${escapeHtml(customMessage).replace(/\n/g, "<br/>")}</p>`
    : "";

  const rowsHtml = items.map((row) => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;">${escapeHtml(row.description)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${Number(row.quantity || 0)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${formatCurrency(row.unit_price, invoice.currency)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${formatCurrency(row.amount, invoice.currency)}</td>
    </tr>
  `).join("");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${escapeHtml(subject)}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;color:#1f2937;background:#f9fafb;margin:0;padding:24px;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;">
    <tr><td>
      <h1 style="font-size:20px;margin:0 0 8px;">Invoice ${escapeHtml(number)}</h1>
      <p style="margin:0 0 24px;color:#6b7280;">From ${escapeHtml(businessName || "InEx Ledger")}${senderName ? " · " + escapeHtml(senderName) : ""}</p>
      ${customLine}
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:16px 0;border-collapse:collapse;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="text-align:left;padding:8px;font-size:12px;color:#6b7280;">Description</th>
            <th style="text-align:right;padding:8px;font-size:12px;color:#6b7280;">Qty</th>
            <th style="text-align:right;padding:8px;font-size:12px;color:#6b7280;">Unit</th>
            <th style="text-align:right;padding:8px;font-size:12px;color:#6b7280;">Amount</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:8px;">
        <tr><td style="text-align:right;padding:4px 8px;color:#6b7280;">Subtotal</td><td style="text-align:right;padding:4px 8px;width:120px;">${formatCurrency(invoice.subtotal, invoice.currency)}</td></tr>
        <tr><td style="text-align:right;padding:4px 8px;color:#6b7280;">Tax</td><td style="text-align:right;padding:4px 8px;">${formatCurrency(invoice.tax_amount, invoice.currency)}</td></tr>
        <tr><td style="text-align:right;padding:6px 8px;font-weight:600;border-top:1px solid #e5e7eb;">Total</td><td style="text-align:right;padding:6px 8px;font-weight:600;border-top:1px solid #e5e7eb;">${total}</td></tr>
      </table>
      ${due ? `<p style="margin:24px 0 0;color:#6b7280;font-size:13px;">Due ${escapeHtml(due)}</p>` : ""}
      <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;">Reply directly to this email to ask a question — your reply will reach ${escapeHtml(businessName || "the sender")}.</p>
    </td></tr>
  </table>
</body></html>`;

  const textLines = [
    `Invoice ${number}`,
    `From: ${businessName || "InEx Ledger"}${senderName ? ` (${senderName})` : ""}`,
    "",
    customMessage ? `${customMessage}\n` : null,
    ...items.map((row) => `- ${row.description}  x${Number(row.quantity || 0)}  ${formatCurrency(row.amount, invoice.currency)}`),
    "",
    `Subtotal: ${formatCurrency(invoice.subtotal, invoice.currency)}`,
    `Tax:      ${formatCurrency(invoice.tax_amount, invoice.currency)}`,
    `Total:    ${total}`,
    due ? `Due:      ${due}` : null,
    "",
    "Reply directly to this email to send a question to the sender."
  ].filter((line) => line !== null);
  const text = textLines.join("\n");

  return { subject, html, text };
}

/**
 * Send an invoice email via Resend. Returns the Resend response on success
 * or throws an Error with `.status` set when something is misconfigured.
 *
 * The Resend client is injected for testability.
 */
async function sendInvoiceEmail(resendClient, {
  invoice,
  recipientEmail,
  businessName,
  senderName,
  customMessage
}) {
  if (!resendClient) {
    const err = new Error("Email service is not configured on this deployment.");
    err.status = 503;
    err.code = "email_not_configured";
    throw err;
  }
  if (!recipientEmail || typeof recipientEmail !== "string" || !recipientEmail.includes("@")) {
    const err = new Error("recipient email is required and must be a valid address.");
    err.status = 400;
    throw err;
  }

  const body = buildInvoiceEmailBody({ invoice, businessName, senderName, customMessage });
  const fromAddress = getInvoiceFromEmail();
  const replyTo = buildReplyToAddress(invoice.id);

  const payload = {
  from: fromAddress,
  to: recipientEmail,
  subject: body.subject,
  html: body.html,
  text: body.text
};

if (replyTo) {
  payload.replyTo = replyTo;
  payload.reply_to = replyTo;
}

console.log("[invoice-email] replyTo debug", {
  invoiceId: invoice.id,
  replyBase: getInvoiceReplyBaseEmail(),
  replyTo,
  replyToLocalLength: replyTo ? replyTo.split("@")[0].length : null,
  payloadReplyTo: payload.replyTo || null
});

const result = await resendClient.emails.send(payload);

if (result?.error) {
  const err = new Error(result.error.message || "Resend failed to send invoice email.");
  err.status = result.error.statusCode || 502;
  err.code = result.error.name || result.error.code || "resend_send_failed";
  err.details = result.error;
  throw err;
}

if (!result?.data?.id) {
  const err = new Error("Resend did not return a message id.");
  err.status = 502;
  err.code = "resend_missing_message_id";
  err.details = result || null;
  throw err;
}

return result;
}

module.exports = {
  buildInvoiceEmailBody,
  buildReplyToken,
  parseReplyToken,
  buildReplyToAddress,
  extractTokenFromRecipient,
  sendInvoiceEmail,
  getInvoiceFromEmail,
  getInvoiceReplyBaseEmail,
  __private: { formatCurrency, escapeHtml }
};
