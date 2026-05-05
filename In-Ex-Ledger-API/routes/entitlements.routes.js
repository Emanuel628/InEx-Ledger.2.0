const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware.js');
const { resolveBusinessIdForUser } = require('../api/utils/resolveBusinessIdForUser.js');
const { getSubscriptionSnapshotForBusiness, PLAN_BUSINESS } = require('../services/subscriptionService.js');
const { logError } = require('../utils/logger.js');

const router = express.Router();
router.use(requireAuth);

router.get('/quick-add', async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const subscription = await getSubscriptionSnapshotForBusiness(businessId);
    const effectiveTier = subscription?.effectiveTier || null;

    res.json({
      effective_tier: effectiveTier,
      business_quick_add_enabled: effectiveTier === PLAN_BUSINESS
    });
  } catch (err) {
    logError('GET /entitlements/quick-add error:', err.stack || err);
    res.status(500).json({ error: 'Failed to load quick add entitlements.' });
  }
});

module.exports = router;
