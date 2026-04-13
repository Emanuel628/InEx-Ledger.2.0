"use strict";

function buildHealthCheckResponse({
  dbState,
  rateLimiting,
  receiptStorage,
  uptimeSeconds = process.uptime(),
  now = new Date().toISOString()
}) {
  const healthy =
    dbState === "ready" &&
    rateLimiting.mode !== "degraded" &&
    receiptStorage.mode !== "degraded";

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
