const express = require("express");
const { logError } = require("../utils/logger.js");
const { createDataApiLimiter } = require("../middleware/rate-limit.middleware.js");

const router = express.Router();
const exportPublicKeyLimiter = createDataApiLimiter({
  keyPrefix: "rl:crypto:export-public-key",
  keyStrategy: "ip",
  max: 30
});

let cachedRawKey = null;
let cachedParsedKey = null;

function getParsedExportPublicKey() {
  const publicKeyJson = process.env.EXPORT_PUBLIC_KEY_JWK;
  if (!publicKeyJson) {
    cachedRawKey = null;
    cachedParsedKey = null;
    return null;
  }

  if (publicKeyJson === cachedRawKey && cachedParsedKey) {
    return cachedParsedKey;
  }

  try {
    const parsed = JSON.parse(publicKeyJson);
    cachedRawKey = publicKeyJson;
    cachedParsedKey = parsed;
    return parsed;
  } catch (err) {
    logError("Failed to parse EXPORT_PUBLIC_KEY_JWK:", err.message);
    cachedRawKey = publicKeyJson;
    cachedParsedKey = null;
    return null;
  }
}

router.get("/export-public-key", exportPublicKeyLimiter, (req, res) => {
  const parsedKey = getParsedExportPublicKey();
  const keyKid = process.env.EXPORT_PUBLIC_KEY_KID || "export-key-1";
  if (!parsedKey) {
    return res.status(503).json({ error: "Export public key not configured." });
  }

  res.setHeader("Cache-Control", "public, max-age=60, must-revalidate");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.json({
    jwk: {
      ...parsedKey,
      use: "enc",
      alg: "RSA-OAEP-256"
    },
    kid: keyKid,
    expiresAt: Date.now() + 60_000
  });
});

module.exports = router;
