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
    <div style="font-family: Arial, sans-serif; background:#f3f7fb; padding: 28px 12px;">
      <div style="max-width: 620px; margin: 0 auto; border: 1px solid #dbe4f0; border-radius: 20px; overflow: hidden; background: #ffffff; box-shadow: 0 24px 64px rgba(15, 23, 42, 0.08);">
        <div style="padding: 24px 28px; background: linear-gradient(135deg, #0f172a, #0f766e); color: #ffffff;">
        ${headerHtml}
        </div>
        <div style="padding: 28px;">
          ${bodyHtml}
        </div>
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
    body: "Thanks for signing up. Verify your email to unlock your account and start tracking income, expenses, receipts, mileage, and tax-ready exports.",
    buttonLabel: "Verify email",
    expiry: "This verification link expires in 15 minutes. If the button does not work, copy and paste this link into your browser:",
    text: (link) =>
      `Welcome to InEx Ledger.\n\nVerify your email to activate your account:\n${link}\n\nThis link expires in 15 minutes.`
  },
  fr: {
    subject: "Bienvenue dans InEx Ledger - vérifiez votre courriel",
    eyebrow: "Bienvenue dans InEx Ledger",
    heading: "Votre compte est prêt. Une dernière étape.",
    body: "Merci de vous être inscrit. Vérifiez votre courriel pour accéder à votre compte et commencer à suivre vos revenus, dépenses, reçus, kilométrage et exports fiscaux.",
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
  const escapedSignInTime = escapeHtml(signInTime);
  const escapedLocation = escapeHtml(location);
  const resetLink = sanitizeHttpUrl(options.resetLink);

  const html = wrapEmailHtml(
    `<div style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85;">${s.eyebrow}</div>
     <h1 style="margin: 12px 0 0; font-size: 28px; line-height: 1.15;">${s.heading}</h1>`,
    `<p style="margin: 0 0 14px; color: #0f172a; font-size: 15px; line-height: 1.6;">${s.body}</p>
     <p style="margin: 0 0 10px; color: #475569; font-size: 13px; line-height: 1.6;"><strong>${s.signInTimeLabel}:</strong> ${escapedSignInTime}</p>
     <p style="margin: 0 0 14px; color: #475569; font-size: 13px; line-height: 1.6;"><strong>${s.locationLabel}:</strong> ${escapedLocation}</p>
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
   Password changed confirmation
   ========================================================= */
const PASSWORD_CHANGED = {
  en: {
    subject: "Your InEx Ledger password was changed",
    eyebrow: "InEx Ledger security",
    heading: "Password updated",
    body: "The password for your InEx Ledger account was changed successfully.",
    warning: "If you did not make this change, reset your password immediately and review your account activity.",
    buttonLabel: "Reset password",
    footer: "This is a confirmation email for your records.",
    text: ({ resetLink }) =>
      `Your InEx Ledger password was changed successfully.\n\nIf you did not make this change, reset your password immediately:\n${resetLink}`
  },
  fr: {
    subject: "Le mot de passe de votre compte InEx Ledger a ete modifie",
    eyebrow: "Securite InEx Ledger",
    heading: "Mot de passe mis a jour",
    body: "Le mot de passe de votre compte InEx Ledger a ete modifie avec succes.",
    warning: "Si vous n'avez pas effectue ce changement, reinitialisez votre mot de passe immediatement et verifiez l'activite du compte.",
    buttonLabel: "Reinitialiser le mot de passe",
    footer: "Ceci est un courriel de confirmation pour vos dossiers.",
    text: ({ resetLink }) =>
      `Le mot de passe de votre compte InEx Ledger a ete modifie avec succes.\n\nSi vous n'avez pas effectue ce changement, reinitialisez votre mot de passe immediatement :\n${resetLink}`
  }
};

function buildPasswordChangedEmail(lang, options = {}) {
  const l = normalizeEmailLang(lang);
  const s = PASSWORD_CHANGED[l];
  const safeResetLink = sanitizeHttpUrl(options.resetLink);
  const html = wrapEmailHtml(
    `<div style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85;">${s.eyebrow}</div>
     <h1 style="margin: 12px 0 0; font-size: 28px; line-height: 1.15;">${s.heading}</h1>`,
    `<p style="margin: 0 0 14px; color: #0f172a; font-size: 15px; line-height: 1.6;">${s.body}</p>
     <p style="margin: 0 0 14px; color: #991b1b; font-size: 14px; line-height: 1.6; font-weight: 600;">${s.warning}</p>
     ${safeResetLink ? ctaButton(safeResetLink, s.buttonLabel) : ""}
     ${safeResetLink ? `<p style="margin: 0 0 14px; word-break: break-all; color: #1d4ed8; font-size: 13px;">${escapeHtml(safeResetLink)}</p>` : ""}
     <p style="margin: 0; color: #64748b; font-size: 12px; line-height: 1.6;">${s.footer}</p>`
  );
  return {
    subject: s.subject,
    html,
    text: s.text({ resetLink: safeResetLink })
  };
}

/* =========================================================
   Email changed confirmation
   ========================================================= */
const EMAIL_CHANGED_CONFIRMATION = {
  en: {
    subject: "Your InEx Ledger sign-in email was updated",
    eyebrow: "InEx Ledger account",
    heading: "Email updated",
    body: "The sign-in email on your InEx Ledger account was changed successfully.",
    oldLabel: "Previous email",
    newLabel: "New email",
    footer: "If you did not make this change, reset your password immediately and contact support.",
    text: ({ oldEmail, newEmail }) =>
      `Your InEx Ledger sign-in email was updated.\n\nPrevious email: ${oldEmail}\nNew email: ${newEmail}\n\nIf you did not make this change, reset your password immediately and contact support.`
  },
  fr: {
    subject: "L'adresse courriel de connexion de votre compte InEx Ledger a ete mise a jour",
    eyebrow: "Compte InEx Ledger",
    heading: "Courriel mis a jour",
    body: "L'adresse courriel de connexion de votre compte InEx Ledger a ete modifiee avec succes.",
    oldLabel: "Ancien courriel",
    newLabel: "Nouveau courriel",
    footer: "Si vous n'avez pas effectue ce changement, reinitialisez votre mot de passe immediatement et communiquez avec le support.",
    text: ({ oldEmail, newEmail }) =>
      `L'adresse courriel de connexion de votre compte InEx Ledger a ete mise a jour.\n\nAncien courriel : ${oldEmail}\nNouveau courriel : ${newEmail}\n\nSi vous n'avez pas effectue ce changement, reinitialisez votre mot de passe immediatement et communiquez avec le support.`
  }
};

function buildEmailChangedConfirmationEmail(lang, options = {}) {
  const l = normalizeEmailLang(lang);
  const s = EMAIL_CHANGED_CONFIRMATION[l];
  const oldEmail = String(options.oldEmail || "").trim() || "-";
  const newEmail = String(options.newEmail || "").trim() || "-";
  const html = wrapEmailHtml(
    `<div style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85;">${s.eyebrow}</div>
     <h1 style="margin: 12px 0 0; font-size: 28px; line-height: 1.15;">${s.heading}</h1>`,
    `<p style="margin: 0 0 14px; color: #0f172a; font-size: 15px; line-height: 1.6;">${s.body}</p>
     <div style="margin: 20px 0; padding: 16px 18px; border: 1px solid #e2e8f0; border-radius: 12px; background: #f8fafc;">
       <div style="display: flex; gap: 8px; margin: 0 0 8px; color: #334155; font-size: 14px; line-height: 1.5;"><strong style="min-width: 132px; color: #0f172a;">${escapeHtml(s.oldLabel)}</strong><span>${escapeHtml(oldEmail)}</span></div>
       <div style="display: flex; gap: 8px; margin: 0; color: #334155; font-size: 14px; line-height: 1.5;"><strong style="min-width: 132px; color: #0f172a;">${escapeHtml(s.newLabel)}</strong><span>${escapeHtml(newEmail)}</span></div>
     </div>
     <p style="margin: 0; color: #64748b; font-size: 12px; line-height: 1.6;">${s.footer}</p>`
  );
  return {
    subject: s.subject,
    html,
    text: s.text({ oldEmail, newEmail })
  };
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

/* =========================================================
   Billing lifecycle emails
   ========================================================= */
const BILLING_LIFECYCLE = {
  activated: {
    en: {
      subject: "Your InEx Ledger Pro subscription is active",
      eyebrow: "InEx Ledger billing",
      heading: "Your Pro subscription is active",
      body: "Your business now has access to Pro features.",
      detailsLabel: "Subscription details",
      actionLabel: "Open billing",
      footer: "You can review your billing details from the subscription page at any time.",
      text: ({ summary, billingUrl }) =>
        `Your InEx Ledger Pro subscription is active.\n\n${summary}\n\nReview billing: ${billingUrl}`
    },
    fr: {
      subject: "Votre abonnement InEx Ledger Pro est actif",
      eyebrow: "Facturation InEx Ledger",
      heading: "Votre abonnement Pro est actif",
      body: "Votre entreprise a maintenant accès aux fonctionnalités Pro.",
      detailsLabel: "Détails de l’abonnement",
      actionLabel: "Ouvrir la facturation",
      footer: "Vous pouvez consulter vos détails de facturation depuis la page d’abonnement à tout moment.",
      text: ({ summary, billingUrl }) =>
        `Votre abonnement InEx Ledger Pro est actif.\n\n${summary}\n\nConsulter la facturation : ${billingUrl}`
    }
  },
  trial_started: {
    en: {
      subject: "Your InEx Ledger trial is active",
      eyebrow: "InEx Ledger billing",
      heading: "Your trial has started",
      body: "Your business now has Pro access during the trial period.",
      detailsLabel: "Trial details",
      actionLabel: "Open billing",
      footer: "Review your trial details anytime from the subscription page.",
      text: ({ summary, billingUrl }) =>
        `Your InEx Ledger trial is active.\n\n${summary}\n\nReview billing: ${billingUrl}`
    },
    fr: {
      subject: "Votre essai InEx Ledger est actif",
      eyebrow: "Facturation InEx Ledger",
      heading: "Votre essai a commence",
      body: "Votre entreprise a maintenant acces aux fonctionnalites Pro pendant la periode d'essai.",
      detailsLabel: "Details de l'essai",
      actionLabel: "Ouvrir la facturation",
      footer: "Consultez les details de votre essai a tout moment depuis la page d'abonnement.",
      text: ({ summary, billingUrl }) =>
        `Votre essai InEx Ledger est actif.\n\n${summary}\n\nConsulter la facturation : ${billingUrl}`
    }
  },
  canceling: {
    en: {
      subject: "Your InEx Ledger subscription has been canceled",
      eyebrow: "InEx Ledger billing",
      heading: "Subscription canceled",
      body: "Your paid subscription has been canceled, and access stays active until the end of the current billing period. We're sorry to see you go.",
      detailsLabel: "Access details",
      actionLabel: "Open billing",
      footer: "You can reactivate anytime before access ends if you want to keep Pro active.",
      text: ({ summary, billingUrl }) =>
        `Your InEx Ledger subscription has been canceled, and access stays active until the end of the current billing period. We're sorry to see you go.\n\n${summary}\n\nReview billing: ${billingUrl}`
    },
    fr: {
      subject: "Votre abonnement InEx Ledger prendra fin à la fin de la période",
      eyebrow: "Facturation InEx Ledger",
      heading: "Annulation planifiée",
      body: "Votre abonnement payant restera actif jusqu’à la fin de la période de facturation en cours.",
      detailsLabel: "Détails d’accès",
      actionLabel: "Ouvrir la facturation",
      footer: "Vous pouvez vous réabonner à tout moment avant la fin de l’accès.",
      text: ({ summary, billingUrl }) =>
        `Votre abonnement InEx Ledger est planifié pour annulation.\n\n${summary}\n\nConsulter la facturation : ${billingUrl}`
    }
  },
  ending_soon: {
    en: {
      subject: "Your InEx Ledger access ends in 7 days",
      eyebrow: "InEx Ledger billing",
      heading: "Access ending soon",
      body: "Your subscription is still set to end, and Pro access now has 7 days left.",
      detailsLabel: "Access details",
      actionLabel: "Open billing",
      footer: "If you want to keep Pro active, reopen billing before access ends.",
      text: ({ summary, billingUrl }) =>
        `Your InEx Ledger access ends in 7 days.\n\n${summary}\n\nReview billing: ${billingUrl}`
    },
    fr: {
      subject: "Votre acces InEx Ledger prend fin dans 7 jours",
      eyebrow: "Facturation InEx Ledger",
      heading: "L'acces prendra bientot fin",
      body: "Votre abonnement est toujours prevu pour se terminer, et il reste maintenant 7 jours d'acces Pro.",
      detailsLabel: "Details d'acces",
      actionLabel: "Ouvrir la facturation",
      footer: "Si vous souhaitez conserver Pro actif, rouvrez la facturation avant la fin de l'acces.",
      text: ({ summary, billingUrl }) =>
        `Votre acces InEx Ledger prend fin dans 7 jours.\n\n${summary}\n\nConsulter la facturation : ${billingUrl}`
    }
  },
  charged: {
    en: {
      subject: "Your InEx Ledger payment was received",
      eyebrow: "InEx Ledger billing",
      heading: "Payment received",
      body: "We received your subscription payment successfully.",
      detailsLabel: "Payment details",
      actionLabel: "View invoice",
      footer: "Keep this email for your records, or view the full invoice from the billing page.",
      text: ({ summary, invoiceUrl }) =>
        `Your InEx Ledger payment was received.\n\n${summary}${invoiceUrl ? `\n\nInvoice: ${invoiceUrl}` : ""}`
    },
    fr: {
      subject: "Votre paiement InEx Ledger a été reçu",
      eyebrow: "Facturation InEx Ledger",
      heading: "Paiement reçu",
      body: "Nous avons bien reçu le paiement de votre abonnement.",
      detailsLabel: "Détails du paiement",
      actionLabel: "Voir la facture",
      footer: "Conservez ce courriel pour vos dossiers ou consultez la facture complète depuis la page de facturation.",
      text: ({ summary, invoiceUrl }) =>
        `Votre paiement InEx Ledger a été reçu.\n\n${summary}${invoiceUrl ? `\n\nFacture : ${invoiceUrl}` : ""}`
    }
  },
  payment_failed: {
    en: {
      subject: "Your InEx Ledger payment needs attention",
      eyebrow: "InEx Ledger billing",
      heading: "Payment failed",
      body: "We could not process your latest subscription payment. Update your payment method in Stripe to keep Pro access from being interrupted.",
      detailsLabel: "Payment details",
      actionLabel: "Update payment",
      footer: "Open the billing page to review the failed invoice and retry with an updated payment method.",
      text: ({ summary, billingUrl, invoiceUrl }) =>
        `Your InEx Ledger subscription payment failed.\n\n${summary}\n\nUpdate payment: ${billingUrl}${invoiceUrl ? `\n\nInvoice: ${invoiceUrl}` : ""}`
    },
    fr: {
      subject: "Votre paiement InEx Ledger nécessite votre attention",
      eyebrow: "Facturation InEx Ledger",
      heading: "Échec du paiement",
      body: "Nous n'avons pas pu traiter votre dernier paiement d'abonnement. Mettez à jour votre mode de paiement dans Stripe pour éviter une interruption de l'accès Pro.",
      detailsLabel: "Détails du paiement",
      actionLabel: "Mettre à jour le paiement",
      footer: "Ouvrez la page de facturation pour consulter la facture échouée et réessayer avec un mode de paiement mis à jour.",
      text: ({ summary, billingUrl, invoiceUrl }) =>
        `Le paiement de votre abonnement InEx Ledger a échoué.\n\n${summary}\n\nMettre à jour le paiement : ${billingUrl}${invoiceUrl ? `\n\nFacture : ${invoiceUrl}` : ""}`
    }
  },
  plan_changed: {
    en: {
      subject: "Your InEx Ledger billing setup changed",
      eyebrow: "InEx Ledger billing",
      heading: "Billing updated",
      body: "Your subscription setup was updated successfully.",
      detailsLabel: "Updated details",
      actionLabel: "Open billing",
      footer: "Review the updated billing summary anytime from the subscription page.",
      text: ({ summary, billingUrl }) =>
        `Your InEx Ledger billing setup changed.\n\n${summary}\n\nReview billing: ${billingUrl}`
    },
    fr: {
      subject: "La configuration de facturation InEx Ledger a ete mise a jour",
      eyebrow: "Facturation InEx Ledger",
      heading: "Facturation mise a jour",
      body: "La configuration de votre abonnement a ete mise a jour avec succes.",
      detailsLabel: "Details mis a jour",
      actionLabel: "Ouvrir la facturation",
      footer: "Consultez le resume de facturation mis a jour a tout moment depuis la page d'abonnement.",
      text: ({ summary, billingUrl }) =>
        `La configuration de facturation InEx Ledger a ete mise a jour.\n\n${summary}\n\nConsulter la facturation : ${billingUrl}`
    }
  }
};

function buildBillingLifecycleEmail(lang, kind, options = {}) {
  const l = normalizeEmailLang(lang);
  const bucket = BILLING_LIFECYCLE[kind] || BILLING_LIFECYCLE.activated;
  const s = bucket[l] || bucket.en;
  const details = Array.isArray(options.details)
    ? options.details.filter((detail) => detail && detail.label && detail.value)
    : [];
  const safeActionUrl = sanitizeHttpUrl(options.actionUrl);
  const safeBillingUrl = sanitizeHttpUrl(options.billingUrl || options.actionUrl);
  const safeInvoiceUrl = sanitizeHttpUrl(options.invoiceUrl);
  const summary = details.map((detail) => `${detail.label}: ${detail.value}`).join("\n");
  const detailHtml = details.length
    ? `
      <div style="margin: 20px 0; padding: 16px 18px; border: 1px solid #e2e8f0; border-radius: 12px; background: #f8fafc;">
        <div style="margin: 0 0 10px; color: #0f172a; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;">${escapeHtml(s.detailsLabel)}</div>
        ${details
          .map(
            (detail) =>
              `<div style="display: flex; gap: 8px; margin: 0 0 8px; color: #334155; font-size: 14px; line-height: 1.5;"><strong style="min-width: 132px; color: #0f172a;">${escapeHtml(detail.label)}</strong><span>${escapeHtml(detail.value)}</span></div>`
          )
          .join("")}
      </div>`
    : "";
  const actionLink = safeActionUrl || safeInvoiceUrl || safeBillingUrl;
  const html = wrapEmailHtml(
    `<div style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85;">${s.eyebrow}</div>
     <h1 style="margin: 12px 0 0; font-size: 28px; line-height: 1.15;">${s.heading}</h1>`,
    `<p style="margin: 0 0 14px; color: #0f172a; font-size: 15px; line-height: 1.6;">${s.body}</p>
     ${detailHtml}
     ${actionLink ? ctaButton(actionLink, s.actionLabel) : ""}
     ${safeInvoiceUrl && safeInvoiceUrl !== actionLink ? `<p style="margin: 0 0 10px; word-break: break-all; color: #1d4ed8; font-size: 13px;">${escapeHtml(safeInvoiceUrl)}</p>` : ""}
     <p style="margin: 0; color: #64748b; font-size: 12px; line-height: 1.6;">${s.footer}</p>`
  );

  return {
    subject: s.subject,
    html,
    text: s.text({
      summary,
      billingUrl: safeBillingUrl,
      invoiceUrl: safeInvoiceUrl
    })
  };
}

const BUSINESS_LIFECYCLE = {
  added: {
    en: {
      subject: "A business was added to your InEx Ledger account",
      eyebrow: "InEx Ledger businesses",
      heading: "Business added",
      body: "A new business was added to your account. Review the updated business count and billing summary below.",
      detailsLabel: "Business details",
      actionLabel: "Open billing",
      footer: "Use Settings to switch or edit businesses, and Subscription to review billing changes.",
      text: ({ summary, actionUrl }) =>
        `A new business was added to your InEx Ledger account.\n\n${summary}\n\nReview details: ${actionUrl}`
    },
    fr: {
      subject: "Une entreprise a été ajoutée à votre compte InEx Ledger",
      eyebrow: "Entreprises InEx Ledger",
      heading: "Entreprise ajoutée",
      body: "Une nouvelle entreprise a été ajoutée à votre compte. Consultez ci-dessous le nombre d’entreprises et le résumé de facturation mis à jour.",
      detailsLabel: "Détails de l’entreprise",
      actionLabel: "Ouvrir la facturation",
      footer: "Utilisez les Paramètres pour changer ou modifier les entreprises et Abonnement pour revoir les changements de facturation.",
      text: ({ summary, actionUrl }) =>
        `Une nouvelle entreprise a été ajoutée à votre compte InEx Ledger.\n\n${summary}\n\nConsulter les détails : ${actionUrl}`
    }
  },
  deleted: {
    en: {
      subject: "A business was deleted from your InEx Ledger account",
      eyebrow: "InEx Ledger businesses",
      heading: "Business deleted",
      body: "A business was deleted from your account. Review the updated business count and billing summary below.",
      detailsLabel: "Business details",
      actionLabel: "Open billing",
      footer: "Use Settings to confirm the remaining businesses and Subscription to review the updated billing state.",
      text: ({ summary, actionUrl }) =>
        `A business was deleted from your InEx Ledger account.\n\n${summary}\n\nReview details: ${actionUrl}`
    },
    fr: {
      subject: "Une entreprise a été supprimée de votre compte InEx Ledger",
      eyebrow: "Entreprises InEx Ledger",
      heading: "Entreprise supprimée",
      body: "Une entreprise a été supprimée de votre compte. Consultez ci-dessous le nombre d’entreprises et le résumé de facturation mis à jour.",
      detailsLabel: "Détails de l’entreprise",
      actionLabel: "Ouvrir la facturation",
      footer: "Utilisez les Paramètres pour confirmer les entreprises restantes et Abonnement pour revoir l’état de facturation mis à jour.",
      text: ({ summary, actionUrl }) =>
        `Une entreprise a été supprimée de votre compte InEx Ledger.\n\n${summary}\n\nConsulter les détails : ${actionUrl}`
    }
  }
};

function buildBusinessLifecycleEmail(lang, kind, options = {}) {
  const l = normalizeEmailLang(lang);
  const bucket = BUSINESS_LIFECYCLE[kind] || BUSINESS_LIFECYCLE.added;
  const s = bucket[l] || bucket.en;
  const details = Array.isArray(options.details)
    ? options.details.filter((detail) => detail && detail.label && detail.value)
    : [];
  const safeActionUrl = sanitizeHttpUrl(options.actionUrl);
  const summary = details.map((detail) => `${detail.label}: ${detail.value}`).join("\n");
  const detailHtml = details.length
    ? `
      <div style="margin: 20px 0; padding: 16px 18px; border: 1px solid #e2e8f0; border-radius: 12px; background: #f8fafc;">
        <div style="margin: 0 0 10px; color: #0f172a; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;">${escapeHtml(s.detailsLabel)}</div>
        ${details
          .map(
            (detail) =>
              `<div style="display: flex; gap: 8px; margin: 0 0 8px; color: #334155; font-size: 14px; line-height: 1.5;"><strong style="min-width: 148px; color: #0f172a;">${escapeHtml(detail.label)}</strong><span>${escapeHtml(detail.value)}</span></div>`
          )
          .join("")}
      </div>`
    : "";
  const html = wrapEmailHtml(
    `<div style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85;">${s.eyebrow}</div>
     <h1 style="margin: 12px 0 0; font-size: 28px; line-height: 1.15;">${s.heading}</h1>`,
    `<p style="margin: 0 0 14px; color: #0f172a; font-size: 15px; line-height: 1.6;">${s.body}</p>
     ${detailHtml}
     ${safeActionUrl ? ctaButton(safeActionUrl, s.actionLabel) : ""}
     <p style="margin: 0; color: #64748b; font-size: 12px; line-height: 1.6;">${s.footer}</p>`
  );

  return {
    subject: s.subject,
    html,
    text: s.text({
      summary,
      actionUrl: safeActionUrl
    })
  };
}

/* =========================================================
   Trial reminder emails
   ========================================================= */
const TRIAL_LIFECYCLE = {
  ending_7: {
    en: {
      subject: "Your InEx Ledger trial ends in 7 days",
      heading: "Your trial ends in 7 days",
      body: "Your Pro trial is still active, but it will end in 7 days.",
      buttonLabel: "Review subscription",
      text: ({ actionUrl }) => `Your InEx Ledger trial ends in 7 days.\n\nReview your subscription: ${actionUrl}`
    },
    fr: {
      subject: "Votre essai InEx Ledger se termine dans 7 jours",
      heading: "Votre essai se termine dans 7 jours",
      body: "Votre essai Pro est toujours actif, mais il se terminera dans 7 jours.",
      buttonLabel: "Voir l'abonnement",
      text: ({ actionUrl }) => `Votre essai InEx Ledger se termine dans 7 jours.\n\nVoir votre abonnement : ${actionUrl}`
    }
  },
  ending_3: {
    en: {
      subject: "Your InEx Ledger trial ends in 3 days",
      heading: "Your trial ends in 3 days",
      body: "Your Pro trial will end soon. Review your subscription now if you want uninterrupted access.",
      buttonLabel: "Review subscription",
      text: ({ actionUrl }) => `Your InEx Ledger trial ends in 3 days.\n\nReview your subscription: ${actionUrl}`
    },
    fr: {
      subject: "Votre essai InEx Ledger se termine dans 3 jours",
      heading: "Votre essai se termine dans 3 jours",
      body: "Votre essai Pro se terminera bientot. Consultez votre abonnement maintenant si vous voulez conserver l'acces sans interruption.",
      buttonLabel: "Voir l'abonnement",
      text: ({ actionUrl }) => `Votre essai InEx Ledger se termine dans 3 jours.\n\nVoir votre abonnement : ${actionUrl}`
    }
  },
  ending_1: {
    en: {
      subject: "Your InEx Ledger trial ends tomorrow",
      heading: "Your trial ends tomorrow",
      body: "Your Pro trial ends tomorrow. Review your subscription today if you want to keep access active.",
      buttonLabel: "Review subscription",
      text: ({ actionUrl }) => `Your InEx Ledger trial ends tomorrow.\n\nReview your subscription: ${actionUrl}`
    },
    fr: {
      subject: "Votre essai InEx Ledger se termine demain",
      heading: "Votre essai se termine demain",
      body: "Votre essai Pro se termine demain. Consultez votre abonnement aujourd'hui si vous voulez garder l'acces actif.",
      buttonLabel: "Voir l'abonnement",
      text: ({ actionUrl }) => `Votre essai InEx Ledger se termine demain.\n\nVoir votre abonnement : ${actionUrl}`
    }
  },
  ended: {
    en: {
      subject: "Your InEx Ledger trial has ended",
      heading: "Your trial has ended",
      body: "Your Pro trial has ended. You can still review your subscription options at any time.",
      buttonLabel: "Open subscription",
      text: ({ actionUrl }) => `Your InEx Ledger trial has ended.\n\nOpen subscription: ${actionUrl}`
    },
    fr: {
      subject: "Votre essai InEx Ledger est termine",
      heading: "Votre essai est termine",
      body: "Votre essai Pro est termine. Vous pouvez toujours consulter vos options d'abonnement a tout moment.",
      buttonLabel: "Ouvrir l'abonnement",
      text: ({ actionUrl }) => `Votre essai InEx Ledger est termine.\n\nOuvrir l'abonnement : ${actionUrl}`
    }
  }
};

function buildTrialLifecycleEmail(lang, kind, options = {}) {
  const l = normalizeEmailLang(lang);
  const bucket = TRIAL_LIFECYCLE[kind] || TRIAL_LIFECYCLE.ending_7;
  const s = bucket[l] || bucket.en;
  const safeActionUrl = sanitizeHttpUrl(options.actionUrl);
  const html = wrapEmailHtml(
    `<div style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85;">InEx Ledger subscription</div>
     <h1 style="margin: 12px 0 0; font-size: 28px; line-height: 1.15;">${s.heading}</h1>`,
    `<p style="margin: 0 0 14px; color: #0f172a; font-size: 15px; line-height: 1.6;">${s.body}</p>
     ${safeActionUrl ? ctaButton(safeActionUrl, s.buttonLabel) : ""}`
  );
  return {
    subject: s.subject,
    html,
    text: s.text({ actionUrl: safeActionUrl })
  };
}

/* =========================================================
   Review queue reminder
   ========================================================= */
const REVIEW_QUEUE_REMINDER = {
  en: {
    subject: "Transactions still need review in InEx Ledger",
    heading: "Review items are waiting",
    body: "You still have bookkeeping items that need review.",
    countLabel: "Open review items",
    buttonLabel: "Open review queue",
    footer: "This reminder is sent occasionally so unresolved issues do not get buried.",
    text: ({ count, actionUrl }) =>
      `You have ${count} open review items in InEx Ledger.\n\nReview queue: ${actionUrl}`
  },
  fr: {
    subject: "Des transactions doivent encore etre revisees dans InEx Ledger",
    heading: "Des elements a reviser sont en attente",
    body: "Vous avez encore des elements de tenue de livres qui doivent etre revises.",
    countLabel: "Elements de revision ouverts",
    buttonLabel: "Ouvrir la file de revision",
    footer: "Ce rappel est envoye occasionnellement afin que les elements non resolus ne soient pas oublies.",
    text: ({ count, actionUrl }) =>
      `Vous avez ${count} elements de revision ouverts dans InEx Ledger.\n\nFile de revision : ${actionUrl}`
  }
};

function buildReviewQueueReminderEmail(lang, options = {}) {
  const l = normalizeEmailLang(lang);
  const s = REVIEW_QUEUE_REMINDER[l];
  const count = Math.max(Number(options.count) || 0, 0);
  const safeActionUrl = sanitizeHttpUrl(options.actionUrl);
  const html = wrapEmailHtml(
    `<div style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85;">InEx Ledger review</div>
     <h1 style="margin: 12px 0 0; font-size: 28px; line-height: 1.15;">${s.heading}</h1>`,
    `<p style="margin: 0 0 14px; color: #0f172a; font-size: 15px; line-height: 1.6;">${s.body}</p>
     <div style="margin: 20px 0; padding: 16px 18px; border: 1px solid #e2e8f0; border-radius: 12px; background: #f8fafc;">
       <div style="display: flex; gap: 8px; margin: 0; color: #334155; font-size: 14px; line-height: 1.5;"><strong style="min-width: 148px; color: #0f172a;">${escapeHtml(s.countLabel)}</strong><span>${escapeHtml(String(count))}</span></div>
     </div>
     ${safeActionUrl ? ctaButton(safeActionUrl, s.buttonLabel) : ""}
     <p style="margin: 0; color: #64748b; font-size: 12px; line-height: 1.6;">${s.footer}</p>`
  );
  return {
    subject: s.subject,
    html,
    text: s.text({ count, actionUrl: safeActionUrl })
  };
}

/* =========================================================
   Invoice owner activity emails
   ========================================================= */
const INVOICE_OWNER_ACTIVITY = {
  sent: {
    en: {
      subject: "Your invoice is on its way",
      heading: "Invoice sent",
      body: "Your invoice was emailed successfully.",
      detailsLabel: "Invoice details",
      buttonLabel: "Open invoices",
      footer: "You can track replies and status updates from InEx Ledger.",
      text: ({ summary, actionUrl }) => `Your invoice was emailed successfully.\n\n${summary}\n\nOpen invoices: ${actionUrl}`
    },
    fr: {
      subject: "Votre facture est en route",
      heading: "Facture envoyee",
      body: "Votre facture a ete envoyee par courriel avec succes.",
      detailsLabel: "Details de la facture",
      buttonLabel: "Ouvrir les factures",
      footer: "Vous pouvez suivre les reponses et les changements d'etat dans InEx Ledger.",
      text: ({ summary, actionUrl }) => `Votre facture a ete envoyee par courriel avec succes.\n\n${summary}\n\nOuvrir les factures : ${actionUrl}`
    }
  },
  failed: {
    en: {
      subject: "We couldn't send your invoice",
      heading: "Invoice delivery failed",
      body: "We tried to send your invoice, but the email did not go through.",
      detailsLabel: "What to check",
      buttonLabel: "Review invoice",
      footer: "Double-check the recipient address and try again when you're ready.",
      text: ({ summary, actionUrl }) => `We couldn't send your invoice.\n\n${summary}\n\nReview invoice: ${actionUrl}`
    },
    fr: {
      subject: "Nous n'avons pas pu envoyer votre facture",
      heading: "Echec de l'envoi de la facture",
      body: "Nous avons tente d'envoyer votre facture, mais le courriel n'a pas ete livre.",
      detailsLabel: "Points a verifier",
      buttonLabel: "Verifier la facture",
      footer: "Verifiez l'adresse du destinataire et reessayez quand vous etes pret.",
      text: ({ summary, actionUrl }) => `Nous n'avons pas pu envoyer votre facture.\n\n${summary}\n\nVerifier la facture : ${actionUrl}`
    }
  },
  replied: {
    en: {
      subject: "A client replied to your invoice",
      heading: "New invoice reply",
      body: "A client replied to one of your invoice emails.",
      detailsLabel: "Reply details",
      buttonLabel: "Open messages",
      footer: "Open Messages to read the full reply and respond from the same thread.",
      text: ({ summary, actionUrl }) => `A client replied to one of your invoice emails.\n\n${summary}\n\nOpen messages: ${actionUrl}`
    },
    fr: {
      subject: "Un client a repondu a votre facture",
      heading: "Nouvelle reponse a une facture",
      body: "Un client a repondu a l'un de vos courriels de facture.",
      detailsLabel: "Details de la reponse",
      buttonLabel: "Ouvrir les messages",
      footer: "Ouvrez Messages pour lire la reponse complete et y repondre dans le meme fil.",
      text: ({ summary, actionUrl }) => `Un client a repondu a l'un de vos courriels de facture.\n\n${summary}\n\nOuvrir les messages : ${actionUrl}`
    }
  }
};

function buildInvoiceOwnerActivityEmail(lang, kind, options = {}) {
  const l = normalizeEmailLang(lang);
  const bucket = INVOICE_OWNER_ACTIVITY[kind] || INVOICE_OWNER_ACTIVITY.sent;
  const s = bucket[l] || bucket.en;
  const details = Array.isArray(options.details)
    ? options.details.filter((detail) => detail && detail.label && detail.value)
    : [];
  const safeActionUrl = sanitizeHttpUrl(options.actionUrl);
  const summary = details.map((detail) => `${detail.label}: ${detail.value}`).join("\n");
  const detailHtml = details.length
    ? `
      <div style="margin: 20px 0; padding: 16px 18px; border: 1px solid #e2e8f0; border-radius: 12px; background: #f8fafc;">
        <div style="margin: 0 0 10px; color: #0f172a; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;">${escapeHtml(s.detailsLabel)}</div>
        ${details
          .map(
            (detail) =>
              `<div style="display: flex; gap: 8px; margin: 0 0 8px; color: #334155; font-size: 14px; line-height: 1.5;"><strong style="min-width: 148px; color: #0f172a;">${escapeHtml(detail.label)}</strong><span>${escapeHtml(detail.value)}</span></div>`
          )
          .join("")}
      </div>`
    : "";
  const html = wrapEmailHtml(
    `<div style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85;">InEx Ledger invoices</div>
     <h1 style="margin: 12px 0 0; font-size: 28px; line-height: 1.15;">${s.heading}</h1>`,
    `<p style="margin: 0 0 14px; color: #0f172a; font-size: 15px; line-height: 1.6;">${s.body}</p>
     ${detailHtml}
     ${safeActionUrl ? ctaButton(safeActionUrl, s.buttonLabel) : ""}
     <p style="margin: 0; color: #64748b; font-size: 12px; line-height: 1.6;">${s.footer}</p>`
  );

  return {
    subject: s.subject,
    html,
    text: s.text({ summary, actionUrl: safeActionUrl })
  };
}

/* =========================================================
   Privacy activity emails
   ========================================================= */
const PRIVACY_ACTIVITY = {
  export_completed: {
    en: {
      subject: "Your InEx Ledger data export is ready",
      heading: "Data export completed",
      body: "Your privacy export finished successfully.",
      detailsLabel: "Export details",
      buttonLabel: "Open privacy settings",
      footer: "Keep this message for your records if you requested a copy of your data.",
      text: ({ summary, actionUrl }) => `Your privacy export finished successfully.\n\n${summary}${actionUrl ? `\n\nOpen privacy settings: ${actionUrl}` : ""}`
    },
    fr: {
      subject: "Votre export de donnees InEx Ledger est pret",
      heading: "Export de donnees termine",
      body: "Votre export de confidentialite a ete genere avec succes.",
      detailsLabel: "Details de l'export",
      buttonLabel: "Ouvrir les parametres de confidentialite",
      footer: "Conservez ce message pour vos dossiers si vous avez demande une copie de vos donnees.",
      text: ({ summary, actionUrl }) => `Votre export de confidentialite a ete genere avec succes.\n\n${summary}${actionUrl ? `\n\nOuvrir les parametres de confidentialite : ${actionUrl}` : ""}`
    }
  },
  erasure_completed: {
    en: {
      subject: "Your personal data was erased from InEx Ledger",
      heading: "Personal data erased",
      body: "Your request to erase personal account data has been completed.",
      detailsLabel: "What was completed",
      footer: "Anonymized financial records may still be retained where required for compliance.",
      text: ({ summary }) => `Your request to erase personal account data has been completed.\n\n${summary}`
    },
    fr: {
      subject: "Vos donnees personnelles ont ete effacees d'InEx Ledger",
      heading: "Donnees personnelles effacees",
      body: "Votre demande d'effacement des donnees personnelles du compte a ete completee.",
      detailsLabel: "Ce qui a ete complete",
      footer: "Des dossiers financiers anonymises peuvent encore etre conserves lorsque la conformite l'exige.",
      text: ({ summary }) => `Votre demande d'effacement des donnees personnelles du compte a ete completee.\n\n${summary}`
    }
  },
  deletion_completed: {
    en: {
      subject: "Your InEx Ledger business data was deleted",
      heading: "Business data deleted",
      body: "Your request to delete business data has been completed.",
      detailsLabel: "Deletion details",
      buttonLabel: "Open privacy settings",
      footer: "Your account is still available, but the selected business data has been removed.",
      text: ({ summary, actionUrl }) => `Your request to delete business data has been completed.\n\n${summary}${actionUrl ? `\n\nOpen privacy settings: ${actionUrl}` : ""}`
    },
    fr: {
      subject: "Les donnees d'entreprise InEx Ledger ont ete supprimees",
      heading: "Donnees d'entreprise supprimees",
      body: "Votre demande de suppression des donnees d'entreprise a ete completee.",
      detailsLabel: "Details de la suppression",
      buttonLabel: "Ouvrir les parametres de confidentialite",
      footer: "Votre compte est toujours disponible, mais les donnees d'entreprise selectionnees ont ete supprimees.",
      text: ({ summary, actionUrl }) => `Votre demande de suppression des donnees d'entreprise a ete completee.\n\n${summary}${actionUrl ? `\n\nOuvrir les parametres de confidentialite : ${actionUrl}` : ""}`
    }
  }
};

function buildPrivacyActivityEmail(lang, kind, options = {}) {
  const l = normalizeEmailLang(lang);
  const bucket = PRIVACY_ACTIVITY[kind] || PRIVACY_ACTIVITY.export_completed;
  const s = bucket[l] || bucket.en;
  const details = Array.isArray(options.details)
    ? options.details.filter((detail) => detail && detail.label && detail.value)
    : [];
  const safeActionUrl = sanitizeHttpUrl(options.actionUrl);
  const summary = details.map((detail) => `${detail.label}: ${detail.value}`).join("\n");
  const detailHtml = details.length
    ? `
      <div style="margin: 20px 0; padding: 16px 18px; border: 1px solid #e2e8f0; border-radius: 12px; background: #f8fafc;">
        <div style="margin: 0 0 10px; color: #0f172a; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;">${escapeHtml(s.detailsLabel)}</div>
        ${details
          .map(
            (detail) =>
              `<div style="display: flex; gap: 8px; margin: 0 0 8px; color: #334155; font-size: 14px; line-height: 1.5;"><strong style="min-width: 148px; color: #0f172a;">${escapeHtml(detail.label)}</strong><span>${escapeHtml(detail.value)}</span></div>`
          )
          .join("")}
      </div>`
    : "";
  const footerHtml = s.footer
    ? `<p style="margin: 0; color: #64748b; font-size: 12px; line-height: 1.6;">${escapeHtml(s.footer)}</p>`
    : "";
  const html = wrapEmailHtml(
    `<div style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85;">InEx Ledger privacy</div>
     <h1 style="margin: 12px 0 0; font-size: 28px; line-height: 1.15;">${s.heading}</h1>`,
    `<p style="margin: 0 0 14px; color: #0f172a; font-size: 15px; line-height: 1.6;">${s.body}</p>
     ${detailHtml}
     ${safeActionUrl && s.buttonLabel ? ctaButton(safeActionUrl, s.buttonLabel) : ""}
     ${footerHtml}`
  );

  return {
    subject: s.subject,
    html,
    text: s.text({ summary, actionUrl: safeActionUrl })
  };
}

/* =========================================================
   Bookkeeping activity emails
   ========================================================= */
const BOOKKEEPING_ACTIVITY = {
  csv_completed: {
    en: {
      subject: "Your CSV import is complete",
      heading: "CSV import completed",
      body: "Your transactions were imported successfully.",
      detailsLabel: "Import details",
      buttonLabel: "Review imported transactions",
      footer: "Open the ledger to review any rows that still need attention.",
      text: ({ summary, actionUrl }) => `Your CSV import is complete.\n\n${summary}\n\nReview imported transactions: ${actionUrl}`
    },
    fr: {
      subject: "Votre import CSV est termine",
      heading: "Import CSV termine",
      body: "Vos transactions ont ete importees avec succes.",
      detailsLabel: "Details de l'import",
      buttonLabel: "Verifier les transactions importees",
      footer: "Ouvrez le grand livre pour verifier les lignes qui demandent encore votre attention.",
      text: ({ summary, actionUrl }) => `Votre import CSV est termine.\n\n${summary}\n\nVerifier les transactions importees : ${actionUrl}`
    }
  },
  csv_failed: {
    en: {
      subject: "Your CSV import could not be completed",
      heading: "CSV import failed",
      body: "We couldn't finish importing your CSV file.",
      detailsLabel: "What happened",
      buttonLabel: "Try the import again",
      footer: "You can retry after reviewing the file and import settings.",
      text: ({ summary, actionUrl }) => `Your CSV import could not be completed.\n\n${summary}\n\nTry the import again: ${actionUrl}`
    },
    fr: {
      subject: "Votre import CSV n'a pas pu etre termine",
      heading: "Echec de l'import CSV",
      body: "Nous n'avons pas pu terminer l'import de votre fichier CSV.",
      detailsLabel: "Ce qui s'est passe",
      buttonLabel: "Reessayer l'import",
      footer: "Vous pouvez reessayer apres avoir verifie le fichier et les parametres d'import.",
      text: ({ summary, actionUrl }) => `Votre import CSV n'a pas pu etre termine.\n\n${summary}\n\nReessayer l'import : ${actionUrl}`
    }
  },
  receipt_uploaded: {
    en: {
      subject: "Your receipt was saved",
      heading: "Receipt uploaded",
      body: "Your receipt was saved successfully.",
      detailsLabel: "Receipt details",
      buttonLabel: "Open receipts",
      footer: "You can attach it to a transaction or review it from the receipts page.",
      text: ({ summary, actionUrl }) => `Your receipt was saved successfully.\n\n${summary}\n\nOpen receipts: ${actionUrl}`
    },
    fr: {
      subject: "Votre recu a ete enregistre",
      heading: "Recu televerse",
      body: "Votre recu a ete enregistre avec succes.",
      detailsLabel: "Details du recu",
      buttonLabel: "Ouvrir les recus",
      footer: "Vous pouvez l'associer a une transaction ou le verifier depuis la page des recus.",
      text: ({ summary, actionUrl }) => `Votre recu a ete enregistre avec succes.\n\n${summary}\n\nOuvrir les recus : ${actionUrl}`
    }
  }
};

function buildBookkeepingActivityEmail(lang, kind, options = {}) {
  const l = normalizeEmailLang(lang);
  const bucket = BOOKKEEPING_ACTIVITY[kind] || BOOKKEEPING_ACTIVITY.csv_completed;
  const s = bucket[l] || bucket.en;
  const details = Array.isArray(options.details)
    ? options.details.filter((detail) => detail && detail.label && detail.value)
    : [];
  const safeActionUrl = sanitizeHttpUrl(options.actionUrl);
  const summary = details.map((detail) => `${detail.label}: ${detail.value}`).join("\n");
  const detailHtml = details.length
    ? `
      <div style="margin: 20px 0; padding: 16px 18px; border: 1px solid #e2e8f0; border-radius: 12px; background: #f8fafc;">
        <div style="margin: 0 0 10px; color: #0f172a; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;">${escapeHtml(s.detailsLabel)}</div>
        ${details
          .map(
            (detail) =>
              `<div style="display: flex; gap: 8px; margin: 0 0 8px; color: #334155; font-size: 14px; line-height: 1.5;"><strong style="min-width: 148px; color: #0f172a;">${escapeHtml(detail.label)}</strong><span>${escapeHtml(detail.value)}</span></div>`
          )
          .join("")}
      </div>`
    : "";
  const footerHtml = s.footer
    ? `<p style="margin: 0; color: #64748b; font-size: 12px; line-height: 1.6;">${escapeHtml(s.footer)}</p>`
    : "";
  const html = wrapEmailHtml(
    `<div style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85;">InEx Ledger bookkeeping</div>
     <h1 style="margin: 12px 0 0; font-size: 28px; line-height: 1.15;">${s.heading}</h1>`,
    `<p style="margin: 0 0 14px; color: #0f172a; font-size: 15px; line-height: 1.6;">${s.body}</p>
     ${detailHtml}
     ${safeActionUrl ? ctaButton(safeActionUrl, s.buttonLabel) : ""}
     ${footerHtml}`
  );

  return {
    subject: s.subject,
    html,
    text: s.text({ summary, actionUrl: safeActionUrl })
  };
}

/* =========================================================
   Export lifecycle emails
   ========================================================= */
const EXPORT_LIFECYCLE = {
  generated: {
    en: {
      subject: "Your InEx Ledger export is ready",
      heading: "Export generated",
      body: "Your export finished successfully and is ready to review in InEx Ledger.",
      detailsLabel: "Export details",
      buttonLabel: "Open exports",
      text: ({ summary, actionUrl }) => `Your export is ready.\n\n${summary}\n\nOpen exports: ${actionUrl}`
    },
    fr: {
      subject: "Votre export InEx Ledger est pret",
      heading: "Export genere",
      body: "Votre export a ete genere avec succes et peut maintenant etre verifie dans InEx Ledger.",
      detailsLabel: "Details de l'export",
      buttonLabel: "Ouvrir les exports",
      text: ({ summary, actionUrl }) => `Votre export est pret.\n\n${summary}\n\nOuvrir les exports : ${actionUrl}`
    }
  },
  failed: {
    en: {
      subject: "Your InEx Ledger export could not be generated",
      heading: "Export failed",
      body: "We could not finish generating your export.",
      detailsLabel: "Attempt details",
      buttonLabel: "Try again",
      footer: "Open exports to retry once the underlying issue is resolved.",
      text: ({ summary, actionUrl }) => `Your export could not be generated.\n\n${summary}\n\nTry again: ${actionUrl}`
    },
    fr: {
      subject: "Votre export InEx Ledger n'a pas pu etre genere",
      heading: "Echec de l'export",
      body: "Nous n'avons pas pu terminer la generation de votre export.",
      detailsLabel: "Details de la tentative",
      buttonLabel: "Reessayer",
      footer: "Ouvrez les exports pour reessayer une fois le probleme regle.",
      text: ({ summary, actionUrl }) => `Votre export n'a pas pu etre genere.\n\n${summary}\n\nReessayer : ${actionUrl}`
    }
  },
  stale: {
    en: {
      subject: "An export in InEx Ledger is now stale",
      heading: "Export needs to be regenerated",
      body: "A previously generated export no longer matches the latest source data.",
      detailsLabel: "What changed",
      buttonLabel: "Open exports",
      footer: "Regenerate the package after reviewing the latest changes.",
      text: ({ summary, actionUrl }) => `A previously generated export is now stale.\n\n${summary}\n\nOpen exports: ${actionUrl}`
    },
    fr: {
      subject: "Un export dans InEx Ledger est maintenant perime",
      heading: "L'export doit etre regenere",
      body: "Un export genere precedemment ne correspond plus aux donnees source les plus recentes.",
      detailsLabel: "Ce qui a change",
      buttonLabel: "Ouvrir les exports",
      footer: "Regenez le dossier apres avoir verifie les changements les plus recents.",
      text: ({ summary, actionUrl }) => `Un export genere precedemment est maintenant perime.\n\n${summary}\n\nOuvrir les exports : ${actionUrl}`
    }
  }
};

function buildExportLifecycleEmail(lang, kind, options = {}) {
  const l = normalizeEmailLang(lang);
  const bucket = EXPORT_LIFECYCLE[kind] || EXPORT_LIFECYCLE.generated;
  const s = bucket[l] || bucket.en;
  const details = Array.isArray(options.details)
    ? options.details.filter((detail) => detail && detail.label && detail.value)
    : [];
  const safeActionUrl = sanitizeHttpUrl(options.actionUrl);
  const summary = details.map((detail) => `${detail.label}: ${detail.value}`).join("\n");
  const detailHtml = details.length
    ? `
      <div style="margin: 20px 0; padding: 16px 18px; border: 1px solid #e2e8f0; border-radius: 12px; background: #f8fafc;">
        <div style="margin: 0 0 10px; color: #0f172a; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;">${escapeHtml(s.detailsLabel)}</div>
        ${details
          .map(
            (detail) =>
              `<div style="display: flex; gap: 8px; margin: 0 0 8px; color: #334155; font-size: 14px; line-height: 1.5;"><strong style="min-width: 148px; color: #0f172a;">${escapeHtml(detail.label)}</strong><span>${escapeHtml(detail.value)}</span></div>`
          )
          .join("")}
      </div>`
    : "";
  const footerHtml = s.footer
    ? `<p style="margin: 0; color: #64748b; font-size: 12px; line-height: 1.6;">${escapeHtml(s.footer)}</p>`
    : "";
  const html = wrapEmailHtml(
    `<div style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85;">InEx Ledger exports</div>
     <h1 style="margin: 12px 0 0; font-size: 28px; line-height: 1.15;">${s.heading}</h1>`,
    `<p style="margin: 0 0 14px; color: #0f172a; font-size: 15px; line-height: 1.6;">${s.body}</p>
     ${detailHtml}
     ${safeActionUrl ? ctaButton(safeActionUrl, s.buttonLabel) : ""}
     ${footerHtml}`
  );

  return {
    subject: s.subject,
    html,
    text: s.text({ summary, actionUrl: safeActionUrl })
  };
}

module.exports = {
  getPreferredLanguageForUser,
  getPreferredLanguageForEmail,
  buildWelcomeVerificationEmail,
  buildVerificationEmail,
  buildPasswordResetEmail,
  buildPasswordChangedEmail,
  buildNewSignInAlertEmail,
  buildEmailChangeEmail,
  buildEmailChangedConfirmationEmail,
  buildBillingLifecycleEmail,
  buildBusinessLifecycleEmail,
  buildTrialLifecycleEmail,
  buildReviewQueueReminderEmail,
  buildInvoiceOwnerActivityEmail,
  buildPrivacyActivityEmail,
  buildBookkeepingActivityEmail,
  buildExportLifecycleEmail,
  buildMfaEmailContent,
  normalizeEmailLang
};
