// V2/Business feature flag and entitlement middleware
function requireV2BusinessEnabled(req, res, next) {
  if (process.env.ENABLE_V2_BUSINESS !== 'true') {
    return res.status(403).json({ error: 'V2/Business features are not enabled.' });
  }
  // TODO: Add real entitlement checks here (e.g., req.user.entitlements)
  next();
}

// Placeholder for future entitlement logic
function requireV2Entitlement(req, res, next) {
  // TODO: Implement real entitlement checks
  next();
}

module.exports = { requireV2BusinessEnabled, requireV2Entitlement };
