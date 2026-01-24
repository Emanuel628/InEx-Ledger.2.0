import express from "express";
import crypto from "node:crypto";
import { signToken } from "../middleware/auth.middleware.js";
import pool from "../db.js";

const router = express.Router();

/** * Title: Temporary Token Storage
 * These stay in memory because they expire quickly (15 mins) and 
 * don't need to clutter your permanent database.
 */
const verificationTokens = new Map();
const VERIFICATION_TOKEN_TTL = 15 * 60 * 1000; // 15 minutes

// --- UTILITY FUNCTIONS ---

/**
 * Title: Email Normalization
 * Ensures emails are consistent (lowercase/trimmed) to prevent duplicate accounts.
 */
function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

/**
 * Title: Token Cleanup
 * Removes expired tokens from the memory map to prevent memory leaks.
 */
function cleanupVerificationTokens() {
  const now = Date.now();
  for (const [token, meta] of verificationTokens.entries()) {
    if (meta.expiresAt <= now) {
      verificationTokens.delete(token);
    }
  }
}

/**
 * Title: Specific Token Removal
 * Clears existing tokens for an email before generating a new one.
 */
function removeTokensForEmail(email) {
  for (const [token, meta] of verificationTokens.entries()) {
    if (meta.email === email) {
      verificationTokens.delete(token);
    }
  }
}

/**
 * Title: Token Generation
 * Creates a unique UUID for email verification links.
 */
function createVerificationToken(email) {
  cleanupVerificationTokens();
  removeTokensForEmail(email);
  const token = crypto.randomUUID();
  const expiresAt = Date.now() + VERIFICATION_TOKEN_TTL;
  verificationTokens.set(token, { email, expiresAt });
  return { token, expiresAt };
}

/**
 * Title: Token Consumption
 * Validates and deletes a token once it has been used.
 */
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

/**
 * Title: Link Builder
 * Constructs the URL sent to users via email.
 */
function buildVerificationLink(req, token) {
  const protocol = req.protocol;
  const host = req.get("host");
  return `${protocol}://${host}/api/auth/verify-email?token=${token}`;
}

/**
 * Title: Password Hashing (scrypt)
 * Uses a unique salt for every user to ensure high security.
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}$${derived}`;
}

/**
 * Title: Password Verification
 * Uses timing-safe comparison to prevent side-channel attacks.
 */
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

// --- AUTHENTICATION ROUTES ---

/**
 * Title: User Registration
 * Writes new user data to the PostgreSQL 'users' table.
 */
router.post("/register", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;
  
  console.log("🧭 REGISTER USING DB:", process.env.DATABASE_URL);
  
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
    console.log("✅ Database Update Success:", user.email);

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

/**
 * Title: Send Verification Email
 * Generates a verification token for an existing user.
 */
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
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Title: User Login
 * Validates credentials against the database and issues a JWT.
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

    // Note: If you don't have email_verified in your SQL, this can be commented out
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
    res.status(500).json({ error: "Login failed" });
  }
});

/**
 * Title: Email Verification (POST)
 * API-based verification for mobile or frontend apps.
 */
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
    res.status(500).json({ error: "Database update failed" });
  }
});

/**
 * Title: Email Verification (GET)
 * Direct link verification for browser access.
 */
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
    return res.status(500).send("Internal server error.");
  }
});

// Title: Placeholders for Future Implementation
router.post("/logout", (req, res) => res.status(501).json({ message: "Not implemented" }));
router.post("/forgot-password", (req, res) => res.status(501).json({ message: "Not implemented" }));
router.post("/reset-password", (req, res) => res.status(501).json({ message: "Not implemented" }));

export default router;
