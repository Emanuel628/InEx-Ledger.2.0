/**
 * CPA Verification Routes
 *
 * POST /api/cpa-verification/verify
 *   Submit (or re-submit) a CPA licence number for verification.
 *   The result is persisted to the user's profile.
 *
 * GET /api/cpa-verification/status
 *   Return the current verification status for the authenticated user.
 */

const express = require('express');
const { requireAuth, requireMfa } = require('../middleware/auth.middleware.js');
const { createDataApiLimiter } = require('../middleware/rate-limit.middleware.js');
const { logError, logWarn, logInfo } = require("../utils/logger.js");
const {
  verifyCpaLicense,
  getCpaVerificationStatus
} = require('../services/cpaVerificationService.js');

const router = express.Router();

// Apply a general rate limit before authentication to prevent brute-force
// attacks against the auth check itself.
router.use(createDataApiLimiter({ max: 60 }));
router.use(requireAuth);
router.use(requireMfa);

// Verification calls hit an external API – apply a conservative rate limit.
const verifyLimiter = createDataApiLimiter({ windowMs: 15 * 60 * 1000, max: 10 });

/**
 * POST /api/cpa-verification/verify
 *
 * Body:
 *   { license_number: string, jurisdiction?: string }
 *
 * The jurisdiction should be a two-letter state/province or country code
 * (e.g. "ON", "CA", "NY", "US").
 */
router.post('/verify', verifyLimiter, async (req, res) => {
  try {
    const licenseNumber = String(req.body?.license_number || '').trim();
    const jurisdiction = String(req.body?.jurisdiction || '').trim().toUpperCase() || undefined;

    if (!licenseNumber) {
      return res.status(400).json({ error: 'license_number is required.' });
    }

    const clientIp = req.ip || req.socket?.remoteAddress || null;
    const result = await verifyCpaLicense(
      req.user.id,
      licenseNumber,
      jurisdiction,
      clientIp
    );

    res.json(result);
  } catch (error) {
    const message = error?.message || 'Licence verification failed.';
    const status = /required/i.test(message) ? 400 : 503;
    logError('POST /api/cpa-verification/verify error:', message);
    res.status(status).json({ error: message });
  }
});

/**
 * GET /api/cpa-verification/status
 *
 * Returns the current CPA licence verification state for the caller.
 */
router.get('/status', async (req, res) => {
  try {
    const verificationStatus = await getCpaVerificationStatus(req.user.id);
    if (!verificationStatus) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json(verificationStatus);
  } catch (error) {
    logError('GET /api/cpa-verification/status error:', error.message);
    res.status(500).json({ error: 'Failed to load verification status.' });
  }
});

module.exports = router;
