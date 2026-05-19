"use strict";

// The public /health endpoint is unauthenticated, so the response body
// must never expose operational error strings, filesystem paths, backend
// hints, or any other detail that could be useful to an attacker probing
// for infrastructure. Sanitize at this boundary by whitelisting fields.

function sanitizeRateLimiting(rateLimiting = {}) {
  return {
    available: rateLimiting.available === true,
    enabled: rateLimiting.enabled === true,
    mode: typeof rateLimiting.mode === "string" ? rateLimiting.mode : "unknown",
    redisConfigured: rateLimiting.redisConfigured === true,
    redisConnected: rateLimiting.redisConnected === true,
    required: rateLimiting.required === true
  };
}

function sanitizeReceiptStorage(receiptStorage = {}) {
  return {
    available: receiptStorage.available === true,
    mode: typeof receiptStorage.mode === "string" ? receiptStorage.mode : "unknown",
    configured: receiptStorage.persistentConfirmed === true
  };
}

function buildHealthCheckResponse({
  dbState,
  rateLimiting = {},
  receiptStorage = {},
  uptimeSeconds = process.uptime(),
  now = new Date().toISOString()
}) {
  const rateLimitingHealthy =
    rateLimiting.mode !== "degraded" && rateLimiting.available !== false;
  const receiptStorageHealthy =
    receiptStorage.mode !== "degraded" && receiptStorage.available !== false;
  const healthy =
    dbState === "ready" &&
    rateLimitingHealthy &&
    receiptStorageHealthy;

  let overallStatus;
  if (healthy) {
    overallStatus = "healthy";
  } else if (dbState === "ready") {
    overallStatus = "degraded";
  } else {
    overallStatus = dbState;
  }

  return {
    statusCode: healthy ? 200 : 503,
    body: {
      status: overallStatus,
      database: {
        state: dbState
      },
      receiptStorage: sanitizeReceiptStorage(receiptStorage),
      rateLimiting: sanitizeRateLimiting(rateLimiting),
      uptime: uptimeSeconds,
      timestamp: now
    }
  };
}

module.exports = {
  buildHealthCheckResponse,
  sanitizeRateLimiting,
  sanitizeReceiptStorage
};
