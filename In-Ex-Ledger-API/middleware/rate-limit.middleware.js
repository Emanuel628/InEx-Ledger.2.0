const rateLimit = require("express-rate-limit");

function createDataApiLimiter(options = {}) {
  return rateLimit({
    windowMs: options.windowMs || 60 * 1000,
    max: options.max || 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please slow down and try again." }
  });
}

module.exports = {
  createDataApiLimiter
};
