"use strict";

function normalizeIpAddress(ipAddress) {
  const ip = String(ipAddress || "").trim();
  if (!ip) return "";
  if (ip.startsWith("::ffff:")) {
    return ip.slice("::ffff:".length);
  }
  if (ip === "::1") {
    return "127.0.0.1";
  }
  return ip;
}

function getTrustedClientIp(req) {
  return normalizeIpAddress(req?.ip || req?.socket?.remoteAddress || req?.connection?.remoteAddress || "");
}

function getForwardedForChain(req) {
  const raw = String(req?.get?.("x-forwarded-for") || req?.headers?.["x-forwarded-for"] || "").trim();
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((value) => normalizeIpAddress(value))
    .filter(Boolean);
}

module.exports = {
  normalizeIpAddress,
  getTrustedClientIp,
  getForwardedForChain
};
