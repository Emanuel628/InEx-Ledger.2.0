'use strict';

/**
 * cpaVerificationService.js
 *
 * Handles professional CPA licence verification against a configurable
 * third-party API (Middesk, Trulioo, etc.).  When no API key is configured
 * the service operates in "mock" mode so that local development and CI work
 * without external credentials.
 *
 * Environment variables:
 *   CPA_VERIFICATION_PROVIDER  – "middesk" | "trulioo" | "mock" (default: "mock")
 *   CPA_VERIFICATION_API_KEY   – secret key supplied by the chosen provider
 *   CPA_VERIFICATION_TIMEOUT_MS – HTTP timeout in ms (default: 10000)
 *
 * Verified CPAs must have:
 *   cpa_license_status = 'active'
 *   cpa_license_verified = true
 */

const crypto = require('crypto');
const https = require('https');
const { pool } = require('../db.js');
const { logError, logWarn, logInfo } = require("../utils/logger.js");

const PROVIDER = (process.env.CPA_VERIFICATION_PROVIDER || 'mock').toLowerCase();
const API_KEY = process.env.CPA_VERIFICATION_API_KEY || '';
const TIMEOUT_MS = Number(process.env.CPA_VERIFICATION_TIMEOUT_MS) || 10_000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Minimal HTTPS POST helper – avoids adding a new HTTP-client dependency.
 * Returns the parsed JSON response body.
 */
function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request(
      {
        hostname,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          ...headers
        },
        timeout: TIMEOUT_MS
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error('CPA verification API request timed out'));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Provider adapters
// ---------------------------------------------------------------------------

/**
 * Mock adapter – always succeeds in development when no real API key exists.
 * Returns a deterministic result based on the licence number so tests can
 * exercise both "active" and "not_found" branches.
 */
async function verifyWithMock(licenseNumber, jurisdiction) {
  // Simulate async latency
  await new Promise((r) => setTimeout(r, 50));

  const num = String(licenseNumber || '').trim().toUpperCase();
  if (!num) {
    return { found: false, status: 'not_found', message: 'Licence number is required.' };
  }
  // Numbers ending in "0" simulate a non-active status (for test coverage).
  if (num.endsWith('0')) {
    return { found: true, status: 'inactive', message: 'Licence is not active.' };
  }
  return {
    found: true,
    status: 'active',
    message: 'Licence is active and in good standing.',
    verifiedName: 'Mock CPA Professional',
    jurisdiction: jurisdiction || 'US'
  };
}

/**
 * Middesk adapter – calls the Middesk "Business Verification" / licence
 * look-up endpoint. Replace the path/hostname if Middesk updates their API.
 */
async function verifyWithMiddesk(licenseNumber, jurisdiction) {
  if (!API_KEY) {
    throw new Error('CPA_VERIFICATION_API_KEY is required for Middesk verification.');
  }

  const { status, body } = await httpsPost(
    'api.middesk.com',
    '/v1/businesses/verify-license',
    { Authorization: `Bearer ${API_KEY}` },
    { license_number: licenseNumber, jurisdiction }
  );

  if (status === 404 || (body && body.found === false)) {
    return { found: false, status: 'not_found', message: 'Licence not found.' };
  }
  if (status !== 200) {
    throw new Error(`Middesk API error ${status}: ${JSON.stringify(body)}`);
  }

  const licStatus = String(body?.license_status || '').toLowerCase();
  const isActive = licStatus === 'active';
  return {
    found: true,
    status: isActive ? 'active' : licStatus || 'unknown',
    message: isActive
      ? 'Licence is active and in good standing.'
      : `Licence status: ${licStatus}.`,
    verifiedName: body?.name || null,
    jurisdiction: body?.jurisdiction || jurisdiction
  };
}

/**
 * Trulioo adapter – calls the Trulioo "Business Verification" endpoint.
 */
async function verifyWithTrulioo(licenseNumber, jurisdiction) {
  if (!API_KEY) {
    throw new Error('CPA_VERIFICATION_API_KEY is required for Trulioo verification.');
  }

  const { status, body } = await httpsPost(
    'api.globaldatacompany.com',
    '/verifications/v1/verify',
    { 'x-trulioo-api-key': API_KEY },
    {
      CountryCode: jurisdiction || 'US',
      DataFields: {
        Business: { LicenseNumber: licenseNumber }
      }
    }
  );

  if (status !== 200) {
    throw new Error(`Trulioo API error ${status}: ${JSON.stringify(body)}`);
  }

  const record = body?.Record;
  const recordStatus = String(record?.RecordStatus || '').toLowerCase();
  const isActive = recordStatus === 'match';
  const datasourceFields = record?.DatasourceResults?.[0]?.DatasourceFields || [];
  const licenseInfo = datasourceFields.find((f) => f.FieldName === 'LicenseStatus');
  const licStatus = String(licenseInfo?.Status || (isActive ? 'active' : 'no_match')).toLowerCase();
  const nameField = datasourceFields.find((f) => f.FieldName === 'Name');
  return {
    found: isActive,
    status: isActive ? 'active' : licStatus,
    message: isActive
      ? 'Licence is active and in good standing.'
      : `Verification status: ${recordStatus}.`,
    verifiedName: nameField?.Data || null,
    jurisdiction
  };
}

// ---------------------------------------------------------------------------
// Verification audit logger
// ---------------------------------------------------------------------------

async function logVerificationEvent({ userId, action, metadata }) {
  try {
    await pool.query(
      `INSERT INTO cpa_audit_logs
         (id, actor_user_id, owner_user_id, action, metadata)
       VALUES ($1, $2, $2, $3, $4::jsonb)`,
      [crypto.randomUUID(), userId, action, JSON.stringify(metadata || {})]
    );
  } catch (err) {
    // Logging failures must never block the main flow
    logError('cpaVerificationService: failed to write audit log:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Submits a CPA licence for verification and persists the result to the
 * user's profile.
 *
 * @param {string} userId           – authenticated user's UUID
 * @param {string} licenseNumber    – the licence number to verify
 * @param {string} [jurisdiction]   – two-letter state/province or country code
 * @param {string} [ipAddress]      – client IP for audit logging
 * @returns {{ verified: boolean, status: string, message: string }}
 */
async function verifyCpaLicense(userId, licenseNumber, jurisdiction, ipAddress) {
  const num = String(licenseNumber || '').trim();
  if (!num) {
    throw new Error('License number is required.');
  }

  let result;
  let apiError = null;

  try {
    if (PROVIDER === 'middesk') {
      result = await verifyWithMiddesk(num, jurisdiction);
    } else if (PROVIDER === 'trulioo') {
      result = await verifyWithTrulioo(num, jurisdiction);
    } else {
      result = await verifyWithMock(num, jurisdiction);
    }
  } catch (err) {
    apiError = err;
    logError(`cpaVerificationService [${PROVIDER}] API failure:`, err.message);

    await logVerificationEvent({
      userId,
      action: 'cpa_license_verification_api_failure',
      metadata: {
        provider: PROVIDER,
        license_number: num,
        jurisdiction: jurisdiction || null,
        error: err.message,
        ip_address: ipAddress || null
      }
    });

    throw new Error(
      'The licence verification service is temporarily unavailable. ' +
        'Please try again later.'
    );
  }

  const isVerified = result.found && result.status === 'active';
  const now = isVerified ? new Date() : null;

  await pool.query(
    `UPDATE users
        SET cpa_license_number      = $1,
            cpa_license_verified    = $2,
            cpa_license_status      = $3,
            cpa_license_verified_at = $4,
            cpa_license_jurisdiction = $5
      WHERE id = $6`,
    [num, isVerified, result.status, now, jurisdiction || null, userId]
  );

  await logVerificationEvent({
    userId,
    action: isVerified
      ? 'cpa_license_verification_success'
      : 'cpa_license_verification_failed',
    metadata: {
      provider: PROVIDER,
      license_number: num,
      jurisdiction: jurisdiction || null,
      status: result.status,
      verified: isVerified,
      ip_address: ipAddress || null
    }
  });

  return {
    verified: isVerified,
    status: result.status,
    message: result.message,
    verifiedName: result.verifiedName || null
  };
}

/**
 * Returns the current CPA licence verification status for the given user.
 *
 * @param {string} userId
 * @returns {{ hasLicense: boolean, verified: boolean, status: string|null, verifiedAt: Date|null, jurisdiction: string|null }}
 */
async function getCpaVerificationStatus(userId) {
  const result = await pool.query(
    `SELECT cpa_license_number,
            cpa_license_verified,
            cpa_license_status,
            cpa_license_verified_at,
            cpa_license_jurisdiction
       FROM users
      WHERE id = $1
      LIMIT 1`,
    [userId]
  );

  if (!result.rowCount) {
    return null;
  }

  const row = result.rows[0];
  return {
    hasLicense: !!row.cpa_license_number,
    licenseNumber: row.cpa_license_number || null,
    verified: !!row.cpa_license_verified,
    status: row.cpa_license_status || null,
    verifiedAt: row.cpa_license_verified_at || null,
    jurisdiction: row.cpa_license_jurisdiction || null
  };
}

module.exports = { verifyCpaLicense, getCpaVerificationStatus };
