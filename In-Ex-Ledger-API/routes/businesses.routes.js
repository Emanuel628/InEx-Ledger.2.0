const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { createBusinessDeleteLimiter } = require("../middleware/rateLimitTiers.js");
const {
  resolveBusinessIdForUser,
  listBusinessesForUser,
  setActiveBusinessForUser,
  createBusinessForUser
} = require("../api/utils/resolveBusinessIdForUser.js");

const router = express.Router();
router.use(requireAuth);

const businessDeleteLimiter = createBusinessDeleteLimiter();

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

/**
 * DELETE /api/businesses/:id
 * Delete a business account and all its associated data.
 * Requires password confirmation. Cannot delete the user's only business.
 */
router.delete("/:id", businessDeleteLimiter, async (req, res) => {
  const { password } = req.body ?? {};
  const businessId = req.params.id;

  if (!password) {
    return res.status(400).json({ error: "Password is required to delete a business." });
  }

  try {
    // Verify that the business belongs to this user
    const ownerCheck = await pool.query(
      "SELECT id FROM businesses WHERE id = $1 AND user_id = $2 LIMIT 1",
      [businessId, req.user.id]
    );
    if (!ownerCheck.rowCount) {
      return res.status(404).json({ error: "Business not found." });
    }

    // Prevent deletion of the user's only business
    const countCheck = await pool.query(
      "SELECT COUNT(*)::int AS count FROM businesses WHERE user_id = $1",
      [req.user.id]
    );
    if (Number(countCheck.rows[0]?.count || 0) <= 1) {
      return res.status(409).json({
        error: "You cannot delete your only business account. Delete your account instead."
      });
    }

    // Verify the user's password
    const userRow = await pool.query(
      "SELECT password_hash FROM users WHERE id = $1 LIMIT 1",
      [req.user.id]
    );
    if (!userRow.rowCount) {
      return res.status(404).json({ error: "User not found." });
    }
    const match = await bcrypt.compare(password, userRow.rows[0].password_hash);
    if (!match) {
      return res.status(401).json({ error: "Incorrect password." });
    }

    // Delete in a transaction. Must clear recurring_transactions before accounts/categories
    // because of ON DELETE RESTRICT on account_id and category_id.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Clear runs first (CASCADE would handle this, but be explicit)
      await client.query(
        "DELETE FROM recurring_transaction_runs WHERE business_id = $1",
        [businessId]
      );

      // Clear recurring templates (RESTRICT on account_id/category_id blocks cascade from accounts)
      await client.query(
        "DELETE FROM recurring_transactions WHERE business_id = $1",
        [businessId]
      );

      // Delete the business — all remaining child rows cascade (transactions, receipts,
      // mileage, accounts, categories, exports, subscriptions, cpa_access_grants)
      await client.query(
        "DELETE FROM businesses WHERE id = $1 AND user_id = $2",
        [businessId, req.user.id]
      );

      // If this was the active business, point to another one
      await client.query(
        `UPDATE users
            SET active_business_id = (
              SELECT id FROM businesses WHERE user_id = $1 ORDER BY created_at ASC, id ASC LIMIT 1
            )
          WHERE id = $1`,
        [req.user.id]
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    const businesses = await listBusinessesForUser(req.user.id);
    res.status(200).json({ message: "Business deleted.", businesses });
  } catch (err) {
    console.error("DELETE /businesses/:id error:", err.message);
    res.status(500).json({ error: "Failed to delete business." });
  }
});

module.exports = router;
