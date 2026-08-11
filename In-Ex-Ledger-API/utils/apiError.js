"use strict";

// Typed error for expected 4xx failures (bad input, missing resource, business
// rule violations) that route code wants to raise from anywhere -- including
// inside async helpers -- and have handled consistently by the app's existing
// central error handler in server.js (which already derives status from
// err.status/err.statusCode, hides 500 details in production, and logs
// structured fields). Route handlers should throw ApiError for these cases
// instead of hand-rolling res.status(...).json(...), and reserve local
// try/catch for compensation/rollback work or translating a lower-level error
// (e.g. a DB constraint violation) into one of these.
class ApiError extends Error {
  constructor(status, message, { code } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    if (code) {
      this.code = code;
    }
  }
}

// Wraps an async Express route handler so a rejected promise (including a
// thrown ApiError) is forwarded to next(err) instead of becoming an unhandled
// rejection. Express does not do this automatically for async handlers.
function asyncRoute(handler) {
  return function wrappedAsyncRoute(req, res, next) {
    try {
      return Promise.resolve(handler(req, res, next)).catch(next);
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { ApiError, asyncRoute };
