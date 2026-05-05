const express = require('express');
const { verifyToken } = require('../middleware/auth.middleware.js');
const { pool } = require('../db.js');
const { resolveBusinessIdForUser } = require('../api/utils/resolveBusinessIdForUser.js');

const router = express.Router();

function normalizeRegion(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === 'CA' || raw === 'CAN' || raw === 'CANADA') return 'CA';
  if (raw === 'US' || raw === 'USA' || raw === 'UNITED STATES') return 'US';
  return null;
}

function detectRegionFromRequest(req) {
  const headerCandidates = [
    req.get('cf-ipcountry'),
    req.get('x-vercel-ip-country'),
    req.get('x-country-code'),
    req.get('x-appengine-country'),
    req.get('cloudfront-viewer-country')
  ];

  for (const candidate of headerCandidates) {
    const normalized = normalizeRegion(candidate);
    if (normalized) return { region: normalized, source: 'edge_header' };
  }

  const acceptLanguage = String(req.get('accept-language') || '').toLowerCase();
  if (acceptLanguage.includes('en-ca') || acceptLanguage.includes('fr-ca')) {
    return { region: 'CA', source: 'accept_language' };
  }

  return { region: 'US', source: 'default' };
}

function getBearerToken(req) {
  const authHeader = String(req.get('authorization') || '').trim();
  return authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice('bearer '.length).trim()
    : '';
}

async function updateAuthenticatedBusinessRegionIfNeeded(req, region) {
  const token = getBearerToken(req);
  if (!token) return false;

  let user;
  try {
    user = verifyToken(token);
  } catch (_) {
    return false;
  }

  if (!user?.id) return false;
  const businessId = await resolveBusinessIdForUser(user);
  await pool.query(
    `UPDATE businesses
        SET region = $2,
            updated_at = NOW()
      WHERE id = $1
        AND region IS DISTINCT FROM $2`,
    [businessId, region]
  );
  return true;
}

router.get('/detect', async (req, res) => {
  const detected = detectRegionFromRequest(req);
  let persisted = false;

  try {
    persisted = await updateAuthenticatedBusinessRegionIfNeeded(req, detected.region);
  } catch (_) {
    persisted = false;
  }

  res.json({
    region: detected.region,
    country: detected.region,
    source: detected.source,
    persisted
  });
});

module.exports = router;
module.exports.detectRegionFromRequest = detectRegionFromRequest;
module.exports.normalizeRegion = normalizeRegion;
