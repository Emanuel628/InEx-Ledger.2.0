"use strict";

function summarizeRouteError(err) {
  if (!err || typeof err !== "object") {
    return { message: String(err || "Unknown error") };
  }

  return cleanObject({
    name: err.name || "Error",
    message: err.message || String(err),
    code: err.code || undefined,
    constraint: err.constraint || undefined,
    status: err.status || err.statusCode || undefined
  });
}

function cleanObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== "")
  );
}

function buildRouteErrorContext(req, err, extra = {}) {
  return cleanObject({
    err: summarizeRouteError(err),
    requestId: req?.requestId || req?.id,
    method: req?.method,
    path: req?.originalUrl || req?.url || req?.path,
    userId: req?.user?.id,
    params: req?.params && Object.keys(req.params).length ? req.params : undefined,
    ...extra
  });
}

module.exports = {
  buildRouteErrorContext,
  summarizeRouteError
};
