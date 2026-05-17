"use strict";

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
      receiptStorage,
      rateLimiting,
      uptime: uptimeSeconds,
      timestamp: now
    }
  };
}

module.exports = {
  buildHealthCheckResponse
};
