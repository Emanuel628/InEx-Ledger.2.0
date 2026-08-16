"use strict";

const fs = require("fs");

function buildSslConfig({
  env = process.env,
  nodeEnv = process.env.NODE_ENV,
  logger = console,
  onFatal = () => process.exit(1)
} = {}) {
  const isProduction = nodeEnv === "production";
  const dbSslEnv = (env.DB_SSL || "").trim().toLowerCase();

  if (dbSslEnv === "disable" || dbSslEnv === "false") {
    return false;
  }

  let sslmodeFromUrl = null;
  try {
    const url = new URL(env.DATABASE_URL || "");
    sslmodeFromUrl = url.searchParams.get("sslmode");
  } catch (err) {
    logger.warn(`[DB] Could not parse DATABASE_URL to read sslmode: ${err.message}`);
  }

  if (sslmodeFromUrl === "disable") {
    return false;
  }

  const sslEnabled =
    dbSslEnv === "true" ||
    dbSslEnv === "require" ||
    sslmodeFromUrl === "require" ||
    sslmodeFromUrl === "verify-full" ||
    isProduction;

  if (!sslEnabled) {
    return false;
  }

  const rejectUnauthorizedDefault = isProduction ? "true" : "false";
  const rejectUnauthorized = (
    env.DB_SSL_REJECT_UNAUTHORIZED !== undefined
      ? env.DB_SSL_REJECT_UNAUTHORIZED
      : rejectUnauthorizedDefault
  ).trim().toLowerCase() === "true";

  const config = { rejectUnauthorized };

  if (env.DB_SSL_CA_CERT) {
    try {
      config.ca = fs.readFileSync(env.DB_SSL_CA_CERT, "utf8");
    } catch (err) {
      const msg = `[DB] Failed to read DB_SSL_CA_CERT: ${err.message}`;
      if (isProduction) {
        logger.error(msg);
        onFatal();
      } else {
        logger.error(msg);
      }
    }
  }

  return config;
}

function describeSslConfig(sslConfig) {
  return sslConfig === false
    ? "disabled"
    : `enabled (rejectUnauthorized=${sslConfig.rejectUnauthorized}, customCA=${!!sslConfig.ca})`;
}

module.exports = { buildSslConfig, describeSslConfig };
