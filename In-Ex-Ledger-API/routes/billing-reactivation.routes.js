const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { createBillingMutationLimiter } = require("../middleware/rateLimitTiers.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");
const {
  findBillingAnchorBusinessIdForUser,
  getSubscriptionSnapshotForBusiness,
  syncStripeSubscriptionForBusiness,
  setTrialPlanSelectionForBusiness
} = require("../services/subscriptionService.js");
const { logError, logInfo } = require("../utils/logger.js");

const router = express.Router();
const STRIPE_API_BASE = "https://api.stripe.com/v1";
const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION || "2026-02-25.clover";
const billingMutationLimiter = createBillingMutationLimiter();

function getStripeSecretKey() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return process.env.STRIPE_SECRET_KEY;
}

function encodeFormBody(payload) {
  const params = new URLSearchParams();
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.append(key, String(value));
    }
  });
  return params.toString();
}

async function stripeRequest(path, payload) {
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getStripeSecretKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": STRIPE_API_VERSION
    },
    body: encodeFormBody(payload)
  });

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(json?.error?.message || `Stripe request failed (${response.status})`);
  }

  return json;
}

function normalizeAdditionalBusinesses(input) {
  if (input === undefined || input === null || input === "") {
    return undefined;
  }
  const value = Number(input);
  if (!Number.isSafeInteger(value) || value < 0 || value > 100) {
    return undefined;
  }
  return value;
}

async function resolveBillingBusinessScope(user) {
  const activeBusinessId = await resolveBusinessIdForUser(user);
  const billingBusinessId =
    await findBillingAnchorBusinessIdForUser(user?.id, activeBusinessId) || activeBusinessId;
  return { activeBusinessId, billingBusinessId };
}

router.post("/reactivate-trial-pro", requireAuth, requireCsrfProtection, billingMutationLimiter, async (req, res) => {
  try {
    const { billingBusinessId } = await resolveBillingBusinessScope(req.user);
    const subscription = await getSubscriptionSnapshotForBusiness(billingBusinessId);

    if (!subscription?.isTrialing) {
      return res.status(409).json({
        error: "Pro can only be reactivated this way while the free trial is still active."
      });
    }

    const shouldReactivate =
      subscription.isTrialDowngradedToFree ||
      subscription.cancelAtPeriodEnd ||
      subscription.selectedPlanCode !== "v1";

    if (!shouldReactivate) {
      return res.status(409).json({
        error: "Pro is already selected for this trial."
      });
    }

    const additionalBusinesses = normalizeAdditionalBusinesses(req.body?.additionalBusinesses);

    if (subscription.stripeSubscriptionId) {
      const stripeSubscription = await stripeRequest(
        `/subscriptions/${subscription.stripeSubscriptionId}`,
        {
          cancel_at_period_end: false,
          "metadata[plan_code]": "v1"
        }
      );
      await syncStripeSubscriptionForBusiness(billingBusinessId, stripeSubscription);
    }

    await setTrialPlanSelectionForBusiness(billingBusinessId, "v1", additionalBusinesses);
    const updated = await getSubscriptionSnapshotForBusiness(billingBusinessId);

    logInfo("Trial Pro reactivated", {
      userId: req.user?.id,
      businessId: billingBusinessId,
      stripeSubscriptionId: subscription.stripeSubscriptionId || null
    });

    res.status(200).json({
      reactivated: true,
      subscription: updated
    });
  } catch (err) {
    logError("POST /api/billing/reactivate-trial-pro error:", err.message);
    res.status(500).json({ error: "Failed to reactivate Pro trial." });
  }
});

module.exports = router;
