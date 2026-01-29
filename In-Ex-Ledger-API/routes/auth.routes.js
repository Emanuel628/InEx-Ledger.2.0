import express from "express";
import crypto from "node:crypto";
import { signToken, requireAuth } from "../middleware/auth.middleware.js";
import pool from "../db.js";

const router = express.Router();

const REFRESH_TOKEN_COOKIE = "refresh_token";
const REFRESH_TOKEN_EXPIRY_DAYS = Number(process.env.REFRESH_TOKEN_EXPIRY_DAYS) || 7;
const REFRESH_TOKEN_EXPIRY_MS = REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
const REFRESH_TOKEN_BYTE_LENGTH = 48;
const ACCESS_TOKEN_EXPIRY_SECONDS = Number(process.env.ACCESS_TOKEN_EXPIRY_SECONDS) || 15 * 60;
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/"
};

/**
 * Temporary verification tokens for email flows (in-memory because they expire quickly).
 */
const verificationTokens = new Map();
const VERIFICATION_TOKEN_TTL = 15 * 60 * 1000; // 15 minutes

function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

function cleanupVerificationTokens() {
  const now = Date.now();
  for (const [token, meta] of verificationTokens.entries()) {
    if (meta.expiresAt <= now) {
      verificationTokens.delete(token);
    }
  }
}

function removeTokensForEmail(email) {
  for (const [token, meta] of verificationTokens.entries()) {
    if (meta.email === email) {
      verificationTokens.delete(token);
    }
  }
}

function createVerificationToken(email) {
  cleanupVerificationTokens();
  removeTokensForEmail(email);
  const token = crypto.randomUUID();
  const expiresAt = Date.now() + VERIFICATION_TOKEN_TTL;
  verificationTokens.set(token, { email, expiresAt });
  return { token, expiresAt };
}

function consumeVerificationToken(token) {
  cleanupVerificationTokens();
  const entry = verificationTokens.get(token);
  if (!entry || entry.expiresAt <= Date.now()) {
    verificationTokens.delete(token);
    return null;
  }
  verificationTokens.delete(token);
  return entry.email;
}

function buildVerificationLink(req, token) {
  const protocol = req.protocol;
  const host = req.get("host");
  return `${protocol}://${host}/api/auth/verify-email?token=${token}`;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}$${derived}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string") {
    return false;
  }

  const [salt, hash] = stored.split("$");
  if (!salt || !hash) {
    return false;
  }

  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  const derivedBuffer = Buffer.from(derived, "hex");
  const hashBuffer = Buffer.from(hash, "hex");

  if (hashBuffer.length !== derivedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(hashBuffer, derivedBuffer);
}

function setRefreshCookie(res, token, expiresAt) {
  res.cookie(REFRESH_TOKEN_COOKIE, token, {
    ...COOKIE_OPTIONS,
    expires: expiresAt
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_TOKEN_COOKIE, COOKIE_OPTIONS);
}

function hashRefreshToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function createRefreshToken(userId) {
  const token = crypto.randomBytes(REFRESH_TOKEN_BYTE_LENGTH).toString("hex");
  const hashed = hashRefreshToken(token);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);
  await pool.query(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [crypto.randomUUID(), userId, hashed, expiresAt]
  );
  return { token, expiresAt };
}

async function revokeRefreshTokenByHash(tokenHash) {
  await pool.query("UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1", [tokenHash]);
}

router.post("/register", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;

  console.log("?? REGISTER USING DB:", process.env.DATABASE_URL);

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const hashedPassword = hashPassword(password);
  const client = await pool.connect();

  try {
    const existing = await client.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (existing.rowCount > 0) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const result = await client.query(
      `INSERT INTO users (id, email, password_hash, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, email`,
      [crypto.randomUUID(), email, hashedPassword]
    );

    const user = result.rows[0];
    console.log("?? Database Update Success:", user.email);

    return res.status(201).json({
      success: true,
      user
    });
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({ error: "Registration failed" });
  } finally {
    client.release();
  }
});

router.post("/send-verification", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    const result = await pool.query("SELECT email, email_verified FROM users WHERE email = $1", [email]);
    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.email_verified) {
      return res.status(200).json({ message: "Email already verified" });
    }

    const { token, expiresAt } = createVerificationToken(email);
    const verificationLink = buildVerificationLink(req, token);

    res.status(200).json({
      token,
      expiresAt,
      verificationLink
    });
  } catch (err) {
    console.error("Send verification error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/login", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = result.rows[0];

    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = signToken(
      {
        id: user.id,
        email: user.email,
        role: user.role || "user",
        email_verified: !!user.email_verified
      },
      ACCESS_TOKEN_EXPIRY_SECONDS
    );

    const { token: refreshToken, expiresAt } = await createRefreshToken(user.id);
    setRefreshCookie(res, refreshToken, expiresAt);

    res.status(200).json({ token });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/refresh", async (req, res) => {
  const rawToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
  if (!rawToken) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: "Missing refresh token" });
  }

  const hashed = hashRefreshToken(rawToken);

  try {
    const result = await pool.query(
      `SELECT rt.id, rt.user_id, u.email, u.role, u.email_verified
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1 AND rt.revoked = false AND rt.expires_at > NOW()
       LIMIT 1`,
      [hashed]
    );

    if (!result.rowCount) {
      clearRefreshCookie(res);
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    await revokeRefreshTokenByHash(hashed);
    const refreshData = await createRefreshToken(result.rows[0].user_id);
    setRefreshCookie(res, refreshData.token, refreshData.expiresAt);

    const token = signToken(
      {
        id: result.rows[0].user_id,
        email: result.rows[0].email,
        role: result.rows[0].role || "user",
        email_verified: !!result.rows[0].email_verified
      },
      ACCESS_TOKEN_EXPIRY_SECONDS
    );

    res.status(200).json({ token });
  } catch (err) {
    console.error("Refresh token error:", err);
    clearRefreshCookie(res);
    res.status(500).json({ error: "Failed to refresh token" });
  }
});

router.post("/logout", requireAuth, async (req, res) => {
  const rawToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
  if (rawToken) {
    const hashed = hashRefreshToken(rawToken);
    await revokeRefreshTokenByHash(hashed);
  }
  clearRefreshCookie(res);
  res.status(204).end();
});

router.post("/verify-email", async (req, res) => {
  const token = req.body?.token;
  if (!token) {
    return res.status(400).json({ error: "Token is required" });
  }

  const email = consumeVerificationToken(token);
  if (!email) {
    return res.status(400).json({ error: "Verification token is invalid or expired" });
  }

  try {
    await pool.query("UPDATE users SET email_verified = true WHERE email = $1", [email]);
    res.status(200).json({ message: "Email verified" });
  } catch (err) {
    console.error("Verification error:", err);
    res.status(500).json({ error: "Database update failed" });
  }
});

router.get("/verify-email", async (req, res) => {
  const token = req.query?.token;
  if (!token) {
    return res.status(400).send("Verification token is required.");
  }

  const email = consumeVerificationToken(token);
  if (!email) {
    return res.status(400).send("The verification link is invalid or has expired.");
  }

  try {
    const result = await pool.query(
      "UPDATE users SET email_verified = true WHERE email = $1 RETURNING id",
      [email]
    );

    if (result.rowCount === 0) {
      return res.status(404).send("User not found.");
    }

    return res.status(200).send("Email verified successfully. You can now log in.");
  } catch (err) {
    console.error("Verification link error:", err);
    return res.status(500).send("Internal server error.");
  }
});

router.post("/forgot-password", (req, res) => res.status(501).json({ message: "Not implemented" }));
router.post("/reset-password", (req, res) => res.status(501).json({ message: "Not implemented" }));

export default router;
