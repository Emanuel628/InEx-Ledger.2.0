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
const {
  extractTokenFromRecipient,
  parseReplyToken
} = require("../services/invoiceEmailService.js");

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

function timingSafeStringEqual(a, b) {
  const ab = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  if (ab.length !== bb.length) return false;
  try {
    return crypto.timingSafeEqual(ab, bb);
  } catch (_) {
    return false;
  }
}

function pickRecipientList(payload) {
  const out = [];
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
  
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (typeof candidate === "string") {
      out.push(candidate);
    } else if (Array.isArray(candidate)) {
      for (const entry of candidate) {
        if (typeof entry === "string") out.push(entry);
        else if (entry?.email) out.push(entry.email);
        else if (entry?.address) out.push(entry.address);
        else if (entry?.raw) out.push(entry.raw);
        else if (entry?.value) out.push(entry.value);
        else if (entry?.name && entry?.email) out.push(`${entry.name} <${entry.email}>`);
      }
    } else if (candidate?.email) {
      out.push(candidate.email);
    }
    else if (candidate?.address) {
       out.push(candidate.address);
    } else if (candidate?.raw) {
       out.push(candidate.raw);
    } else if (candidate?.value) {
      out.push(candidate.value);
    }
  }
  return out;
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

  let cleaned = cutIndex >= 0 ? body.slice(0, cutIndex) : body;

  cleaned = cleaned
    .split("\n")
    .filter((line) => !line.trim().startsWith(">"))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned;
}

const INBOUND_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;
const INBOUND_REPLAY_TTL_MS = 5 * 60 * 1000;
const inboundReplayCache = new Map();

function pruneReplayCache(nowMs) {
  for (const [signature, recordedAt] of inboundReplayCache.entries()) {
    if (nowMs - recordedAt > INBOUND_REPLAY_TTL_MS) {
      inboundReplayCache.delete(signature);
    }
  }
}

function rememberSignature(signature, nowMs) {
  inboundReplayCache.set(signature, nowMs);
}

function hasSeenSignature(signature) {
  return inboundReplayCache.has(signature);
}

function computeInboundSignature(secret, timestampHeader, rawBody) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestampHeader}.${rawBody}`)
    .digest("hex");
}

function timingSafeHexEqual(a, b) {
  try {
    const ab = Buffer.from(String(a || ""), "hex");
    const bb = Buffer.from(String(b || ""), "hex");
    if (ab.length === 0 || ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  } catch (_) {
    return false;
  }
}

function rawBodyUtf8(req) {
  if (Buffer.isBuffer(req.body)) {
    return req.body.toString("utf8");
  }
  if (typeof req.body === "string") {
    return req.body;
  }
  return "";
}

function verifyInboundEmailRequest(req, nowMs = Date.now()) {
  const secret = String(process.env.INBOUND_EMAIL_WEBHOOK_SECRET || "").trim();
  
  if (!secret) {
    return { ok: false, status: 503, error: "Inbound email webhook is not configured." };
  }

  const rawBody = rawBodyUtf8(req);
  const timestampHeader = String(req.get("x-inbound-timestamp") || "").trim();
  const signatureHeader = String(req.get("x-inbound-signature") || "").trim();
  const legacySecretHeader = req.get("x-inbound-secret") || req.get("x-webhook-secret") || "";
  const allowLegacyFallback = process.env.NODE_ENV !== "production" || process.env.ALLOW_INBOUND_EMAIL_SECRET_FALLBACK === "true";

  if (timestampHeader || signatureHeader) {
    if (!timestampHeader || !signatureHeader) {
      return { ok: false, status: 400, error: "Missing webhook signature headers." };
    }

    const timestampSeconds = Number.parseInt(timestampHeader, 10);
    if (!Number.isFinite(timestampSeconds) || timestampSeconds <= 0) {
      return { ok: false, status: 400, error: "Malformed webhook timestamp." };
    }

    const nowSeconds = Math.floor(nowMs / 1000);
    if (Math.abs(nowSeconds - timestampSeconds) > INBOUND_TIMESTAMP_TOLERANCE_SECONDS) {
      return { ok: false, status: 401, error: "Webhook timestamp outside tolerance window." };
    }

    const expectedSignature = computeInboundSignature(secret, timestampHeader, rawBody);
    if (!timingSafeHexEqual(signatureHeader, expectedSignature)) {
      return { ok: false, status: 401, error: "Invalid webhook signature." };
    }

    pruneReplayCache(nowMs);
    if (hasSeenSignature(signatureHeader)) {
      return { ok: false, status: 409, error: "Replayed webhook signature." };
    }
    rememberSignature(signatureHeader, nowMs);
  } else if (allowLegacyFallback && legacySecretHeader) {
    // Dev-only fallback: pre-signing clients (local scripts, manual smoke
    // tests) may still send the static secret. Never accepted in production.
    if (!timingSafeStringEqual(legacySecretHeader, secret)) {
      return { ok: false, status: 401, error: "Invalid webhook secret." };
    }
  } else {
    return { ok: false, status: 401, error: "Missing webhook signature." };
  }

  let payload = {};
  if (rawBody) {
    try {
      payload = JSON.parse(rawBody);
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
        return { ok: false, status: 400, error: "Webhook payload must be a JSON object." };
      }
    } catch (_) {
      return { ok: false, status: 400, error: "Webhook payload is not valid JSON." };
    }
  }

  return { ok: true, payload };
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
router.post("/inbound", async (req, res) => {
  const verification = verifyInboundEmailRequest(req);
  if (!verification.ok) {
    logWarn("inbound email webhook rejected", {
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
  for (const recipient of recipients) {
    const token = extractTokenFromRecipient(recipient);
    if (!token) continue;
    const candidate = parseReplyToken(token);
    if (candidate) {
      invoiceId = candidate;
      break;
    }
  }

  if (!invoiceId) {
    logWarn("inbound email webhook: no matching reply token", { recipients });
    return res.status(200).json({ ok: true, ignored: "no_matching_invoice" });
  }

  try {
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
    const invoice = invoiceResult.rows[0];
    const ownerId = invoice.owner_id;
    if (!ownerId) {
      logWarn("inbound email webhook: business has no owner", { invoiceId });
      return res.status(200).json({ ok: true, ignored: "no_owner" });
    }

const from = pickFromAddress(receivedEmail || payload);
    const subject = String(
  receivedEmail?.subject ||
  payload?.subject ||
  payload?.data?.subject ||
  `Re: Invoice ${invoice.invoice_number}`
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
    external_sender_email, external_sender_name, invoice_id,
    external_message_id, external_references, external_in_reply_to)
 VALUES ($1, NULL, $2, 'invoice_reply', $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        messageId,
        ownerId,
        subject,
        body,
        from.email,
        from.name,
        invoice.id,
        receivedEmail?.message_id || payload?.data?.message_id || null,
        receivedEmail?.headers?.references || receivedEmail?.headers?.References || null,
        receivedEmail?.headers?.in_reply_to || receivedEmail?.headers?.["In-Reply-To"] || null
      ]
    );

    logInfo("inbound email webhook: invoice reply stored", {
  invoiceId: invoice.id,
  messageId,
  from: from.email,
  fetchedBody: !!receivedEmail,
  bodyLength: body.length
    });

    res.json({
      ok: true,
      invoice_id: invoice.id,
      message_id: messageId
    });
  } catch (err) {
    logError("inbound email webhook error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to process inbound email." });
  }
});

module.exports = router;
