const express = require('express');
const router = express.Router();
const arApService = require('../services/arApService');
const { requireAuth } = require('../middleware/auth.middleware.js');
const { resolveBusinessIdForUser } = require('../api/utils/resolveBusinessIdForUser.js');
const { getSubscriptionSnapshotForBusiness, PLAN_PRO, PLAN_BUSINESS } = require('../services/subscriptionService.js');
const { allowTrustedBrowserAccountSwitch, rememberTrustedBrowserOnLogout } = require('../middleware/accountSwitchMfaTrust.js');
const { requireV2BusinessEnabled, requireV2Entitlement } = require('../api/utils/requireV2BusinessEnabled.js');

const businessTierOnly = [requireV2BusinessEnabled, requireV2Entitlement];

async function getEffectiveTierForRequest(req) {
  const businessId = await resolveBusinessIdForUser(req.user);
  const subscription = await getSubscriptionSnapshotForBusiness(businessId);
  return subscription?.effectiveTier || null;
}

router.use('/auth/login', allowTrustedBrowserAccountSwitch);
router.use('/auth/logout', rememberTrustedBrowserOnLogout);

router.get('/arap-summary', ...businessTierOnly, async (req, res) => {
  try {
    res.json(await arApService.getArApSummary(req.business.id));
  } catch (_) {
    res.status(500).json({ error: 'Failed to load AR/AP summary.' });
  }
});

// Optional paid-feature preload endpoints should not create noisy 402 console errors
// when a page checks for data the current plan does not include.
router.get('/recurring', requireAuth, async (req, res, next) => {
  try {
    const tier = await getEffectiveTierForRequest(req);
    if (tier !== PLAN_BUSINESS) {
      return res.json([]);
    }
    return next();
  } catch (_) {
    return next();
  }
});

router.get('/exports/history', requireAuth, async (req, res, next) => {
  try {
    const tier = await getEffectiveTierForRequest(req);
    if (tier !== PLAN_PRO && tier !== PLAN_BUSINESS) {
      return res.json([]);
    }
    return next();
  } catch (_) {
    return next();
  }
});

const ENABLE_V2_BUSINESS = process.env.ENABLE_V2_BUSINESS === 'true';
if (ENABLE_V2_BUSINESS) {
  router.use('/vendors', ...businessTierOnly, require('./vendors.routes'));
  router.use('/customers', ...businessTierOnly, require('./customers.routes'));
  router.use('/invoices', ...businessTierOnly, require('./invoices.routes'));
  router.use('/bills', ...businessTierOnly, require('./bills.routes'));
  router.use('/projects', ...businessTierOnly, require('./projects.routes'));
  router.use('/billable-expenses', ...businessTierOnly, require('./billable-expenses.routes'));
}

router.use('/auth', require('./auth.routes.js'));
router.use('/accounts', require('./accounts.routes.js'));
router.use('/receipts', require('./receipts.routes.js'));
router.use('/categories', require('./categories.routes.js'));
router.use('/exports', require('./exports.routes.js'));
router.use('/business', require('./business.routes.js'));
router.use('/system', require('./system.routes.js'));
router.use('/me', require('./me.routes.js'));
router.use('/crypto', require('./crypto.routes.js'));
router.use('/privacy', require('./privacy.routes.js'));
router.use('/region', require('./region.routes.js'));
router.use('/entitlements', require('./entitlements.routes.js'));
router.use('/mileage', require('./mileage.routes.js'));
router.use('/sessions', require('./sessions.routes.js'));
router.use('/billing', require('./billing.routes.js'));
router.use('/recurring', require('./recurring.routes.js'));
router.use('/businesses', require('./businesses.routes.js'));
router.use('/cpa-access', require('./cpa-access.routes.js'));
router.use('/cpa-verification', require('./cpa-verification.routes.js'));
router.use('/analytics', require('./analytics.routes.js'));
router.use('/invoices-v1', require('./invoices-v1.routes.js'));
router.use('/messages', require('./messages.routes.js'));
router.use('/consent', require('./consent.routes.js'));
router.use('/check-email-verified', require('./check-email-verified.routes.js'));

module.exports = router;
