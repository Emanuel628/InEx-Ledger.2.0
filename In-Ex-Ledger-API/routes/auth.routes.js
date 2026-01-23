import express from "express";
import crypto from "node:crypto";
import { signToken } from "../middleware/auth.middleware.js";
import pool from "../db.js";

const router = express.Router();

// Title: In-Memory Verification Tokens
// These are short-lived (15 min) and do not need a database table.
const verificationTokens = new Map();
const VERIFICATION_TOKEN_TTL = 15 * 60 * 1000;

// --- RESTORED UTILITY FUNCTIONS ---

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
  // Ensure this points to your mounted route
  return `${protocol}://${host}/api/auth/verify-email?token=${token}`;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}$${derived}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string") return false;
  const [salt, hash] = stored.split("$");
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  const derivedBuffer = Buffer.from(derived, "hex");
  const hashBuffer = Buffer.from(hash, "hex");
  if (hashBuffer.length !== derivedBuffer.length) return false;
  return crypto.timingSafeEqual(hashBuffer, derivedBuffer);
}

// --- DATABASE INTEGRATED ROUTES ---

/**
 * Title: User Registration
 * Purpose: Hashes password and inserts user into PostgreSQL 'users' table.
 */
router.post("/register", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const hashedPassword = hashPassword(password);
  const client = await pool.connect();

  try {
    const existing = await client.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const result = await client.query(
      `INSERT INTO users (id, email, password_hash, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, email`,
      [crypto.randomUUID(), email, hashedPassword]
    );

    console.log("✅ Railway Update: New user created:", result.rows[0].email);
    return res.status(201).json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({ error: "Registration failed" });
  } finally {
    client.release();
  }
});

/**
 * Title: Send Verification
 * Purpose: Verifies user exists in DB before issuing a token.
 */
router.post("/send-verification", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    const result = await pool.query("SELECT email, email_verified FROM users WHERE email = $1", [email]);
    const user = result.rows[0];

    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.email_verified) return res.status(200).json({ message: "Email already verified" });

    const { token, expiresAt } = createVerificationToken(email);
    const verificationLink = buildVerificationLink(req, token);

    res.status(200).json({ token, expiresAt, verificationLink });
  } catch (err) {
    res.status(500).json({ error: "Failed to process verification" });
  }
});

/**
 * Title: User Login
 * Purpose: Validates credentials against persistent PostgreSQL data.
 */
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

    // Check email verification status from DB
    if (user.email_verified === false) {
      return res.status(403).json({ error: "Email address not verified" });
    }

    const token = signToken({
      id: user.id,
      email: user.email,
      role: user.role || 'user',
      email_verified: !!user.email_verified
    });

    res.status(200).json({ token });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

/**
 * Title: Verify Email (POST)
 * Purpose: Updates the database record to mark user as verified.
 */
router.post("/verify-email", async (req, res) => {
  const token = req.body?.token;
  if (!token) return res.status(400).json({ error: "Token is required" });

  const email = consumeVerificationToken(token);
  if (!email) return res.status(400).json({ error: "Verification token is invalid or expired" });

  try {
    await pool.query("UPDATE users SET email_verified = true WHERE email = $1", [email]);
    res.status(200).json({ message: "Email verified successfully" });
  } catch (err) {
    res.status(500).json({ error: "Database update failed" });
  }
});

/**
 * Title: Verify Email (GET)
 * Purpose: Allows browser-based verification from email links.
 */
router.get("/verify-email", async (req, res) => {
  const token = req.query?.token;
  if (!token) return res.status(400).send("Verification token is required.");

  const email = consumeVerificationToken(token);
  if (!email) return res.status(400).send("The verification link is invalid or has expired.");

  try {
    const result = await pool.query(
      "UPDATE users SET email_verified = true WHERE email = $1 RETURNING id",
      [email]
    );
    if (result.rowCount === 0) return res.status(404).send("User not found.");
    return res.status(200).send("Email verified successfully. You can now log in.");
  } catch (err) {
    return res.status(500).send("Internal server error during verification.");
  }
});

// Title: Unimplemented Routes
router.post("/logout", (req, res) => res.status(501).json({ message: "Not implemented" }));
router.post("/forgot-password", (req, res) => res.status(501).json({ message: "Not implemented" }));
router.post("/reset-password", (req, res) => res.status(501).json({ message: "Not implemented" }));

export default router;
