const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const rateLimit = require("express-rate-limit");
const { pool } = require("../db.js");
const { requireAuth, verifyToken } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { resolveBusinessIdForUser, listBusinessesForUser } = require("../api/utils/resolveBusinessIdForUser.js");
const { getSubscriptionSnapshotForBusiness } = require("../services/subscriptionService.js");
const { listAssignedCpaGrants, listAccessibleBusinessScopeForUser } = require("../services/cpaAccessService.js");
const { COOKIE_OPTIONS, isLegacyScryptHash, verifyPassword } = require("../utils/authUtils.js");
const { createDataApiLimiter } = require("../middleware/rate-limit.middleware.js");
const { logError, logInfo } = require("../utils/logger.js");
const { isManagedReceiptPath } = require("../services/receiptStorage.js");

const router = express.Router();

const accountDeleteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many account deletion attempts. Please try again later." }
});

const VALID_REGIONS = new Set(["US", "CA"]);
const VALID_LANGUAGES = new Set(["en", "es", "fr"]);
const VALID_BUSINESS_TYPES = new Set(["sole_proprietor", "llc", "s_corp", "partnership", "corporation"]);
const MAX_CUSTOM_ACCOUNT_TYPE_LEN = 50;
const GUIDED_SETUP_STEPS = ["categories", "accounts", "transactions"];
const VALID_GUIDED_SETUP_ACTIONS = new Set(["next", "skip", "finish"]);
const CA_PROVINCES = new Set(["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"]);
const REFRESH_TOKEN_COOKIE = "refresh_token";
const LEGACY_CPA_AUDIT_USER_CONSTRAINTS = [
  "cpa_audit_logs_owner_user_id_fkey",
  "cpa_audit_logs_actor_user_id_fkey"
];

function normalizeOptionalTrimmedString(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeUiPreferences(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const next = {};

  if ("dynamic_sidebar_favorites" in input) {
    const rawFavorites = Array.isArray(input.dynamic_sidebar_favorites)
      ? input.dynamic_sidebar_favorites
      : [];
    next.dynamic_sidebar_favorites = Array.from(
      new Set(
        rawFavorites
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      )
    ).slice(0, 12);
  }

  return next;
}

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

function resolveNextGuidedSetupStep(currentStep) {
  const currentIndex = GUIDED_SETUP_STEPS.indexOf(currentStep);
  if (currentIndex === -1) {
    return GUIDED_SETUP_STEPS[0];
  }
  return GUIDED_SETUP_STEPS[currentIndex + 1] || null;
}

router.use(requireAuth);
router.use(requireCsrfProtection);
router.use(createDataApiLimiter());

router.get("/", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user, { seedDefaults: false });
    const result = await pool.query(
      `SELECT id, email, role, email_verified, mfa_enabled, recovery_email, recovery_email_verified, full_name, display_name,
              ui_preferences,
              country, province, data_residency, created_at,
              onboarding_completed, onboarding_completed_at, onboarding_data, onboarding_tour_seen,
              cpa_license_number, cpa_license_verified, cpa_license_status,
              cpa_license_verified_at, cpa_license_jurisdiction
         FROM users
        WHERE id = $1
        LIMIT 1`,
      [req.user.id]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    const businesses = await listBusinessesForUser(req.user.id);
    const activeBusiness = businesses.find((business) => business.id === businessId) || null;
    const assignedCpaGrants = await listAssignedCpaGrants(user);
    const assignedCpaPortfolios = await listAccessibleBusinessScopeForUser(user);
    const subscription = await getSubscriptionSnapshotForBusiness(businessId);
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
    logError("GET /me error:", err.message);
    res.status(500).json({ error: "Failed to load profile." });
  }
});

router.get("/onboarding", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT onboarding_completed, onboarding_completed_at, onboarding_data, onboarding_tour_seen
         FROM users
        WHERE id = $1
        LIMIT 1`,
      [req.user.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "User not found." });
    }

    return res.status(200).json(normalizeOnboardingPayload(result.rows[0]));
  } catch (err) {
    logError("GET /me/onboarding error:", err.message);
    return res.status(500).json({ error: "Failed to load onboarding state." });
  }
});

router.put("/onboarding", async (req, res) => {
  const businessName = String(req.body?.business_name || "").trim();
  const businessType = String(req.body?.business_type || "").trim();
  const region = String(req.body?.region || "").trim().toUpperCase();
  const province = String(req.body?.province || "").trim().toUpperCase();
  const language = String(req.body?.language || "").trim();
  const starterAccountType = String(req.body?.starter_account_type || "").trim();
  const starterAccountName = String(req.body?.starter_account_name || "").trim();

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
  if (!starterAccountType || starterAccountType.length > MAX_CUSTOM_ACCOUNT_TYPE_LEN) {
    return res.status(400).json({ error: "Choose a starter account type." });
  }
  if (!starterAccountName) {
    return res.status(400).json({ error: "Starter account name is required." });
  }
  try {
    const businessId = await resolveBusinessIdForUser(req.user, { seedDefaults: false });
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const currentUserState = await client.query(
        "SELECT onboarding_completed FROM users WHERE id = $1 LIMIT 1",
        [req.user.id]
      );
      const onboardingCompleted = !!currentUserState.rows[0]?.onboarding_completed;

      await client.query(
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

      if (!onboardingCompleted) {
        await client.query("DELETE FROM accounts WHERE business_id = $1", [businessId]);
      }
      const accountCheck = await client.query("SELECT 1 FROM accounts WHERE business_id = $1 LIMIT 1", [businessId]);
      if (!onboardingCompleted && !accountCheck.rowCount) {
        await client.query(
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
        guided_setup_active: true,
        guided_setup_step: GUIDED_SETUP_STEPS[0]
      };

      const updated = await client.query(
        `UPDATE users
            SET onboarding_completed = true,
                onboarding_completed_at = COALESCE(onboarding_completed_at, NOW()),
                onboarding_data = $1::jsonb
          WHERE id = $2
          RETURNING onboarding_completed, onboarding_completed_at, onboarding_data, onboarding_tour_seen`,
        [JSON.stringify(onboardingData), req.user.id]
      );

      await client.query("COMMIT");

      return res.status(200).json({
        onboarding: normalizeOnboardingPayload(updated.rows[0]),
        redirect_to: `/${GUIDED_SETUP_STEPS[0]}`
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    logError("PUT /me/onboarding error:", err.message);
    return res.status(500).json({ error: "Failed to save onboarding." });
  }
});

router.post("/onboarding/guide", async (req, res) => {
  const action = String(req.body?.action || "").trim().toLowerCase();
  const page = String(req.body?.page || "").trim().toLowerCase();

  if (!VALID_GUIDED_SETUP_ACTIONS.has(action)) {
    return res.status(400).json({ error: "Invalid onboarding guide action." });
  }
  if (page && !GUIDED_SETUP_STEPS.includes(page)) {
    return res.status(400).json({ error: "Invalid onboarding guide page." });
  }

  try {
    const current = await pool.query(
      `SELECT onboarding_completed, onboarding_data, onboarding_tour_seen
         FROM users
        WHERE id = $1
        LIMIT 1`,
      [req.user.id]
    );
    if (!current.rowCount) {
      return res.status(404).json({ error: "User not found." });
    }

    if (!current.rows[0]?.onboarding_completed) {
      return res.status(400).json({ error: "Finish onboarding before using the guided setup flow." });
    }

    const currentData =
      current.rows[0]?.onboarding_data && typeof current.rows[0].onboarding_data === "object"
        ? { ...current.rows[0].onboarding_data }
        : {};
    const currentTourSeen =
      current.rows[0]?.onboarding_tour_seen && typeof current.rows[0].onboarding_tour_seen === "object"
        ? { ...current.rows[0].onboarding_tour_seen }
        : {};
    const effectivePage =
      page || (GUIDED_SETUP_STEPS.includes(currentData.guided_setup_step) ? currentData.guided_setup_step : GUIDED_SETUP_STEPS[0]);
    const timestamp = new Date().toISOString();

    let redirectTo = "/transactions";
    if (action === "skip") {
      GUIDED_SETUP_STEPS.forEach((step) => {
        currentTourSeen[step] = true;
      });
      currentData.guided_setup_active = false;
      currentData.guided_setup_step = "skipped";
      currentData.guided_setup_completed_at = timestamp;
      currentData.guided_setup_skipped_at = timestamp;
    } else if (action === "finish") {
      currentTourSeen[effectivePage] = true;
      currentData.guided_setup_active = false;
      currentData.guided_setup_step = "complete";
      currentData.guided_setup_completed_at = timestamp;
    } else {
      currentTourSeen[effectivePage] = true;
      const nextStep = resolveNextGuidedSetupStep(effectivePage);
      if (nextStep) {
        currentData.guided_setup_active = true;
        currentData.guided_setup_step = nextStep;
        redirectTo = `/${nextStep}`;
      } else {
        currentData.guided_setup_active = false;
        currentData.guided_setup_step = "complete";
        currentData.guided_setup_completed_at = timestamp;
      }
    }

    const updated = await pool.query(
      `UPDATE users
          SET onboarding_data = $1::jsonb,
              onboarding_tour_seen = $2::jsonb
        WHERE id = $3
        RETURNING onboarding_completed, onboarding_completed_at, onboarding_data, onboarding_tour_seen`,
      [JSON.stringify(currentData), JSON.stringify(currentTourSeen), req.user.id]
    );

    return res.status(200).json({
      onboarding: normalizeOnboardingPayload(updated.rows[0]),
      redirect_to: redirectTo
    });
  } catch (err) {
    logError("POST /me/onboarding/guide error:", err.message);
    return res.status(500).json({ error: "Failed to update guided onboarding." });
  }
});

router.post("/onboarding/tour", async (req, res) => {
  const page = String(req.body?.page || "").trim();
  if (!page) {
    return res.status(400).json({ error: "Page is required." });
  }

  const VALID_TOUR_PAGES = new Set([
    "transactions", "accounts", "categories", "receipts", "mileage", "exports",
    "analytics", "goals", "tax", "settings", "billing", "messages"
  ]);
  if (!VALID_TOUR_PAGES.has(page)) {
    return res.status(400).json({ error: "Invalid page value." });
  }

  try {
    const current = await pool.query(
      "SELECT onboarding_tour_seen FROM users WHERE id = $1 LIMIT 1",
      [req.user.id]
    );
    if (!current.rowCount) {
      return res.status(404).json({ error: "User not found." });
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
    logError("POST /me/onboarding/tour error:", err.message);
    return res.status(500).json({ error: "Failed to update onboarding tour state." });
  }
});

router.post("/onboarding/replay", async (req, res) => {
  try {
    await pool.query(
      "UPDATE users SET onboarding_tour_seen = '{}'::jsonb WHERE id = $1",
      [req.user.id]
    );
    return res.status(200).json({ success: true });
  } catch (err) {
    logError("POST /me/onboarding/replay error:", err.message);
    return res.status(500).json({ error: "Failed to reset onboarding tips." });
  }
});

/**
 * PUT /api/me
 * Update user profile (full_name, display_name).
 */
router.put("/", async (req, res) => {
  const body = req.body ?? {};
  try {
    const result = await pool.query(
      `UPDATE users
       SET full_name = CASE WHEN $4::boolean THEN $1 ELSE full_name END,
           display_name = CASE WHEN $5::boolean THEN $2 ELSE display_name END
       WHERE id = $3
       RETURNING id, email, full_name, display_name, created_at`,
      [
        'full_name' in body ? normalizeOptionalTrimmedString(body.full_name) : null,
        'display_name' in body ? normalizeOptionalTrimmedString(body.display_name) : null,
        req.user.id,
        'full_name' in body,
        'display_name' in body
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    logError("PUT /me error:", err.message);
    res.status(500).json({ error: "Failed to update profile." });
  }
});

router.put("/preferences", async (req, res) => {
  const updates = normalizeUiPreferences(req.body);
  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: "No valid preferences provided." });
  }

  try {
    const result = await pool.query(
      `UPDATE users
          SET ui_preferences = COALESCE(ui_preferences, '{}'::jsonb) || $1::jsonb
        WHERE id = $2
        RETURNING ui_preferences`,
      [JSON.stringify(updates), req.user.id]
    );

    return res.status(200).json({ ui_preferences: result.rows[0]?.ui_preferences || {} });
  } catch (err) {
    logError("PUT /me/preferences error:", err.message);
    return res.status(500).json({ error: "Failed to update preferences." });
  }
});

router.delete("/", accountDeleteLimiter, async (req, res) => {
  const { password } = req.body ?? {};
  const providedMfaReauthToken = String(req.body?.mfaReauthToken || "").trim();
  const client = await pool.connect();
  let transactionOpen = false;
  let storagePaths = [];

  try {
    if (!password) {
      return res.status(400).json({ error: "Password is required to delete your account." });
    }

    if (req.user?.mfa_enabled) {
      if (!providedMfaReauthToken) {
        return res.status(403).json({
          error: "MFA verification required before deleting your account.",
          mfa_required: true,
          requirement: "verification",
          reauthenticate: true,
          reauth_endpoint: "/api/auth/mfa/reauth"
        });
      }

      let reauthPayload;
      try {
        reauthPayload = verifyToken(providedMfaReauthToken);
      } catch (error) {
        return res.status(403).json({
          error: "MFA verification expired. Re-authenticate and try again.",
          mfa_required: true,
          requirement: "verification",
          reauthenticate: true,
          reauth_endpoint: "/api/auth/mfa/reauth"
        });
      }

      if (
        reauthPayload?.purpose !== "mfa_sensitive_reauth" ||
        reauthPayload?.reason !== "account_delete" ||
        reauthPayload?.id !== req.user.id
      ) {
        return res.status(403).json({
          error: "MFA verification invalid for account deletion. Re-authenticate and try again.",
          mfa_required: true,
          requirement: "verification",
          reauthenticate: true,
          reauth_endpoint: "/api/auth/mfa/reauth"
        });
      }
    }

    await client.query("BEGIN");
    transactionOpen = true;

    const userResult = await client.query(
      "SELECT id, email, password_hash FROM users WHERE id = $1 LIMIT 1",
      [req.user.id]
    );
    if (!userResult.rowCount) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return res.status(404).json({ error: "User not found." });
    }

    const { match } = await verifyPassword(password, userResult.rows[0].password_hash);
    if (!match) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return res.status(401).json({ error: "Incorrect password." });
    }

    const legacyConstraintResult = await client.query(
      `SELECT EXISTS(
         SELECT 1
           FROM pg_constraint
          WHERE conname = ANY($1::text[])
       ) AS has_legacy_constraints`,
      [LEGACY_CPA_AUDIT_USER_CONSTRAINTS]
    );
    if (legacyConstraintResult.rows[0]?.has_legacy_constraints) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return res.status(500).json({
        error: "Failed to delete account.",
        detail: "Database migration 045_drop_cpa_audit_user_fks.sql must be applied before account deletion can succeed."
      });
    }

    const receiptFiles = await client.query(
      `SELECT r.storage_path
         FROM receipts r
         JOIN businesses b ON b.id = r.business_id
        WHERE b.user_id = $1
          AND r.storage_path IS NOT NULL`,
      [req.user.id]
    );
    storagePaths = receiptFiles.rows
      .map((row) => row.storage_path)
      .filter((filePath) => isManagedReceiptPath(filePath));

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
      // Delete child rows in dependency order so that ON DELETE RESTRICT
      // foreign keys (recurring_transactions.account_id/category_id and
      // transactions.account_id/category_id) are never violated.
      //
      // Order:
      //   1. Recurring runs & templates (RESTRICT on account_id/category_id)
      //   2. Transactions (RESTRICT on account_id/category_id blocks steps 3/4
      //      unless transactions are removed first)
      //   3. Receipts (receipts.transaction_id is ON DELETE SET NULL, so the FK
      //      is already nulled by step 2; deleting receipts here is an explicit
      //      clean-up before the business row is removed)
      //   4. Mileage, exports, subscriptions, CPA grants (no dependencies on
      //      each other or on the tables deleted in steps 1–3; safe in any order)
      //   5. Accounts, categories (safe to delete once all transactions are gone)
      //   6. Delete the business rows (any remaining CASCADE cleans up leftovers)
      await client.query(
        "DELETE FROM recurring_transaction_runs WHERE business_id = ANY($1::uuid[])",
        [businessIds]
      );
      await client.query(
        "DELETE FROM recurring_transactions WHERE business_id = ANY($1::uuid[])",
        [businessIds]
      );
      await client.query(
        "DELETE FROM transactions WHERE business_id = ANY($1::uuid[])",
        [businessIds]
      );
      await client.query(
        "DELETE FROM receipts WHERE business_id = ANY($1::uuid[])",
        [businessIds]
      );
      await client.query(
        "DELETE FROM mileage WHERE business_id = ANY($1::uuid[])",
        [businessIds]
      );
      await client.query(
        "DELETE FROM exports WHERE business_id = ANY($1::uuid[])",
        [businessIds]
      );
      await client.query(
        "DELETE FROM business_subscriptions WHERE business_id = ANY($1::uuid[])",
        [businessIds]
      );
      await client.query("DELETE FROM accounts WHERE business_id = ANY($1::uuid[])", [businessIds]
      );
      await client.query(
        "DELETE FROM categories WHERE business_id = ANY($1::uuid[])",
        [businessIds]
      );
      await client.query(
        "UPDATE users SET active_business_id = NULL WHERE id = $1",
        [req.user.id]
      );
      await client.query(
        "DELETE FROM businesses WHERE user_id = $1",
        [req.user.id]
      );
    }

    // Delete email-keyed tokens that have no FK to users and won't cascade.
    await client.query("DELETE FROM verification_tokens WHERE email = $1", [userResult.rows[0].email]);
    await client.query("DELETE FROM password_reset_tokens WHERE email = $1", [userResult.rows[0].email]);

    // Hard-delete the user row.  All remaining child rows (refresh_tokens,
    // mfa_trusted_devices, mfa_email_challenges, email_change_requests,
    // user_privacy_settings, cpa_access_grants) are removed automatically
    // via ON DELETE CASCADE foreign keys.
    const result = await client.query(
      "DELETE FROM users WHERE id = $1 RETURNING id",
      [req.user.id]
    );

    if (!result.rowCount) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return res.status(404).json({ error: "User not found." });
    }

    await client.query("COMMIT");
    transactionOpen = false;

    const unlinkResults = await Promise.allSettled(
      storagePaths.map(async (filePath) => {
        await fs.promises.unlink(filePath);
      })
    );
    unlinkResults.forEach((result, index) => {
      if (result.status === "rejected" && result.reason?.code !== "ENOENT") {
        logError("DELETE /me: failed to unlink receipt file:", storagePaths[index], result.reason);
      }
    });

    res.clearCookie(REFRESH_TOKEN_COOKIE, COOKIE_OPTIONS);
    res.status(200).json({ message: "Account and data deleted" });
  } catch (err) {
    if (transactionOpen) {
      await client.query("ROLLBACK");
    }
    logError("DELETE /me error:", {
      message: err.message,
      code: err.code,
      detail: err.detail,
      constraint: err.constraint,
      table: err.table
    });
    const cpaAuditConstraint = String(err?.constraint || "");
    if (
      err?.code === "23503" &&
      /cpa_audit_logs_(owner_user_id|actor_user_id)_fkey/i.test(cpaAuditConstraint)
    ) {
      return res.status(500).json({
        error: "Failed to delete account.",
        detail: "Database migration 045_drop_cpa_audit_user_fks.sql must be applied before account deletion can succeed."
      });
    }

    res.status(500).json({
      error: "Failed to delete account.",
      detail: err?.code ? `Database error code: ${err.code}` : "Unexpected server error."
    });
  } finally {
    client.release();
  }
});

module.exports = router;
