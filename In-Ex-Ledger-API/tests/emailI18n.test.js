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
  buildPasswordChangedEmail,
  buildNewSignInAlertEmail,
  buildEmailChangeEmail,
  buildEmailChangedConfirmationEmail,
  buildBillingLifecycleEmail,
  buildTrialLifecycleEmail,
  buildReviewQueueReminderEmail,
  buildInvoiceOwnerActivityEmail,
  buildPrivacyActivityEmail,
  buildBookkeepingActivityEmail,
  buildExportLifecycleEmail,
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

describe("buildPasswordChangedEmail", () => {
  it("returns English content", () => {
    const { subject, html, text } = buildPasswordChangedEmail("en", {
      resetLink: "https://app.inexledger.com/reset-password?token=changed"
    });
    assert.ok(subject.includes("password was changed"));
    assert.ok(html.includes("changed successfully"));
    assert.ok(text.includes("reset your password immediately"));
  });

  it("returns French content", () => {
    const { subject, html } = buildPasswordChangedEmail("fr", {
      resetLink: "https://app.inexledger.com/reset-password?token=changed"
    });
    assert.ok(subject.includes("mot de passe"));
    assert.ok(html.includes("mot de passe"));
  });
});

/* ================================================================== */

describe("buildEmailChangedConfirmationEmail", () => {
  it("returns English content with both email addresses", () => {
    const { subject, html, text } = buildEmailChangedConfirmationEmail("en", {
      oldEmail: "old@example.com",
      newEmail: "new@example.com"
    });
    assert.ok(subject.includes("sign-in email was updated"));
    assert.ok(html.includes("old@example.com"));
    assert.ok(html.includes("new@example.com"));
    assert.ok(text.includes("new@example.com"));
  });

  it("returns French content", () => {
    const { subject, html } = buildEmailChangedConfirmationEmail("fr", {
      oldEmail: "ancien@example.com",
      newEmail: "nouveau@example.com"
    });
    assert.ok(subject.includes("a ete mise a jour"));
    assert.ok(html.includes("nouveau@example.com"));
  });
});

/* ================================================================== */

describe("buildBillingLifecycleEmail", () => {
  it("returns trial started copy", () => {
    const { subject, html, text } = buildBillingLifecycleEmail("en", "trial_started", {
      details: [{ label: "Trial ends", value: "2026-06-27" }],
      billingUrl: "https://app.inexledger.com/subscription"
    });
    assert.ok(subject.includes("trial is active"));
    assert.ok(html.includes("trial has started"));
    assert.ok(text.includes("/subscription"));
  });

  it("returns ending soon copy", () => {
    const { subject, html } = buildBillingLifecycleEmail("en", "ending_soon", {
      details: [{ label: "Access ends", value: "2026-06-04" }],
      billingUrl: "https://app.inexledger.com/subscription"
    });
    assert.ok(subject.includes("ends in 7 days"));
    assert.ok(html.includes("2026-06-04"));
  });

  it("returns plan changed copy", () => {
    const { subject, html } = buildBillingLifecycleEmail("en", "plan_changed", {
      details: [{ label: "Additional businesses", value: "2" }],
      billingUrl: "https://app.inexledger.com/subscription"
    });
    assert.ok(subject.includes("setup changed"));
    assert.ok(html.includes("Billing updated"));
  });
});

/* ================================================================== */

describe("buildTrialLifecycleEmail", () => {
  it("returns English 7-day reminder copy", () => {
    const { subject, html, text } = buildTrialLifecycleEmail("en", "ending_7", {
      actionUrl: "https://app.inexledger.com/upgrade"
    });
    assert.ok(subject.includes("ends in 7 days"));
    assert.ok(html.includes("ends in 7 days"));
    assert.ok(text.includes("https://app.inexledger.com/upgrade"));
  });

  it("returns English trial ended copy", () => {
    const { subject, html } = buildTrialLifecycleEmail("en", "ended", {
      actionUrl: "https://app.inexledger.com/upgrade"
    });
    assert.ok(subject.includes("trial has ended"));
    assert.ok(html.includes("Your trial has ended"));
  });
});

/* ================================================================== */

describe("buildReviewQueueReminderEmail", () => {
  it("returns English aggregated reminder copy", () => {
    const { subject, html, text } = buildReviewQueueReminderEmail("en", {
      count: 18,
      actionUrl: "https://app.inexledger.com/exports?focus=review"
    });
    assert.ok(subject.includes("need review"));
    assert.ok(html.includes("Open review items"));
    assert.ok(html.includes(">18<"));
    assert.ok(text.includes("/exports"));
  });

  it("returns French aggregated reminder copy", () => {
    const { subject, html } = buildReviewQueueReminderEmail("fr", {
      count: 7,
      actionUrl: "https://app.inexledger.com/exports?focus=review"
    });
    assert.ok(subject.includes("doivent encore etre revisees"));
    assert.ok(html.includes("7"));
  });
});

/* ================================================================== */

describe("buildInvoiceOwnerActivityEmail", () => {
  it("returns sent confirmation copy", () => {
    const { subject, html, text } = buildInvoiceOwnerActivityEmail("en", "sent", {
      details: [
        { label: "Invoice", value: "INV-2026-0042" },
        { label: "Recipient", value: "client@example.com" }
      ],
      actionUrl: "https://app.inexledger.com/invoices"
    });
    assert.ok(subject.includes("on its way"));
    assert.ok(html.includes("Invoice sent"));
    assert.ok(html.includes("INV-2026-0042"));
    assert.ok(text.includes("/invoices"));
  });

  it("returns delivery failed copy", () => {
    const { subject, html } = buildInvoiceOwnerActivityEmail("en", "failed", {
      details: [{ label: "Issue", value: "Mailbox unavailable" }],
      actionUrl: "https://app.inexledger.com/invoices"
    });
    assert.ok(subject.includes("couldn't send"));
    assert.ok(html.includes("Mailbox unavailable"));
  });

  it("returns client reply copy", () => {
    const { subject, html } = buildInvoiceOwnerActivityEmail("en", "replied", {
      details: [{ label: "From", value: "Client Co <client@example.com>" }],
      actionUrl: "https://app.inexledger.com/messages"
    });
    assert.ok(subject.includes("client replied"));
    assert.ok(html.includes("client@example.com"));
  });
});

/* ================================================================== */

describe("buildPrivacyActivityEmail", () => {
  it("returns export completed copy", () => {
    const { subject, html, text } = buildPrivacyActivityEmail("en", "export_completed", {
      details: [{ label: "Format", value: "JSON" }],
      actionUrl: "https://app.inexledger.com/privacy"
    });
    assert.ok(subject.includes("data export is ready"));
    assert.ok(html.includes("Data export completed"));
    assert.ok(text.includes("/privacy"));
  });

  it("returns erasure completed copy", () => {
    const { subject, html } = buildPrivacyActivityEmail("en", "erasure_completed", {
      details: [{ label: "Scope", value: "Personal account data" }]
    });
    assert.ok(subject.includes("personal data was erased"));
    assert.ok(html.includes("Personal account data"));
  });

  it("returns deletion completed copy", () => {
    const { subject, html } = buildPrivacyActivityEmail("en", "deletion_completed", {
      details: [{ label: "Businesses deleted", value: "2" }],
      actionUrl: "https://app.inexledger.com/privacy"
    });
    assert.ok(subject.includes("business data was deleted"));
    assert.ok(html.includes("Businesses deleted"));
  });
});

/* ================================================================== */

describe("buildBookkeepingActivityEmail", () => {
  it("returns csv completed copy", () => {
    const { subject, html, text } = buildBookkeepingActivityEmail("en", "csv_completed", {
      details: [{ label: "Imported", value: "42" }],
      actionUrl: "https://app.inexledger.com/transactions"
    });
    assert.ok(subject.includes("CSV import is complete"));
    assert.ok(html.includes("CSV import completed"));
    assert.ok(text.includes("/transactions"));
  });

  it("returns csv failed copy", () => {
    const { subject, html } = buildBookkeepingActivityEmail("en", "csv_failed", {
      details: [{ label: "Issue", value: "Unexpected parser failure" }],
      actionUrl: "https://app.inexledger.com/transactions"
    });
    assert.ok(subject.includes("could not be completed"));
    assert.ok(html.includes("Unexpected parser failure"));
  });

  it("returns receipt uploaded copy", () => {
    const { subject, html } = buildBookkeepingActivityEmail("en", "receipt_uploaded", {
      details: [{ label: "Filename", value: "receipt.png" }],
      actionUrl: "https://app.inexledger.com/receipts"
    });
    assert.ok(subject.includes("receipt was saved"));
    assert.ok(html.includes("receipt.png"));
  });

});

/* ================================================================== */

describe("buildExportLifecycleEmail", () => {
  it("returns English generated export copy with details", () => {
    const { subject, html, text } = buildExportLifecycleEmail("en", "generated", {
      details: [
        { label: "Format", value: "PDF" },
        { label: "Date range", value: "2026-01-01 to 2026-03-31" }
      ],
      actionUrl: "https://app.inexledger.com/exports"
    });
    assert.ok(subject.includes("export is ready"));
    assert.ok(html.includes("Export generated"));
    assert.ok(html.includes("2026-01-01 to 2026-03-31"));
    assert.ok(text.includes("/exports"));
  });

  it("returns English stale export copy", () => {
    const { subject, html } = buildExportLifecycleEmail("en", "stale", {
      details: [{ label: "Area", value: "Transactions" }],
      actionUrl: "https://app.inexledger.com/exports"
    });
    assert.ok(subject.includes("now stale"));
    assert.ok(html.includes("Transactions"));
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
