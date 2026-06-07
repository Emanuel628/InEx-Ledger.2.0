const crypto = require("crypto");

function unauthorized(res) {
  return res.status(401).json({ ok: false, message: "Unauthorized." });
}

function requireSupportSecret(req, res, next) {
  const providedHeader = req.headers["x-support-secret"];
  const provided = Array.isArray(providedHeader)
    ? String(providedHeader[0] || "")
    : String(providedHeader || "");
  const expected = String(process.env.INEX_LEDGER_SUPPORT_SECRET || "");

  if (!provided || !expected) {
    return unauthorized(res);
  }

  const providedBuffer = Buffer.from(provided, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (providedBuffer.length !== expectedBuffer.length) {
    return unauthorized(res);
  }

  if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    return unauthorized(res);
  }

  return next();
}

module.exports = { requireSupportSecret };
