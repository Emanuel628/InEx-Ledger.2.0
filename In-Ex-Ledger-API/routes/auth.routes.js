/**
 * AUTH ROUTES - FULL PRODUCTION VERSION
 * Handles registration, real email verification, login, and password resets.
 */

const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { Resend } = require("resend");
const rateLimit = require("express-rate-limit");
const { signToken, requireAuth } = require("../middleware/auth.middleware.js");
const { pool } = require("../db.js");

const router = express.Router();

/* =========================================================
   1. EMAIL API CONFIGURATION (Replaces SMTP)
   ========================================================= */
// Lazy init — avoids crash at startup when RESEND_API_KEY is not set
let _resend = null;
function getResend() {
  if (!_resend) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}
console.log("Email engine ready (Resend)");


/* =========================================================
   2. RATE LIMITERS
   ========================================================= */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." }
});

const passwordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many password reset attempts, please try again later." }
});

/* =========================================================
   3. CONSTANTS & COOKIE CONFIGURATION
   ========================================================= */
const REFRESH_TOKEN_COOKIE = "refresh_token";
const REFRESH_TOKEN_EXPIRY_DAYS = Number(process.env.REFRESH_TOKEN_EXPIRY_DAYS) || 7;
const REFRESH_TOKEN_EXPIRY_MS = REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
const REFRESH_TOKEN_BYTE_LENGTH = 48;
const ACCESS_TOKEN_EXPIRY_SECONDS = Number(process.env.ACCESS_TOKEN_EXPIRY_SECONDS) || 15 * 60;
const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS) || 12;

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  path: "/"
};


/* =========================================================
   3. TOKEN MANAGEMENT (DB-backed)
   ========================================================= */
const VERIFICATION_TOKEN_TTL_MS = 15 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 20 * 60 * 1000;

function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

async function createVerificationToken(email) {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);
  await pool.query("DELETE FROM verification_tokens WHERE email = $1", [email]);
  await pool.query(
    "INSERT INTO verification_tokens (token, email, expires_at) VALUES ($1, $2, $3)",
    [token, email, expiresAt]
  );
  return { token, expiresAt };
}

async function consumeVerificationToken(token) {
  await pool.query("DELETE FROM verification_tokens WHERE expires_at <= NOW()");
  const result = await pool.query(
    "DELETE FROM verification_tokens WHERE token = $1 AND expires_at > NOW() RETURNING email",
    [token]
  );
  return result.rows[0]?.email ?? null;
}

/* =========================================================
   4. PASSWORD RESET UTILITIES (DB-backed)
   ========================================================= */
async function createPasswordResetToken(email) {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
  await pool.query("DELETE FROM password_reset_tokens WHERE email = $1", [email]);
  await pool.query(
    "INSERT INTO password_reset_tokens (token, email, expires_at) VALUES ($1, $2, $3)",
    [token, email, expiresAt]
  );
  return { token, expiresAt };
}

async function consumePasswordResetToken(token) {
  await pool.query("DELETE FROM password_reset_tokens WHERE expires_at <= NOW()");
  const result = await pool.query(
    "DELETE FROM password_reset_tokens WHERE token = $1 AND expires_at > NOW() RETURNING email",
    [token]
  );
  return result.rows[0]?.email ?? null;
}

/* =========================================================
   5. LINK BUILDERS
   ========================================================= */
function buildVerificationLink(req, token) {
  const protocol = req.protocol;
  const host = req.get("host");
  return `${protocol}://${host}/api/auth/verify-email?token=${token}`;
}

function buildPasswordResetLink(req, token) {
  const protocol = req.protocol;
  const host = req.get("host");
  return `${protocol}://${host}/reset-password.html?token=${token}`;
}

/* =========================================================
   6. CRYPTOGRAPHY & SECURITY
   ========================================================= */
async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

function isLegacyScryptHash(stored) {
  return typeof stored === "string" && stored.includes("$") && stored.split("$").length === 2;
}

async function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string") {
    return { match: false, legacy: false };
  }

  if (isLegacyScryptHash(stored)) {
    const [salt, hash] = stored.split("$");
    if (!salt || !hash) {
      return { match: false, legacy: true };
    }
    const derived = crypto.scryptSync(password, salt, 64).toString("hex");
    const derivedBuffer = Buffer.from(derived, "hex");
    const hashBuffer = Buffer.from(hash, "hex");
    if (hashBuffer.length !== derivedBuffer.length) {
      return { match: false, legacy: true };
    }
    const matched = crypto.timingSafeEqual(hashBuffer, derivedBuffer);
    return { match: matched, legacy: matched };
  }

  const match = await bcrypt.compare(password, stored);
  return { match, legacy: false };
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

/* =========================================================
   7. ROUTES
   ========================================================= */

/**
 * POST /register
 */
router.post("/register", authLimiter, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;

  console.log("?? Registration Attempt:", email);

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const hashedPassword = await hashPassword(password);
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

            console.log("?? Account Created:", result.rows[0].email);

    // --- START OF EMAIL LOGIC ---
    try {
      const { token } = await createVerificationToken(email);
      const verificationLink = buildVerificationLink(req, token);

      await getResend().emails.send({
        from: "InEx Ledger <onboarding@resend.dev>",
        to: [email],
        subject: "Verify Your InEx Ledger Account",
        html: `<p>Welcome! Click <a href="${verificationLink}">here</a> to verify your account.</p>`
      });
      console.log("?? Verification Email Sent via Resend API");
    } catch (emailErr) {
      console.error("?? Email failed to send, but account was created:", emailErr);
    }
    // --- END OF EMAIL LOGIC ---

    return res.status(201).json({ success: true, message: "Account created. Check your email!" });
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({ error: "Registration failed" });
  } finally {
    client.release();
  }
});


/**
 * POST /send-verification
 * Now sends a REAL email via SMTP.
 */
router.post("/send-verification", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    const result = await pool.query("SELECT email, email_verified FROM users WHERE email = $1", [email]);
    const user = result.rows[0];

    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.email_verified) return res.status(200).json({ message: "Email already verified" });

    const { token, expiresAt } = await createVerificationToken(email);
    const verificationLink = buildVerificationLink(req, token);

    await getResend().emails.send({
      from: "InEx Ledger <onboarding@resend.dev>",
      to: [email],
      subject: "Verify Your InEx Ledger Account",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; border: 1px solid #eee; padding: 20px;">
          <h2>Welcome to InEx Ledger</h2>
          <p>Please click the button below to verify your email address. This link will expire in 15 minutes.</p>
          <a href="${verificationLink}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 4px;">Verify Email</a>
          <p style="margin-top: 20px; font-size: 12px; color: #666;">If you didn't create an account, you can safely ignore this email.</p>
        </div>
      `
    });


    console.log("?? Verification Email Sent to:", email);
    res.status(200).json({ message: "Verification link sent to your email." });
  } catch (err) {
    console.error("Send verification error:", err);
    res.status(500).json({ error: "Failed to send verification email." });
  }
});

/**
 * POST /login
 * Added strict check for email_verified status.
 */
router.post("/login", authLimiter, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const { match, legacy } = await verifyPassword(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (legacy) {
      try {
        const migratedHash = await hashPassword(password);
        await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
          migratedHash,
          user.id
        ]);
      } catch (migrationErr) {
        console.error("Legacy password migration failed:", migrationErr);
      }
    }

    const verified = Boolean(user.email_verified);

    const token = signToken(
      {
        id: user.id,
        email: user.email,
        role: user.role || "user",
        email_verified: verified
      },
      ACCESS_TOKEN_EXPIRY_SECONDS
    );

    const { token: refreshToken, expiresAt } = await createRefreshToken(user.id);
    setRefreshCookie(res, refreshToken, expiresAt);

    res.status(200).json({
      token,
      email_verified: verified,
      message: verified ? undefined : "Please verify your email before requesting exports."
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

/**
 * POST /refresh
 */
router.post("/refresh", async (req, res) => {
  const rawToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
  if (!rawToken) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: "Missing refresh token" });
  }

  const hashed = hashRefreshToken(rawToken);

  try {
    const result = await pool.query(
      `SELECT rt.user_id, u.email, u.role, u.email_verified
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

/**
 * POST /logout
 */
router.post("/logout", requireAuth, async (req, res) => {
  const rawToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
  if (rawToken) {
    const hashed = hashRefreshToken(rawToken);
    await revokeRefreshTokenByHash(hashed);
  }
  clearRefreshCookie(res);
  res.status(204).end();
});

/**
 * GET /verify-email
 * The link clicked by the user in their email.
 */
router.get("/verify-email", async (req, res) => {
  const token = req.query?.token;
  if (!token) return res.status(400).send("Token is required.");

  const email = await consumeVerificationToken(token);
  if (!email) return res.status(400).send("Invalid or expired link.");

  try {
    const result = await pool.query(
      "UPDATE users SET email_verified = true WHERE email = $1 RETURNING id",
      [email]
    );

    if (result.rowCount === 0) return res.status(404).send("User not found.");

    // Redirect to login with a success parameter
    return res.redirect("/html/login.html?verified=true");
  } catch (err) {
    console.error("Verification error:", err);
    return res.status(500).send("Verification failed.");
  }
});

/**
 * POST /forgot-password
 */
router.post("/forgot-password", passwordLimiter, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    const userResult = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (userResult.rowCount > 0) {
      const { token } = await createPasswordResetToken(email);
      const resetLink = buildPasswordResetLink(req, token);

      await getResend().emails.send({
        from: "InEx Ledger <onboarding@resend.dev>",
        to: [email],
        subject: "Password Reset Request",
        html: `<p>Click here to reset your password:</p><a href="${resetLink}">${resetLink}</a>`
      });

    }
    // Always return 200 for security reasons (don't leak which emails exist)
    return res.status(200).json({ message: "If the email is registered, a reset link was sent." });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

/**
 * POST /reset-password
 */
router.post("/reset-password", passwordLimiter, async (req, res) => {
  const { token, password, confirmPassword } = req.body;

  if (!token || !password || password !== confirmPassword) {
    return res.status(400).json({ error: "Invalid input or passwords do not match." });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const email = await consumePasswordResetToken(token);
  if (!email) return res.status(400).json({ error: "Token expired or invalid." });

  try {
    const hashedPassword = await hashPassword(password);
    await pool.query("UPDATE users SET password_hash = $1 WHERE email = $2", [hashedPassword, email]);
    return res.status(200).json({ message: "Password updated successfully." });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ error: "Failed to reset password." });
  }
});

/**
 * POST /request-email-change
 * Initiates email change: verifies current password, sends link to new address.
 */
router.post("/request-email-change", requireAuth, authLimiter, async (req, res) => {
  const { newEmail, currentPassword } = req.body ?? {};
  const email = normalizeEmail(newEmail);

  if (!email || !currentPassword) {
    return res.status(400).json({ error: "newEmail and currentPassword are required" });
  }

  try {
    const result = await pool.query("SELECT * FROM users WHERE id = $1", [req.user.id]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: "User not found" });

    const { match } = await verifyPassword(currentPassword, user.password_hash);
    if (!match) return res.status(401).json({ error: "Current password is incorrect" });

    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: "Email already in use" });
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await pool.query("DELETE FROM email_change_requests WHERE user_id = $1", [req.user.id]);
    await pool.query(
      "INSERT INTO email_change_requests (token, user_id, new_email, expires_at) VALUES ($1, $2, $3, $4)",
      [token, req.user.id, email, expiresAt]
    );

    const confirmLink = `${req.protocol}://${req.get("host")}/api/auth/confirm-email-change?token=${token}`;
    await getResend().emails.send({
      from: "InEx Ledger <onboarding@resend.dev>",
      to: [email],
      subject: "Confirm your new email address",
      html: `<p>Click to confirm your new email address: <a href="${confirmLink}">${confirmLink}</a></p>`
    });

    res.json({ message: "Confirmation email sent to your new address." });
  } catch (err) {
    console.error("Request email change error:", err);
    res.status(500).json({ error: "Failed to initiate email change." });
  }
});

/**
 * GET /confirm-email-change
 */
router.get("/confirm-email-change", async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send("Token is required.");

  try {
    await pool.query("DELETE FROM email_change_requests WHERE expires_at <= NOW()");
    const result = await pool.query(
      "DELETE FROM email_change_requests WHERE token = $1 AND expires_at > NOW() RETURNING user_id, new_email",
      [token]
    );

    if (result.rowCount === 0) return res.status(400).send("Invalid or expired link.");

    const { user_id, new_email } = result.rows[0];
    await pool.query("UPDATE users SET email = $1 WHERE id = $2", [new_email, user_id]);

    return res.redirect("/html/login.html?email_changed=true");
  } catch (err) {
    console.error("Confirm email change error:", err);
    res.status(500).send("Email change failed.");
  }
});

module.exports = router;
