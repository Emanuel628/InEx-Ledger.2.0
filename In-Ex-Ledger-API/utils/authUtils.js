/**
 * Shared authentication utilities used by auth.routes.js and me.routes.js.
 * Centralising these here eliminates duplication and ensures both routes
 * always use the same cookie policy and password-verification logic.
 */

const crypto = require("crypto");
const bcrypt = require("bcrypt");

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  path: "/"
};

function isLegacyScryptHash(stored) {
  return typeof stored === "string" && stored.includes("$") && stored.split("$").length === 2;
}

async function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string") {
    return { match: false, legacy: false };
  }

  if (isLegacyScryptHash(stored)) {
    const [salt, hash] = stored.split("$");
    if (!salt || !hash) {
      return { match: false, legacy: true };
    }
    const derived = crypto.scryptSync(password, salt, 64).toString("hex");
    const derivedBuffer = Buffer.from(derived, "hex");
    const hashBuffer = Buffer.from(hash, "hex");
    if (hashBuffer.length !== derivedBuffer.length) {
      return { match: false, legacy: true };
    }
    const matched = crypto.timingSafeEqual(hashBuffer, derivedBuffer);
    return { match: matched, legacy: matched };
  }

  const match = await bcrypt.compare(password, stored);
  return { match, legacy: false };
}

module.exports = { COOKIE_OPTIONS, isLegacyScryptHash, verifyPassword };
