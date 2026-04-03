const crypto = require("crypto");

const JWT_SECRET = process.env.JWT_SECRET;
const DEFAULT_JWT_EXPIRY_SECONDS = Number(process.env.JWT_EXPIRY_SECONDS) || 15 * 60;

if (!JWT_SECRET) {
  throw new Error(
    "Missing required environment variable: JWT_SECRET (set this before running the server)"
  );
}

function encodeSegment(value) {
  const payload =
    typeof value === "string" ? value : JSON.stringify(value ?? {});
  return Buffer.from(payload, "utf8").toString("base64url");
}

function decodeSegment(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signWithSecret(message) {
  return crypto.createHmac("sha256", JWT_SECRET).update(message).digest("base64url");
}

function signToken(payload, expiresInSeconds = DEFAULT_JWT_EXPIRY_SECONDS) {
  const header = encodeSegment({ alg: "HS256", typ: "JWT" });
  const now = Math.floor(Date.now() / 1000);
  const bodyPayload = {
    ...payload,
    iat: now,
    ...(typeof expiresInSeconds === "number" && expiresInSeconds > 0
      ? { exp: now + expiresInSeconds }
      : {})
  };
  const body = encodeSegment(bodyPayload);
  const signature = signWithSecret(`${header}.${body}`);
  return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid token format");
  }

  const [header, body, signature] = parts;
  const expected = signWithSecret(`${header}.${body}`);
  const bufferSignature = Buffer.from(signature, "utf8");
  const bufferExpected = Buffer.from(expected, "utf8");
  if (
    bufferSignature.length !== bufferExpected.length ||
    !crypto.timingSafeEqual(bufferSignature, bufferExpected)
  ) {
    throw new Error("Invalid token signature");
  }

  const decoded = JSON.parse(decodeSegment(body));
  const now = Math.floor(Date.now() / 1000);
  if (typeof decoded.exp === "number" && decoded.exp <= now) {
    throw new Error("Token expired");
  }

  return decoded;
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const token = authHeader.slice("Bearer ".length).trim();
  try {
    req.user = verifyToken(token);
  } catch (err) {
    return res.status(401).json({ error: "Authentication required" });
  }

  next();
}

function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      req.user = verifyToken(authHeader.slice("Bearer ".length).trim());
    } catch (err) {
      // ignore invalid tokens
    }
  }

  next();
}

module.exports = { signToken, verifyToken, requireAuth, optionalAuth };
