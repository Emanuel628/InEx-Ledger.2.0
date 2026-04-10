/**
 * test-email.mjs
 * Quick smoke-test for the Resend email integration.
 *
 * Usage:
 *   RESEND_API_KEY=re_xxxx TO=you@example.com node scripts/test-email.mjs
 *
 * Or, if a .env file is present in the project root:
 *   node scripts/test-email.mjs
 *
 * The script will print success/failure details to stdout so you can
 * confirm that the email service is reachable and properly configured
 * before debugging the forgot-password flow end-to-end.
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";
import { existsSync } from "fs";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from the project root when available
const envPath = resolve(__dirname, "../.env");
if (existsSync(envPath)) {
  const dotenv = (() => {
    try { return require("dotenv"); } catch { return null; }
  })();
  if (dotenv) {
    dotenv.config({ path: envPath });
    console.log("[test-email] Loaded .env from", envPath);
  }
}

const apiKey = process.env.RESEND_API_KEY;
const from =
  process.env.RESEND_FROM_EMAIL ||
  process.env.EMAIL_FROM ||
  "InEx Ledger <noreply@inexledger.com>";
const to = process.env.TO || process.argv[2];

if (!apiKey) {
  console.error(
    "[test-email] ERROR: RESEND_API_KEY is not set.\n" +
    "  Set it in your .env file or as an environment variable:\n" +
    "  RESEND_API_KEY=re_xxxx node scripts/test-email.mjs"
  );
  process.exit(1);
}

if (!to) {
  console.error(
    "[test-email] ERROR: recipient address not provided.\n" +
    "  Pass it as TO env var or the first CLI argument:\n" +
    "  TO=you@example.com node scripts/test-email.mjs"
  );
  process.exit(1);
}

const { Resend } = require("resend");
const resend = new Resend(apiKey);

const subject = "InEx Ledger — test email";
const html = `
  <div style="font-family: Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 32px; border: 1px solid #e5e7eb; border-radius: 12px;">
    <h2 style="color: #0f172a;">Test email from InEx Ledger</h2>
    <p style="color: #475569;">
      This is a diagnostic test email sent by <code>scripts/test-email.mjs</code>.
      If you received this, the Resend integration is configured correctly.
    </p>
    <p style="font-size: 12px; color: #94a3b8;">Sent at: ${new Date().toISOString()}</p>
  </div>
`;
const text = `Test email from InEx Ledger\n\nIf you received this, the Resend integration is configured correctly.\n\nSent at: ${new Date().toISOString()}`;

console.log("[test-email] Sending test email to", to, "via Resend (from:", from, ")...");

try {
  const result = await resend.emails.send({ from, to: [to], subject, html, text });
  console.log("[test-email] SUCCESS — Resend response:", JSON.stringify(result, null, 2));
} catch (err) {
  console.error("[test-email] FAILED:", err?.message || err);
  process.exit(1);
}
