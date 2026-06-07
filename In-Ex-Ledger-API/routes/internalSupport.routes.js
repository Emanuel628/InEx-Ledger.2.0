const express = require("express");
const { pool } = require("../db.js");
const { requireSupportSecret } = require("../middleware/requireSupportSecret.js");
const {
  findBillingAnchorBusinessIdForUser,
  getSubscriptionSnapshotForBusiness
} = require("../services/subscriptionService.js");

const router = express.Router();
router.use(requireSupportSecret);

function buildPlanSnapshot(subscription) {
  return {
    plan: subscription?.effectiveTier || "free",
    subscriptionStatus: subscription?.effectiveStatus || subscription?.status || "inactive",
    additionalBusinessSlots: Math.max(Number(subscription?.additionalBusinesses || 0), 0),
    businessLimit: Math.max(Number(subscription?.maxBusinessesAllowed || 1), 1),
    currentPeriodEnd: subscription?.currentPeriodEnd
      ? new Date(subscription.currentPeriodEnd).toISOString()
      : null,
    cancelAtPeriodEnd: Boolean(subscription?.cancelAtPeriodEnd)
  };
}

async function fetchUserContextById(userId) {
  const userResult = await pool.query(
    `SELECT id,
            email,
            COALESCE(NULLIF(BTRIM(display_name), ''), NULLIF(BTRIM(full_name), ''), email) AS display_name,
            email_verified,
            role,
            created_at,
            active_business_id
       FROM users
      WHERE id = $1
      LIMIT 1`,
    [userId]
  );
  const user = userResult.rows[0] || null;
  if (!user) {
    return null;
  }

  const contextBusinessResult = await pool.query(
    `SELECT id, region, language
       FROM businesses
      WHERE user_id = $1
      ORDER BY
        CASE WHEN id = $2 THEN 0 ELSE 1 END,
        created_at ASC,
        id ASC
      LIMIT 1`,
    [user.id, user.active_business_id || null]
  );
  const contextBusiness = contextBusinessResult.rows[0] || null;
  const billingBusinessId = contextBusiness
    ? await findBillingAnchorBusinessIdForUser(user.id, user.active_business_id || contextBusiness.id)
    : null;
  const subscription = billingBusinessId
    ? await getSubscriptionSnapshotForBusiness(billingBusinessId)
    : null;
  const planSnapshot = buildPlanSnapshot(subscription);

  return {
    user,
    contextBusiness,
    subscription,
    planSnapshot
  };
}

router.get("/users/:email", async (req, res) => {
  try {
    const email = String(req.params.email || "").trim();
    const userLookup = await pool.query(
      `SELECT id
         FROM users
        WHERE lower(email) = lower($1)
        LIMIT 1`,
      [email]
    );
    const userId = userLookup.rows[0]?.id || null;
    if (!userId) {
      return res.status(404).json({ ok: false, message: "User not found." });
    }

    const context = await fetchUserContextById(userId);
    if (!context) {
      return res.status(404).json({ ok: false, message: "User not found." });
    }

    return res.json({
      ok: true,
      item: {
        userId: context.user.id,
        email: context.user.email,
        displayName: context.user.display_name,
        emailVerified: context.user.email_verified === true,
        role: context.user.role || "user",
        plan: context.planSnapshot.plan,
        subscriptionStatus: context.planSnapshot.subscriptionStatus,
        region: context.contextBusiness?.region || "US",
        language: context.contextBusiness?.language || "en",
        createdAt: new Date(context.user.created_at).toISOString()
      }
    });
  } catch (_err) {
    return res.status(500).json({ ok: false, message: "Failed to load user." });
  }
});

router.get("/businesses/:businessId", async (req, res) => {
  try {
    const businessResult = await pool.query(
      `SELECT b.id,
              b.name,
              b.user_id,
              b.region,
              b.language,
              b.created_at,
              u.email AS owner_email,
              u.active_business_id
         FROM businesses b
         JOIN users u
           ON u.id = b.user_id
        WHERE b.id = $1
        LIMIT 1`,
      [req.params.businessId]
    );
    const business = businessResult.rows[0] || null;
    if (!business) {
      return res.status(404).json({ ok: false, message: "Business not found." });
    }

    const billingBusinessId =
      await findBillingAnchorBusinessIdForUser(
        business.user_id,
        business.active_business_id || business.id
      ) || business.id;
    const subscription = billingBusinessId
      ? await getSubscriptionSnapshotForBusiness(billingBusinessId)
      : null;
    const planSnapshot = buildPlanSnapshot(subscription);

    return res.json({
      ok: true,
      item: {
        businessId: business.id,
        businessName: business.name,
        ownerUserId: business.user_id,
        ownerEmail: business.owner_email,
        plan: planSnapshot.plan,
        subscriptionStatus: planSnapshot.subscriptionStatus,
        includedBusinesses: 1,
        additionalBusinessSlots: planSnapshot.additionalBusinessSlots,
        businessLimit: planSnapshot.businessLimit,
        region: business.region || "US",
        language: business.language || "en",
        createdAt: new Date(business.created_at).toISOString()
      }
    });
  } catch (_err) {
    return res.status(500).json({ ok: false, message: "Failed to load business." });
  }
});

router.get("/users/:userId/subscription", async (req, res) => {
  try {
    const context = await fetchUserContextById(req.params.userId);
    if (!context) {
      return res.status(404).json({ ok: false, message: "User not found." });
    }

    return res.json({
      ok: true,
      item: {
        userId: context.user.id,
        plan: context.planSnapshot.plan,
        subscriptionStatus: context.planSnapshot.subscriptionStatus,
        currentPeriodEnd: context.planSnapshot.currentPeriodEnd,
        cancelAtPeriodEnd: context.planSnapshot.cancelAtPeriodEnd,
        additionalBusinessSlots: context.planSnapshot.additionalBusinessSlots
      }
    });
  } catch (_err) {
    return res.status(500).json({ ok: false, message: "Failed to load subscription." });
  }
});

module.exports = router;
