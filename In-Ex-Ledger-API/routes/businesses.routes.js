const express = require("express");
const crypto = require("crypto");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const {
  resolveBusinessIdForUser,
  listBusinessesForUser,
  setActiveBusinessForUser,
  createBusinessForUser
} = require("../api/utils/resolveBusinessIdForUser.js");

const router = express.Router();
router.use(requireAuth);

const TAX_ID_PREFIX = "enc:";

function getTaxIdKey() {
  const secret = process.env.JWT_SECRET || "";
  return crypto.createHash("sha256").update(secret).digest();
}

function decryptTaxId(stored) {
  if (!stored || !stored.startsWith(TAX_ID_PREFIX)) return stored;
  try {
    const parts = stored.slice(TAX_ID_PREFIX.length).split(":");
    if (parts.length !== 3) return stored;
    const [ivB64, authTagB64, encryptedB64] = parts;
    const key = getTaxIdKey();
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");
    const encrypted = Buffer.from(encryptedB64, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

function normalizeBusinessPayload(payload = {}) {
  const name = String(payload.name || "").trim();
  const region = String(payload.region || "US").trim().toUpperCase();
  const language = String(payload.language || "en").trim().toLowerCase();

  if (!name) {
    return { valid: false, error: "Business name is required." };
  }
  if (!["US", "CA"].includes(region)) {
    return { valid: false, error: "Region must be US or CA." };
  }
  if (!["en", "es", "fr"].includes(language)) {
    return { valid: false, error: "Language must be en, es, or fr." };
  }

  return { valid: true, normalized: { name, region, language } };
}

router.get("/", async (req, res) => {
  try {
    const activeBusinessId = await resolveBusinessIdForUser(req.user);
    const businesses = await listBusinessesForUser(req.user.id);
    const activeBusiness = businesses.find((business) => business.id === activeBusinessId) || null;

    res.json({
      active_business_id: activeBusinessId,
      active_business: activeBusiness,
      businesses
    });
  } catch (err) {
    console.error("GET /businesses error:", err.message);
    res.status(500).json({ error: "Failed to load businesses." });
  }
});

router.get("/:id/profile", async (req, res) => {
  try {
    const businesses = await listBusinessesForUser(req.user.id);
    const business = businesses.find((item) => item.id === req.params.id);
    if (!business) {
      return res.status(404).json({ error: "Business not found." });
    }

    const result = await pool.query(
      `SELECT id, name, region, language, fiscal_year_start, province,
              business_type, tax_id, address, created_at
       FROM businesses
       WHERE id = $1
       LIMIT 1`,
      [req.params.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Business not found." });
    }

    const row = result.rows[0];
    res.json({ ...row, tax_id: decryptTaxId(row.tax_id) });
  } catch (err) {
    console.error("GET /businesses/:id/profile error:", err.message);
    res.status(500).json({ error: "Failed to load business profile." });
  }
});

router.post("/", async (req, res) => {
  const validation = normalizeBusinessPayload(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const businessId = await createBusinessForUser(req.user, validation.normalized);
    req.user.business_id = businessId;
    const businesses = await listBusinessesForUser(req.user.id);
    const activeBusiness = businesses.find((business) => business.id === businessId) || null;

    res.status(201).json({
      active_business_id: businessId,
      active_business: activeBusiness,
      businesses
    });
  } catch (err) {
    console.error("POST /businesses error:", err.message);
    res.status(500).json({ error: "Failed to create business." });
  }
});

router.post("/:id/activate", async (req, res) => {
  try {
    const updated = await setActiveBusinessForUser(req.user.id, req.params.id);
    if (!updated) {
      return res.status(404).json({ error: "Business not found." });
    }

    req.user.business_id = req.params.id;
    const businesses = await listBusinessesForUser(req.user.id);
    const activeBusiness = businesses.find((business) => business.id === req.params.id) || null;

    res.json({
      active_business_id: req.params.id,
      active_business: activeBusiness,
      businesses
    });
  } catch (err) {
    console.error("POST /businesses/:id/activate error:", err.message);
    res.status(500).json({ error: "Failed to switch business." });
  }
});

module.exports = router;
