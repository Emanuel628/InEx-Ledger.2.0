const rateLimit = require("express-rate-limit");
const rateLimitRedis = require("rate-limit-redis");
const { createClient } = require("redis");
const { logWarn } = require("../utils/logger.js");

const RedisStore =
  rateLimitRedis.RedisStore || rateLimitRedis.default || rateLimitRedis;

const RETRY_ERROR_MESSAGE = "Too many requests";

let sharedRedisClient = null;
let redisClientPromise = null;
let redisClientOverride = null;

const metrics = {
  increment() {}
};

function buildNormalizedPrefix(keyPrefix) {
  if (!keyPrefix) {
    return "";
  }
  return keyPrefix.endsWith(":") ? keyPrefix : `${keyPrefix}:`;
}

async function ensureRedisClient() {
  if (redisClientOverride) {
    return redisClientOverride;
  }

  if (sharedRedisClient) {
    return sharedRedisClient;
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return null;
  }

  if (!redisClientPromise) {
    const client = createClient({ url: redisUrl });
    client.on("error", (err) => {
      logWarn("Redis client error", { err: err.message });
    });
    redisClientPromise = client
      .connect()
      .then(() => {
        sharedRedisClient = client;
        return sharedRedisClient;
      })
      .catch((err) => {
        logWarn("Unable to connect to Redis for rate limiting", {
          err: err.message
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

  if (process.env.RATE_LIMIT_ENABLED !== "true") {
    return buildUnlimitedLimiter();
  }

  const windowSeconds = Math.ceil(windowMs / 1000);
  const client = await ensureRedisClient();
  if (!client && !storeOverride) {
    logWarn("Rate limiting disabled (Redis unavailable)", { tier: keyPrefix });
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
      if (!err) {
        attachHeaders(req, res, windowSeconds).catch(() => {});
        metrics.increment("rate_limit.allowed", { tier: keyPrefix });
      }
      next(err);
    });
  };
}

module.exports = {
  createLimiter,
  metrics,
  setRedisClientOverride
};
