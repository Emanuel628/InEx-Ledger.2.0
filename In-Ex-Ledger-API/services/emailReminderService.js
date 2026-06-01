"use strict";

const { Resend } = require("resend");
const { pool } = require("../db.js");
const { logInfo, logWarn, logError } = require("../utils/logger.js");
const { AUDIT_ACTIONS, recordAuditEvent } = require("./auditEventService.js");
const { computeTransactionReviewFlags } = require("./transactionReviewFlagService.js");
const {
  getPreferredLanguageForUser,
  buildBillingLifecycleEmail,
  buildTrialLifecycleEmail,
  buildReviewQueueReminderEmail
} = require("./emailI18nService.js");

const REVIEW_REMINDER_KEY = "review_queue_biweekly";
const CANCELLATION_ENDING_SOON_KEY = "subscription_ending_soon_7";
const REVIEW_REMINDER_MIN_COUNT = 5;
const REVIEW_REMINDER_COOLDOWN_DAYS = 14;
const REVIEW_SIGNIN_SUPPRESSION_DAYS = 7;
const DEFAULT_TRIAL_DAYS = 30;

function getResendClient() {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) return null;
  try {
    return new Resend(apiKey);
  } catch (err) {
    logWarn("emailReminderService: Resend client unavailable", { message: err?.message });
    return null;
  }
}

function getFromEmail() {
  return (
    String(process.env.RESEND_FROM_EMAIL || "").trim() ||
    String(process.env.EMAIL_FROM || "").trim() ||
    "InEx Ledger <noreply@inexledger.com>"
  );
}

function buildAppUrl(path) {
  const base = String(process.env.APP_BASE_URL || process.env.FRONTEND_URL || "https://www.inexledger.com")
    .trim()
    .replace(/\/+$/, "");
  const normalizedPath = String(path || "/").startsWith("/") ? String(path || "/") : `/${String(path || "")}`;
  return `${base}${normalizedPath}`;
}

function utcDateOnly(value) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function diffCalendarDays(fromValue, toValue) {
  const from = utcDateOnly(fromValue);
  const to = utcDateOnly(toValue);
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function addDays(value, days) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

async function loadReminderState(db, businessId, reminderKey) {
  const result = await db.query(
    `SELECT last_sent_at, last_count, metadata_json
       FROM business_email_reminders
      WHERE business_id = $1
        AND reminder_key = $2
      LIMIT 1`,
    [businessId, reminderKey]
  );
  return result.rows[0] || null;
}

async function saveReminderState(db, businessId, reminderKey, { count = 0, metadata = {} } = {}) {
  await db.query(
    `INSERT INTO business_email_reminders (
       business_id, reminder_key, last_sent_at, last_count, metadata_json, updated_at
     ) VALUES ($1, $2, NOW(), $3, $4::jsonb, NOW())
     ON CONFLICT (business_id, reminder_key) DO UPDATE
       SET last_sent_at = NOW(),
           last_count = EXCLUDED.last_count,
           metadata_json = EXCLUDED.metadata_json,
           updated_at = NOW()`,
    [businessId, reminderKey, Math.max(Number(count) || 0, 0), JSON.stringify(metadata || {})]
  );
}

function resolveTrialReminder(daysUntil) {
  if (daysUntil === 7) return { key: "trial_ending_7", kind: "ending_7" };
  if (daysUntil === 3) return { key: "trial_ending_3", kind: "ending_3" };
  if (daysUntil === 1) return { key: "trial_ending_1", kind: "ending_1" };
  if (daysUntil < 0) return { key: "trial_ended", kind: "ended" };
  return null;
}

async function sendEmail(resendClient, { to, subject, html, text }) {
  if (!resendClient) {
    throw new Error("Resend is not configured.");
  }
  const result = await resendClient.emails.send({
    from: getFromEmail(),
    to,
    subject,
    html,
    text
  });
  if (result?.error) {
    throw new Error(result.error.message || "Email send failed.");
  }
  return true;
}

async function sendTrialLifecycleReminders({ db = pool, resendClient = getResendClient(), now = new Date() } = {}) {
  const stats = { sent: 0, skipped: 0, failed: 0 };
  const result = await db.query(
    `SELECT bs.business_id,
            bs.status,
            bs.trial_started_at,
            bs.trial_ends_at,
            b.user_id,
            u.email
       FROM business_subscriptions bs
       JOIN businesses b ON b.id = bs.business_id
       JOIN users u ON u.id = b.user_id
      WHERE LOWER(COALESCE(bs.status, '')) = 'trialing'
        AND u.is_erased = FALSE
        AND u.email IS NOT NULL`
  );

  for (const row of result.rows) {
    const trialEnd = row.trial_ends_at || addDays(row.trial_started_at || now, DEFAULT_TRIAL_DAYS);
    const daysUntil = diffCalendarDays(now, trialEnd);
    const reminder = resolveTrialReminder(daysUntil);
    if (!reminder) {
      stats.skipped += 1;
      continue;
    }

    try {
      const prior = await loadReminderState(db, row.business_id, reminder.key);
      if (prior) {
        stats.skipped += 1;
        continue;
      }

      const lang = await getPreferredLanguageForUser(row.user_id);
      const emailContent = buildTrialLifecycleEmail(lang, reminder.kind, {
        actionUrl: buildAppUrl("/subscription")
      });
      await sendEmail(resendClient, {
        to: row.email,
        ...emailContent
      });
      await saveReminderState(db, row.business_id, reminder.key, {
        metadata: {
          trial_ends_at: new Date(trialEnd).toISOString(),
          days_until: daysUntil
        }
      });
      stats.sent += 1;
    } catch (err) {
      stats.failed += 1;
      logWarn("emailReminderService: trial reminder failed", {
        businessId: row.business_id,
        kind: reminder.key,
        message: err?.message
      });
    }
  }

  return stats;
}

async function getLastLoginAt(db, userId) {
  const result = await db.query(
    `SELECT MAX(created_at) AS last_login_at
       FROM audit_events
      WHERE user_id = $1
        AND action = $2`,
    [userId, AUDIT_ACTIONS.LOGIN_SUCCESS]
  );
  return result.rows[0]?.last_login_at ? new Date(result.rows[0].last_login_at) : null;
}

async function getOpenReviewItemCount(db, businessId) {
  const result = await db.query(
    `SELECT t.id,
            t.category_id,
            t.review_status,
            t.note,
            t.type,
            t.personal_use_pct,
            t.tax_treatment,
            b.region AS business_region,
            c.name AS category_name,
            c.tax_map_us,
            c.tax_map_ca,
            COALESCE(rc.receipt_count, 0)::int AS receipt_count
       FROM transactions t
       JOIN businesses b ON b.id = t.business_id
       LEFT JOIN categories c ON c.id = t.category_id
       LEFT JOIN (
         SELECT transaction_id, COUNT(*)::int AS receipt_count
           FROM receipts
          WHERE business_id = $1
          GROUP BY transaction_id
       ) rc ON rc.transaction_id = t.id
      WHERE t.business_id = $1
        AND t.deleted_at IS NULL
        AND (t.is_void = false OR t.is_void IS NULL)
        AND (t.is_adjustment = false OR t.is_adjustment IS NULL)`,
    [businessId]
  );

  let count = 0;
  for (const row of result.rows) {
    const flags = computeTransactionReviewFlags(row);
    const manualReview = row.review_status && row.review_status !== "ready" && row.review_status !== "matched";
    if (flags.length > 0 || manualReview) {
      count += 1;
    }
  }
  return count;
}

async function sendReviewQueueReminderEmails({ db = pool, resendClient = getResendClient(), now = new Date() } = {}) {
  const stats = { sent: 0, skipped: 0, failed: 0 };
  const businesses = await db.query(
    `SELECT b.id AS business_id, b.user_id, u.email
       FROM businesses b
       JOIN users u ON u.id = b.user_id
      WHERE u.is_erased = FALSE
        AND u.email IS NOT NULL`
  );

  for (const row of businesses.rows) {
    try {
      const lastLoginAt = await getLastLoginAt(db, row.user_id);
      if (lastLoginAt && diffCalendarDays(lastLoginAt, now) < REVIEW_SIGNIN_SUPPRESSION_DAYS) {
        stats.skipped += 1;
        continue;
      }

      const count = await getOpenReviewItemCount(db, row.business_id);
      if (count < REVIEW_REMINDER_MIN_COUNT) {
        stats.skipped += 1;
        continue;
      }

      const prior = await loadReminderState(db, row.business_id, REVIEW_REMINDER_KEY);
      if (prior?.last_sent_at && diffCalendarDays(prior.last_sent_at, now) < REVIEW_REMINDER_COOLDOWN_DAYS) {
        stats.skipped += 1;
        continue;
      }

      const lang = await getPreferredLanguageForUser(row.user_id);
      const emailContent = buildReviewQueueReminderEmail(lang, {
        count,
        actionUrl: buildAppUrl("/exports?focus=review")
      });
      await sendEmail(resendClient, {
        to: row.email,
        ...emailContent
      });
      await saveReminderState(db, row.business_id, REVIEW_REMINDER_KEY, {
        count,
        metadata: {
          last_login_at: lastLoginAt ? lastLoginAt.toISOString() : null
        }
      });
      await recordAuditEvent(db, {
        userId: row.user_id,
        businessId: row.business_id,
        action: "email.review_queue.sent",
        metadata: { count }
      });
      stats.sent += 1;
    } catch (err) {
      stats.failed += 1;
      logWarn("emailReminderService: review reminder failed", {
        businessId: row.business_id,
        message: err?.message
      });
    }
  }

  return stats;
}

async function sendCancellationEndingSoonReminders({ db = pool, resendClient = getResendClient(), now = new Date() } = {}) {
  const stats = { sent: 0, skipped: 0, failed: 0 };
  const result = await db.query(
    `SELECT bs.business_id,
            bs.current_period_end,
            b.user_id,
            u.email
       FROM business_subscriptions bs
       JOIN businesses b ON b.id = bs.business_id
       JOIN users u ON u.id = b.user_id
      WHERE bs.cancel_at_period_end = TRUE
        AND LOWER(COALESCE(bs.status, '')) <> 'trialing'
        AND bs.current_period_end IS NOT NULL
        AND u.is_erased = FALSE
        AND u.email IS NOT NULL`
  );

  for (const row of result.rows) {
    try {
      const daysUntil = diffCalendarDays(now, row.current_period_end);
      if (daysUntil !== 7) {
        stats.skipped += 1;
        continue;
      }

      const prior = await loadReminderState(db, row.business_id, CANCELLATION_ENDING_SOON_KEY);
      if (prior) {
        stats.skipped += 1;
        continue;
      }

      const lang = await getPreferredLanguageForUser(row.user_id);
      const emailContent = buildBillingLifecycleEmail(lang, "ending_soon", {
        details: [
          { label: "Access ends", value: new Date(row.current_period_end).toISOString().slice(0, 10) },
          { label: "Status", value: "Cancellation scheduled" }
        ],
        actionUrl: buildAppUrl("/subscription"),
        billingUrl: buildAppUrl("/subscription")
      });
      await sendEmail(resendClient, {
        to: row.email,
        ...emailContent
      });
      await saveReminderState(db, row.business_id, CANCELLATION_ENDING_SOON_KEY, {
        metadata: {
          current_period_end: new Date(row.current_period_end).toISOString(),
          days_until: daysUntil
        }
      });
      stats.sent += 1;
    } catch (err) {
      stats.failed += 1;
      logWarn("emailReminderService: cancellation ending soon reminder failed", {
        businessId: row.business_id,
        message: err?.message
      });
    }
  }

  return stats;
}

async function runEmailReminderSweep({ db = pool, resendClient = getResendClient(), now = new Date() } = {}) {
  const trial = await sendTrialLifecycleReminders({ db, resendClient, now });
  const review = await sendReviewQueueReminderEmails({ db, resendClient, now });
  const cancellation = await sendCancellationEndingSoonReminders({ db, resendClient, now });
  const summary = { trial, review, cancellation };
  logInfo("emailReminderService: reminder sweep complete", summary);
  return summary;
}

module.exports = {
  sendTrialLifecycleReminders,
  sendReviewQueueReminderEmails,
  sendCancellationEndingSoonReminders,
  runEmailReminderSweep,
  __private: {
    diffCalendarDays,
    resolveTrialReminder,
    getOpenReviewItemCount,
    getLastLoginAt,
    buildAppUrl
  }
};
