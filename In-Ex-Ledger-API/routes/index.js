const arApService = require('../services/arApService');
// AR/AP summary endpoint (feature-flagged)
router.get('/arap-summary', async (req, res) => {
	if (process.env.ENABLE_V2_BUSINESS !== 'true') {
		return res.status(403).json({ error: 'V2/Business features are not enabled.' });
	}
	const businessId = req.user?.business_id || req.user?.active_business_id || null;
	if (!businessId) {
		return res.status(400).json({ error: 'Missing business context.' });
	}
	try {
		const summary = await arApService.getArApSummary(businessId);
		res.json(summary);
	} catch (err) {
		res.status(500).json({ error: 'Failed to load AR/AP summary.' });
	}
});
// V2/Business modules (feature-flagged)
const vendorsRoutes = require('./vendors.routes');
const customersRoutes = require('./customers.routes');
const invoicesRoutes = require('./invoices.routes');
const billsRoutes = require('./bills.routes');
// Feature flag for V2/Business modules
const ENABLE_V2_BUSINESS = process.env.ENABLE_V2_BUSINESS === 'true';

if (ENABLE_V2_BUSINESS) {
	router.use('/vendors', vendorsRoutes);
	router.use('/customers', customersRoutes);
	router.use('/invoices', invoicesRoutes);
	router.use('/bills', billsRoutes);
}
const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes.js');
const accountsRoutes = require('./accounts.routes.js');
const receiptsRoutes = require('./receipts.routes.js');
const categoriesRoutes = require('./categories.routes.js');
const exportsRoutes = require('./exports.routes.js');
const businessRoutes = require('./business.routes.js');
const systemRoutes = require('./system.routes.js');
const meRoutes = require('./me.routes.js');
const cryptoRoutes = require('./crypto.routes.js');
const privacyRoutes = require('./privacy.routes.js');
const mileageRoutes = require('./mileage.routes.js');
const sessionsRoutes = require('./sessions.routes.js');
const billingRoutes = require('./billing.routes.js');
const recurringRoutes = require('./recurring.routes.js');
const businessesRoutes = require('./businesses.routes.js');
const cpaAccessRoutes = require('./cpa-access.routes.js');
const cpaVerificationRoutes = require('./cpa-verification.routes.js');
const analyticsRoutes = require('./analytics.routes.js');
const messagesRoutes = require('./messages.routes.js');
const consentRoutes = require('./consent.routes.js');
const checkEmailVerifiedRoutes = require('./check-email-verified.routes.js');

router.use('/auth', authRoutes);
router.use('/accounts', accountsRoutes);
router.use('/receipts', receiptsRoutes);
router.use('/categories', categoriesRoutes);
router.use('/exports', exportsRoutes);
router.use('/business', businessRoutes);
router.use('/system', systemRoutes);
router.use('/me', meRoutes);
router.use('/crypto', cryptoRoutes);
router.use('/privacy', privacyRoutes);
router.use('/mileage', mileageRoutes);
router.use('/sessions', sessionsRoutes);
router.use('/billing', billingRoutes);
router.use('/recurring', recurringRoutes);
router.use('/businesses', businessesRoutes);
router.use('/cpa-access', cpaAccessRoutes);
router.use('/cpa-verification', cpaVerificationRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/messages', messagesRoutes);
router.use('/consent', consentRoutes);
router.use('/check-email-verified', checkEmailVerifiedRoutes);

module.exports = router;
