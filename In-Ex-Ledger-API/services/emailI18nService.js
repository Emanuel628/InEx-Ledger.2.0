/**
 * emailI18nService.js
 *
 * Provides language-aware email content builders for all transactional emails.
 * Supported languages: 'en', 'fr'.  Falls back to 'en' for anything else.
 *
 * Public API
 * ----------
 * getPreferredLanguageForUser(userId)   → Promise<'en'|'fr'>
 * getPreferredLanguageForEmail(email)   → Promise<'en'|'fr'>
 * buildWelcomeVerificationEmail(lang, verificationLink)  → { subject, html, text }
 * buildVerificationEmail(lang, verificationLink)         → { subject, html, text }
 * buildPasswordResetEmail(lang, resetLink)               → { subject, html, text }
 * buildNewSignInAlertEmail(lang, options)                → { subject, html, text }
 * buildEmailChangeEmail(lang, confirmLink)               → { subject, html, text }
 * buildMfaEmailContent(lang, opts)                       → { subject, heading, body, footer }
 */

const { pool } = require("../db.js");

const SUPPORTED = new Set(["en", "fr"]);
const HTML_ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};

function normalizeEmailLang(lang) {
  const l = String(lang || "").toLowerCase().trim();
  return SUPPORTED.has(l) ? l : "en";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char] || char);
}

function sanitizeHttpUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.toString();
  } catch (_) {
    return "";
  }
}

/**
 * Look up the language stored in the first business owned by this user.
 * Falls back to 'en' if no business / no language is set.
 */
async function getPreferredLanguageForUser(userId) {
  if (!userId) return "en";
  try {
    const result = await pool.query(
      "SELECT language FROM businesses WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1",
      [userId]
    );
    return normalizeEmailLang(result.rows[0]?.language);
  } catch (_) {
    return "en";
  }
}

/**
 * Look up the language stored for a user identified by email address.
 * Falls back to 'en'.
 */
async function getPreferredLanguageForEmail(email) {
  if (!email) return "en";
  try {
    const result = await pool.query(
      `SELECT b.language
         FROM businesses b
         JOIN users u ON u.id = b.user_id
        WHERE u.email = $1
        ORDER BY b.created_at ASC
        LIMIT 1`,
      [email]
    );
    return normalizeEmailLang(result.rows[0]?.language);
  } catch (_) {
    return "en";
  }
}

/* =========================================================
   Shared HTML wrapper
   ========================================================= */
function wrapEmailHtml(headerHtml, bodyHtml) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden; background: #ffffff;">
      <div style="padding: 24px 28px; background: linear-gradient(135deg, #0f172a, #1d4ed8); color: #ffffff;">
        ${headerHtml}
      </div>
      <div style="padding: 28px;">
        ${bodyHtml}
      </div>
    </div>
  `;
}

function ctaButton(href, label) {
  const safeHref = sanitizeHttpUrl(href);
  if (!safeHref) return "";
  return `<div style="margin: 24px 0;"><a href="${escapeHtml(safeHref)}" style="display: inline-block; padding: 14px 22px; background: #2563eb; color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 700;">${escapeHtml(label)}</a></div>`;
}

/* =========================================================
   Welcome / registration verification email
   ========================================================= */
const WELCOME_VERIFY = {
  en: {
    subject: "Welcome to InEx Ledger - verify your email",
    eyebrow: "Welcome to InEx Ledger",
    heading: "Your account is ready. One last step.",
    body: "Thanks for signing up. Verify your email to unlock your workspace and start tracking income, expenses, receipts, mileage, and tax-ready exports.",
    buttonLabel: "Verify email",
    expiry: "This verification link expires in 15 minutes. If the button does not work, copy and paste this link into your browser:",
    text: (link) =>
      `Welcome to InEx Ledger.\n\nVerify your email to activate your account:\n${link}\n\nThis link expires in 15 minutes.`
  },
  fr: {
    subject: "Bienvenue dans InEx Ledger - vérifiez votre courriel",
    eyebrow: "Bienvenue dans InEx Ledger",
    heading: "Votre compte est prêt. Une dernière étape.",
    body: "Merci de vous être inscrit. Vérifiez votre courriel pour accéder à votre espace de travail et commencer à suivre vos revenus, dépenses, reçus, kilométrage et exports fiscaux.",
    buttonLabel: "Vérifier le courriel",
    expiry: "Ce lien de vérification expire dans 15 minutes. Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :",
    text: (link) =>
      `Bienvenue dans InEx Ledger.\n\nVérifiez votre courriel pour activer votre compte :\n${link}\n\nCe lien expire dans 15 minutes.`
  }
};

function buildWelcomeVerificationEmail(lang, verificationLink) {
  const l = normalizeEmailLang(lang);
  const s = WELCOME_VERIFY[l];
  const safeVerificationLink = sanitizeHttpUrl(verificationLink);
  const html = wrapEmailHtml(
    `<div style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85;">${s.eyebrow}</div>
     <h1 style="margin: 12px 0 0; font-size: 28px; line-height: 1.15;">${s.heading}</h1>`,
    `<p style="margin: 0 0 14px; color: #0f172a; font-size: 15px; line-height: 1.6;">${s.body}</p>
     ${ctaButton(safeVerificationLink, s.buttonLabel)}
     <p style="margin: 0 0 10px; color: #475569; font-size: 13px; line-height: 1.6;">${s.expiry}</p>
     <p style="margin: 0; word-break: break-all; color: #1d4ed8; font-size: 13px;">${escapeHtml(safeVerificationLink)}</p>`
  );
  return { subject: s.subject, html, text: s.text(safeVerificationLink) };
}

/* =========================================================
   Re-send verification email
   ========================================================= */
const RESEND_VERIFY = {
  en: {
    subject: "Verify your InEx Ledger email",
    eyebrow: "InEx Ledger",
    heading: "Verify your email",
    body: "Click the button below to verify your email address and finish setting up your account.",
    buttonLabel: "Verify email",
    expiry: "This verification link expires in 15 minutes. If you did not create this account, you can ignore this email.",
    text: (link) =>
      `Verify your InEx Ledger email.\n\nUse this link to verify your account:\n${link}\n\nThis link expires in 15 minutes.`
  },
  fr: {
    subject: "Vérifiez votre courriel InEx Ledger",
    eyebrow: "InEx Ledger",
    heading: "Vérifiez votre courriel",
    body: "Cliquez sur le bouton ci-dessous pour vérifier votre adresse courriel et terminer la configuration de votre compte.",
    buttonLabel: "Vérifier le courriel",
    expiry: "Ce lien de vérification expire dans 15 minutes. Si vous n'avez pas créé ce compte, vous pouvez ignorer ce courriel.",
    text: (link) =>
      `Vérifiez votre courriel InEx Ledger.\n\nUtilisez ce lien pour vérifier votre compte :\n${link}\n\nCe lien expire dans 15 minutes.`
  }
};

function buildVerificationEmail(lang, verificationLink) {
  const l = normalizeEmailLang(lang);
  const s = RESEND_VERIFY[l];
  const safeVerificationLink = sanitizeHttpUrl(verificationLink);
  const html = wrapEmailHtml(
    `<div style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85;">${s.eyebrow}</div>
     <h1 style="margin: 12px 0 0; font-size: 26px; line-height: 1.15;">${s.heading}</h1>`,
    `<p style="margin: 0 0 14px; color: #0f172a; font-size: 15px; line-height: 1.6;">${s.body}</p>
     ${ctaButton(safeVerificationLink, s.buttonLabel)}
     <p style="margin: 0 0 10px; color: #475569; font-size: 13px; line-height: 1.6;">${s.expiry}</p>
     <p style="margin: 0; word-break: break-all; color: #1d4ed8; font-size: 13px;">${escapeHtml(safeVerificationLink)}</p>`
  );
  return { subject: s.subject, html, text: s.text(safeVerificationLink) };
}

/* =========================================================
   Password reset email
   ========================================================= */
const PASSWORD_RESET = {
  en: {
    subject: "Reset your InEx Ledger password",
    eyebrow: "InEx Ledger security",
    heading: "Reset your password",
    body: "We received a request to reset the password for your InEx Ledger account. Click the button below to choose a new password.",
    buttonLabel: "Reset password",
    expiry: "This link expires in 20 minutes. If the button does not work, copy and paste this link into your browser:",
    ignore: "If you did not request a password reset, you can safely ignore this email.",
    text: (link) =>
      `Reset your InEx Ledger password\n\nWe received a request to reset the password for your account. Use this link to choose a new password:\n${link}\n\nThis link expires in 20 minutes.\n\nIf you did not request a password reset, you can safely ignore this email.`
  },
  fr: {
    subject: "Réinitialisez votre mot de passe InEx Ledger",
    eyebrow: "Sécurité InEx Ledger",
    heading: "Réinitialisez votre mot de passe",
    body: "Nous avons reçu une demande de réinitialisation du mot de passe pour votre compte InEx Ledger. Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.",
    buttonLabel: "Réinitialiser le mot de passe",
    expiry: "Ce lien expire dans 20 minutes. Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :",
    ignore: "Si vous n'avez pas demandé de réinitialisation de mot de passe, vous pouvez ignorer ce courriel en toute sécurité.",
    text: (link) =>
      `Réinitialisez votre mot de passe InEx Ledger\n\nNous avons reçu une demande de réinitialisation du mot de passe pour votre compte. Utilisez ce lien pour choisir un nouveau mot de passe :\n${link}\n\nCe lien expire dans 20 minutes.\n\nSi vous n'avez pas demandé de réinitialisation, vous pouvez ignorer ce courriel en toute sécurité.`
  }
};

function buildPasswordResetEmail(lang, resetLink) {
  const l = normalizeEmailLang(lang);
  const s = PASSWORD_RESET[l];
  const safeResetLink = sanitizeHttpUrl(resetLink);
  const html = wrapEmailHtml(
    `<div style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85;">${s.eyebrow}</div>
     <h1 style="margin: 12px 0 0; font-size: 28px; line-height: 1.15;">${s.heading}</h1>`,
    `<p style="margin: 0 0 14px; color: #0f172a; font-size: 15px; line-height: 1.6;">${s.body}</p>
     ${ctaButton(safeResetLink, s.buttonLabel)}
     <p style="margin: 0 0 10px; color: #475569; font-size: 13px; line-height: 1.6;">${s.expiry}</p>
     <p style="margin: 0 0 14px; word-break: break-all; color: #1d4ed8; font-size: 13px;">${escapeHtml(safeResetLink)}</p>
     <p style="margin: 0; color: #64748b; font-size: 12px; line-height: 1.6;">${s.ignore}</p>`
  );
  return { subject: s.subject, html, text: s.text(safeResetLink) };
}

/* =========================================================
   New sign-in alert email
   ========================================================= */
const NEW_SIGNIN_ALERT = {
  en: {
    subject: "New sign-in detected on your InEx Ledger account",
    eyebrow: "InEx Ledger security",
    heading: "New sign-in detected",
    body: "We noticed a sign-in from a new device on your account.",
    signInTimeLabel: "Sign-in time",
    locationLabel: "Location",
    unknownLocation: "Unknown location",
    warning: "Was this not you? Reset your password immediately to secure your account.",
    buttonLabel: "Reset password now",
    footer: "If this was you, you can ignore this message.",
    text: ({ signInTime, location, resetLink }) =>
      `New sign-in detected on your InEx Ledger account.\n\nSign-in time: ${signInTime}\nLocation: ${location}\n\nWas this not you? Reset your password immediately:\n${resetLink}\n\nIf this was you, you can ignore this message.`
  },
  fr: {
    subject: "Nouvelle connexion détectée sur votre compte InEx Ledger",
    eyebrow: "Sécurité InEx Ledger",
    heading: "Nouvelle connexion détectée",
    body: "Nous avons détecté une connexion depuis un nouvel appareil sur votre compte.",
    signInTimeLabel: "Heure de connexion",
    locationLabel: "Emplacement",
    unknownLocation: "Emplacement inconnu",
    warning: "Ce n'était pas vous? Réinitialisez votre mot de passe immédiatement pour sécuriser votre compte.",
    buttonLabel: "Réinitialiser le mot de passe",
    footer: "Si c'était bien vous, vous pouvez ignorer ce message.",
    text: ({ signInTime, location, resetLink }) =>
      `Nouvelle connexion détectée sur votre compte InEx Ledger.\n\nHeure de connexion: ${signInTime}\nEmplacement: ${location}\n\nCe n'était pas vous? Réinitialisez votre mot de passe immédiatement:\n${resetLink}\n\nSi c'était bien vous, vous pouvez ignorer ce message.`
  }
};

function buildNewSignInAlertEmail(lang, options = {}) {
  const l = normalizeEmailLang(lang);
  const s = NEW_SIGNIN_ALERT[l];

  const signInTime = String(options.signInTime || "").trim() || new Date().toISOString();
  const city = String(options.city || "").trim();
  const country = String(options.country || "").trim();
  const location = [city, country].filter(Boolean).join(", ") || s.unknownLocation;
  const resetLink = sanitizeHttpUrl(options.resetLink);

  const html = wrapEmailHtml(
    `<div style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85;">${s.eyebrow}</div>
     <h1 style="margin: 12px 0 0; font-size: 28px; line-height: 1.15;">${s.heading}</h1>`,
    `<p style="margin: 0 0 14px; color: #0f172a; font-size: 15px; line-height: 1.6;">${s.body}</p>
     <p style="margin: 0 0 10px; color: #475569; font-size: 13px; line-height: 1.6;"><strong>${s.signInTimeLabel}:</strong> ${escapeHtml(signInTime)}</p>
     <p style="margin: 0 0 14px; color: #475569; font-size: 13px; line-height: 1.6;"><strong>${s.locationLabel}:</strong> ${escapeHtml(location)}</p>
     <p style="margin: 0 0 14px; color: #991b1b; font-size: 14px; line-height: 1.6; font-weight: 600;">${s.warning}</p>
     ${resetLink ? ctaButton(resetLink, s.buttonLabel) : ""}
     ${resetLink ? `<p style="margin: 0 0 14px; word-break: break-all; color: #1d4ed8; font-size: 13px;">${escapeHtml(resetLink)}</p>` : ""}
     <p style="margin: 0; color: #64748b; font-size: 12px; line-height: 1.6;">${s.footer}</p>`
  );

  return {
    subject: s.subject,
    html,
    text: s.text({ signInTime, location, resetLink })
  };
}

/* =========================================================
   Email address change confirmation
   ========================================================= */
const EMAIL_CHANGE = {
  en: {
    subject: "Confirm your new InEx Ledger email address",
    eyebrow: "InEx Ledger account",
    heading: "Confirm your new email",
    body: "We received a request to change the email address on your InEx Ledger account. Click the button below to confirm this change.",
    buttonLabel: "Confirm email change",
    expiry: "This link expires in 30 minutes. If the button does not work, copy and paste this link into your browser:",
    ignore: "Your email address will not change until you click the link above. If you did not request this change, you can safely ignore this email.",
    text: (link) =>
      `Confirm your new InEx Ledger email address\n\nWe received a request to change the email address on your account. Use this link to confirm the change:\n${link}\n\nThis link expires in 30 minutes.\n\nYour email address will not change until you click the link. If you did not request this change, you can safely ignore this email.`
  },
  fr: {
    subject: "Confirmez votre nouvelle adresse courriel InEx Ledger",
    eyebrow: "Compte InEx Ledger",
    heading: "Confirmez votre nouvelle adresse courriel",
    body: "Nous avons reçu une demande de modification de l'adresse courriel associée à votre compte InEx Ledger. Cliquez sur le bouton ci-dessous pour confirmer ce changement.",
    buttonLabel: "Confirmer le changement de courriel",
    expiry: "Ce lien expire dans 30 minutes. Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :",
    ignore: "Votre adresse courriel ne changera pas tant que vous n'aurez pas cliqué sur le lien ci-dessus. Si vous n'avez pas demandé ce changement, vous pouvez ignorer ce courriel en toute sécurité.",
    text: (link) =>
      `Confirmez votre nouvelle adresse courriel InEx Ledger\n\nNous avons reçu une demande de modification de l'adresse courriel de votre compte. Utilisez ce lien pour confirmer le changement :\n${link}\n\nCe lien expire dans 30 minutes.\n\nVotre adresse courriel ne changera pas tant que vous n'aurez pas cliqué sur le lien. Si vous n'avez pas demandé ce changement, vous pouvez ignorer ce courriel en toute sécurité.`
  }
};

function buildEmailChangeEmail(lang, confirmLink) {
  const l = normalizeEmailLang(lang);
  const s = EMAIL_CHANGE[l];
  const safeConfirmLink = sanitizeHttpUrl(confirmLink);
  const html = wrapEmailHtml(
    `<div style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85;">${s.eyebrow}</div>
     <h1 style="margin: 12px 0 0; font-size: 28px; line-height: 1.15;">${s.heading}</h1>`,
    `<p style="margin: 0 0 14px; color: #0f172a; font-size: 15px; line-height: 1.6;">${s.body}</p>
     ${ctaButton(safeConfirmLink, s.buttonLabel)}
     <p style="margin: 0 0 10px; color: #475569; font-size: 13px; line-height: 1.6;">${s.expiry}</p>
     <p style="margin: 0 0 14px; word-break: break-all; color: #1d4ed8; font-size: 13px;">${escapeHtml(safeConfirmLink)}</p>
     <p style="margin: 0; color: #64748b; font-size: 12px; line-height: 1.6;">${s.ignore}</p>`
  );
  return { subject: s.subject, html, text: s.text(safeConfirmLink) };
}

/* =========================================================
   MFA challenge email content
   Callers still compose the full email via createMfaEmailChallenge;
   this helper provides the localised text pieces they pass in as options.
   ========================================================= */
const MFA_CONTENT = {
  signin: {
    en: {
      subject: "Your InEx Ledger sign-in code",
      heading: "Your sign-in verification code",
      body: "We noticed a sign-in from a new or untrusted device. Enter this code to finish signing in.",
      footer: "If this was not you, change your password immediately."
    },
    fr: {
      subject: "Votre code de connexion InEx Ledger",
      heading: "Votre code de vérification de connexion",
      body: "Nous avons détecté une connexion depuis un appareil nouveau ou non approuvé. Entrez ce code pour terminer la connexion.",
      footer: "Si ce n'était pas vous, changez votre mot de passe immédiatement."
    }
  },
  mfa_enable: {
    en: {
      subject: "Confirm MFA setup for InEx Ledger",
      heading: "Confirm MFA setup",
      body: "We received a request to turn on multi-factor authentication for your account. Enter this code in Settings to confirm it was really you.",
      footer: "If you did not request this change, do not enter the code."
    },
    fr: {
      subject: "Confirmez l'activation de l'A2F pour InEx Ledger",
      heading: "Confirmez l'activation de l'A2F",
      body: "Nous avons reçu une demande d'activation de l'authentification à deux facteurs pour votre compte. Entrez ce code dans les Paramètres pour confirmer qu'il s'agissait bien de vous.",
      footer: "Si vous n'avez pas demandé ce changement, n'entrez pas le code."
    }
  },
  mfa_disable: {
    en: {
      subject: "Confirm MFA removal for InEx Ledger",
      heading: "Confirm MFA removal",
      body: "We received a request to turn off multi-factor authentication for your account. Enter this code in Settings to confirm it was really you.",
      footer: "If you did not request this change, do not enter the code."
    },
    fr: {
      subject: "Confirmez la désactivation de l'A2F pour InEx Ledger",
      heading: "Confirmez la désactivation de l'A2F",
      body: "Nous avons reçu une demande de désactivation de l'authentification à deux facteurs pour votre compte. Entrez ce code dans les Paramètres pour confirmer qu'il s'agissait bien de vous.",
      footer: "Si vous n'avez pas demandé ce changement, n'entrez pas le code."
    }
  }
};

/**
 * Returns localised text pieces used by createMfaEmailChallenge.
 *
 * @param {string} lang   - 'en' or 'fr'
 * @param {'signin'|'mfa_enable'|'mfa_disable'} purpose
 * @returns {{ subject, heading, body, footer }}
 */
function buildMfaEmailContent(lang, purpose = "signin") {
  const l = normalizeEmailLang(lang);
  const bucket = MFA_CONTENT[purpose] || MFA_CONTENT.signin;
  return bucket[l] || bucket.en;
}

module.exports = {
  getPreferredLanguageForUser,
  getPreferredLanguageForEmail,
  buildWelcomeVerificationEmail,
  buildVerificationEmail,
  buildPasswordResetEmail,
  buildNewSignInAlertEmail,
  buildEmailChangeEmail,
  buildMfaEmailContent,
  normalizeEmailLang
};
