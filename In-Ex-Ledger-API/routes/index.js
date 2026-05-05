const express = require('express');
const router = express.Router();
const arApService = require('../services/arApService');
const { allowTrustedBrowserAccountSwitch, rememberTrustedBrowserOnLogout } = require('../middleware/accountSwitchMfaTrust.js');
const { requireV2BusinessEnabled, requireV2Entitlement } = require('../api/utils/requireV2BusinessEnabled.js');

router.use('/auth/login', allowTrustedBrowserAccountSwitch);
router.use('/auth/logout', rememberTrustedBrowserOnLogout);

router.get('/arap-summary', requireV2BusinessEnabled, requireV2Entitlement, async (req, res) => {
  try {
    res.json(await arApService.getArApSummary(req.business.id));
  } catch (_) {
    res.status(500).json({ error: 'Failed to load AR/AP summary.' });
  }
});

const ENABLE_V2_BUSINESS = process.env.ENABLE_V2_BUSINESS === 'true';
if (ENABLE_V2_BUSINESS) {
  router.use('/vendors', require('./vendors.routes'));
  router.use('/customers', require('./customers.routes'));
  router.use('/invoices', require('./invoices.routes'));
  router.use('/bills', require('./bills.routes'));
  router.use('/projects', require('./projects.routes'));
  router.use('/billable-expenses', require('./billable-expenses.routes'));
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
router.use('/mileage', require('./mileage.routes.js'));
router.use('/sessions', require('./sessions.routes.js'));
router.use('/billing', require('./billing-checkout-overrides.routes.js'));
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
