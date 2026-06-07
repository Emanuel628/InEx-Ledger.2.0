"use strict";

const express = require("express");
const { pool } = require("../db.js");
const { verifyUnsubscribeToken } = require("../services/emailPreferencesService.js");

const router = express.Router();

router.get("/", async (req, res) => {
  const token = String(req.query?.token || "").trim();
  const payload = verifyUnsubscribeToken(token, "optional_emails");
  if (!payload?.u) {
    return res.status(400).type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Unsubscribe link invalid | InEx Ledger</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      background:
        radial-gradient(circle at top left, rgba(59, 130, 246, 0.16), transparent 30%),
        radial-gradient(circle at top right, rgba(20, 184, 166, 0.12), transparent 28%),
        linear-gradient(180deg, #f8fbff 0%, #eef4fb 100%);
      color: #0f172a;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .panel {
      width: min(100%, 680px);
      border: 1px solid rgba(15, 23, 42, 0.08);
      border-radius: 28px;
      padding: 34px;
      background: rgba(255,255,255,0.94);
      box-shadow: 0 28px 72px rgba(15, 23, 42, 0.10);
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      color: #0f766e;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    .badge {
      width: 18px;
      height: 18px;
      border-radius: 999px;
      background: linear-gradient(135deg, #ef4444, #f97316);
      box-shadow: 0 0 0 6px rgba(239, 68, 68, 0.10);
    }
    h1 {
      margin: 16px 0 10px;
      font-size: clamp(34px, 5vw, 56px);
      line-height: 0.96;
      letter-spacing: -0.06em;
    }
    p {
      margin: 0;
      color: #475569;
      font-size: 15px;
      line-height: 1.7;
      max-width: 52ch;
    }
    .actions { margin-top: 24px; display: flex; gap: 12px; flex-wrap: wrap; }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 46px;
      padding: 0 18px;
      border-radius: 14px;
      text-decoration: none;
      font-weight: 700;
    }
    .btn-primary { background: #2563eb; color: #fff; }
    .btn-secondary { background: #f8fafc; color: #0f172a; border: 1px solid #dbe4f0; }
  </style>
</head>
<body>
  <main class="panel">
    <div class="eyebrow"><span class="badge" aria-hidden="true"></span> InEx Ledger email preferences</div>
    <h1>Unsubscribe link invalid</h1>
    <p>This unsubscribe link is invalid or has expired. Open your privacy settings from inside the app or use a newer email footer link.</p>
    <div class="actions">
      <a class="btn btn-primary" href="/settings">Open settings</a>
      <a class="btn btn-secondary" href="/help">Need help?</a>
    </div>
  </main>
</body>
</html>`);
  }

  await pool.query(
    `INSERT INTO user_privacy_settings (user_id, data_sharing_opt_out, consent_given, analytics_opt_in, marketing_email_opt_in, updated_at)
     VALUES ($1, FALSE, TRUE, FALSE, FALSE, NOW())
     ON CONFLICT (user_id) DO UPDATE
       SET marketing_email_opt_in = FALSE,
           updated_at = NOW()`,
    [payload.u]
  );

  return res.status(200).type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Email preferences updated | InEx Ledger</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      background:
        radial-gradient(circle at top left, rgba(59, 130, 246, 0.16), transparent 30%),
        radial-gradient(circle at top right, rgba(20, 184, 166, 0.12), transparent 28%),
        linear-gradient(180deg, #f8fbff 0%, #eef4fb 100%);
      color: #0f172a;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .panel {
      width: min(100%, 720px);
      border: 1px solid rgba(15, 23, 42, 0.08);
      border-radius: 30px;
      padding: 36px;
      background:
        radial-gradient(circle at 100% 0%, rgba(37, 99, 235, 0.10), transparent 34%),
        linear-gradient(145deg, rgba(255,255,255,0.98), rgba(247,250,252,0.96));
      box-shadow: 0 30px 76px rgba(15, 23, 42, 0.10);
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      color: #0f766e;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    .badge {
      width: 18px;
      height: 18px;
      border-radius: 999px;
      background: linear-gradient(135deg, #14b8a6, #2563eb);
      box-shadow: 0 0 0 6px rgba(20, 184, 166, 0.12);
    }
    h1 {
      margin: 16px 0 10px;
      font-size: clamp(34px, 5vw, 58px);
      line-height: 0.94;
      letter-spacing: -0.06em;
    }
    p {
      margin: 0;
      color: #475569;
      font-size: 15px;
      line-height: 1.72;
      max-width: 56ch;
    }
    .status {
      margin-top: 24px;
      padding: 16px 18px;
      border-radius: 18px;
      background: rgba(15, 118, 110, 0.08);
      color: #0f172a;
      border: 1px solid rgba(15, 118, 110, 0.14);
    }
    .actions { margin-top: 24px; display: flex; gap: 12px; flex-wrap: wrap; }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 48px;
      padding: 0 18px;
      border-radius: 14px;
      text-decoration: none;
      font-weight: 700;
    }
    .btn-primary { background: #2563eb; color: #fff; }
    .btn-secondary { background: #f8fafc; color: #0f172a; border: 1px solid #dbe4f0; }
  </style>
</head>
<body>
  <main class="panel">
    <div class="eyebrow"><span class="badge" aria-hidden="true"></span> InEx Ledger email preferences</div>
    <h1>Optional emails turned off</h1>
    <p>You will no longer receive optional bookkeeping update emails. Required security, billing, invoice, and support emails will still arrive when they matter.</p>
    <div class="status">You can re-enable optional updates anytime from Privacy &amp; Data inside Settings.</div>
    <div class="actions">
      <a class="btn btn-primary" href="/settings">Open settings</a>
      <a class="btn btn-secondary" href="/help">View help</a>
    </div>
  </main>
</body>
</html>`);
});

module.exports = router;
