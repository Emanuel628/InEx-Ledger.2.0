import crypto from "node:crypto";

const JWT_SECRET = process.env.JWT_SECRET;

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

export function signToken(payload) {
  const header = encodeSegment({ alg: "HS256", typ: "JWT" });
  const body = encodeSegment(payload);
  const signature = signWithSecret(`${header}.${body}`);
  return `${header}.${body}.${signature}`;
}

export function verifyToken(token) {
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
  return decoded;
}

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const token = authHeader.slice("Bearer ".length).trim();
  try {
    req.user = verifyToken(token);
    console.log("AUTH user.id:", req.user.id, "email:", req.user.email);
  } catch (err) {
    return res.status(401).json({ error: "Authentication required" });
  }

  next();
}

export function optionalAuth(req, res, next) {
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
