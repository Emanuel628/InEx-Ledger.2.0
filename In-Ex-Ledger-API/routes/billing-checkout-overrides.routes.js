const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");
const {
  findBillingAnchorBusinessIdForUser,
  getSubscriptionSnapshotForBusiness
} = require("../services/subscriptionService.js");
const { pool } = require("../db.js");
const { logError, logInfo } = require("../utils/logger.js");

const router = express.Router();

async function getBillingBusinessId(user) {
  const activeBusinessId = await resolveBusinessIdForUser(user);
  return (await findBillingAnchorBusinessIdForUser(user?.id, activeBusinessId)) || activeBusinessId;
}

function isTrialReupgradeAttempt(subscription) {
  return Boolean(
    subscription?.isTrialing &&
    (
      subscription.cancelAtPeriodEnd ||
      subscription.isTrialDowngradedToFree ||
      subscription.selectedPlanCode !== "v1" ||
      subscription.trialPlanSelection === "free"
    )
  );
}

router.post("/checkout-session", requireAuth, requireCsrfProtection, async (req, res, next) => {
  try {
    const businessId = await getBillingBusinessId(req.user);
    const subscription = await getSubscriptionSnapshotForBusiness(businessId);

    if (!isTrialReupgradeAttempt(subscription)) {
      return next();
    }

    // The existing checkout route blocks when cancel_at_period_end makes a
    // still-trialing account look like paid remaining access. Clear only that
    // blocker so the original route can create the normal Stripe checkout.
    await pool.query(
      `UPDATE business_subscriptions
          SET cancel_at_period_end = false,
              canceled_at = NULL,
              updated_at = NOW()
        WHERE business_id = $1
          AND status = 'trialing'`,
      [businessId]
    );

    logInfo("Normalized downgraded trial before checkout", {
      businessId,
      userId: req.user?.id,
      selectedPlanCode: subscription.selectedPlanCode,
      trialPlanSelection: subscription.trialPlanSelection
    });

    return next();
  } catch (err) {
    logError("Trial checkout normalization failed", { message: err.message });
    return next();
  }
});

module.exports = router;
