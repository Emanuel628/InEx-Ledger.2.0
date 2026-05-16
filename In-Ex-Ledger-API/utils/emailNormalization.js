"use strict";

const MAX_EMAIL_LENGTH = 320;

function normalizeEmail(email) {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!normalized || normalized.length > MAX_EMAIL_LENGTH) {
    return "";
  }
  if (/\.{2,}/.test(normalized)) {
    return "";
  }
  const atIndex = normalized.indexOf("@");
  if (atIndex <= 0 || atIndex !== normalized.lastIndexOf("@")) {
    return "";
  }
  const domain = normalized.slice(atIndex + 1);
  if (!domain || domain.startsWith(".") || domain.endsWith(".") || !domain.includes(".")) {
    return "";
  }
  return normalized;
}

module.exports = {
  normalizeEmail,
  MAX_EMAIL_LENGTH
};
