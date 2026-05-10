"use strict";

const { STRIPE_PRICE_ENTRIES } = require("./stripePriceConfig.js");

function isProductionEnvironment(nodeEnv = process.env.NODE_ENV) {
  return String(nodeEnv || "").trim().toLowerCase() === "production";
}

function collectRequiredEnvironmentVariables(nodeEnv = process.env.NODE_ENV) {
  const required = [
    "DATABASE_URL",
    "JWT_SECRET",
    "APP_BASE_URL",
    "RESEND_API_KEY"
  ];

  if (!isProductionEnvironment(nodeEnv)) {
    return required;
  }

  required.push(
    "CSRF_SECRET",
    "FIELD_ENCRYPTION_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "EXPORT_GRANT_SECRET",
    "RECEIPT_STORAGE_DIR"
  );

  STRIPE_PRICE_ENTRIES.forEach((entry) => {
    required.push(entry.env);
  });

  return [...new Set(required)];
}

function validateEnvironmentOrThrow(nodeEnv = process.env.NODE_ENV) {
  const required = collectRequiredEnvironmentVariables(nodeEnv);
  const missing = required.filter((name) => !String(process.env[name] || "").trim());
  if (missing.length > 0) {
    const error = new Error(`Missing required environment variables: ${missing.join(", ")}`);
    error.code = "ENV_VALIDATION_FAILED";
    error.missing = missing;
    throw error;
  }
}

module.exports = {
  collectRequiredEnvironmentVariables,
  isProductionEnvironment,
  validateEnvironmentOrThrow
};
