"use strict";

/**
 * emailI18nService.test.js
 *
 * Unit tests for the email i18n service.  These tests run without a live
 * database by stubbing the pool.query call inside the module.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

/* ── stub the db module so emailI18nService loads without a real DB ─── */
const Module = require("node:module");
const originalLoad = Module._load.bind(Module);

let stubbedLanguage = "en";

Module._load = function (request, parent, isMain) {
  if (request === "../db.js" || /db\.js$/.test(request)) {
    return {
      pool: {
        query: async (_sql, _params) => ({
          rows: stubbedLanguage ? [{ language: stubbedLanguage }] : []
        })
      }
    };
  }
  return originalLoad(request, parent, isMain);
};

const {
  normalizeEmailLang,
  getPreferredLanguageForUser,
  getPreferredLanguageForEmail,
  buildWelcomeVerificationEmail,
  buildVerificationEmail,
  buildPasswordResetEmail,
  buildNewSignInAlertEmail,
  buildEmailChangeEmail,
  buildMfaEmailContent
} = require("../services/emailI18nService.js");

// Restore the module loader once the service is loaded
Module._load = originalLoad;

/* ================================================================== */

describe("normalizeEmailLang", () => {
  it("returns en for empty input", () => {
    assert.equal(normalizeEmailLang(""), "en");
    assert.equal(normalizeEmailLang(null), "en");
    assert.equal(normalizeEmailLang(undefined), "en");
  });

  it("returns fr for fr input", () => {
    assert.equal(normalizeEmailLang("fr"), "fr");
    assert.equal(normalizeEmailLang("FR"), "fr");
  });

  it("falls back to en for unsupported langs", () => {
    assert.equal(normalizeEmailLang("es"), "en");
    assert.equal(normalizeEmailLang("de"), "en");
  });
});

/* ================================================================== */

describe("getPreferredLanguageForUser (stubbed)", () => {
  it("returns fr when business language is fr", async () => {
    stubbedLanguage = "fr";
    const lang = await getPreferredLanguageForUser("some-user-id");
    assert.equal(lang, "fr");
  });

  it("returns en when business language is en", async () => {
    stubbedLanguage = "en";
    const lang = await getPreferredLanguageForUser("some-user-id");
    assert.equal(lang, "en");
  });

  it("returns en for null userId", async () => {
    const lang = await getPreferredLanguageForUser(null);
    assert.equal(lang, "en");
  });
});

/* ================================================================== */

describe("getPreferredLanguageForEmail (stubbed)", () => {
  it("returns fr when business language is fr", async () => {
    stubbedLanguage = "fr";
    const lang = await getPreferredLanguageForEmail("user@example.com");
    assert.equal(lang, "fr");
  });

  it("returns en for null email", async () => {
    const lang = await getPreferredLanguageForEmail(null);
    assert.equal(lang, "en");
  });
});

/* ================================================================== */

describe("buildWelcomeVerificationEmail", () => {
  const link = "https://app.inexledger.com/verify?token=abc";

  it("returns English content by default", () => {
    const { subject, html, text } = buildWelcomeVerificationEmail("en", link);
    assert.ok(subject.includes("Welcome"));
    assert.ok(html.includes("Verify email"));
    assert.ok(text.includes("Welcome to InEx Ledger"));
    assert.ok(html.includes(link));
    assert.ok(text.includes(link));
  });

  it("returns French content for lang=fr", () => {
    const { subject, html, text } = buildWelcomeVerificationEmail("fr", link);
    assert.ok(subject.toLowerCase().includes("bienvenue"));
    assert.ok(html.includes("Vérifier le courriel"));
    assert.ok(text.includes("Bienvenue dans InEx Ledger"));
    assert.ok(html.includes(link));
    assert.ok(text.includes(link));
  });

  it("falls back to English for unknown lang", () => {
    const { subject } = buildWelcomeVerificationEmail("de", link);
    assert.ok(subject.includes("Welcome"));
  });
});

/* ================================================================== */

describe("buildVerificationEmail", () => {
  const link = "https://app.inexledger.com/verify?token=xyz";

  it("returns English content", () => {
    const { subject, html } = buildVerificationEmail("en", link);
    assert.ok(subject.includes("Verify your InEx Ledger"));
    assert.ok(html.includes("Verify your email"));
  });

  it("returns French content", () => {
    const { subject, html } = buildVerificationEmail("fr", link);
    assert.ok(subject.includes("Vérifiez votre courriel"));
    assert.ok(html.includes("Vérifiez votre courriel"));
  });
});

/* ================================================================== */

describe("buildPasswordResetEmail", () => {
  const link = "https://app.inexledger.com/reset-password?token=tok";

  it("returns English content", () => {
    const { subject, html, text } = buildPasswordResetEmail("en", link);
    assert.ok(subject.includes("Reset your InEx Ledger password"));
    assert.ok(html.includes("Reset your password"));
    assert.ok(text.includes("reset the password"));
    assert.ok(html.includes(link));
  });

  it("returns French content", () => {
    const { subject, html, text } = buildPasswordResetEmail("fr", link);
    assert.ok(subject.includes("Réinitialisez votre mot de passe"));
    assert.ok(html.includes("Réinitialisez votre mot de passe"));
    assert.ok(text.includes("mot de passe"));
    assert.ok(html.includes(link));
  });

  it("escapes/sanitizes unsafe reset link content in HTML", () => {
    const unsafe = `https://app.inexledger.com/reset?token="><img src=x onerror=alert(1)>`;
    const { html } = buildPasswordResetEmail("en", unsafe);
    assert.ok(html.includes("https://app.inexledger.com/reset?token="));
    assert.ok(!html.includes("<img"));
    assert.ok(!html.includes(`"><img`));
  });
});

/* ================================================================== */

describe("buildNewSignInAlertEmail", () => {
  const link = "https://app.inexledger.com/reset-password?token=security";
  const options = {
    signInTime: "2026-04-14T11:00:00.000Z",
    city: "Montreal",
    country: "Canada",
    resetLink: link
  };

  it("returns English content with time and location details", () => {
    const { subject, html, text } = buildNewSignInAlertEmail("en", options);
    assert.ok(subject.includes("New sign-in detected"));
    assert.ok(html.includes("Sign-in time"));
    assert.ok(html.includes("Montreal, Canada"));
    assert.ok(html.includes("Was this not you?"));
    assert.ok(html.includes(link));
    assert.ok(text.includes("Sign-in time"));
  });

  it("returns French content with warning and reset guidance", () => {
    const { subject, html, text } = buildNewSignInAlertEmail("fr", options);
    assert.ok(subject.includes("Nouvelle connexion"));
    assert.ok(html.includes("Heure de connexion"));
    assert.ok(html.includes("Ce n'était pas vous"));
    assert.ok(text.includes("Réinitialisez votre mot de passe"));
  });

  it("escapes sign-in time and location HTML fields", () => {
    const { html } = buildNewSignInAlertEmail("en", {
      signInTime: `2026-04-14T11:00:00.000Z<script>alert(1)</script>`,
      city: `Montreal<script>alert(1)</script>`,
      country: `Canada`,
      resetLink: link
    });
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  });
});

/* ================================================================== */

describe("buildEmailChangeEmail", () => {
  const link = "https://app.inexledger.com/api/auth/confirm-email-change?token=t";

  it("returns English content", () => {
    const { subject, html, text } = buildEmailChangeEmail("en", link);
    assert.ok(subject.includes("Confirm your new InEx Ledger email"));
    assert.ok(html.includes("Confirm email change"));
    assert.ok(text.includes("30 minutes"));
  });

  it("returns French content", () => {
    const { subject, html, text } = buildEmailChangeEmail("fr", link);
    assert.ok(subject.includes("Confirmez votre nouvelle adresse courriel"));
    assert.ok(html.includes("Confirmez votre nouvelle adresse courriel"));
    assert.ok(text.includes("30 minutes"));
  });
});

/* ================================================================== */

describe("buildMfaEmailContent", () => {
  it("returns English signin content", () => {
    const { subject, heading, body, footer } = buildMfaEmailContent("en", "signin");
    assert.ok(subject.includes("sign-in code"));
    assert.ok(heading.includes("verification code"));
    assert.ok(body.includes("untrusted device"));
    assert.ok(footer.includes("change your password"));
  });

  it("returns French signin content", () => {
    const { subject, heading, body, footer } = buildMfaEmailContent("fr", "signin");
    assert.ok(subject.includes("code de connexion"));
    assert.ok(heading.includes("vérification de connexion"));
    assert.ok(body.includes("non approuvé"));
    assert.ok(footer.includes("mot de passe"));
  });

  it("returns English MFA enable content", () => {
    const { subject, heading } = buildMfaEmailContent("en", "mfa_enable");
    assert.ok(subject.includes("Confirm MFA setup"));
    assert.ok(heading.includes("Confirm MFA setup"));
  });

  it("returns French MFA enable content", () => {
    const { subject, heading } = buildMfaEmailContent("fr", "mfa_enable");
    assert.ok(subject.includes("activation de l'A2F"));
    assert.ok(heading.includes("activation de l'A2F"));
  });

  it("returns English MFA disable content", () => {
    const { subject } = buildMfaEmailContent("en", "mfa_disable");
    assert.ok(subject.includes("MFA removal"));
  });

  it("returns French MFA disable content", () => {
    const { subject } = buildMfaEmailContent("fr", "mfa_disable");
    assert.ok(subject.includes("désactivation de l'A2F"));
  });

  it("falls back to signin content for unknown purpose", () => {
    const { subject } = buildMfaEmailContent("en", "unknown_purpose");
    assert.ok(subject.includes("sign-in code"));
  });

  it("falls back to English for unknown lang", () => {
    const { subject } = buildMfaEmailContent("de", "signin");
    assert.ok(subject.includes("sign-in code"));
  });
});
