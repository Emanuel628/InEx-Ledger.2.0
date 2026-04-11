/**
 * AUTH ROUTES - FULL PRODUCTION VERSION
 * Handles registration, real email verification, login, and password resets.
 */

const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { Resend } = require("resend");
const { signToken, verifyToken, requireAuth, requireMfa } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const {
  createAuthLimiter,
  createMfaVerifyLimiter,
  createPasswordLimiter
} = require("../middleware/rateLimitTiers.js");
const { pool } = require("../db.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");
const { getSubscriptionSnapshotForBusiness } = require("../services/subscriptionService.js");
const { COOKIE_OPTIONS, isLegacyScryptHash, verifyPassword } = require("../utils/authUtils.js");
const { logError, logWarn, logInfo } = require("../utils/logger.js");
const {
  getPreferredLanguageForUser,
  getPreferredLanguageForEmail,
  buildWelcomeVerificationEmail,
  buildVerificationEmail,
  buildPasswordResetEmail,
  buildEmailChangeEmail,
  buildMfaEmailContent
} = require("../services/emailI18nService.js");

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
if (process.env.NODE_ENV !== "production") {
  logInfo("Email engine ready (Resend)");
}
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM || "InEx Ledger <noreply@inexledger.com>";


/* =========================================================
   2. RATE LIMITERS
   ========================================================= */
const authLimiter = createAuthLimiter();
const passwordLimiter = createPasswordLimiter();
const mfaVerifyLimiter = createMfaVerifyLimiter();

/* =========================================================
   3. CONSTANTS & COOKIE CONFIGURATION
   ========================================================= */
const REFRESH_TOKEN_COOKIE = "refresh_token";
const MFA_TRUST_COOKIE = "mfa_trust";
const REFRESH_TOKEN_EXPIRY_DAYS = Number(process.env.REFRESH_TOKEN_EXPIRY_DAYS) || 7;
const REFRESH_TOKEN_EXPIRY_MS = REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
const MFA_TRUST_EXPIRY_DAYS = Number(process.env.MFA_TRUST_EXPIRY_DAYS) || 30;
const MFA_TRUST_EXPIRY_MS = MFA_TRUST_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
const MFA_EMAIL_CODE_EXPIRY_MINUTES = Number(process.env.MFA_EMAIL_CODE_EXPIRY_MINUTES) || 10;
const MFA_EMAIL_CODE_EXPIRY_MS = MFA_EMAIL_CODE_EXPIRY_MINUTES * 60 * 1000;
const REFRESH_TOKEN_BYTE_LENGTH = 48;
const ACCESS_TOKEN_EXPIRY_SECONDS = Number(process.env.ACCESS_TOKEN_EXPIRY_SECONDS) || 15 * 60;
const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS) || 12;
const MAX_MFA_ATTEMPTS = 8;


/* =========================================================
   3. TOKEN MANAGEMENT (DB-backed)
   ========================================================= */
const VERIFICATION_TOKEN_TTL_MS = 15 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 20 * 60 * 1000;
const MFA_PENDING_TOKEN_EXPIRY_SECONDS = 5 * 60;

function normalizeEmail(email) {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  if (/\.{2,}/.test(normalized)) {
    return "";
  }
  const atIndex = normalized.indexOf("@");
  if (atIndex <= 0 || atIndex !== normalized.lastIndexOf("@")) {
    return "";
  }
  const domain = normalized.slice(atIndex + 1);
  if (!domain || domain.startsWith(".") || domain.endsWith(".") || !domain.includes(".")) {
    return "";
  }
  return normalized;
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
  return `${getAppBaseUrl(req)}/api/auth/verify-email?token=${token}`;
}

function buildPasswordResetLink(req, token) {
  return `${getAppBaseUrl(req)}/reset-password?token=${token}`;
}

function getAppBaseUrl(req) {
  const configured = String(process.env.APP_BASE_URL || "").trim().replace(/\/+$/, "");
  if (configured) {
    return configured;
  }
  const protocol = req.protocol;
  const host = req.get("host");
  return `${protocol}://${host}`;
}

async function sendAppEmail({ to, subject, html, text }, { retries = 2, retryDelayMs = 500 } = {}) {
  const replyTo = process.env.RESEND_REPLY_TO || process.env.EMAIL_REPLY_TO || undefined;
  const recipient = Array.isArray(to) ? to : [to];

  let lastError;
  // One initial attempt plus up to `retries` additional attempts
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await getResend().emails.send({
        from: RESEND_FROM_EMAIL,
        to: recipient,
        subject,
        html,
        text,
        replyTo
      });
      if (process.env.NODE_ENV !== "production") {
        logInfo(`[email] sent to ${recipient.join(", ")} (subject: "${subject}")`);
      }
      return result;
    } catch (err) {
      lastError = err;
      logError("[email] attempt", attempt + 1, "failed for subject", JSON.stringify(subject), "to", recipient.join(", "), "-", err?.message || err);
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
}

/* =========================================================
   6. CRYPTOGRAPHY & SECURITY
   ========================================================= */
async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

function isStrongPassword(password) {
  const value = String(password || "");
  return (
    value.length >= 8 &&
    /\d/.test(value) &&
    /[A-Z]/.test(value) &&
    /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(value)
  );
}

async function findUserByEmail(email) {
  const result = await pool.query(
    "SELECT id, email, password_hash, email_verified, mfa_enabled, mfa_enabled_at, role, created_at, is_erased FROM users WHERE email = $1 LIMIT 1",
    [email]
  );
  return result.rows[0] || null;
}

async function findUserById(userId) {
  const result = await pool.query(
    "SELECT id, email, password_hash, email_verified, mfa_enabled, mfa_enabled_at, role, created_at, is_erased FROM users WHERE id = $1 LIMIT 1",
    [userId]
  );
  return result.rows[0] || null;
}

async function revokeAllRefreshTokensForUser(userId) {
  await pool.query("UPDATE refresh_tokens SET revoked = true WHERE user_id = $1 AND revoked = false", [
    userId
  ]);
}

async function issueAuthenticatedSession(res, user, businessIdOverride = null) {
  const verified = Boolean(user.email_verified);
  const businessId = businessIdOverride || (await resolveBusinessIdForUser(user));
  const subscription = await getSubscriptionSnapshotForBusiness(businessId);
  const token = signToken(
    {
      id: user.id,
      email: user.email,
      role: user.role || "user",
      email_verified: verified,
      business_id: businessId,
      mfa_enabled: !!user.mfa_enabled
    },
    ACCESS_TOKEN_EXPIRY_SECONDS
  );

  const { token: refreshToken, expiresAt } = await createRefreshToken(user.id);
  setRefreshCookie(res, refreshToken, expiresAt);

  return {
    token,
    email_verified: verified,
    subscription,
    mfa_enabled: !!user.mfa_enabled,
    message: verified ? undefined : "Please verify your email before requesting exports."
  };
}

async function resetCurrentRefreshSession(res, user) {
  await revokeAllRefreshTokensForUser(user.id);
  const { token, expiresAt } = await createRefreshToken(user.id);
  setRefreshCookie(res, token, expiresAt);
}

function ensureArrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function hashMfaEmailCode(code) {
  return crypto.createHash("sha256").update(String(code || "")).digest("hex");
}

function generateMfaEmailCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function createPendingMfaToken(user, businessId, challengeId, purpose = "mfa_pending", extraPayload = {}) {
  return signToken(
    {
      purpose,
      id: user.id,
      email: user.email,
      email_verified: !!user.email_verified,
      business_id: businessId,
      challenge_id: challengeId,
      ...extraPayload
    },
    MFA_PENDING_TOKEN_EXPIRY_SECONDS
  );
}

function buildMfaStatusPayload(user) {
  return {
    enabled: !!user?.mfa_enabled,
    enabled_at: user?.mfa_enabled_at || null,
    delivery: "email"
  };
}

async function clearPendingMfaEmailChallenges(userId) {
  await pool.query("DELETE FROM mfa_email_challenges WHERE user_id = $1 AND consumed_at IS NULL", [userId]);
}

async function createMfaEmailChallenge(user, req, options = {}) {
  const {
    businessId = null,
    tokenPurpose = "mfa_pending",
    tokenPayload = {},
    lang = "en",
    mfaContentKey = "signin",
    locationPath = "/login"
  } = options;

  // Merge caller-supplied text overrides with language-default content so that
  // French users always receive French copy even for callers that do not
  // explicitly set subject/heading/body/footer.
  const defaultContent = buildMfaEmailContent(lang, mfaContentKey);
  const subject = options.subject ?? defaultContent.subject;
  const heading = options.heading ?? defaultContent.heading;
  const body    = options.body    ?? defaultContent.body;
  const footer  = options.footer  ?? defaultContent.footer;

  // Localised page label for the footer line
  const locationLabelFr = {
    "/login":    "Page de connexion",
    "/settings": "Paramètres"
  };
  const locationLabel = options.locationLabel
    ?? (lang === "fr" ? (locationLabelFr[locationPath] ?? "InEx Ledger") : (mfaContentKey === "signin" ? "Sign-in page" : "Settings"));

  const expiryLine =
    lang === "fr"
      ? `Ce code expire dans ${MFA_EMAIL_CODE_EXPIRY_MINUTES} minutes. ${footer}`
      : `This code expires in ${MFA_EMAIL_CODE_EXPIRY_MINUTES} minutes. ${footer}`;

  const code = generateMfaEmailCode();
  const expiresAt = new Date(Date.now() + MFA_EMAIL_CODE_EXPIRY_MS);
  const challengeId = crypto.randomUUID();

  await clearPendingMfaEmailChallenges(user.id);
  await pool.query(
    `INSERT INTO mfa_email_challenges (id, user_id, code_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [challengeId, user.id, hashMfaEmailCode(code), expiresAt]
  );

  const appBaseUrl = getAppBaseUrl(req);
  await sendAppEmail({
    to: user.email,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden; background: #ffffff;">
        <div style="padding: 24px 28px; background: linear-gradient(135deg, #0f172a, #1d4ed8); color: #ffffff;">
          <div style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85;">InEx Ledger security</div>
          <h1 style="margin: 12px 0 0; font-size: 28px; line-height: 1.15;">${heading}</h1>
        </div>
        <div style="padding: 28px;">
          <p style="margin: 0 0 14px; color: #0f172a; font-size: 15px; line-height: 1.6;">
            ${body}
          </p>
          <div style="margin: 24px 0; padding: 18px 20px; border-radius: 12px; background: #eff6ff; color: #1d4ed8; font-size: 32px; font-weight: 800; letter-spacing: 0.18em; text-align: center;">
            ${code}
          </div>
          <p style="margin: 0 0 10px; color: #475569; font-size: 13px; line-height: 1.6;">
            ${expiryLine}
          </p>
          <p style="margin: 0; color: #64748b; font-size: 12px; line-height: 1.6;">
            ${locationLabel}: ${appBaseUrl}${locationPath}
          </p>
        </div>
      </div>
    `,
    text: `${heading}\n\n${body}\n\nCode: ${code}\n\n${expiryLine}`
  });

  return createPendingMfaToken(user, businessId, challengeId, tokenPurpose, tokenPayload);
}

async function findActiveMfaEmailChallenge(challengeId, userId) {
  const result = await pool.query(
    `SELECT id, code_hash, attempt_count, expires_at
       FROM mfa_email_challenges
      WHERE id = $1
        AND user_id = $2
        AND consumed_at IS NULL
        AND expires_at > NOW()
      LIMIT 1`,
    [challengeId, userId]
  );
  return result.rows[0] || null;
}

async function recordFailedMfaEmailAttempt(challengeId) {
  await pool.query(
    "UPDATE mfa_email_challenges SET attempt_count = attempt_count + 1 WHERE id = $1",
    [challengeId]
  );
}

async function consumeMfaEmailChallenge(challengeId) {
  await pool.query(
    "UPDATE mfa_email_challenges SET consumed_at = NOW() WHERE id = $1",
    [challengeId]
  );
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

function setMfaTrustCookie(res, token, expiresAt) {
  res.cookie(MFA_TRUST_COOKIE, token, {
    ...COOKIE_OPTIONS,
    expires: expiresAt
  });
}

function clearMfaTrustCookie(res) {
  res.clearCookie(MFA_TRUST_COOKIE, COOKIE_OPTIONS);
}

function hashRefreshToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function hashMfaTrustToken(token) {
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

async function createTrustedMfaDevice(user, req) {
  const token = crypto.randomBytes(48).toString("hex");
  const tokenHash = hashMfaTrustToken(token);
  const expiresAt = new Date(Date.now() + MFA_TRUST_EXPIRY_MS);
  const userAgent = String(req.get("user-agent") || "").slice(0, 512);
  const deviceLabel = req.body?.deviceLabel
    ? String(req.body.deviceLabel).trim().slice(0, 120)
    : null;

  await pool.query(
    `INSERT INTO mfa_trusted_devices (id, user_id, token_hash, device_label, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [crypto.randomUUID(), user.id, tokenHash, deviceLabel, userAgent || null, expiresAt]
  );

  return { token, expiresAt };
}

async function resolveTrustedMfaDevice(rawToken, userId) {
  if (!rawToken || !userId) {
    return null;
  }

  const tokenHash = hashMfaTrustToken(rawToken);
  const result = await pool.query(
    `SELECT id, user_id, expires_at
       FROM mfa_trusted_devices
      WHERE token_hash = $1
        AND user_id = $2
        AND expires_at > NOW()
      LIMIT 1`,
    [tokenHash, userId]
  );

  return result.rows[0] || null;
}

async function touchTrustedMfaDevice(deviceId) {
  await pool.query("UPDATE mfa_trusted_devices SET last_used_at = NOW() WHERE id = $1", [deviceId]);
}

async function revokeTrustedMfaDevicesForUser(userId) {
  await pool.query("DELETE FROM mfa_trusted_devices WHERE user_id = $1", [userId]);
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

  // Optional geo-tagging fields for data residency tracking (PIPEDA / Quebec Law 25)
  const country = String(req.body?.country || "").trim().toUpperCase() || null;
  const province = String(req.body?.province || "").trim().toUpperCase() || null;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  if (!isStrongPassword(password)) {
    return res.status(400).json({ error: "Password must be at least 8 characters and include an uppercase letter, number, and symbol." });
  }

  const hashedPassword = await hashPassword(password);
  const client = await pool.connect();
  let committed = false;

  try {
    await client.query("BEGIN");
    const existing = await client.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Email already registered" });
    }

    const result = await client.query(
      `INSERT INTO users (id, email, password_hash, country, province, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id, email`,
      [crypto.randomUUID(), email, hashedPassword, country, province]
    );

    const newUserId = result.rows[0].id;

    // Quebec Privacy Default (Law 25): data sharing is opt-OUT by default for QC residents
    const isQuebec = country === "CA" && province === "QC";
    await client.query(
      `INSERT INTO user_privacy_settings (user_id, data_sharing_opt_out, consent_given, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id) DO NOTHING`,
      [newUserId, isQuebec, !isQuebec]
    );
    await client.query("COMMIT");
    committed = true;

    // --- START OF EMAIL LOGIC ---
    try {
      const { token } = await createVerificationToken(email);
      const verificationLink = buildVerificationLink(req, token);
      // For new registrations the business language hasn't been set yet via
      // onboarding, so we infer language from province: QC defaults to French.
      const registrationLang = (country === "CA" && province === "QC") ? "fr" : "en";
      const emailContent = buildWelcomeVerificationEmail(registrationLang, verificationLink);
      await sendAppEmail({ to: email, ...emailContent });
    } catch (emailErr) {
      logError("Email failed to send, but account was created:", emailErr);
    }
    // --- END OF EMAIL LOGIC ---

    return res.status(201).json({ success: true, message: "Account created. Check your email!" });
  } catch (err) {
    if (!committed) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackErr) {
        logError("Register rollback failed:", rollbackErr);
      }
    }
    logError("Register error:", err);
    return res.status(500).json({ error: "Registration failed" });
  } finally {
    client.release();
  }
});


/**
 * POST /send-verification
 * Sends a verification email via the Resend API.
 */
router.post("/send-verification", authLimiter, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    const result = await pool.query("SELECT email, email_verified FROM users WHERE email = $1", [email]);
    const user = result.rows[0];

    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.email_verified) return res.status(200).json({ message: "Email already verified" });

    const { token, expiresAt } = await createVerificationToken(email);
    const verificationLink = buildVerificationLink(req, token);
    const lang = await getPreferredLanguageForEmail(email);
    const emailContent = buildVerificationEmail(lang, verificationLink);
    await sendAppEmail({ to: email, ...emailContent });

    res.status(200).json({ message: "Verification link sent to your email." });
  } catch (err) {
    logError("Send verification error:", err);
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
    const user = await findUserByEmail(email);

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (user.is_erased) {
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
        logError("Legacy password migration failed:", migrationErr);
      }
    }

    const verified = Boolean(user.email_verified);
    const businessId = await resolveBusinessIdForUser(user);

    if (user.mfa_enabled) {
      const trustedDevice = await resolveTrustedMfaDevice(req.cookies?.[MFA_TRUST_COOKIE], user.id);
      if (trustedDevice) {
        await touchTrustedMfaDevice(trustedDevice.id);
      } else {
        clearMfaTrustCookie(res);
      }

      if (!trustedDevice) {
        const userLang = await getPreferredLanguageForUser(user.id);
        const mfaToken = await createMfaEmailChallenge(user, req, {
          businessId,
          lang: userLang,
          mfaContentKey: "signin",
          locationPath: "/login"
        });
        return res.status(200).json({
          mfa_required: true,
          mfa_token: mfaToken,
          email_verified: verified,
          mfa_enabled: true
        });
      }
    }

    const session = await issueAuthenticatedSession(res, user, businessId);
    res.status(200).json(session);
  } catch (err) {
    logError("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

/**
 * POST /refresh
 */
router.post("/refresh", requireCsrfProtection, async (req, res) => {
  const rawToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
  if (!rawToken) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: "Missing refresh token" });
  }

  const hashed = hashRefreshToken(rawToken);

  try {
    const result = await pool.query(
      `SELECT rt.user_id, u.email, u.role, u.email_verified
              , u.mfa_enabled
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

    const businessId = await resolveBusinessIdForUser({
      id: result.rows[0].user_id,
      email: result.rows[0].email,
      business_id: req.user?.business_id
    });
    const subscription = await getSubscriptionSnapshotForBusiness(businessId);

    const token = signToken(
      {
        id: result.rows[0].user_id,
        email: result.rows[0].email,
        role: result.rows[0].role || "user",
        email_verified: !!result.rows[0].email_verified,
        business_id: businessId,
        mfa_enabled: !!result.rows[0].mfa_enabled
      },
      ACCESS_TOKEN_EXPIRY_SECONDS
    );

    res.status(200).json({ token, subscription });
  } catch (err) {
    logError("Refresh token error:", err);
    clearRefreshCookie(res);
    res.status(500).json({ error: "Failed to refresh token" });
  }
});

/**
 * POST /logout
 */
router.post("/logout", requireAuth, requireCsrfProtection, async (req, res) => {
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
    return res.redirect("/login?verified=true");
  } catch (err) {
    logError("Verification error:", err);
    return res.status(500).send("Verification failed.");
  }
});

router.post("/change-password", authLimiter, requireAuth, requireCsrfProtection, requireMfa, async (req, res) => {
  const currentPassword = req.body?.currentPassword;
  const newPassword = req.body?.newPassword;
  const confirmPassword = req.body?.confirmPassword;

  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({ error: "All password fields are required." });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: "New passwords do not match." });
  }

  if (!isStrongPassword(newPassword)) {
    return res.status(400).json({
      error: "Password must be at least 8 characters and include an uppercase letter, number, and symbol."
    });
  }

  try {
    const user = await findUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const { match } = await verifyPassword(currentPassword, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }

    const samePassword = await verifyPassword(newPassword, user.password_hash);
    if (samePassword.match) {
      return res.status(400).json({ error: "Choose a different password." });
    }

    const nextHash = await hashPassword(newPassword);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [nextHash, user.id]);
    await resetCurrentRefreshSession(res, user);
    await revokeTrustedMfaDevicesForUser(user.id);
    clearMfaTrustCookie(res);

    return res.status(200).json({ success: true, message: "Password updated." });
  } catch (err) {
    logError("Change password error:", err);
    return res.status(500).json({ error: "Unable to update password." });
  }
});

router.get("/mfa/status", requireAuth, async (req, res) => {
  try {
    const user = await findUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.status(200).json(buildMfaStatusPayload(user));
  } catch (err) {
    logError("MFA status error:", err);
    return res.status(500).json({ error: "Unable to load MFA status." });
  }
});

router.post("/mfa/setup", requireAuth, requireCsrfProtection, authLimiter, async (req, res) => {
  return res.status(410).json({ error: "Authenticator app setup is no longer used." });
});

router.post("/mfa/setup/cancel", requireAuth, requireCsrfProtection, async (req, res) => {
  return res.status(200).json({ success: true });
});

router.post("/mfa/enable", requireAuth, requireCsrfProtection, authLimiter, async (req, res) => {
  const currentPassword = req.body?.currentPassword;
  const code = String(req.body?.code || "").trim();
  const mfaToken = String(req.body?.mfaToken || "").trim();
  if (!currentPassword) {
    return res.status(400).json({ error: "Current password is required." });
  }

  try {
    const user = await findUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const { match } = await verifyPassword(currentPassword, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }

    if (!code || !mfaToken) {
      const userLang = await getPreferredLanguageForUser(user.id);
      const pendingToken = await createMfaEmailChallenge(user, req, {
        tokenPurpose: "mfa_settings_enable",
        tokenPayload: { target_state: true },
        lang: userLang,
        mfaContentKey: "mfa_enable",
        locationPath: "/settings"
      });

      return res.status(200).json({
        pending_verification: true,
        mfa_token: pendingToken,
        message: "We emailed you a verification code. Enter it to finish turning MFA on."
      });
    }

    let pending;
    try {
      pending = verifyToken(mfaToken);
    } catch (error) {
      return res.status(401).json({ error: "Verification session expired. Start again." });
    }

    if (pending.purpose !== "mfa_settings_enable" || pending.id !== user.id || pending.email !== user.email) {
      return res.status(401).json({ error: "Verification session expired. Start again." });
    }

    const challenge = await findActiveMfaEmailChallenge(pending.challenge_id, user.id);
    if (!challenge) {
      return res.status(401).json({ error: "Verification code expired. Start again." });
    }

    if (Number(challenge.attempt_count || 0) >= MAX_MFA_ATTEMPTS) {
      return res.status(429).json({ error: "Too many invalid verification attempts. Start again." });
    }

    if (hashMfaEmailCode(code) !== String(challenge.code_hash || "")) {
      const nextAttemptCount = Number(challenge.attempt_count || 0) + 1;
      await recordFailedMfaEmailAttempt(challenge.id);
      if (nextAttemptCount >= MAX_MFA_ATTEMPTS) {
        return res.status(429).json({ error: "Too many invalid verification attempts. Start again." });
      }
      return res.status(401).json({ error: "Invalid verification code." });
    }

    await consumeMfaEmailChallenge(challenge.id);
    await pool.query(
      `UPDATE users
          SET mfa_enabled = true,
              mfa_secret_encrypted = NULL,
              mfa_recovery_codes_hash = '[]'::jsonb,
              mfa_temp_secret_encrypted = NULL,
              mfa_temp_recovery_codes_hash = '[]'::jsonb,
              mfa_enabled_at = COALESCE(mfa_enabled_at, NOW())
        WHERE id = $1`,
      [user.id]
    );

    const refreshedUser = await findUserById(user.id);
    await resetCurrentRefreshSession(res, refreshedUser);
    await revokeTrustedMfaDevicesForUser(user.id);
    clearMfaTrustCookie(res);

    return res.status(200).json({
      success: true,
      message: "MFA enabled.",
      status: buildMfaStatusPayload(refreshedUser)
    });
  } catch (err) {
    logError("MFA enable error:", err);
    return res.status(500).json({ error: "Unable to enable MFA." });
  }
});

router.post("/mfa/disable", requireAuth, requireCsrfProtection, mfaVerifyLimiter, async (req, res) => {
  const currentPassword = req.body?.currentPassword;
  const code = String(req.body?.code || "").trim();
  const mfaToken = String(req.body?.mfaToken || "").trim();
  if (!currentPassword) {
    return res.status(400).json({ error: "Current password is required." });
  }

  try {
    const user = await findUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const { match } = await verifyPassword(currentPassword, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }

    if (!code || !mfaToken) {
      const userLang = await getPreferredLanguageForUser(user.id);
      const pendingToken = await createMfaEmailChallenge(user, req, {
        tokenPurpose: "mfa_settings_disable",
        tokenPayload: { target_state: false },
        lang: userLang,
        mfaContentKey: "mfa_disable",
        locationPath: "/settings"
      });

      return res.status(200).json({
        pending_verification: true,
        mfa_token: pendingToken,
        message: "We emailed you a verification code. Enter it to finish turning MFA off."
      });
    }

    let pending;
    try {
      pending = verifyToken(mfaToken);
    } catch (error) {
      return res.status(401).json({ error: "Verification session expired. Start again." });
    }

    if (pending.purpose !== "mfa_settings_disable" || pending.id !== user.id || pending.email !== user.email) {
      return res.status(401).json({ error: "Verification session expired. Start again." });
    }

    const challenge = await findActiveMfaEmailChallenge(pending.challenge_id, user.id);
    if (!challenge) {
      return res.status(401).json({ error: "Verification code expired. Start again." });
    }

    if (Number(challenge.attempt_count || 0) >= MAX_MFA_ATTEMPTS) {
      return res.status(429).json({ error: "Too many invalid verification attempts. Start again." });
    }

    if (hashMfaEmailCode(code) !== String(challenge.code_hash || "")) {
      const nextAttemptCount = Number(challenge.attempt_count || 0) + 1;
      await recordFailedMfaEmailAttempt(challenge.id);
      if (nextAttemptCount >= MAX_MFA_ATTEMPTS) {
        return res.status(429).json({ error: "Too many invalid verification attempts. Start again." });
      }
      return res.status(401).json({ error: "Invalid verification code." });
    }

    await consumeMfaEmailChallenge(challenge.id);
    await pool.query(
      `UPDATE users
          SET mfa_enabled = false,
              mfa_secret_encrypted = NULL,
              mfa_recovery_codes_hash = '[]'::jsonb,
              mfa_temp_secret_encrypted = NULL,
              mfa_temp_recovery_codes_hash = '[]'::jsonb,
              mfa_enabled_at = NULL
        WHERE id = $1`,
      [user.id]
    );

    const refreshedUser = await findUserById(user.id);
    await resetCurrentRefreshSession(res, refreshedUser);
    await revokeTrustedMfaDevicesForUser(user.id);
    clearMfaTrustCookie(res);

    return res.status(200).json({
      success: true,
      message: "MFA disabled.",
      status: buildMfaStatusPayload(refreshedUser)
    });
  } catch (err) {
    logError("MFA disable error:", err);
    return res.status(500).json({ error: "Unable to disable MFA." });
  }
});

router.post("/mfa/recovery-codes/regenerate", requireAuth, requireCsrfProtection, mfaVerifyLimiter, async (req, res) => {
  return res.status(410).json({ error: "Recovery codes are no longer used." });
});

router.post("/mfa/verify", mfaVerifyLimiter, async (req, res) => {
  const mfaToken = req.body?.mfaToken;
  const code = req.body?.code;
  const trustDevice = !!req.body?.trustDevice;

  if (!mfaToken || !code) {
    return res.status(400).json({ error: "MFA token and code are required." });
  }

  try {
    const pending = verifyToken(mfaToken);
    if (pending.purpose !== "mfa_pending" || !pending.id) {
      return res.status(401).json({ error: "Invalid MFA session." });
    }

    const user = await findUserById(pending.id);
    if (!user || user.email !== pending.email || !user.mfa_enabled) {
      return res.status(401).json({ error: "MFA session is no longer valid." });
    }

    const challenge = await findActiveMfaEmailChallenge(pending.challenge_id, user.id);
    if (!challenge) {
      return res.status(401).json({ error: "Verification code expired. Sign in again to get a new one." });
    }

    if (Number(challenge.attempt_count || 0) >= MAX_MFA_ATTEMPTS) {
      return res.status(429).json({ error: "Too many invalid verification attempts. Sign in again to get a new code." });
    }

    if (hashMfaEmailCode(code) !== String(challenge.code_hash || "")) {
      const nextAttemptCount = Number(challenge.attempt_count || 0) + 1;
      await recordFailedMfaEmailAttempt(challenge.id);
      if (nextAttemptCount >= MAX_MFA_ATTEMPTS) {
        return res.status(429).json({ error: "Too many invalid verification attempts. Sign in again to get a new code." });
      }
      return res.status(401).json({ error: "Invalid verification code." });
    }

    await consumeMfaEmailChallenge(challenge.id);
    const refreshedUser = await findUserById(user.id);
    if (trustDevice) {
      const trustedDevice = await createTrustedMfaDevice(refreshedUser, req);
      setMfaTrustCookie(res, trustedDevice.token, trustedDevice.expiresAt);
    }
    const session = await issueAuthenticatedSession(res, refreshedUser, pending.business_id || null);
    return res.status(200).json(session);
  } catch (err) {
    logError("MFA verify error:", err);
    return res.status(401).json({ error: "Invalid or expired MFA session." });
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

      try {
        const lang = await getPreferredLanguageForEmail(email);
        const emailContent = buildPasswordResetEmail(lang, resetLink);
        await sendAppEmail({ to: email, ...emailContent });
      } catch (emailErr) {
        logError("[forgot-password] failed to send reset email to", email, ":", emailErr?.message || emailErr);
        // Continue — do not expose email delivery failure to the caller
      }

    }
    // Always return 200 for security reasons (don't leak which emails exist)
    return res.status(200).json({ message: "If the email is registered, a reset link was sent." });
  } catch (err) {
    logError("Forgot password error:", err);
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

  if (!isStrongPassword(password)) {
    return res.status(400).json({ error: "Password must be at least 8 characters and include an uppercase letter, number, and symbol." });
  }

  const email = await consumePasswordResetToken(token);
  if (!email) return res.status(400).json({ error: "Token expired or invalid." });

  try {
    const hashedPassword = await hashPassword(password);
    await pool.query("UPDATE users SET password_hash = $1 WHERE email = $2", [hashedPassword, email]);
    return res.status(200).json({ message: "Password updated successfully." });
  } catch (err) {
    logError("Reset password error:", err);
    res.status(500).json({ error: "Failed to reset password." });
  }
});

/**
 * POST /request-email-change
 * Initiates email change: verifies current password, sends link to new address.
 */
router.post("/request-email-change", requireAuth, requireCsrfProtection, authLimiter, async (req, res) => {
  const { newEmail, currentPassword } = req.body ?? {};
  const email = normalizeEmail(newEmail);

  if (!email || !currentPassword) {
    return res.status(400).json({ error: "newEmail and currentPassword are required" });
  }

  try {
    const result = await pool.query(
      "SELECT id, email, password_hash FROM users WHERE id = $1",
      [req.user.id]
    );
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

    const confirmLink = `${getAppBaseUrl(req)}/api/auth/confirm-email-change?token=${token}`;
    const lang = await getPreferredLanguageForUser(req.user.id);
    const emailContent = buildEmailChangeEmail(lang, confirmLink);
    await sendAppEmail({ to: email, ...emailContent });

    res.json({ message: "Confirmation email sent to your new address." });
  } catch (err) {
    logError("Request email change error:", err);
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
    await revokeAllRefreshTokensForUser(user_id);
    await revokeTrustedMfaDevicesForUser(user_id);
    clearRefreshCookie(res);
    clearMfaTrustCookie(res);

    return res.redirect("/login?email_changed=true");
  } catch (err) {
    logError("Confirm email change error:", err);
    res.status(500).send("Email change failed.");
  }
});

module.exports = router;
