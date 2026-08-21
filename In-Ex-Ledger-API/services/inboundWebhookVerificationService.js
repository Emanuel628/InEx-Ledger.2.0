"use strict";

/**
 * Shared inbound-webhook security logic for the two inbound email routes
 * (routes/email.routes.js and routes/supportEmail.routes.js): HMAC/Svix
 * signature verification, replay-protection caching, secret rotation, and
 * the address/body parsing helpers both routes need once a request has been
 * verified.
 *
 * Signed-webhook contract (shared by both routes):
 *   - At least one configured secret is required; otherwise 503.
 *   - The webhook source sends either Svix headers (svix-id / svix-timestamp
 *     / svix-signature, as used by Resend) or the legacy pair:
 *       x-inbound-timestamp : Unix seconds when the payload was signed.
 *       x-inbound-signature : HMAC-SHA256 hex of `${timestamp}.${rawBodyUtf8}`.
 *   - Requests older than 5 minutes are rejected (clock skew tolerance).
 *   - Each signature is single-use within a 5-minute window (replay cache).
 *   - JSON parsing happens only after the signature check succeeds.
 *   - Outside production (or with ALLOW_INBOUND_EMAIL_SECRET_FALLBACK=true),
 *     a legacy `X-Inbound-Secret` / `X-Webhook-Secret` header is honoured as
 *     a fallback so smoke tests against a local instance don't have to
 *     compute HMACs.
 *
 * Multiple comma-separated secrets may be configured per env var (and
 * secrets from every configured env var are pooled together) to support
 * zero-downtime key rotation: a request signed with any configured secret
 * is accepted.
 */

const crypto = require("crypto");

const DEFAULT_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;
const DEFAULT_REPLAY_TTL_MS = 5 * 60 * 1000;

const DEFAULT_MESSAGES = {
  unconfigured: "Inbound email webhook is not configured.",
  malformedTimestamp: "Malformed webhook timestamp.",
  toleranceWindow: "Webhook timestamp outside tolerance window.",
  invalidSignature: "Invalid webhook signature.",
  replayed: "Replayed webhook signature.",
  missingSignatureHeaders: "Missing webhook signature headers.",
  invalidSecret: "Invalid webhook secret.",
  missingSignature: "Missing webhook signature.",
  invalidJson: "Webhook payload is not valid JSON.",
  invalidPayloadShape: "Webhook payload must be a JSON object."
};

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

function computeInboundSignature(secret, timestampHeader, rawBody) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestampHeader}.${rawBody}`)
    .digest("hex");
}

// Resend signs inbound webhooks with Svix (https://docs.svix.com). The request
// carries three headers — svix-id, svix-timestamp and svix-signature — where
// svix-signature is a space-delimited list of "v1,<base64sig>" entries. The
// signing secret looks like "whsec_<base64>"; the bytes after the prefix are
// the HMAC-SHA256 key. The signed content is `${id}.${timestamp}.${rawBody}`.
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

function rawBodyUtf8(req) {
  if (Buffer.isBuffer(req.body)) {
    return req.body.toString("utf8");
  }
  if (typeof req.body === "string") {
    return req.body;
  }
  return "";
}

function maskEmailLike(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/<([^>]+)>/);
  const address = (match ? match[1] : raw).trim().toLowerCase();
  const [local, domain] = address.split("@");
  if (!local || !domain) {
    return raw.slice(0, 3) + "***";
  }
  const localPrefix = local.length <= 2 ? `${local[0] || "*"}*` : `${local.slice(0, 2)}***`;
  const domainParts = domain.split(".");
  const domainName = domainParts.shift() || "";
  const maskedDomain = domainName.length <= 2 ? `${domainName[0] || "*"}*` : `${domainName.slice(0, 2)}***`;
  return `${localPrefix}@${[maskedDomain, ...domainParts].join(".")}`;
}

function maskRecipientList(recipients = []) {
  return recipients.map((recipient) => maskEmailLike(recipient)).filter(Boolean);
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
      for (const entry of value) {
        collect(entry);
      }
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

  for (const candidate of candidates) {
    collect(candidate);
  }

  return [...new Set(out.map((item) => String(item).trim()).filter(Boolean))];
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

/**
 * Describe who is calling an inbound webhook, for diagnostics. Captures the
 * caller's User-Agent and source IP plus WHICH signature-header family is
 * present — never the secret or signature values themselves. This lets us
 * identify the forwarder/service posting to the endpoint when requests are
 * rejected.
 */
function describeInboundCaller(req) {
  const forwardedFor = String(req.get("x-forwarded-for") || "").trim();
  return {
    userAgent: req.get("user-agent") || null,
    ip: req.ip || null,
    hasForwardedFor: Boolean(forwardedFor),
    forwardedForHopCount: forwardedFor ? forwardedFor.split(",").map((part) => part.trim()).filter(Boolean).length : 0,
    // Header families present (booleans only — values are never logged):
    hasSvixHeaders: Boolean(req.get("svix-signature") || req.get("svix-id")),
    hasCustomHeaders: Boolean(req.get("x-inbound-signature") || req.get("x-inbound-timestamp")),
    hasLegacyHeaders: Boolean(req.get("x-inbound-secret") || req.get("x-webhook-secret"))
  };
}

/**
 * Resolves the pool of accepted secrets from one or more env vars, supporting
 * comma-separated values within each var so a single var can carry multiple
 * secrets during rotation. Secrets from every listed env var are pooled
 * together (deduplicated) — a request signed with any of them is accepted.
 */
function resolveWebhookSecrets(envVarNames) {
  const names = Array.isArray(envVarNames) ? envVarNames : [envVarNames];

  return [...new Set(
    names
      .map((name) => process.env[name])
      .flatMap((value) => String(value || "").split(","))
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  )];
}

/**
 * Builds an independent inbound-webhook verifier: its own replay cache plus
 * a `verify(req, nowMs)` function implementing the shared signature-checking
 * contract described above. Each call site (one per route) should call this
 * once at module load time so replay caches stay isolated per route.
 *
 * @param {object} options
 * @param {string|string[]} options.envVarNames  Env var name(s) whose values
 *   (comma-separated secrets allowed, pooled across all listed vars) are
 *   accepted as signing secrets.
 * @param {number} [options.timestampToleranceSeconds]
 * @param {number} [options.replayTtlMs]
 * @param {object} [options.messages]  Overrides for any of DEFAULT_MESSAGES,
 *   so each route can preserve its own wording.
 */
function createInboundWebhookVerifier({
  envVarNames,
  timestampToleranceSeconds = DEFAULT_TIMESTAMP_TOLERANCE_SECONDS,
  replayTtlMs = DEFAULT_REPLAY_TTL_MS,
  messages = {}
} = {}) {
  const text = { ...DEFAULT_MESSAGES, ...messages };
  const replayCache = new Map();

  function pruneReplayCache(nowMs) {
    for (const [signature, recordedAt] of replayCache.entries()) {
      if (nowMs - recordedAt > replayTtlMs) {
        replayCache.delete(signature);
      }
    }
  }

  function hasSeenSignature(key) {
    return replayCache.has(key);
  }

  function rememberSignature(key, nowMs) {
    replayCache.set(key, nowMs);
  }

  function verify(req, nowMs = Date.now()) {
    const secrets = resolveWebhookSecrets(envVarNames);

    if (!secrets.length) {
      return { ok: false, status: 503, error: text.unconfigured };
    }

    const rawBody = rawBodyUtf8(req);
    const svixId = String(req.get("svix-id") || "").trim();
    const svixTimestamp = String(req.get("svix-timestamp") || "").trim();
    const svixSignature = String(req.get("svix-signature") || "").trim();
    const timestampHeader = String(req.get("x-inbound-timestamp") || "").trim();
    const signatureHeader = String(req.get("x-inbound-signature") || "").trim();
    const legacySecretHeader = req.get("x-inbound-secret") || req.get("x-webhook-secret") || "";
    const allowLegacyFallback = process.env.NODE_ENV !== "production" || process.env.ALLOW_INBOUND_EMAIL_SECRET_FALLBACK === "true";

    if (svixId && svixTimestamp && svixSignature) {
      // Resend (Svix) signed webhook — the standard setup when Resend's inbound
      // webhook posts directly to this endpoint.
      const timestampSeconds = Number.parseInt(svixTimestamp, 10);
      if (!Number.isFinite(timestampSeconds) || timestampSeconds <= 0) {
        return { ok: false, status: 400, error: text.malformedTimestamp };
      }

      const nowSeconds = Math.floor(nowMs / 1000);
      if (Math.abs(nowSeconds - timestampSeconds) > timestampToleranceSeconds) {
        return { ok: false, status: 401, error: text.toleranceWindow };
      }

      const signatureValid = secrets.some((secret) =>
        verifySvixSignature(secret, svixId, svixTimestamp, svixSignature, rawBody)
      );
      if (!signatureValid) {
        return { ok: false, status: 401, error: text.invalidSignature };
      }

      pruneReplayCache(nowMs);
      const replayKey = `svix:${svixId}`;
      if (hasSeenSignature(replayKey)) {
        return { ok: false, status: 409, error: text.replayed };
      }
      rememberSignature(replayKey, nowMs);
    } else if (timestampHeader || signatureHeader) {
      if (!timestampHeader || !signatureHeader) {
        return { ok: false, status: 400, error: text.missingSignatureHeaders };
      }

      const timestampSeconds = Number.parseInt(timestampHeader, 10);
      if (!Number.isFinite(timestampSeconds) || timestampSeconds <= 0) {
        return { ok: false, status: 400, error: text.malformedTimestamp };
      }

      const nowSeconds = Math.floor(nowMs / 1000);
      if (Math.abs(nowSeconds - timestampSeconds) > timestampToleranceSeconds) {
        return { ok: false, status: 401, error: text.toleranceWindow };
      }

      const signatureValid = secrets.some((secret) => {
        const expectedSignature = computeInboundSignature(secret, timestampHeader, rawBody);
        return timingSafeHexEqual(signatureHeader, expectedSignature);
      });
      if (!signatureValid) {
        return { ok: false, status: 401, error: text.invalidSignature };
      }

      pruneReplayCache(nowMs);
      const replayKey = `header:${signatureHeader}`;
      if (hasSeenSignature(replayKey)) {
        return { ok: false, status: 409, error: text.replayed };
      }
      rememberSignature(replayKey, nowMs);
    } else if (allowLegacyFallback && legacySecretHeader) {
      // Dev-only fallback: pre-signing clients (local scripts, manual smoke
      // tests) may still send the static secret. Never accepted in production.
      const secretMatched = secrets.some((secret) => timingSafeStringEqual(legacySecretHeader, secret));
      if (!secretMatched) {
        return { ok: false, status: 401, error: text.invalidSecret };
      }
    } else {
      return { ok: false, status: 401, error: text.missingSignature };
    }

    let payload = {};
    if (rawBody) {
      try {
        payload = JSON.parse(rawBody);
        if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
          return { ok: false, status: 400, error: text.invalidPayloadShape };
        }
      } catch (_) {
        return { ok: false, status: 400, error: text.invalidJson };
      }
    }

    return { ok: true, payload };
  }

  return { verify };
}

module.exports = {
  timingSafeStringEqual,
  timingSafeHexEqual,
  timingSafeB64Equal,
  computeInboundSignature,
  verifySvixSignature,
  rawBodyUtf8,
  maskEmailLike,
  maskRecipientList,
  pickRecipientList,
  pickFromAddress,
  pickBody,
  cleanInboundReplyBody,
  describeInboundCaller,
  resolveWebhookSecrets,
  createInboundWebhookVerifier
};
