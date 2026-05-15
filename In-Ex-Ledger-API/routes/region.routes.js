const express = require('express');

const router = express.Router();
const TRUST_EDGE_REGION_HEADERS = process.env.TRUST_EDGE_REGION_HEADERS === 'true';

function normalizeRegion(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === 'CA' || raw === 'CAN' || raw === 'CANADA') return 'CA';
  if (raw === 'US' || raw === 'USA' || raw === 'UNITED STATES') return 'US';
  return null;
}

function detectRegionFromRequest(req, options = {}) {
  const trustEdgeHeaders = options.trustEdgeHeaders ?? TRUST_EDGE_REGION_HEADERS;

  if (trustEdgeHeaders) {
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
  }

  const acceptLanguage = String(req.get('accept-language') || '').toLowerCase();
  if (acceptLanguage.includes('en-ca') || acceptLanguage.includes('fr-ca')) {
    return { region: 'CA', source: 'accept_language' };
  }

  return { region: 'US', source: 'default' };
}

router.get('/detect', (req, res) => {
  const detected = detectRegionFromRequest(req);
  res.json({
    region: detected.region,
    country: detected.region,
    source: detected.source,
    persisted: false
  });
});

module.exports = router;
module.exports.detectRegionFromRequest = detectRegionFromRequest;
module.exports.normalizeRegion = normalizeRegion;
