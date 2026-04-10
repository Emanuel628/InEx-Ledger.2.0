const express = require("express");
const { logError, logWarn, logInfo } = require("../utils/logger.js");

const router = express.Router();

const PUBLIC_KEY_JSON = process.env.EXPORT_PUBLIC_KEY_JWK;
const KEY_KID = process.env.EXPORT_PUBLIC_KEY_KID || "export-key-1";
let parsedKey = null;

if (PUBLIC_KEY_JSON) {
  try {
    parsedKey = JSON.parse(PUBLIC_KEY_JSON);
  } catch (err) {
    logError("Failed to parse EXPORT_PUBLIC_KEY_JWK:", err.message);
  }
}

router.get("/export-public-key", (req, res) => {
  if (!parsedKey) {
    return res.status(503).json({ error: "Export public key not configured." });
  }

  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
  res.json({
    jwk: {
      ...parsedKey,
      use: "enc",
      alg: "RSA-OAEP-256"
    },
    kid: KEY_KID,
    expiresAt: Date.now() + 300_000
  });
});

module.exports = router;
