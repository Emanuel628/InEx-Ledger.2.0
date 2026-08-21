"use strict";

/**
 * Inbound email webhook. Designed to accept a Resend-style inbound payload:
 *
 *   {
 *     "from": { "email": "client@example.com", "name": "Client Co" },
 *     "to":   [{ "email": "invoices+<token>@inexledger.com" }],
 *     "subject": "Re: Invoice INV-2026-0001",
 *     "text":   "Plain text body...",
 *     "html":   "<p>HTML body...</p>"
 *   }
 *
 * We extract the reply token from any recipient that matches the
 * plus-addressing pattern, validate it against the HMAC secret,
 * load the invoice, and insert an 'invoice_reply' message owned by the
 * invoice's business owner (so it appears in their Messages page).
 *
 * Signed-webhook contract (production-required):
 *   - INBOUND_EMAIL_WEBHOOK_SECRET must be set; otherwise 503.
 *   - The webhook source must send two headers:
 *       x-inbound-timestamp : Unix seconds when the payload was signed.
 *       x-inbound-signature : HMAC-SHA256 hex of `${timestamp}.${rawBodyUtf8}`
 *                             using INBOUND_EMAIL_WEBHOOK_SECRET.
 *   - Requests older than 5 minutes are rejected (clock skew tolerance).
 *   - Each signature is single-use within a 5-minute window (replay cache).
 *   - JSON parsing happens only after the signature check succeeds.
 *
 * For local development outside production, a legacy `X-Inbound-Secret`
 * header is still honoured as a fallback so smoke tests against a
 * local instance don't have to compute HMACs. This fallback is rejected
 * when NODE_ENV === "production".
 */

const express = require("express");
const crypto = require("crypto");
const { Resend } = require("resend");
const { pool } = require("../db.js");
const { logError, logWarn, logInfo } = require("../utils/logger.js");
const { asyncRoute } = require("../utils/apiError.js");
const {
  extractTokenFromRecipient,
  parseReplyToken
} = require("../services/invoiceEmailService.js");
const { parseSupportReplyToken } = require("../services/supportEmailService.js");
const { sendInvoiceOwnerActivityEmail } = require("../services/invoiceOwnerEmailService.js");
const {
  maskEmailLike,
  maskRecipientList,
  pickRecipientList,
  pickFromAddress,
  pickBody,
  cleanInboundReplyBody,
  describeInboundCaller,
  createInboundWebhookVerifier
} = require("../services/inboundWebhookVerificationService.js");

const router = express.Router();
function getResendClient() {
  const key = String(process.env.RESEND_API_KEY || "").trim();
  if (!key) return null;
  return new Resend(key);
}

async function fetchReceivedEmailContent(payload) {
  const emailId = payload?.data?.email_id || payload?.email_id;
  if (!emailId) {
    logWarn("inbound email webhook: missing email_id", {
      payloadKeys: Object.keys(payload || {}),
      dataKeys: Object.keys(payload?.data || {})
    });
    return null;
  }

  const resend = getResendClient();
  if (!resend) {
    logWarn("inbound email webhook: Resend client unavailable");
    return null;
  }

  logInfo("inbound email webhook: Resend receiving client shape", {
    hasEmails: !!resend.emails,
    hasReceiving: !!resend.emails?.receiving,
    emailMethods: resend.emails ? Object.keys(resend.emails) : [],
    receivingMethods: resend.emails?.receiving ? Object.keys(resend.emails.receiving) : []
  });

  if (!resend.emails?.receiving?.get) {
    logWarn("inbound email webhook: Resend receiving get method unavailable", {
      emailId
    });
    return null;
  }

  const result = await resend.emails.receiving.get(emailId);

  if (result?.error) {
    const err = new Error(result.error.message || "Failed to fetch received email content.");
    err.details = result.error;
    throw err;
  }

  logInfo("inbound email webhook: received email content fetched", {
    emailId,
    hasData: !!result?.data,
    dataKeys: result?.data ? Object.keys(result.data) : [],
    textLength: String(result?.data?.text || "").length,
    htmlLength: String(result?.data?.html || "").length
  });

  return result?.data || null;
}

function buildInboundNotification({ invoice, from, subject, body }) {
  const senderLabel = from?.name
    ? `${from.name} <${from.email || ""}>`.trim()
    : (from?.email || "External sender");

  if (invoice) {
    return {
      subject: `New invoice reply: ${invoice.invoice_number || "Invoice"}`.slice(0, 200),
      body: [
        `${senderLabel} replied to ${invoice.invoice_number || "an invoice"}.`,
        "",
        `Subject: ${subject}`,
        "",
        body
      ].join("\n").slice(0, 10000)
    };
  }

  return {
    subject: "New support reply".slice(0, 200),
    body: [
      `${senderLabel} replied to your support thread.`,
      "",
      `Subject: ${subject}`,
      "",
      body
    ].join("\n").slice(0, 10000)
  };
}

// Secrets from both INBOUND_EMAIL_WEBHOOK_SECRET and SUPPORT_INBOUND_WEBHOOK_SECRET
// (each may hold multiple comma-separated values for zero-downtime rotation)
// are pooled together, so this endpoint accepts either family of secret.
const inboundEmailWebhookVerifier = createInboundWebhookVerifier({
  envVarNames: ["INBOUND_EMAIL_WEBHOOK_SECRET", "SUPPORT_INBOUND_WEBHOOK_SECRET"]
});

function verifyInboundEmailRequest(req, nowMs = Date.now()) {
  return inboundEmailWebhookVerifier.verify(req, nowMs);
}

/**
 * POST /api/email/inbound
 * Public webhook entry point.
 *
 * Body is consumed as a raw Buffer via the path-specific `express.raw`
 * middleware registered in server.js (mirroring the Stripe webhook).
 * The standalone email-route tests build their own app and must
 * register the same raw parser before any global JSON parser.
 */
router.post("/inbound", asyncRoute(async (req, res) => {
  const verification = verifyInboundEmailRequest(req);
  if (!verification.ok) {
    logWarn("inbound email webhook rejected", {
      status: verification.status,
      reason: verification.error,
      caller: describeInboundCaller(req)
    });
    return res.status(verification.status).json({ ok: false, error: verification.error });
  }

    const payload = verification.payload || {};

  let receivedEmail = null;
  try {
    receivedEmail = await fetchReceivedEmailContent(payload);
  } catch (err) {
    logWarn("inbound email webhook: failed to fetch received email content", {
      message: err?.message || String(err),
      emailId: payload?.data?.email_id || payload?.email_id || null
    });
  }

  const recipients = [
    ...pickRecipientList(payload),
    ...pickRecipientList(receivedEmail || {})
  ];

  if (!recipients.length) {
    logWarn("inbound email webhook: no recipients in payload or fetched email", {
      payloadKeys: Object.keys(payload || {}),
      dataKeys: Object.keys(payload?.data || {}),
      fetchedEmail: !!receivedEmail,
      fetchedEmailKeys: receivedEmail ? Object.keys(receivedEmail) : []
    });
    return res.status(200).json({ ok: true, ignored: "no_recipients" });
  }

  let invoiceId = null;
  let supportThreadId = null;
  for (const recipient of recipients) {
    const token = extractTokenFromRecipient(recipient);
    if (!token) continue;
    const invoiceCandidate = parseReplyToken(token);
    if (invoiceCandidate) {
      invoiceId = invoiceCandidate;
      break;
    }
    const supportCandidate = parseSupportReplyToken(token);
    if (supportCandidate) {
      supportThreadId = supportCandidate;
      break;
    }
  }

  if (!invoiceId && !supportThreadId) {
    logWarn("inbound email webhook: no matching reply token", { recipients: maskRecipientList(recipients) });
    return res.status(200).json({ ok: true, ignored: "no_matching_invoice" });
  }

  try {
    let invoice = null;
    let ownerId = null;
    let rootMessageId = supportThreadId || null;
    let threadBusinessId = null;

    if (invoiceId) {
      const invoiceResult = await pool.query(
        `SELECT i.id, i.invoice_number, i.business_id, b.user_id AS owner_id
           FROM invoices_v1 i
           JOIN businesses b ON b.id = i.business_id
          WHERE i.id = $1
          LIMIT 1`,
        [invoiceId]
      );
      if (!invoiceResult.rowCount) {
        logWarn("inbound email webhook: invoice not found", { invoiceId });
        return res.status(200).json({ ok: true, ignored: "invoice_not_found" });
      }
      invoice = invoiceResult.rows[0];
      ownerId = invoice.owner_id;
      threadBusinessId = invoice.business_id || null;
      if (!ownerId) {
        logWarn("inbound email webhook: business has no owner", { invoiceId });
        return res.status(200).json({ ok: true, ignored: "no_owner" });
      }
    } else {
      const supportThreadResult = await pool.query(
        `SELECT id, sender_id, business_id
           FROM messages
          WHERE id = $1
          LIMIT 1`,
        [supportThreadId]
      );
      if (!supportThreadResult.rowCount) {
        logWarn("inbound email webhook: support thread not found", { supportThreadId });
        return res.status(200).json({ ok: true, ignored: "support_thread_not_found" });
      }
      ownerId = supportThreadResult.rows[0].sender_id || null;
      rootMessageId = supportThreadResult.rows[0].id;
      threadBusinessId = supportThreadResult.rows[0].business_id || null;
      if (!ownerId) {
        logWarn("inbound email webhook: support thread missing owner", { supportThreadId });
        return res.status(200).json({ ok: true, ignored: "no_owner" });
      }
    }

const from = pickFromAddress(receivedEmail || payload);
    const subject = String(
  receivedEmail?.subject ||
  payload?.subject ||
  payload?.data?.subject ||
  (invoice ? `Re: Invoice ${invoice.invoice_number}` : "Re: Support Request")
).slice(0, 200);

const rawBody =
  String(receivedEmail?.text || "").trim() ||
  String(receivedEmail?.html || "").trim() ||
  pickBody(payload).trim();

const body =
  cleanInboundReplyBody(rawBody).slice(0, 50000) ||
  "(reply received — body not included in Resend webhook metadata)";

    const messageId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO messages
   (id, sender_id, receiver_id, message_type, subject, body,
    external_sender_email, external_sender_name, invoice_id, parent_id,
    external_message_id, external_references, external_in_reply_to, business_id)
 VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        messageId,
        ownerId,
        invoice ? "invoice_reply" : "it_support",
        subject,
        body,
        from.email,
        from.name,
        invoice?.id || null,
        rootMessageId,
        receivedEmail?.message_id || payload?.data?.message_id || null,
        receivedEmail?.headers?.references || receivedEmail?.headers?.References || null,
        receivedEmail?.headers?.in_reply_to || receivedEmail?.headers?.["In-Reply-To"] || null,
        threadBusinessId
      ]
    );

    const notification = buildInboundNotification({ invoice, from, subject, body });
    await pool.query(
      `INSERT INTO messages
   (id, sender_id, receiver_id, message_type, subject, body,
    external_sender_email, external_sender_name, is_read, business_id)
 VALUES ($1, NULL, $2, 'notification', $3, $4, $5, $6, FALSE, $7)`,
      [
        crypto.randomUUID(),
        ownerId,
        notification.subject,
        notification.body,
        from.email,
        from.name,
        threadBusinessId
      ]
    );

    logInfo("inbound email webhook: external reply stored", {
  invoiceId: invoice?.id || null,
  supportThreadId: rootMessageId,
  messageId,
  from: maskEmailLike(from.email),
  fetchedBody: !!receivedEmail,
  bodyLength: body.length
    });
    if (invoice) {
      await sendInvoiceOwnerActivityEmail({
        businessId: invoice.business_id,
        kind: "replied",
        userId: ownerId,
        actionUrl: "/messages",
        details: [
          { label: "Invoice", value: invoice.invoice_number || "Invoice" },
          ...(from.name ? [{ label: "From", value: `${from.name} <${from.email || ""}>`.trim() }] : from.email ? [{ label: "From", value: from.email }] : []),
          { label: "Subject", value: subject.slice(0, 120) },
          { label: "Reply preview", value: body.slice(0, 180) }
        ]
      });
    }

    res.json({
      ok: true,
      invoice_id: invoice?.id || null,
      support_thread_id: rootMessageId,
      message_id: messageId
    });
  } catch (err) {
    throw err;
  }
}));

router.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    logError("inbound email webhook error:", err.message);
  }
  const error = status < 500 ? err.message : "Internal server error";
  res.status(status).json({ ok: false, error });
});

module.exports = router;
