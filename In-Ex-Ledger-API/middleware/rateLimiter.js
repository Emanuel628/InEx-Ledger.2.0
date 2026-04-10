const rateLimit = require("express-rate-limit");
const rateLimitRedis = require("rate-limit-redis");
const { createClient } = require("redis");
const { logError, logInfo, logWarn } = require("../utils/logger.js");

const RedisStore =
  rateLimitRedis.RedisStore || rateLimitRedis.default || rateLimitRedis;

const RETRY_ERROR_MESSAGE = "Too many requests";

let sharedRedisClient = null;
let redisClientPromise = null;
let redisClientOverride = null;
let limiterHealth = {
  available: false,
  enabled: false,
  lastError: null,
  mode: "disabled",
  redisConfigured: false,
  redisConnected: false,
  required: false,
  updatedAt: null
};

const metrics = {
  increment() {}
};

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function isRateLimitingEnabled() {
  return process.env.RATE_LIMIT_ENABLED === "true";
}

function isRateLimitingRequired() {
  return isProduction();
}

function updateLimiterHealth(nextState) {
  const previous = limiterHealth;
  limiterHealth = {
    ...previous,
    ...nextState,
    updatedAt: new Date().toISOString()
  };

  if (previous.available && limiterHealth.available === false) {
    logError("Rate limiting protection dropped", {
      lastError: limiterHealth.lastError,
      mode: limiterHealth.mode,
      redisConfigured: limiterHealth.redisConfigured,
      redisConnected: limiterHealth.redisConnected
    });
  } else if (!previous.available && limiterHealth.available) {
    logInfo("Rate limiting protection restored", {
      mode: limiterHealth.mode,
      redisConfigured: limiterHealth.redisConfigured,
      redisConnected: limiterHealth.redisConnected
    });
  }

  return limiterHealth;
}

function markLimiterHealth(partial = {}) {
  const required = partial.required ?? isRateLimitingRequired();
  const enabled = partial.enabled ?? isRateLimitingEnabled();
  const redisConfigured =
    partial.redisConfigured ?? Boolean(redisClientOverride || process.env.REDIS_URL);
  const redisConnected = partial.redisConnected ?? Boolean(redisClientOverride || sharedRedisClient);
  let mode = partial.mode;

  if (!mode) {
    if (required && (!enabled || !redisConfigured || !redisConnected)) {
      mode = "degraded";
    } else if (enabled && (redisConfigured || partial.storeOverrideActive)) {
      mode = required ? "enforced" : "enabled";
    } else {
      mode = "disabled";
    }
  }

  const available =
    partial.available ?? (!required || (enabled && (partial.storeOverrideActive || (redisConfigured && redisConnected))));

  return updateLimiterHealth({
    available,
    enabled,
    lastError: Object.prototype.hasOwnProperty.call(partial, "lastError") ? partial.lastError : limiterHealth.lastError,
    mode,
    redisConfigured,
    redisConnected,
    required
  });
}

function buildNormalizedPrefix(keyPrefix) {
  if (!keyPrefix) {
    return "";
  }
  return keyPrefix.endsWith(":") ? keyPrefix : `${keyPrefix}:`;
}

async function ensureRedisClient() {
  if (redisClientOverride) {
    markLimiterHealth({
      available: true,
      enabled: true,
      lastError: null,
      mode: isRateLimitingRequired() ? "enforced" : "enabled",
      redisConfigured: true,
      redisConnected: true,
      storeOverrideActive: true
    });
    return redisClientOverride;
  }

  if (sharedRedisClient) {
    markLimiterHealth({
      available: true,
      enabled: isRateLimitingEnabled(),
      lastError: null,
      mode: isRateLimitingRequired() ? "enforced" : "enabled",
      redisConfigured: true,
      redisConnected: true
    });
    return sharedRedisClient;
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    markLimiterHealth({
      available: !isRateLimitingRequired(),
      enabled: isRateLimitingEnabled(),
      lastError: "REDIS_URL is not configured",
      mode: isRateLimitingRequired() ? "degraded" : "disabled",
      redisConfigured: false,
      redisConnected: false
    });
    return null;
  }

  if (!redisClientPromise) {
    const client = createClient({ url: redisUrl });
    client.on("error", (err) => {
      logWarn("Redis client error", { err: err.message });
      markLimiterHealth({
        available: !isRateLimitingRequired(),
        enabled: isRateLimitingEnabled(),
        lastError: err.message,
        mode: isRateLimitingRequired() ? "degraded" : "disabled",
        redisConfigured: true,
        redisConnected: false
      });
    });
    client.on("ready", () => {
      markLimiterHealth({
        available: true,
        enabled: isRateLimitingEnabled(),
        lastError: null,
        mode: isRateLimitingRequired() ? "enforced" : "enabled",
        redisConfigured: true,
        redisConnected: true
      });
    });
    client.on("end", () => {
      markLimiterHealth({
        available: !isRateLimitingRequired(),
        enabled: isRateLimitingEnabled(),
        lastError: "Redis connection ended",
        mode: isRateLimitingRequired() ? "degraded" : "disabled",
        redisConfigured: true,
        redisConnected: false
      });
    });
    redisClientPromise = client
      .connect()
      .then(() => {
        sharedRedisClient = client;
        markLimiterHealth({
          available: true,
          enabled: isRateLimitingEnabled(),
          lastError: null,
          mode: isRateLimitingRequired() ? "enforced" : "enabled",
          redisConfigured: true,
          redisConnected: true
        });
        return sharedRedisClient;
      })
      .catch((err) => {
        logWarn("Unable to connect to Redis for rate limiting", {
          err: err.message
        });
        markLimiterHealth({
          available: !isRateLimitingRequired(),
          enabled: isRateLimitingEnabled(),
          lastError: err.message,
          mode: isRateLimitingRequired() ? "degraded" : "disabled",
          redisConfigured: true,
          redisConnected: false
        });
        return null;
      });
  }

  return redisClientPromise;
}

async function deriveResetSeconds(windowSeconds, redisKey) {
  if (!redisKey) {
    return windowSeconds;
  }

  const client = redisClientOverride || sharedRedisClient;
  if (!client || typeof client.ttl !== "function") {
    return windowSeconds;
  }

  try {
    const ttl = await client.ttl(redisKey);
    if (typeof ttl !== "number" || ttl <= 0) {
      return windowSeconds;
    }
    return Math.ceil(ttl);
  } catch (err) {
    logWarn("Failed to read TTL for rate limit key", { err: err.message });
    return windowSeconds;
  }
}

function buildUnlimitedLimiter() {
  return (req, res, next) => {
    res.setHeader("X-RateLimit-Limit", "unlimited");
    res.setHeader("X-RateLimit-Remaining", "unlimited");
    res.setHeader("X-RateLimit-Reset", "0");
    next();
  };
}

function buildUnavailableLimiter(errorMessage = "Rate limiting protection is temporarily unavailable.") {
  return (_req, res) => {
    res.setHeader("Retry-After", "60");
    res.setHeader("X-RateLimit-Limit", "unavailable");
    res.setHeader("X-RateLimit-Remaining", "0");
    res.setHeader("X-RateLimit-Reset", "60");
    res.status(503).json({
      error: errorMessage,
      retryAfter: 60
    });
  };
}

function buildFailHandler({ tier, windowSeconds, errorMessage }) {
  return async (req, res) => {
    const reset = await deriveResetSeconds(
      windowSeconds,
      req.rateLimit?.redisKey
    );
    res.setHeader("Retry-After", String(reset));
    res.setHeader("X-RateLimit-Limit", req.rateLimit?.limit ?? "0");
    res.setHeader("X-RateLimit-Remaining", "0");
    res.setHeader("X-RateLimit-Reset", String(reset));
    logWarn("Rate limit exceeded", {
      subject: req.user?.id ?? req.ip,
      endpoint: req.originalUrl || req.path,
      tier
    });
    metrics.increment("rate_limit.blocked", { tier });
    res.status(429).json({
      error: errorMessage || RETRY_ERROR_MESSAGE,
      retryAfter: reset
    });
  };
}

async function attachHeaders(req, res, windowSeconds) {
  const limit = req.rateLimit?.limit ?? 0;
  const remaining = req.rateLimit?.remaining ?? limit;
  const reset = await deriveResetSeconds(windowSeconds, req.rateLimit?.redisKey);
  res.setHeader("X-RateLimit-Limit", String(limit));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, remaining)));
  res.setHeader("X-RateLimit-Reset", String(reset));
}

function buildKeyIdentifier(req, keyStrategy) {
  if (keyStrategy === "ip") {
    return req.ip;
  }
  return req.user?.id ? String(req.user.id) : req.ip;
}

function buildKeyMeta(req, keyPrefix, identifier) {
  const normalizedPrefix = buildNormalizedPrefix(keyPrefix);
  const redisKey = `${normalizedPrefix}${identifier}`;
  req.rateLimit = req.rateLimit || {};
  req.rateLimit.redisKey = redisKey;
  req.rateLimit.key = identifier;
}

function buildLimiterInstance({
  windowMs,
  max,
  keyPrefix,
  keyStrategy,
  store,
  skip,
  errorMessage
}) {
  return rateLimit({
    windowMs,
    max,
    legacyHeaders: false,
    standardHeaders: false,
    skipFailedRequests: true,
    store,
    skip,
    handler: buildFailHandler({
      tier: keyPrefix,
      windowSeconds: Math.ceil(windowMs / 1000),
      errorMessage
    }),
    keyGenerator: (req) => {
      const identifier = buildKeyIdentifier(req, keyStrategy);
      buildKeyMeta(req, keyPrefix, identifier);
      return identifier;
    }
  });
}

function setRedisClientOverride(client) {
  redisClientOverride = client || null;
  sharedRedisClient = client || null;
  if (!client) {
    redisClientPromise = null;
  }
  markLimiterHealth({
    available: Boolean(client) || !isRateLimitingRequired(),
    enabled: isRateLimitingEnabled(),
    lastError: client ? null : limiterHealth.lastError,
    mode: client
      ? (isRateLimitingRequired() ? "enforced" : "enabled")
      : (isRateLimitingRequired() ? "degraded" : "disabled"),
    redisConfigured: Boolean(client) || Boolean(process.env.REDIS_URL),
    redisConnected: Boolean(client)
  });
}

async function createLimiter({
  windowMs,
  max,
  keyPrefix,
  keyStrategy = "user",
  storeOverride = null,
  skip,
  errorMessage = RETRY_ERROR_MESSAGE,
  message = null
}) {
  const resolvedErrorMessage = message || errorMessage;
  const enabled = isRateLimitingEnabled();
  const required = isRateLimitingRequired();

  if (!enabled) {
    markLimiterHealth({
      available: !required,
      enabled: false,
      lastError: required ? "RATE_LIMIT_ENABLED must be true in production" : null,
      mode: required ? "degraded" : "disabled",
      redisConfigured: Boolean(process.env.REDIS_URL),
      redisConnected: Boolean(sharedRedisClient)
    });
    if (required) {
      return buildUnavailableLimiter("Rate limiting is required in production and is not enabled.");
    }
    return buildUnlimitedLimiter();
  }

  const windowSeconds = Math.ceil(windowMs / 1000);
  if (storeOverride) {
    markLimiterHealth({
      available: true,
      enabled: true,
      lastError: null,
      mode: required ? "enforced" : "enabled",
      redisConfigured: true,
      redisConnected: true,
      storeOverrideActive: true
    });
    const limiter = buildLimiterInstance({
      windowMs,
      max,
      keyPrefix,
      keyStrategy,
      store: storeOverride,
      skip,
      errorMessage: resolvedErrorMessage
    });

    return (req, res, next) => {
      limiter(req, res, (err) => {
        if (err) {
          logError("Rate limiter middleware failed", {
            endpoint: req.originalUrl || req.path,
            err: err.message,
            tier: keyPrefix
          });
          if (required) {
            return buildUnavailableLimiter()(req, res, next);
          }
          return next(err);
        }

        attachHeaders(req, res, windowSeconds).catch(() => {});
        metrics.increment("rate_limit.allowed", { tier: keyPrefix });
        return next();
      });
    };
  }

  const client = await ensureRedisClient();
  if (!client) {
    if (required) {
      logWarn("Redis unavailable; rate limiting will use in-memory store", { tier: keyPrefix });
      markLimiterHealth({
        available: true,
        enabled: true,
        lastError: "Redis unavailable; rate limiting using in-memory store",
        mode: "enforced",
        redisConfigured: Boolean(process.env.REDIS_URL),
        redisConnected: false
      });
      const inMemoryLimiter = buildLimiterInstance({
        windowMs,
        max,
        keyPrefix,
        keyStrategy,
        store: undefined,
        skip,
        errorMessage: resolvedErrorMessage
      });
      return (req, res, next) => {
        inMemoryLimiter(req, res, (err) => {
          if (err) {
            logError("Rate limiter middleware failed", {
              endpoint: req.originalUrl || req.path,
              err: err.message,
              tier: keyPrefix
            });
            return buildUnavailableLimiter()(req, res, next);
          }
          attachHeaders(req, res, windowSeconds).catch(() => {});
          metrics.increment("rate_limit.allowed", { tier: keyPrefix });
          return next();
        });
      };
    }
    logWarn("Rate limiting backend unavailable", { tier: keyPrefix });
    return buildUnlimitedLimiter();
  }

  const store =
    storeOverride ||
    new RedisStore({
      sendCommand: (...args) => client.sendCommand([...args]),
      prefix: buildNormalizedPrefix(keyPrefix)
    });

  const limiter = buildLimiterInstance({
    windowMs,
    max,
    keyPrefix,
    keyStrategy,
    store,
    skip,
    errorMessage: resolvedErrorMessage
  });

  return (req, res, next) => {
    limiter(req, res, (err) => {
      if (err) {
        logError("Rate limiter middleware failed", {
          endpoint: req.originalUrl || req.path,
          err: err.message,
          tier: keyPrefix
        });
        markLimiterHealth({
          available: !required,
          enabled: true,
          lastError: err.message,
          mode: required ? "degraded" : "disabled",
          redisConfigured: true,
          redisConnected: false
        });
        if (required) {
          return buildUnavailableLimiter()(req, res, next);
        }
        return next(err);
      }

      attachHeaders(req, res, windowSeconds).catch(() => {});
      metrics.increment("rate_limit.allowed", { tier: keyPrefix });
      return next();
    });
  };
}

async function initializeRateLimiterProtection() {
  const enabled = isRateLimitingEnabled();
  const required = isRateLimitingRequired();

  if (!enabled) {
    markLimiterHealth({
      available: !required,
      enabled: false,
      lastError: required ? "RATE_LIMIT_ENABLED must be true in production" : null,
      mode: required ? "degraded" : "disabled",
      redisConfigured: Boolean(process.env.REDIS_URL),
      redisConnected: false
    });
    if (required) {
      throw new Error("Rate limiting is required in production but RATE_LIMIT_ENABLED is not true.");
    }
    return limiterHealth;
  }

  const client = await ensureRedisClient();
  if (!client) {
    logWarn("Redis unavailable; rate limiting will use in-memory store per limiter", {
      redisConfigured: Boolean(process.env.REDIS_URL)
    });
    markLimiterHealth({
      available: true,
      enabled: true,
      lastError: "Redis unavailable; rate limiting using in-memory store",
      mode: required ? "enforced" : "enabled",
      redisConfigured: Boolean(process.env.REDIS_URL),
      redisConnected: false
    });
    return limiterHealth;
  }

  return limiterHealth;
}

function getRateLimiterHealth() {
  return { ...limiterHealth };
}

function resetRateLimiterHealthForTests() {
  limiterHealth = {
    available: false,
    enabled: false,
    lastError: null,
    mode: "disabled",
    redisConfigured: false,
    redisConnected: false,
    required: false,
    updatedAt: null
  };
}

module.exports = {
  createLimiter,
  getRateLimiterHealth,
  initializeRateLimiterProtection,
  metrics,
  resetRateLimiterHealthForTests,
  setRedisClientOverride
};
