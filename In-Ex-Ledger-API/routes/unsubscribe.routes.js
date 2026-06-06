"use strict";

const express = require("express");
const { pool } = require("../db.js");
const { verifyUnsubscribeToken } = require("../services/emailPreferencesService.js");

const router = express.Router();

router.get("/", async (req, res) => {
  const token = String(req.query?.token || "").trim();
  const payload = verifyUnsubscribeToken(token, "optional_emails");
  if (!payload?.u) {
    return res.status(400).type("html").send(`<!doctype html><html><body style="font-family:Arial,sans-serif;padding:32px;background:#f8fafc;color:#0f172a;"><div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;"><h1 style="margin-top:0;">Unsubscribe link invalid</h1><p>This unsubscribe link is invalid or has expired.</p></div></body></html>`);
  }

  await pool.query(
    `INSERT INTO user_privacy_settings (user_id, data_sharing_opt_out, consent_given, analytics_opt_in, marketing_email_opt_in, updated_at)
     VALUES ($1, FALSE, TRUE, FALSE, FALSE, NOW())
     ON CONFLICT (user_id) DO UPDATE
       SET marketing_email_opt_in = FALSE,
           updated_at = NOW()`,
    [payload.u]
  );

  return res.status(200).type("html").send(`<!doctype html><html><body style="font-family:Arial,sans-serif;padding:32px;background:#f8fafc;color:#0f172a;"><div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;box-shadow:0 24px 64px rgba(15,23,42,.08);"><div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#0f766e;font-weight:700;">InEx Ledger</div><h1 style="margin:12px 0 0;font-size:28px;line-height:1.15;">Optional emails turned off</h1><p style="margin:16px 0 0;line-height:1.6;color:#334155;">You will no longer receive optional bookkeeping update emails. Required security, billing, invoice, and support emails will still be delivered when needed.</p><p style="margin:20px 0 0;"><a href="/settings" style="display:inline-block;padding:12px 18px;background:#0f766e;color:#fff;border-radius:10px;text-decoration:none;font-weight:700;">Open settings</a></p></div></body></html>`);
});

module.exports = router;
