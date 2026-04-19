// V2/Business feature flag and entitlement middleware

const { getSubscriptionSnapshotForBusiness } = require("../../services/subscriptionService.js");
const { resolveBusinessIdForUser } = require("./resolveBusinessIdForUser.js");

async function requireV2BusinessEnabled(req, res, next) {
  if (!req.user?.id) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (process.env.ENABLE_V2_BUSINESS !== 'true') {
    return res.status(403).json({ error: 'V2/Business features are not enabled.' });
  }
  try {
    const user = req.user;
    const businessId = user?.business_id || user?.active_business_id || (await resolveBusinessIdForUser(user));
    if (!businessId) {
      return res.status(400).json({ error: 'Missing business context.' });
    }
    req.business = req.business || {};
    req.business.id = businessId;
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


function requireV2Entitlement(req, res, next) {
  next();
}

module.exports = { requireV2BusinessEnabled, requireV2Entitlement };
