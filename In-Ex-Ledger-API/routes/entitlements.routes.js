const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware.js');
const { resolveBusinessIdForUser } = require('../api/utils/resolveBusinessIdForUser.js');
const { getSubscriptionSnapshotForBusiness, PLAN_PRO, PLAN_BUSINESS } = require('../services/subscriptionService.js');
const { logError } = require('../utils/logger.js');

const router = express.Router();
router.use(requireAuth);

function buildEntitlements(subscription) {
  const effectiveTier = subscription?.effectiveTier || null;
  const isPro = effectiveTier === PLAN_PRO;
  const isBusiness = effectiveTier === PLAN_BUSINESS;

  return {
    effective_tier: effectiveTier,
    quick_add_sidebar_enabled: isPro || isBusiness,
    business_quick_add_enabled: isBusiness,
    recurring_templates_enabled: isPro || isBusiness,
    export_history_enabled: isPro || isBusiness,
    receipts_enabled: isPro || isBusiness,
    edge_case_tools_enabled: isPro || isBusiness,
    tax_estimates_enabled: isPro || isBusiness,
    advanced_exports_enabled: isPro || isBusiness
  };
}

router.get('/features', async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const subscription = await getSubscriptionSnapshotForBusiness(businessId);
    res.json(buildEntitlements(subscription));
  } catch (err) {
    logError('GET /entitlements/features error:', err.stack || err);
    res.status(500).json({ error: 'Failed to load feature entitlements.' });
  }
});

module.exports = router;
