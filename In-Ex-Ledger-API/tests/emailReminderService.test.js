"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  sendTrialLifecycleReminders,
  sendReviewQueueReminderEmails,
  sendCancellationEndingSoonReminders,
  __private
} = require("../services/emailReminderService.js");

const BUSINESS_ID = "00000000-0000-4000-8000-000000000801";
const USER_ID = "00000000-0000-4000-8000-000000000802";

function makeResendClient({ shouldError = false } = {}) {
  const sent = [];
  return {
    sent,
    emails: {
      async send(message) {
        sent.push(message);
        if (shouldError) return { error: { message: "provider rejected" } };
        return { data: { id: "email-reminder-1" } };
      }
    }
  };
}

// --- claimReminderState: direct race-safety coverage, same shape as
// usageLimitEmailService's "claimThresholds is race-safe" test. ---

test("claimReminderState (one-shot key): claim succeeds once, then reports lost", async () => {
  let claimed = false;
  const db = {
    async query(sql) {
      if (/INSERT INTO business_email_reminders/i.test(sql)) {
        if (claimed) return { rowCount: 0, rows: [] };
        claimed = true;
        return { rowCount: 1, rows: [{ business_id: BUSINESS_ID }] };
      }
      return { rowCount: 0, rows: [] };
    }
  };

  const first = await __private.claimReminderState(db, BUSINESS_ID, "trial_ending_7", {});
  const second = await __private.claimReminderState(db, BUSINESS_ID, "trial_ending_7", {});
  assert.equal(first, true);
  assert.equal(second, false, "a second overlapping claim for the same one-shot key must lose");
});

test("claimReminderState (cooldown key): loses while inside the cooldown window, wins once it's stale", async () => {
  const queries = [];
  let insideCooldown = true;
  const db = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (/INSERT INTO business_email_reminders/i.test(sql)) {
        return insideCooldown
          ? { rowCount: 0, rows: [] }
          : { rowCount: 1, rows: [{ business_id: BUSINESS_ID }] };
      }
      return { rowCount: 0, rows: [] };
    }
  };

  const duringCooldown = await __private.claimReminderState(db, BUSINESS_ID, "review_queue_biweekly", { cooldownDays: 14 });
  assert.equal(duringCooldown, false);

  insideCooldown = false;
  const afterCooldown = await __private.claimReminderState(db, BUSINESS_ID, "review_queue_biweekly", { cooldownDays: 14 });
  assert.equal(afterCooldown, true);

  const claimCall = queries.find((q) => /INSERT INTO business_email_reminders/i.test(q.sql));
  assert.match(claimCall.sql, /ON CONFLICT \(business_id, reminder_key\) DO UPDATE/);
  assert.match(claimCall.sql, /WHERE business_email_reminders\.last_sent_at < NOW\(\) - /);
});

// --- sendTrialLifecycleReminders ---

function makeTrialDb({ recipientOptedIn = true, claimWins = true, daysUntilTrialEnd = 7 } = {}) {
  const queries = [];
  const trialEndsAt = new Date(Date.now() + daysUntilTrialEnd * 86400000);
  const db = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (/FROM business_subscriptions bs/i.test(sql) && /trialing/i.test(sql)) {
        return {
          rowCount: 1,
          rows: [{
            business_id: BUSINESS_ID,
            status: "trialing",
            trial_started_at: null,
            trial_ends_at: trialEndsAt,
            user_id: USER_ID,
            email: "owner@example.com"
          }]
        };
      }
      if (/marketing_email_opt_in/i.test(sql) && /user_privacy_settings/i.test(sql)) {
        return recipientOptedIn
          ? { rowCount: 1, rows: [{ user_id: null, email: "owner@example.com", business_name: "Test Business", marketing_email_opt_in: true }] }
          : { rowCount: 1, rows: [{ user_id: null, email: "owner@example.com", business_name: "Test Business", marketing_email_opt_in: false }] };
      }
      if (/INSERT INTO business_email_reminders/i.test(sql)) {
        return claimWins ? { rowCount: 1, rows: [{ business_id: BUSINESS_ID }] } : { rowCount: 0, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    }
  };
  return { db, queries };
}

test("sendTrialLifecycleReminders sends and counts a claimed, opted-in trial-ending reminder", async () => {
  const { db } = makeTrialDb({ daysUntilTrialEnd: 7 });
  const resendClient = makeResendClient();

  const stats = await sendTrialLifecycleReminders({ db, resendClient, now: new Date() });

  assert.equal(stats.sent, 1);
  assert.equal(stats.skipped, 0);
  assert.equal(resendClient.sent.length, 1);
});

test("sendTrialLifecycleReminders skips without claiming when the recipient has not opted in", async () => {
  const { db, queries } = makeTrialDb({ recipientOptedIn: false, daysUntilTrialEnd: 7 });
  const resendClient = makeResendClient();

  const stats = await sendTrialLifecycleReminders({ db, resendClient, now: new Date() });

  assert.equal(stats.sent, 0);
  assert.equal(stats.skipped, 1);
  assert.equal(resendClient.sent.length, 0);
  assert.ok(!queries.some((q) => /INSERT INTO business_email_reminders/i.test(q.sql)), "opted-out recipients must not burn the one-shot claim");
});

test("sendTrialLifecycleReminders skips sending when the atomic claim is lost (simulates a losing concurrent cron run)", async () => {
  const { db } = makeTrialDb({ claimWins: false, daysUntilTrialEnd: 7 });
  const resendClient = makeResendClient();

  const stats = await sendTrialLifecycleReminders({ db, resendClient, now: new Date() });

  assert.equal(stats.sent, 0);
  assert.equal(stats.skipped, 1);
  assert.equal(resendClient.sent.length, 0, "losing the atomic claim must prevent the send entirely");
});

test("two overlapping sendTrialLifecycleReminders runs against a shared table only send once", async () => {
  // Models two cron invocations racing against the same underlying table:
  // the first INSERT ... ON CONFLICT DO NOTHING wins, the second sees the
  // row already exists and gets rowCount 0.
  const trialEndsAt = new Date(Date.now() + 7 * 86400000);
  let claimed = false;
  const sharedDb = {
    async query(sql) {
      if (/FROM business_subscriptions bs/i.test(sql) && /trialing/i.test(sql)) {
        return {
          rowCount: 1,
          rows: [{
            business_id: BUSINESS_ID,
            status: "trialing",
            trial_started_at: null,
            trial_ends_at: trialEndsAt,
            user_id: USER_ID,
            email: "owner@example.com"
          }]
        };
      }
      if (/marketing_email_opt_in/i.test(sql) && /user_privacy_settings/i.test(sql)) {
        return { rowCount: 1, rows: [{ user_id: null, email: "owner@example.com", business_name: "Test Business", marketing_email_opt_in: true }] };
      }
      if (/INSERT INTO business_email_reminders/i.test(sql)) {
        if (claimed) return { rowCount: 0, rows: [] };
        claimed = true;
        return { rowCount: 1, rows: [{ business_id: BUSINESS_ID }] };
      }
      return { rowCount: 0, rows: [] };
    }
  };
  const resendClient = makeResendClient();

  const [first, second] = await Promise.all([
    sendTrialLifecycleReminders({ db: sharedDb, resendClient, now: new Date() }),
    sendTrialLifecycleReminders({ db: sharedDb, resendClient, now: new Date() })
  ]);

  assert.equal(first.sent + second.sent, 1, "exactly one of the two overlapping runs must send the reminder");
  assert.equal(resendClient.sent.length, 1);
});

test("sendTrialLifecycleReminders counts a provider failure without crashing the sweep", async () => {
  const { db } = makeTrialDb({ daysUntilTrialEnd: 7 });
  const resendClient = makeResendClient({ shouldError: true });

  const stats = await sendTrialLifecycleReminders({ db, resendClient, now: new Date() });

  assert.equal(stats.sent, 0);
  assert.equal(stats.failed, 1);
});

// --- sendCancellationEndingSoonReminders ---

function makeCancellationDb({ claimWins = true, daysUntil = 7 } = {}) {
  const currentPeriodEnd = new Date(Date.now() + daysUntil * 86400000);
  const db = {
    async query(sql) {
      if (/FROM business_subscriptions bs/i.test(sql) && /cancel_at_period_end/i.test(sql)) {
        return {
          rowCount: 1,
          rows: [{ business_id: BUSINESS_ID, current_period_end: currentPeriodEnd, user_id: USER_ID, email: "owner@example.com" }]
        };
      }
      if (/INSERT INTO business_email_reminders/i.test(sql)) {
        return claimWins ? { rowCount: 1, rows: [{ business_id: BUSINESS_ID }] } : { rowCount: 0, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    }
  };
  return db;
}

test("sendCancellationEndingSoonReminders sends when exactly 7 days out and the claim wins", async () => {
  const db = makeCancellationDb({ daysUntil: 7 });
  const resendClient = makeResendClient();

  const stats = await sendCancellationEndingSoonReminders({ db, resendClient, now: new Date() });

  assert.equal(stats.sent, 1);
  assert.equal(resendClient.sent.length, 1);
});

test("sendCancellationEndingSoonReminders skips outside the 7-day window without touching the claim", async () => {
  const db = makeCancellationDb({ daysUntil: 3 });
  const resendClient = makeResendClient();

  const stats = await sendCancellationEndingSoonReminders({ db, resendClient, now: new Date() });

  assert.equal(stats.sent, 0);
  assert.equal(stats.skipped, 1);
  assert.equal(resendClient.sent.length, 0);
});

test("sendCancellationEndingSoonReminders skips sending when the atomic claim is lost", async () => {
  const db = makeCancellationDb({ claimWins: false, daysUntil: 7 });
  const resendClient = makeResendClient();

  const stats = await sendCancellationEndingSoonReminders({ db, resendClient, now: new Date() });

  assert.equal(stats.sent, 0);
  assert.equal(stats.skipped, 1);
  assert.equal(resendClient.sent.length, 0);
});

// --- sendReviewQueueReminderEmails ---

function makeReviewDb({ openItemCount = 10, priorSentRecently = false, claimWins = true, recipientOptedIn = true } = {}) {
  const db = {
    async query(sql) {
      if (/SELECT b\.id AS business_id/i.test(sql)) {
        return { rowCount: 1, rows: [{ business_id: BUSINESS_ID, user_id: USER_ID, email: "owner@example.com" }] };
      }
      if (/FROM audit_events/i.test(sql)) {
        return { rowCount: 1, rows: [{ last_login_at: null }] };
      }
      if (/FROM transactions t/i.test(sql)) {
        const rows = Array.from({ length: openItemCount }, (_, i) => ({
          id: `tx_${i}`,
          category_id: null,
          review_status: "needs_review",
          note: null,
          type: "expense",
          personal_use_pct: 0,
          tax_treatment: null,
          business_region: "US",
          category_name: null,
          tax_map_us: null,
          tax_map_ca: null,
          receipt_count: 0
        }));
        return { rowCount: rows.length, rows };
      }
      if (/SELECT last_sent_at, last_count, metadata_json/i.test(sql)) {
        return priorSentRecently
          ? { rowCount: 1, rows: [{ last_sent_at: new Date(), last_count: 5, metadata_json: {} }] }
          : { rowCount: 0, rows: [] };
      }
      if (/marketing_email_opt_in/i.test(sql) && /user_privacy_settings/i.test(sql)) {
        return { rowCount: 1, rows: [{ user_id: null, email: "owner@example.com", business_name: "Test Business", marketing_email_opt_in: recipientOptedIn }] };
      }
      if (/INSERT INTO business_email_reminders/i.test(sql)) {
        return claimWins ? { rowCount: 1, rows: [{ business_id: BUSINESS_ID }] } : { rowCount: 0, rows: [] };
      }
      if (/INSERT INTO audit_events/i.test(sql)) {
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    }
  };
  return db;
}

test("sendReviewQueueReminderEmails sends once the open-item count clears the minimum and the claim wins", async () => {
  const db = makeReviewDb({ openItemCount: 10 });
  const resendClient = makeResendClient();

  const stats = await sendReviewQueueReminderEmails({ db, resendClient, now: new Date() });

  assert.equal(stats.sent, 1);
  assert.equal(resendClient.sent.length, 1);
});

test("sendReviewQueueReminderEmails skips below the minimum open-item count", async () => {
  const db = makeReviewDb({ openItemCount: 1 });
  const resendClient = makeResendClient();

  const stats = await sendReviewQueueReminderEmails({ db, resendClient, now: new Date() });

  assert.equal(stats.sent, 0);
  assert.equal(stats.skipped, 1);
});

test("sendReviewQueueReminderEmails skips inside the cooldown pre-check", async () => {
  const db = makeReviewDb({ openItemCount: 10, priorSentRecently: true });
  const resendClient = makeResendClient();

  const stats = await sendReviewQueueReminderEmails({ db, resendClient, now: new Date() });

  assert.equal(stats.sent, 0);
  assert.equal(resendClient.sent.length, 0);
});

test("sendReviewQueueReminderEmails skips sending when the atomic claim is lost even though the cheap pre-check passed", async () => {
  const db = makeReviewDb({ openItemCount: 10, priorSentRecently: false, claimWins: false });
  const resendClient = makeResendClient();

  const stats = await sendReviewQueueReminderEmails({ db, resendClient, now: new Date() });

  assert.equal(stats.sent, 0);
  assert.equal(stats.skipped, 1);
  assert.equal(resendClient.sent.length, 0, "the atomic claim is the authoritative gate, not just the cheap pre-check");
});
