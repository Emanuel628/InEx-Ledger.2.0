// V2/Business feature flag and entitlement middleware

const { getSubscriptionSnapshotForBusiness } = require("../../services/subscriptionService.js");
const { resolveBusinessIdForUser } = require("./resolveBusinessIdForUser.js");

async function requireV2BusinessEnabled(req, res, next) {
  if (process.env.ENABLE_V2_BUSINESS !== 'true') {
    return res.status(403).json({ error: 'V2/Business features are not enabled.' });
  }
  try {
    // Resolve business context
    const user = req.user;
    const businessId = user?.business_id || user?.active_business_id || (await resolveBusinessIdForUser(user));
    if (!businessId) {
      return res.status(400).json({ error: 'Missing business context.' });
    }
    // Attach businessId to req for downstream use
    req.business = req.business || {};
    req.business.id = businessId;
    // Get subscription
    const subscription = await getSubscriptionSnapshotForBusiness(businessId);
    if (!subscription || subscription.effectiveTier !== 'v2') {
      return res.status(403).json({ error: 'Your current plan does not include Business features.' });
    }
    req.business.subscription = subscription;
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Failed to check entitlements.' });
  }
}


// Optionally, this can be extended for per-feature checks in the future
function requireV2Entitlement(req, res, next) {
  // For now, just pass through (already checked in requireV2BusinessEnabled)
  next();
}

module.exports = { requireV2BusinessEnabled, requireV2Entitlement };
