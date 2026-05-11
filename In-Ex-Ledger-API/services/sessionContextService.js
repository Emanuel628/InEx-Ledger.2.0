"use strict";

const MAX_USER_AGENT_LEN = 512;
const MAX_IP_LEN = 64;
const MAX_DEVICE_LABEL_LEN = 120;

function extractRequestContext(req) {
  if (!req) return { ipAddress: null, userAgent: null };
  const xff = req.headers?.["x-forwarded-for"];
  const forwarded = typeof xff === "string" ? xff.split(",")[0].trim() : null;
  const ipAddress = forwarded || req.ip || req.connection?.remoteAddress || null;
  const userAgent = req.headers?.["user-agent"] || req.get?.("user-agent") || null;
  return {
    ipAddress: truncate(ipAddress, MAX_IP_LEN),
    userAgent: truncate(userAgent, MAX_USER_AGENT_LEN)
  };
}

function truncate(value, max) {
  if (value === null || value === undefined) return null;
  const str = String(value);
  return str.length > max ? str.slice(0, max) : str;
}

/**
 * Derive a short, human-friendly device label from a User-Agent string.
 * Examples:
 *   "Mozilla/5.0 ... Chrome/124 ... Macintosh" -> "Chrome on Mac"
 *   "... Safari/605 ... iPhone"                -> "Safari on iPhone"
 *   "Mozilla/5.0 ... Firefox/115 ... X11; Linux" -> "Firefox on Linux"
 * Falls back to "Unknown device" when nothing matches.
 */
function deriveDeviceLabel(userAgent) {
  const ua = String(userAgent || "");
  if (!ua) return null;

  let browser = "Unknown browser";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\//.test(ua) || /Opera/.test(ua)) browser = "Opera";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) browser = "Chrome";
  else if (/Safari\//.test(ua)) browser = "Safari";

  let os = "Unknown OS";
  if (/iPhone|iPod/.test(ua)) os = "iPhone";
  else if (/iPad/.test(ua)) os = "iPad";
  else if (/Android/.test(ua)) os = "Android";
  else if (/Windows NT/.test(ua)) os = "Windows";
  else if (/Macintosh|Mac OS X/.test(ua)) os = "Mac";
  else if (/Linux/.test(ua)) os = "Linux";
  else if (/CrOS/.test(ua)) os = "ChromeOS";

  const label = `${browser} on ${os}`;
  return truncate(label, MAX_DEVICE_LABEL_LEN);
}

function isCurrentSession(row, { currentTokenHash } = {}) {
  if (!row || !currentTokenHash) return false;
  return row.token_hash === currentTokenHash;
}

/**
 * Decorate a refresh_tokens row for safe display in the user-facing
 * Sessions panel. Strips token_hash and produces:
 *   - device_label (falling back to user_agent excerpt)
 *   - last_active_at (last_used_at || created_at)
 *   - is_current (when currentTokenHash is provided)
 */
function decorateSessionRow(row, { currentTokenHash } = {}) {
  if (!row) return null;
  const deviceLabel = row.device_label || deriveDeviceLabel(row.user_agent) || null;
  return {
    id: row.id,
    created_at: row.created_at,
    expires_at: row.expires_at,
    last_active_at: row.last_used_at || row.created_at,
    ip_address: row.ip_address || null,
    user_agent: row.user_agent || null,
    device_label: deviceLabel,
    mfa_authenticated: !!row.mfa_authenticated,
    is_current: isCurrentSession(row, { currentTokenHash })
  };
}

module.exports = {
  extractRequestContext,
  deriveDeviceLabel,
  decorateSessionRow,
  __private: { truncate, MAX_USER_AGENT_LEN, MAX_IP_LEN, MAX_DEVICE_LABEL_LEN }
};
