"use strict";

const crypto = require("crypto");
const net = require("net");

const DEFAULT_GEOLOCATION_API_URL = "https://ipapi.co/{ip}/json/";
const DEFAULT_ALLOWED_GEOLOCATION_HOSTS = new Set(["ipapi.co", "www.ipapi.co"]);

function normalizeUserAgent(userAgent) {
  return String(userAgent || "").trim().slice(0, 512);
}

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

function extractClientIp(req) {
  const forwarded = String(req?.get?.("x-forwarded-for") || req?.headers?.["x-forwarded-for"] || "").trim();
  if (forwarded) {
    const first = forwarded.split(",")[0];
    return normalizeIpAddress(first);
  }
  return normalizeIpAddress(req?.ip || req?.socket?.remoteAddress || "");
}

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function buildDeviceFingerprint({ userId, userAgent, ipAddress }) {
  return hashValue(
    `user:${userId || ""}|ua:${normalizeUserAgent(userAgent)}|ip:${normalizeIpAddress(ipAddress)}`
  );
}

function isPrivateIp(ipAddress) {
  const ip = normalizeIpAddress(ipAddress);
  const version = net.isIP(ip);
  if (!version) return true;

  if (version === 4) {
    const [a, b] = ip.split(".").map((v) => Number(v));
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }

  const lower = ip.toLowerCase();
  return (
    lower === "::1" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe80:")
  );
}

function parseLocation(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const city = String(
    payload.city || payload.town || payload.regionName || payload.region_name || ""
  ).trim();
  const country = String(
    payload.country_name || payload.country || payload.countryName || payload.country_code || payload.countryCode || ""
  ).trim();
  if (!city && !country) {
    return null;
  }
  return { city: city || null, country: country || null };
}

function resolveAllowedGeolocationHosts() {
  const configured = String(process.env.GEOLOCATION_ALLOWED_HOSTS || "").trim();
  if (!configured) {
    return new Set(DEFAULT_ALLOWED_GEOLOCATION_HOSTS);
  }

  return new Set(
    configured
      .split(",")
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean)
  );
}

function resolveGeolocationApiUrl(ipAddress) {
  const apiTemplate = String(process.env.GEOLOCATION_API_URL || DEFAULT_GEOLOCATION_API_URL).trim();
  if (!apiTemplate || !apiTemplate.includes("{ip}")) {
    return null;
  }

  const apiUrl = apiTemplate.replace("{ip}", encodeURIComponent(ipAddress));

  try {
    const parsed = new URL(apiUrl);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      !resolveAllowedGeolocationHosts().has(parsed.hostname.toLowerCase())
    ) {
      return null;
    }
    return parsed.toString();
  } catch (_) {
    return null;
  }
}

async function fetchIpLocation(ipAddress, { fetchImpl = globalThis.fetch } = {}) {
  const ip = normalizeIpAddress(ipAddress);
  if (!ip || isPrivateIp(ip) || typeof fetchImpl !== "function") {
    return null;
  }

  const apiUrl = resolveGeolocationApiUrl(ip);
  if (!apiUrl) {
    return null;
  }
  const timeoutMs = Math.max(100, Number(process.env.GEOLOCATION_TIMEOUT_MS) || 3000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(apiUrl, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" }
    });
    if (!response?.ok) {
      return null;
    }
    const payload = await response.json();
    return parseLocation(payload);
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  normalizeUserAgent,
  normalizeIpAddress,
  extractClientIp,
  hashValue,
  buildDeviceFingerprint,
  isPrivateIp,
  parseLocation,
  fetchIpLocation,
  resolveGeolocationApiUrl
};
