"use strict";

const express = require("express");
const crypto = require("crypto");
const { Resend } = require("resend");
const { pool } = require("../db.js");
const { logError, logWarn, logInfo } = require("../utils/logger.js");
const { asyncRoute } = require("../utils/apiError.js");
const {
  parseSupportReplyToken
} = require("../services/supportEmailService.js");
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

// Preserves this route's original error wording while now pooling secrets
// from both SUPPORT_INBOUND_WEBHOOK_SECRET and INBOUND_EMAIL_WEBHOOK_SECRET
// (each may hold multiple comma-separated values for zero-downtime rotation)
// — matching the multi-secret rotation support routes/email.routes.js already had.
const supportInboundWebhookVerifier = createInboundWebhookVerifier({
  envVarNames: ["SUPPORT_INBOUND_WEBHOOK_SECRET", "INBOUND_EMAIL_WEBHOOK_SECRET"],
  messages: {
    unconfigured: "Support inbound webhook is not configured.",
    malformedTimestamp: "Malformed support webhook timestamp.",
    toleranceWindow: "Support webhook timestamp outside tolerance window.",
    invalidSignature: "Invalid support webhook signature.",
    replayed: "Replayed support webhook signature.",
    missingSignatureHeaders: "Missing support webhook signature headers.",
    invalidSecret: "Invalid support webhook secret.",
    missingSignature: "Missing support webhook signature.",
    invalidJson: "Support webhook payload is not valid JSON.",
    invalidPayloadShape: "Support webhook payload must be a JSON object."
  }
});

function verifySupportInboundRequest(req, nowMs = Date.now()) {
  return supportInboundWebhookVerifier.verify(req, nowMs);
}

function extractTokenFromRecipient(recipient) {
  const raw = String(recipient || "");
  const match = raw.match(/<([^>]+)>/);
  const address = (match ? match[1] : raw).trim();
  const at = address.lastIndexOf("@");
  if (at < 1) return null;

  const local = address.slice(0, at);
  const plus = local.indexOf("+");
  if (plus < 0) return null;

  return local.slice(plus + 1);
}

async function fetchReceivedEmailContent(payload) {
  const emailId = payload?.data?.email_id || payload?.email_id;
  if (!emailId) return null;

  const resend = getResendClient();
  if (!resend || !resend.emails?.receiving?.get) return null;

  const result = await resend.emails.receiving.get(emailId);

  if (result?.error) {
    const err = new Error(result.error.message || "Failed to fetch support reply content.");
    err.details = result.error;
    throw err;
  }

  return result?.data || null;
}

router.post("/inbound", asyncRoute(async (req, res) => {
  const verification = verifySupportInboundRequest(req);

  if (!verification.ok) {
    logWarn("support inbound email webhook rejected", {
      status: verification.status,
      reason: verification.error,
      caller: describeInboundCaller(req)
    });
    return res.status(verification.status).json({ ok: false, error: verification.error });
  }

  const payload = verification.payload || {};
  logInfo("support inbound email webhook accepted", {
    caller: describeInboundCaller(req),
    payloadKeys: Object.keys(payload || {}),
    dataKeys: Object.keys(payload?.data || {})
  });

  let receivedEmail = null;
  try {
    receivedEmail = await fetchReceivedEmailContent(payload);
  } catch (err) {
    logWarn("support inbound email webhook: failed to fetch received email content", {
      message: err?.message || String(err),
      emailId: payload?.data?.email_id || payload?.email_id || null
    });
  }

  const recipients = [
    ...pickRecipientList(payload),
    ...pickRecipientList(receivedEmail || {})
  ];

  if (!recipients.length) {
    logWarn("support inbound email webhook: no recipients found");
    return res.status(200).json({ ok: true, ignored: "no_recipients" });
  }

  let supportMessageId = null;

  for (const recipient of recipients) {
    const token = extractTokenFromRecipient(recipient);
    if (!token) continue;

    const candidate = parseSupportReplyToken(token);
    if (candidate) {
      supportMessageId = candidate;
      break;
    }
  }

  if (!supportMessageId) {
    logWarn("support inbound email webhook: no matching support token", { recipients: maskRecipientList(recipients) });
    return res.status(200).json({ ok: true, ignored: "no_matching_support_token" });
  }

  try {
    const originalResult = await pool.query(
      `SELECT id, sender_id, subject, business_id
         FROM messages
        WHERE id = $1
          AND message_type = 'support_request'
        LIMIT 1`,
      [supportMessageId]
    );

    if (!originalResult.rowCount) {
      logWarn("support inbound email webhook: support request not found", { supportMessageId });
      return res.status(200).json({ ok: true, ignored: "support_request_not_found" });
    }

    const original = originalResult.rows[0];
    const ownerId = original.sender_id;

    if (!ownerId) {
      logWarn("support inbound email webhook: support request has no sender", { supportMessageId });
      return res.status(200).json({ ok: true, ignored: "support_request_no_sender" });
    }

    const from = pickFromAddress(receivedEmail || payload);

    const subject = String(
      receivedEmail?.subject ||
      payload?.subject ||
      payload?.data?.subject ||
      `Re: ${original.subject || "Support Request"}`
    ).slice(0, 200);

    const rawBody =
      String(receivedEmail?.text || "").trim() ||
      String(receivedEmail?.html || "").trim() ||
      pickBody(payload).trim();

    const body =
      cleanInboundReplyBody(rawBody).slice(0, 50000) ||
      "(support reply received — body not included in inbound metadata)";

    const messageId = crypto.randomUUID();

    await pool.query(
      `INSERT INTO messages
         (id, sender_id, receiver_id, message_type, subject, body,
          is_read, parent_id,
          external_sender_email, external_sender_name,
          external_message_id, external_references, external_in_reply_to, business_id)
       VALUES ($1, NULL, $2, 'it_support', $3, $4, FALSE, $5, $6, $7, $8, $9, $10, $11)`,
      [
        messageId,
        ownerId,
        subject,
        body,
        supportMessageId,
        from.email,
        from.name,
        receivedEmail?.message_id || payload?.data?.message_id || null,
        receivedEmail?.headers?.references || receivedEmail?.headers?.References || null,
        receivedEmail?.headers?.in_reply_to || receivedEmail?.headers?.["In-Reply-To"] || null,
        original.business_id || null
      ]
    );

    logInfo("support inbound email webhook: support reply stored", {
      supportMessageId,
      messageId,
      from: maskEmailLike(from.email),
      bodyLength: body.length
    });

    return res.json({
      ok: true,
      support_message_id: supportMessageId,
      message_id: messageId
    });
  } catch (err) {
    throw err;
  }
}));

router.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    logError("support inbound email webhook error:", err.message);
  }
  const error = status < 500 ? err.message : "Internal server error";
  res.status(status).json({ ok: false, error });
});

module.exports = router;
