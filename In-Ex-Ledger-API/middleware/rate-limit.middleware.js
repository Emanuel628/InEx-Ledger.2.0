const { createLimiter } = require("./rateLimiter.js");

function createRouteLimiter(options = {}) {
  let resolvedLimiter = null;
  let pendingLimiter = null;

  async function ensureLimiter() {
    if (resolvedLimiter) {
      return resolvedLimiter;
    }

    if (!pendingLimiter) {
      pendingLimiter = createLimiter(options).then((limiter) => {
        resolvedLimiter = limiter;
        return resolvedLimiter;
      });
    }

    return pendingLimiter;
  }

  return async (req, res, next) => {
    try {
      const limiter = await ensureLimiter();
      return limiter(req, res, next);
    } catch (err) {
      return next(err);
    }
  };
}

function createDataApiLimiter(options = {}) {
  return createRouteLimiter({
    windowMs: options.windowMs || 60 * 1000,
    max: options.max || 120,
    keyPrefix: options.keyPrefix || "rl:data",
    keyStrategy: options.keyStrategy || "user",
    skip: options.skip,
    storeOverride: options.storeOverride,
    message:
      options.message || "Too many requests. Please slow down and try again."
  });
}

module.exports = {
  createDataApiLimiter,
  createRouteLimiter
};
