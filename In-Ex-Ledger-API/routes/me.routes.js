const express = require("express");
const crypto = require("crypto");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { resolveBusinessIdForUser, listBusinessesForUser } = require("../api/utils/resolveBusinessIdForUser.js");
const { getSubscriptionSnapshotForBusiness } = require("../services/subscriptionService.js");
const { listAssignedCpaGrants, listAccessibleBusinessScopeForUser } = require("../services/cpaAccessService.js");

const router = express.Router();

const VALID_REGIONS = new Set(["US", "CA"]);
const VALID_LANGUAGES = new Set(["en", "es", "fr"]);
const VALID_BUSINESS_TYPES = new Set(["sole_proprietor", "llc", "s_corp", "partnership"]);
const VALID_ACCOUNT_TYPES = new Set(["checking", "savings", "credit_card", "cash", "loan"]);
const VALID_START_FOCUS = new Set(["transactions", "receipts", "mileage", "exports"]);
const CA_PROVINCES = new Set(["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"]);
const REFRESH_TOKEN_COOKIE = "refresh_token";
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  path: "/"
};

function normalizeOnboardingPayload(user) {
  return {
    completed: !!user?.onboarding_completed,
    completed_at: user?.onboarding_completed_at || null,
    data: user?.onboarding_data && typeof user.onboarding_data === "object" ? user.onboarding_data : {},
    tour_seen:
      user?.onboarding_tour_seen && typeof user.onboarding_tour_seen === "object"
        ? user.onboarding_tour_seen
        : {}
  };
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const result = await pool.query(
      `SELECT id, email, role, email_verified, mfa_enabled, full_name, display_name,
              country, province, data_residency, created_at,
              onboarding_completed, onboarding_completed_at, onboarding_data, onboarding_tour_seen,
              cpa_license_number, cpa_license_verified, cpa_license_status,
              cpa_license_verified_at, cpa_license_jurisdiction
         FROM users
        WHERE id = $1
        LIMIT 1`,
      [req.user.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "User not found" });
    }

    const subscription = await getSubscriptionSnapshotForBusiness(businessId);
    const businesses = await listBusinessesForUser(req.user.id);
    const activeBusiness = businesses.find((business) => business.id === businessId) || null;
    const assignedCpaGrants = await listAssignedCpaGrants(result.rows[0]);
    const assignedCpaPortfolios = await listAccessibleBusinessScopeForUser(result.rows[0]);
    const user = result.rows[0];
    res.status(200).json({
      ...user,
      business_id: businessId,
      active_business_id: businessId,
      active_business: activeBusiness,
      businesses,
      assigned_cpa_grants: assignedCpaGrants,
      assigned_cpa_portfolios: assignedCpaPortfolios,
      onboarding: normalizeOnboardingPayload(user),
      cpa_verification: {
        hasLicense: !!user.cpa_license_number,
        licenseNumber: user.cpa_license_number || null,
        verified: !!user.cpa_license_verified,
        status: user.cpa_license_status || null,
        verifiedAt: user.cpa_license_verified_at || null,
        jurisdiction: user.cpa_license_jurisdiction || null
      },
      subscription
    });
  } catch (err) {
    console.error("GET /me error:", err.message);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

router.get("/onboarding", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT onboarding_completed, onboarding_completed_at, onboarding_data, onboarding_tour_seen
         FROM users
        WHERE id = $1
        LIMIT 1`,
      [req.user.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.status(200).json(normalizeOnboardingPayload(result.rows[0]));
  } catch (err) {
    console.error("GET /me/onboarding error:", err.message);
    return res.status(500).json({ error: "Failed to load onboarding state" });
  }
});

router.put("/onboarding", requireAuth, async (req, res) => {
  const businessName = String(req.body?.business_name || "").trim();
  const businessType = String(req.body?.business_type || "").trim();
  const region = String(req.body?.region || "").trim().toUpperCase();
  const province = String(req.body?.province || "").trim().toUpperCase();
  const language = String(req.body?.language || "").trim();
  const starterAccountType = String(req.body?.starter_account_type || "").trim();
  const starterAccountName = String(req.body?.starter_account_name || "").trim();
  const startFocus = String(req.body?.start_focus || "").trim();

  if (!businessName) {
    return res.status(400).json({ error: "Business name is required." });
  }
  if (!VALID_BUSINESS_TYPES.has(businessType)) {
    return res.status(400).json({ error: "Choose a valid business type." });
  }
  if (!VALID_REGIONS.has(region)) {
    return res.status(400).json({ error: "Choose a valid region." });
  }
  if (!VALID_LANGUAGES.has(language)) {
    return res.status(400).json({ error: "Choose a valid language." });
  }
  if (region === "CA" && !CA_PROVINCES.has(province)) {
    return res.status(400).json({ error: "Choose a valid province." });
  }
  if (!VALID_ACCOUNT_TYPES.has(starterAccountType)) {
    return res.status(400).json({ error: "Choose a starter account type." });
  }
  if (!starterAccountName) {
    return res.status(400).json({ error: "Starter account name is required." });
  }
  if (!VALID_START_FOCUS.has(startFocus)) {
    return res.status(400).json({ error: "Choose what you want to do first." });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);

    await pool.query(
      `UPDATE businesses
          SET name = $1,
              business_type = $2,
              region = $3,
              language = $4,
              province = CASE
                WHEN $3 = 'CA' THEN $5
                ELSE NULL
              END
        WHERE id = $6`,
      [businessName, businessType, region, language, province || null, businessId]
    );

    const accountCheck = await pool.query(
      "SELECT COUNT(*)::int AS count FROM accounts WHERE business_id = $1",
      [businessId]
    );
    const hasAccounts = Number(accountCheck.rows[0]?.count || 0) > 0;

    if (!hasAccounts) {
      await pool.query(
        `INSERT INTO accounts (id, business_id, name, type)
         VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), businessId, starterAccountName, starterAccountType]
      );
    }

    const onboardingData = {
      business_name: businessName,
      business_type: businessType,
      region,
      province: region === "CA" ? province : "",
      language,
      starter_account_type: starterAccountType,
      starter_account_name: starterAccountName,
      start_focus: startFocus
    };

    const updated = await pool.query(
      `UPDATE users
          SET onboarding_completed = true,
              onboarding_completed_at = COALESCE(onboarding_completed_at, NOW()),
              onboarding_data = $1::jsonb
        WHERE id = $2
        RETURNING onboarding_completed, onboarding_completed_at, onboarding_data, onboarding_tour_seen`,
      [JSON.stringify(onboardingData), req.user.id]
    );

    return res.status(200).json({
      onboarding: normalizeOnboardingPayload(updated.rows[0]),
      redirect_to: `/${startFocus}`
    });
  } catch (err) {
    console.error("PUT /me/onboarding error:", err.message);
    return res.status(500).json({ error: "Failed to save onboarding." });
  }
});

router.post("/onboarding/tour", requireAuth, async (req, res) => {
  const page = String(req.body?.page || "").trim();
  if (!page) {
    return res.status(400).json({ error: "Page is required." });
  }

  try {
    const current = await pool.query(
      "SELECT onboarding_tour_seen FROM users WHERE id = $1 LIMIT 1",
      [req.user.id]
    );
    if (!current.rowCount) {
      return res.status(404).json({ error: "User not found" });
    }

    const nextState =
      current.rows[0]?.onboarding_tour_seen && typeof current.rows[0].onboarding_tour_seen === "object"
        ? { ...current.rows[0].onboarding_tour_seen, [page]: true }
        : { [page]: true };

    await pool.query(
      "UPDATE users SET onboarding_tour_seen = $1::jsonb WHERE id = $2",
      [JSON.stringify(nextState), req.user.id]
    );

    return res.status(200).json({ success: true, tour_seen: nextState });
  } catch (err) {
    console.error("POST /me/onboarding/tour error:", err.message);
    return res.status(500).json({ error: "Failed to update onboarding tour state" });
  }
});

router.post("/onboarding/replay", requireAuth, async (req, res) => {
  try {
    await pool.query(
      "UPDATE users SET onboarding_tour_seen = '{}'::jsonb WHERE id = $1",
      [req.user.id]
    );
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("POST /me/onboarding/replay error:", err.message);
    return res.status(500).json({ error: "Failed to reset onboarding tips" });
  }
});

/**
 * PUT /api/me
 * Update user profile (full_name, display_name).
 */
router.put("/", requireAuth, async (req, res) => {
  const { full_name, display_name } = req.body ?? {};
  try {
    const result = await pool.query(
      `UPDATE users
       SET full_name = COALESCE($1, full_name),
           display_name = COALESCE($2, display_name)
       WHERE id = $3
       RETURNING id, email, full_name, display_name, created_at`,
      [full_name?.trim() || null, display_name?.trim() || null, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error("PUT /me error:", err.message);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

router.delete("/", requireAuth, async (req, res) => {
  const anonymizedEmail = `deleted-${crypto.randomUUID()}@deleted.invalid`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const userResult = await client.query(
      "SELECT id, email FROM users WHERE id = $1 LIMIT 1",
      [req.user.id]
    );
    if (!userResult.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "User not found" });
    }

    const businessesResult = await client.query(
      "SELECT id FROM businesses WHERE user_id = $1",
      [req.user.id]
    );
    const businessIds = businessesResult.rows.map((row) => row.id);

    await client.query(
      `INSERT INTO user_action_audit_log
         (id, user_id, action, ip_address, user_agent, metadata)
       VALUES ($1, $2, 'data_deletion', $3, $4, $5)`,
      [
        crypto.randomUUID(),
        req.user.id,
        req.ip || req.connection?.remoteAddress || null,
        req.get("user-agent") || null,
        JSON.stringify({
          accountDeletion: true,
          requestedAt: new Date().toISOString(),
          businessCount: businessIds.length
        })
      ]
    );

    if (businessIds.length) {
      await client.query(
        "DELETE FROM recurring_transaction_runs WHERE business_id = ANY($1::uuid[])",
        [businessIds]
      );
      await client.query(
        "DELETE FROM recurring_transactions WHERE business_id = ANY($1::uuid[])",
        [businessIds]
      );
      await client.query(
        "DELETE FROM businesses WHERE user_id = $1",
        [req.user.id]
      );
    }

    await client.query("DELETE FROM refresh_tokens WHERE user_id = $1", [req.user.id]);
    await client.query("DELETE FROM mfa_trusted_devices WHERE user_id = $1", [req.user.id]);
    await client.query("DELETE FROM mfa_email_challenges WHERE user_id = $1", [req.user.id]);
    await client.query("DELETE FROM email_change_requests WHERE user_id = $1", [req.user.id]);
    await client.query("DELETE FROM verification_tokens WHERE email = $1", [userResult.rows[0].email]);
    await client.query("DELETE FROM password_reset_tokens WHERE email = $1", [userResult.rows[0].email]);

    const result = await client.query(
      `UPDATE users
          SET email = $1,
              password_hash = 'ERASED',
              email_verified = false,
              full_name = NULL,
              display_name = NULL,
              mfa_enabled = false,
              mfa_enabled_at = NULL,
              active_business_id = NULL,
              country = NULL,
              province = NULL,
              is_erased = true,
              erased_at = NOW()
        WHERE id = $2
        RETURNING id`,
      [anonymizedEmail, req.user.id]
    );

    if (!result.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "User not found" });
    }

    await client.query("COMMIT");

    res.clearCookie(REFRESH_TOKEN_COOKIE, COOKIE_OPTIONS);
    res.status(200).json({ message: "Account and data deleted" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("DELETE /me error:", err.message);
    res.status(500).json({ error: "Failed to delete account" });
  } finally {
    client.release();
  }
});

module.exports = router;
