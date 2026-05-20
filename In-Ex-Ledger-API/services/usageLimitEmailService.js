"use strict";

/**
 * usageLimitEmailService — calm, non-pushy usage-limit emails for Basic-tier
 * businesses.
 *
 * Emails are sent at 70%, 90%, and 100% of each monthly cap (transactions,
 * receipts, CSV imports). Each threshold is sent at most once per monthly
 * usage period; the *_email_*_sent_at columns on business_usage_periods make
 * this idempotent and a new period row resets the tracking automatically.
 *
 * Every public function is best-effort: it never throws, so a mail failure
 * can never block a transaction, receipt, or import.
 */

const { pool } = require("../db.js");
const { logError, logWarn, logInfo } = require("../utils/logger.js");
const { getUsageSummary } = require("./basicPlanUsageService.js");

const THRESHOLDS = [70, 90, 100];

const RESOURCE_CONFIG = {
  transactions: {
    columns: {
      70: "transaction_email_70_sent_at",
      90: "transaction_email_90_sent_at",
      100: "transaction_email_100_sent_at"
    }
  },
  receipts: {
    columns: {
      70: "receipt_email_70_sent_at",
      90: "receipt_email_90_sent_at",
      100: "receipt_email_100_sent_at"
    }
  },
  csvImportRows: {
    columns: {
      70: "csv_import_email_70_sent_at",
      90: "csv_import_email_90_sent_at",
      100: "csv_import_email_100_sent_at"
    }
  }
};

function getResendClient() {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) {
    return null;
  }
  try {
    const { Resend } = require("resend");
    return new Resend(apiKey);
  } catch (err) {
    logWarn("usageLimitEmailService: Resend client unavailable", { message: err?.message });
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

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Returns calm, helpful email copy for a given resource + threshold.
 */
function buildUsageEmailCopy(resource, threshold, metric) {
  const used = metric.used;
  const limit = metric.limit;

  if (resource === "transactions") {
    if (threshold === 100) {
      return {
        subject: "You've reached your Basic transaction limit this month",
        body: `You've reached your ${limit} Basic transactions for this month. Your records are safe. You can upgrade to Pro to keep adding more this month.`
      };
    }
    if (threshold === 90) {
      return {
        subject: "A heads-up on your InEx Ledger transactions",
        body: `You've used ${used} of your ${limit} Basic transactions this month. You're close to this month's limit — no action is needed yet. If your business activity is growing, Pro gives you higher limits, receipt-backed records, mileage tools, imports, and tax-ready exports.`
      };
    }
    return {
      subject: "A heads-up on your InEx Ledger transactions",
      body: `You've used ${used} of your ${limit} Basic transactions this month. No action is needed yet — we just wanted to give you a heads-up so your recordkeeping does not get interrupted. If your business activity is growing, Pro gives you higher limits, receipt-backed records, mileage tools, imports, and tax-ready exports.`
    };
  }

  if (resource === "receipts") {
    if (threshold === 100) {
      return {
        subject: "You've reached your Basic receipt limit this month",
        body: "You've reached your Basic receipt limit for this month. You can keep adding transactions, or upgrade to Pro to keep uploading receipts."
      };
    }
    return {
      subject: "A heads-up on your InEx Ledger receipt uploads",
      body: `You've used ${used} of your ${limit} Basic receipt uploads this month. You can keep adding transactions, but receipt uploads may pause once you reach the Basic limit. Pro keeps receipt capture open for regular business use.`
    };
  }

  // csvImportRows
  if (threshold === 100) {
    return {
      subject: "You've reached your Basic import limit this month",
      body: "You've reached your Basic import limit for this month. You can still add transactions manually, or upgrade to Pro for higher import limits."
    };
  }
  return {
    subject: "A heads-up on your InEx Ledger CSV imports",
    body: `You've used ${used} of your ${limit} Basic CSV import rows this month. No action is needed yet — just a heads-up. Pro gives you higher import limits, receipt-backed records, mileage tools, and tax-ready exports.`
  };
}

function renderEmailHtml({ subject, body, businessName }) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${escapeHtml(subject)}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;color:#1f2937;background:#f9fafb;margin:0;padding:24px;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;">
    <tr><td>
      <h1 style="font-size:18px;margin:0 0 16px;">${escapeHtml(subject)}</h1>
      <p style="margin:0 0 16px;line-height:1.6;">${escapeHtml(body)}</p>
      <p style="margin:0 0 16px;line-height:1.6;color:#6b7280;font-size:13px;">This note is for ${escapeHtml(businessName || "your business")}. Your monthly limits reset at the start of each calendar month.</p>
      <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;">InEx Ledger · You're receiving this because usage limit notices are part of your Basic plan.</p>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Atomically claims the crossed thresholds for one resource. Returns true when
 * this caller won the claim (and should therefore send the email), false when
 * another concurrent caller already claimed it.
 */
async function claimThresholds(db, periodId, resource, crossedThresholds) {
  const cfg = RESOURCE_CONFIG[resource];
  const highest = Math.max(...crossedThresholds);
  const setSql = crossedThresholds.map((t) => `${cfg.columns[t]} = now()`).join(", ");
  const result = await db.query(
    `UPDATE business_usage_periods
        SET ${setSql}, updated_at = now()
      WHERE id = $1 AND ${cfg.columns[highest]} IS NULL
      RETURNING id`,
    [periodId]
  );
  return result.rowCount > 0;
}

async function loadRecipient(db, businessId) {
  const result = await db.query(
    `SELECT u.email, u.is_erased, b.name AS business_name
       FROM businesses b
       JOIN users u ON u.id = b.user_id
      WHERE b.id = $1
      LIMIT 1`,
    [businessId]
  );
  const row = result.rows[0];
  if (!row || row.is_erased || !row.email || !String(row.email).includes("@")) {
    return null;
  }
  return { email: row.email, businessName: row.business_name };
}

async function evaluateResource(db, resendClient, { businessId, resource, metric, period, recipient }) {
  const cfg = RESOURCE_CONFIG[resource];
  if (!cfg || !period || !metric || metric.limit <= 0) {
    return;
  }

  const pct = (metric.used / metric.limit) * 100;
  const crossed = THRESHOLDS.filter((t) => pct >= t && !period[cfg.columns[t]]);
  if (crossed.length === 0) {
    return;
  }

  // Claim every crossed threshold so a large jump (e.g. a big CSV import) does
  // not later trigger a lower-threshold email. Only the highest is emailed.
  const won = await claimThresholds(db, period.id, resource, crossed);
  if (!won) {
    return;
  }

  const highest = Math.max(...crossed);
  const copy = buildUsageEmailCopy(resource, highest, metric);

  if (!resendClient) {
    logWarn("usageLimitEmailService: email not sent (Resend not configured)", {
      businessId,
      resource,
      threshold: highest
    });
    return;
  }

  try {
    const result = await resendClient.emails.send({
      from: getFromEmail(),
      to: recipient.email,
      subject: copy.subject,
      html: renderEmailHtml({ subject: copy.subject, body: copy.body, businessName: recipient.businessName }),
      text: copy.body
    });
    if (result?.error) {
      logWarn("usageLimitEmailService: Resend reported an error", {
        businessId,
        resource,
        threshold: highest,
        message: result.error.message
      });
      return;
    }
    logInfo("usageLimitEmailService: usage email sent", { businessId, resource, threshold: highest });
  } catch (err) {
    logWarn("usageLimitEmailService: failed to send usage email", {
      businessId,
      resource,
      threshold: highest,
      message: err?.message
    });
  }
}

/**
 * Evaluates and (if needed) sends usage-limit emails for a Basic business.
 * Best-effort: never throws. Safe to call fire-and-forget after a write.
 *
 * @param {object}   args
 * @param {string}   args.businessId
 * @param {string[]} [args.resources] - subset of transactions|receipts|csvImportRows
 * @param {object}   [args.subscription] - pre-resolved subscription snapshot
 * @param {object}   [args.db] - db handle (defaults to the shared pool)
 */
async function evaluateUsageLimitEmails({ businessId, resources = null, subscription = null, db = pool } = {}) {
  try {
    if (!businessId) {
      return;
    }
    // Fast path: usage-limit emails apply only to Basic-tier businesses. When
    // the caller already knows the tier, skip the usage queries entirely.
    if (subscription && (subscription.effectiveTier || "free") !== "free") {
      return;
    }
    const summary = await getUsageSummary(db, businessId, { subscription });
    if (!summary.enforced || !summary.period) {
      return; // Only Basic-tier businesses receive usage-limit emails.
    }

    const recipient = await loadRecipient(db, businessId);
    if (!recipient) {
      return;
    }

    const resendClient = getResendClient();
    const targets = Array.isArray(resources) && resources.length
      ? resources
      : ["transactions", "receipts", "csvImportRows"];

    for (const resource of targets) {
      const metric = summary[resource];
      if (metric) {
        await evaluateResource(db, resendClient, {
          businessId,
          resource,
          metric,
          period: summary.period,
          recipient
        });
      }
    }
  } catch (err) {
    logError("usageLimitEmailService: evaluation failed", { businessId, message: err?.message });
  }
}

module.exports = {
  evaluateUsageLimitEmails,
  buildUsageEmailCopy,
  __private: { claimThresholds, evaluateResource, RESOURCE_CONFIG, THRESHOLDS }
};
