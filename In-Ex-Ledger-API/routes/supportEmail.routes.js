"use strict";

const express = require("express");
const crypto = require("crypto");
const { Resend } = require("resend");
const { pool } = require("../db.js");
const { logError, logWarn, logInfo } = require("../utils/logger.js");
const {
  parseSupportReplyToken
} = require("../services/supportEmailService.js");

const router = express.Router();

const INBOUND_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;
const INBOUND_REPLAY_TTL_MS = 5 * 60 * 1000;
const inboundReplayCache = new Map();

function getResendClient() {
  const key = String(process.env.RESEND_API_KEY || "").trim();
  if (!key) return null;
  return new Resend(key);
}

function rawBodyUtf8(req) {
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  if (typeof req.body === "string") return req.body;
  return "";
}

function timingSafeB64Equal(a, b) {
  try {
    const ab = Buffer.from(String(a || ""), "base64");
    const bb = Buffer.from(String(b || ""), "base64");
    if (ab.length === 0 || ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  } catch (_) {
    return false;
  }
}

function verifySvixSignature(secret, svixId, svixTimestamp, svixSignature, rawBody) {
  const keyMaterial = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;

  let keyBytes;
  try {
    keyBytes = Buffer.from(keyMaterial, "base64");
  } catch (_) {
    return false;
  }

  if (!keyBytes.length) return false;

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", keyBytes).update(signedContent).digest("base64");

  const provided = String(svixSignature || "")
    .split(" ")
    .map((part) => (part.includes(",") ? part.split(",")[1] : part))
    .filter(Boolean);

  return provided.some((sig) => timingSafeB64Equal(sig, expected));
}

function pruneReplayCache(nowMs) {
  for (const [signature, recordedAt] of inboundReplayCache.entries()) {
    if (nowMs - recordedAt > INBOUND_REPLAY_TTL_MS) {
      inboundReplayCache.delete(signature);
    }
  }
}

function verifySupportInboundRequest(req, nowMs = Date.now()) {
  const secret = String(process.env.SUPPORT_INBOUND_WEBHOOK_SECRET || process.env.INBOUND_EMAIL_WEBHOOK_SECRET || "").trim();

  if (!secret) {
    return { ok: false, status: 503, error: "Support inbound webhook is not configured." };
  }

  const rawBody = rawBodyUtf8(req);
  const svixId = String(req.get("svix-id") || "").trim();
  const svixTimestamp = String(req.get("svix-timestamp") || "").trim();
  const svixSignature = String(req.get("svix-signature") || "").trim();

  if (!svixId || !svixTimestamp || !svixSignature) {
    return { ok: false, status: 401, error: "Missing support webhook signature." };
  }

  const timestampSeconds = Number.parseInt(svixTimestamp, 10);
  if (!Number.isFinite(timestampSeconds) || timestampSeconds <= 0) {
    return { ok: false, status: 400, error: "Malformed support webhook timestamp." };
  }

  const nowSeconds = Math.floor(nowMs / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > INBOUND_TIMESTAMP_TOLERANCE_SECONDS) {
    return { ok: false, status: 401, error: "Support webhook timestamp outside tolerance window." };
  }

  if (!verifySvixSignature(secret, svixId, svixTimestamp, svixSignature, rawBody)) {
    return { ok: false, status: 401, error: "Invalid support webhook signature." };
  }

  pruneReplayCache(nowMs);
  const replayKey = `support-svix:${svixId}`;
  if (inboundReplayCache.has(replayKey)) {
    return { ok: false, status: 409, error: "Replayed support webhook signature." };
  }
  inboundReplayCache.set(replayKey, nowMs);

  let payload = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch (_) {
    return { ok: false, status: 400, error: "Support webhook payload is not valid JSON." };
  }

  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, status: 400, error: "Support webhook payload must be a JSON object." };
  }

  return { ok: true, payload };
}

function pickRecipientList(payload) {
  const out = [];

  function collect(value) {
    if (!value) return;

    if (typeof value === "string") {
      out.push(value);
      return;
    }

    if (Array.isArray(value)) {
      for (const entry of value) collect(entry);
      return;
    }

    if (value.email) collect(value.email);
    if (value.address) collect(value.address);
    if (value.raw) collect(value.raw);
    if (value.text) collect(value.text);
    if (value.value) collect(value.value);
    if (value.to) collect(value.to);
    if (value.recipients) collect(value.recipients);
    if (value.rcpt_to) collect(value.rcpt_to);
  }

  const candidates = [
    payload?.to,
    payload?.data?.to,
    payload?.recipient,
    payload?.data?.recipient,
    payload?.recipients,
    payload?.data?.recipients,
    payload?.envelope?.to,
    payload?.data?.envelope?.to,
    payload?.envelope?.recipients,
    payload?.data?.envelope?.recipients,
    payload?.envelope?.rcpt_to,
    payload?.data?.envelope?.rcpt_to,
    payload?.headers?.to,
    payload?.headers?.To,
    payload?.data?.headers?.to,
    payload?.data?.headers?.To
  ];

  for (const candidate of candidates) collect(candidate);

  return [...new Set(out.map((item) => String(item).trim()).filter(Boolean))];
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

function pickFromAddress(payload) {
  const f = payload?.from || payload?.data?.from;
  if (typeof f === "string") return { email: f, name: null };
  if (Array.isArray(f) && f[0]) return { email: f[0].email || f[0].address || null, name: f[0].name || null };
  if (f?.email) return { email: f.email, name: f.name || null };
  if (f?.address) return { email: f.address, name: f.name || null };
  return { email: null, name: null };
}

function pickBody(payload) {
  return String(payload?.text || payload?.plain || payload?.body || "")
    .slice(0, 50000)
    || String(payload?.html || "").slice(0, 50000);
}

function cleanInboundReplyBody(rawBody) {
  const body = String(rawBody || "").replace(/\r\n/g, "\n").trim();
  if (!body) return "";

  const cutMarkers = [
    /^On .+ wrote:$/im,
    /^From:\s.+$/im,
    /^Sent:\s.+$/im,
    /^To:\s.+$/im,
    /^Subject:\s.+$/im,
    /^-{2,}\s*Original Message\s*-{2,}$/im,
    /^_{5,}$/im
  ];

  let cutIndex = -1;

  for (const marker of cutMarkers) {
    const match = body.match(marker);
    if (match && typeof match.index === "number") {
      if (cutIndex === -1 || match.index < cutIndex) {
        cutIndex = match.index;
      }
    }
  }

  return (cutIndex >= 0 ? body.slice(0, cutIndex) : body)
    .split("\n")
    .filter((line) => !line.trim().startsWith(">"))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

router.post("/inbound", async (req, res) => {
  const verification = verifySupportInboundRequest(req);

  if (!verification.ok) {
    logWarn("support inbound email webhook rejected", {
      status: verification.status,
      reason: verification.error
    });
    return res.status(verification.status).json({ ok: false, error: verification.error });
  }

  const payload = verification.payload || {};

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
    logWarn("support inbound email webhook: no matching support token", { recipients });
    return res.status(200).json({ ok: true, ignored: "no_matching_support_token" });
  }

  try {
    const originalResult = await pool.query(
      `SELECT id, sender_id, subject
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
          external_message_id, external_references, external_in_reply_to)
       VALUES ($1, NULL, $2, 'it_support', $3, $4, FALSE, $5, $6, $7, $8, $9, $10)`,
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
        receivedEmail?.headers?.in_reply_to || receivedEmail?.headers?.["In-Reply-To"] || null
      ]
    );

    logInfo("support inbound email webhook: support reply stored", {
      supportMessageId,
      messageId,
      from: from.email,
      bodyLength: body.length
    });

    return res.json({
      ok: true,
      support_message_id: supportMessageId,
      message_id: messageId
    });
  } catch (err) {
    logError("support inbound email webhook error:", err.message);
    return res.status(500).json({ ok: false, error: "Failed to process inbound support email." });
  }
});

module.exports = router;
