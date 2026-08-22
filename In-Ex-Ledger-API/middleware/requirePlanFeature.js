const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");
const { getSubscriptionSnapshotForBusiness, hasFeatureAccess } = require("../services/subscriptionService.js");
const { FEATURE_LABELS, PLAN_CODES } = require("../config/planCatalog.js");
const { logError } = require("../utils/logger.js");

/**
 * Builds the standard "this plan doesn't include this feature" response body
 * (HTTP 403, code "feature_requires_plan"). Exported so route handlers that
 * already resolved `subscription` mid-request for other reasons (and so
 * can't cleanly insert this as a leading middleware) can still respond with
 * the same shape requirePlanFeature() uses, rather than a bespoke 402.
 */
function buildFeatureRequiresPlanResponse(subscription, featureKey) {
  const currentPlan = subscription?.effectiveTier || PLAN_CODES.BASIC;
  const label = FEATURE_LABELS[featureKey] || "This feature";
  return {
    error: `${label} ${label.endsWith("s") ? "are" : "is"} available on Pro.`,
    code: "feature_requires_plan",
    feature: featureKey,
    current_plan: currentPlan,
    required_plan: PLAN_CODES.PRO,
    required_plan_name: "Pro"
  };
}

/**
 * Express middleware factory gating a route on a canonical plan feature key
 * (see config/planCatalog.js FEATURE_KEYS). Resolves the business and
 * subscription snapshot once and attaches them to `req` so downstream
 * handlers and other requirePlanFeature() calls in the same request don't
 * re-query for them.
 *
 * Responds 403 with a structured, consistent body when the feature isn't
 * available on the caller's current plan -- never silently falls through.
 */
function requirePlanFeature(featureKey) {
  return async function requirePlanFeatureMiddleware(req, res, next) {
    try {
      const businessId = req.businessId || (req.businessId = await resolveBusinessIdForUser(req.user));
      const subscription = req.subscription || (req.subscription = await getSubscriptionSnapshotForBusiness(businessId));

      if (hasFeatureAccess(subscription, featureKey)) {
        return next();
      }

      return res.status(403).json(buildFeatureRequiresPlanResponse(subscription, featureKey));
    } catch (err) {
      logError(`requirePlanFeature(${featureKey}) error:`, err);
      next(err);
    }
  };
}

module.exports = { requirePlanFeature, buildFeatureRequiresPlanResponse };
