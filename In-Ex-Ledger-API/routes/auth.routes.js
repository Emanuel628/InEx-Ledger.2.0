import express from "express";
import crypto from "node:crypto";
import { signToken } from "../middleware/auth.middleware.js";
import pool from "../db.js";

const router = express.Router();
const usersByEmail = new Map();
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
  return `${protocol}://${host}/auth/verify-email?token=${token}`;
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

router.post("/auth/register", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;

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
      `
      INSERT INTO users (id, email, password_hash, created_at)
      VALUES ($1, $2, $3, NOW())
      RETURNING id, email
      `,
      [crypto.randomUUID(), email, hashedPassword]
    );

    const user = result.rows[0];

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

router.post("/auth/send-verification", (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  const user = usersByEmail.get(email);
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
});

router.post("/auth/login", (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const user = usersByEmail.get(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  if (!user.email_verified) {
    return res.status(403).json({ error: "Email address not verified" });
  }

  const token = signToken({
    id: user.id,
    email: user.email,
    role: user.role,
    email_verified: user.email_verified
  });

  res.status(200).json({ token });
});

router.post("/auth/logout", (req, res) => {
  res.status(501).json({ message: "Not implemented" });
});

router.post("/auth/forgot-password", (req, res) => {
  res.status(501).json({ message: "Not implemented" });
});

router.post("/auth/reset-password", (req, res) => {
  res.status(501).json({ message: "Not implemented" });
});

router.post("/auth/verify-email", (req, res) => {
  const token = req.body?.token;
  if (!token) {
    return res.status(400).json({ error: "Token is required" });
  }

  const email = consumeVerificationToken(token);
  if (!email) {
    return res.status(400).json({ error: "Verification token is invalid or expired" });
  }

  const user = usersByEmail.get(email);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  if (user.email_verified) {
    return res.status(200).json({ message: "Email already verified" });
  }

  user.email_verified = true;
  res.status(200).json({ message: "Email verified" });
});

router.get("/auth/verify-email", (req, res) => {
  const token = req.query?.token;
  if (!token) {
    return res.status(400).send("Verification token is required.");
  }

  const email = consumeVerificationToken(token);
  if (!email) {
    return res.status(400).send("The verification link is invalid or has expired.");
  }

  const user = usersByEmail.get(email);
  if (!user) {
    return res.status(404).send("User not found.");
  }

  if (!user.email_verified) {
    user.email_verified = true;
  }

  return res.status(200).send("Email verified successfully. You can now log in.");
});

export default router;