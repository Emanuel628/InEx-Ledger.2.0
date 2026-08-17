"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { sendExportGeneratedEmail, sendExportFailedEmail } = require("../services/exportEmailService.js");

const BUSINESS_ID = "00000000-0000-4000-8000-000000000902";

function makeDb({ reserveResult = true } = {}) {
  const queries = [];
  const db = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (/FROM businesses b\s+JOIN users u/i.test(sql)) {
        return {
          rowCount: 1,
          rows: [{
            user_id: null, // keeps getPreferredLanguageForUser on its no-DB "en" fast path
            email: "owner@example.com",
            business_name: "Test Business",
            marketing_email_opt_in: true
          }]
        };
      }
      if (/INSERT INTO email_delivery_dedupe/i.test(sql)) {
        return {
          rowCount: reserveResult ? 1 : 0,
          rows: reserveResult ? [{ dedupe_key: params[0] }] : []
        };
      }
      if (/UPDATE email_delivery_dedupe/i.test(sql)) {
        return { rowCount: 1, rows: [] };
      }
      return { rows: [], rowCount: 0 };
    }
  };
  return { db, queries };
}

// A stateful DB that really tracks which dedupe keys have been reserved, so
// these tests prove the real key derivation -- not just "the mock said
// reserve succeeded/failed" like makeDb() above does for the simpler cases.
function makeStatefulDb() {
  const reservedKeys = new Set();
  const queries = [];
  const db = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (/FROM businesses b\s+JOIN users u/i.test(sql)) {
        return {
          rowCount: 1,
          rows: [{
            user_id: null,
            email: "owner@example.com",
            business_name: "Test Business",
            marketing_email_opt_in: true
          }]
        };
      }
      if (/INSERT INTO email_delivery_dedupe/i.test(sql)) {
        const dedupeKey = params[0];
        if (reservedKeys.has(dedupeKey)) {
          return { rowCount: 0, rows: [] };
        }
        reservedKeys.add(dedupeKey);
        return { rowCount: 1, rows: [{ dedupe_key: dedupeKey }] };
      }
      if (/UPDATE email_delivery_dedupe/i.test(sql)) {
        return { rowCount: 1, rows: [] };
      }
      return { rows: [], rowCount: 0 };
    }
  };
  return { db, queries };
}

function makeResendClient({ shouldError = false } = {}) {
  const sent = [];
  return {
    sent,
    emails: {
      async send(message) {
        sent.push(message);
        if (shouldError) return { error: { message: "provider rejected" } };
        return { data: { id: "email-export-1" } };
      }
    }
  };
}

test("sendExportGeneratedEmail reserves a dedupe key before sending", async () => {
  const { db, queries } = makeDb();
  const resendClient = makeResendClient();

  const sent = await sendExportGeneratedEmail(
    { businessId: BUSINESS_ID, exportType: "pdf", startDate: "2026-01-01", endDate: "2026-01-31" },
    { db, resendClient }
  );

  assert.equal(sent, true);
  assert.equal(resendClient.sent.length, 1);

  const reserveCall = queries.find((q) => /INSERT INTO email_delivery_dedupe/i.test(q.sql));
  assert.ok(reserveCall, "expected a dedupe reservation query");
  assert.equal(reserveCall.params[1], "export.generated");
  assert.equal(reserveCall.params[2], BUSINESS_ID);
  assert.equal(reserveCall.params[3], "owner@example.com");

  const sentUpdateCall = queries.find((q) => /SET status = 'sent'/i.test(q.sql));
  assert.ok(sentUpdateCall, "expected the dedupe row to be marked sent");
});

test("sendExportGeneratedEmail skips the send when a retried export POST hits the same dedupe key", async () => {
  const { db } = makeDb({ reserveResult: false });
  const resendClient = makeResendClient();

  const sent = await sendExportGeneratedEmail(
    { businessId: BUSINESS_ID, exportType: "pdf", startDate: "2026-01-01", endDate: "2026-01-31" },
    { db, resendClient }
  );

  assert.equal(sent, false);
  assert.equal(resendClient.sent.length, 0, "a client-side retry of the export POST must not resend the email");
});

test("sendExportGeneratedEmail marks the dedupe row failed on provider error", async () => {
  const { db, queries } = makeDb();
  const resendClient = makeResendClient({ shouldError: true });

  const sent = await sendExportGeneratedEmail(
    { businessId: BUSINESS_ID, exportType: "pdf", startDate: "2026-01-01", endDate: "2026-01-31" },
    { db, resendClient }
  );

  assert.equal(sent, false);
  const failedUpdateCall = queries.find((q) => /SET status = 'failed'/i.test(q.sql));
  assert.ok(failedUpdateCall, "expected the dedupe row to be marked failed so a retry can reserve again");
});

test("a different export (different date range) gets its own dedupe key and is not suppressed", async () => {
  const { db } = makeDb();
  const resendClient = makeResendClient();

  const first = await sendExportGeneratedEmail(
    { businessId: BUSINESS_ID, exportType: "pdf", startDate: "2026-01-01", endDate: "2026-01-31" },
    { db, resendClient }
  );
  const second = await sendExportGeneratedEmail(
    { businessId: BUSINESS_ID, exportType: "pdf", startDate: "2026-02-01", endDate: "2026-02-28" },
    { db, resendClient }
  );

  assert.equal(first, true);
  assert.equal(second, true);
  assert.equal(resendClient.sent.length, 2);
});

test("sendExportFailedEmail reserves a dedupe key before sending", async () => {
  const { db, queries } = makeDb();
  const resendClient = makeResendClient();

  const sent = await sendExportFailedEmail(
    { businessId: BUSINESS_ID, exportType: "pdf", startDate: "2026-01-01", endDate: "2026-01-31", reason: "PDF generation timed out" },
    { db, resendClient }
  );

  assert.equal(sent, true);
  assert.equal(resendClient.sent.length, 1);

  const reserveCall = queries.find((q) => /INSERT INTO email_delivery_dedupe/i.test(q.sql));
  assert.equal(reserveCall.params[1], "export.failed");
});

test("sendExportFailedEmail skips the send when a retried export POST hits the same dedupe key", async () => {
  const { db } = makeDb({ reserveResult: false });
  const resendClient = makeResendClient();

  const sent = await sendExportFailedEmail(
    { businessId: BUSINESS_ID, exportType: "pdf", startDate: "2026-01-01", endDate: "2026-01-31", reason: "PDF generation timed out" },
    { db, resendClient }
  );

  assert.equal(sent, false);
  assert.equal(resendClient.sent.length, 0);
});

test("a different failure reason gets its own dedupe key and is not suppressed", async () => {
  const { db } = makeDb();
  const resendClient = makeResendClient();

  const first = await sendExportFailedEmail(
    { businessId: BUSINESS_ID, exportType: "pdf", startDate: "2026-01-01", endDate: "2026-01-31", reason: "PDF generation timed out" },
    { db, resendClient }
  );
  const second = await sendExportFailedEmail(
    { businessId: BUSINESS_ID, exportType: "pdf", startDate: "2026-01-01", endDate: "2026-01-31", reason: "Dataset hash mismatch" },
    { db, resendClient }
  );

  assert.equal(first, true);
  assert.equal(second, true);
  assert.equal(resendClient.sent.length, 2);
});

test("sendExportGeneratedEmail returns false without querying dedupe when the owner has no marketing opt-in", async () => {
  const queries = [];
  const db = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (/FROM businesses b\s+JOIN users u/i.test(sql)) {
        return { rowCount: 1, rows: [{ user_id: null, email: "owner@example.com", business_name: "Test Business", marketing_email_opt_in: false }] };
      }
      return { rows: [], rowCount: 0 };
    }
  };
  const resendClient = makeResendClient();

  const sent = await sendExportGeneratedEmail(
    { businessId: BUSINESS_ID, exportType: "pdf", startDate: "2026-01-01", endDate: "2026-01-31" },
    { db, resendClient }
  );

  assert.equal(sent, false);
  assert.equal(resendClient.sent.length, 0);
  assert.ok(!queries.some((q) => /email_delivery_dedupe/i.test(q.sql)));
});

test("two separate exports for the same date range each get their own email, keyed by exportId", async () => {
  const { db } = makeStatefulDb();
  const resendClient = makeResendClient();

  const first = await sendExportGeneratedEmail(
    {
      businessId: BUSINESS_ID,
      exportType: "pdf",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      exportId: "export-aaaa-1111",
    },
    { db, resendClient },
  );
  const second = await sendExportGeneratedEmail(
    {
      businessId: BUSINESS_ID,
      exportType: "pdf",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      exportId: "export-bbbb-2222",
    },
    { db, resendClient },
  );

  assert.equal(first, true, "the first export's email should send");
  assert.equal(
    second,
    true,
    "a second, genuinely separate export for the identical date range must not be suppressed as a false duplicate",
  );
  assert.equal(resendClient.sent.length, 2);
});

test("retrying the same export operation (same exportId) is suppressed as a real duplicate", async () => {
  const { db } = makeStatefulDb();
  const resendClient = makeResendClient();

  const params = {
    businessId: BUSINESS_ID,
    exportType: "pdf",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    exportId: "export-cccc-3333",
  };

  const first = await sendExportGeneratedEmail(params, { db, resendClient });
  // Same exportId sent again -- e.g. a duplicate invocation of the same
  // best-effort side effect for the export that was actually already
  // recorded, not a new generation.
  const retry = await sendExportGeneratedEmail(params, { db, resendClient });

  assert.equal(first, true);
  assert.equal(retry, false, "resending for the exact same exportId must be treated as a duplicate, not a new export");
  assert.equal(resendClient.sent.length, 1);
});

test("two separate failed export attempts for the same date range each get their own email, keyed by exportAttemptId", async () => {
  const { db } = makeStatefulDb();
  const resendClient = makeResendClient();

  const first = await sendExportFailedEmail(
    {
      businessId: BUSINESS_ID,
      exportType: "pdf",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      reason: "PDF generation timed out",
      exportAttemptId: "attempt-aaaa-1111",
    },
    { db, resendClient },
  );
  const second = await sendExportFailedEmail(
    {
      businessId: BUSINESS_ID,
      exportType: "pdf",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      reason: "PDF generation timed out",
      exportAttemptId: "attempt-bbbb-2222",
    },
    { db, resendClient },
  );

  assert.equal(first, true);
  assert.equal(
    second,
    true,
    "a later, separate failed attempt with the identical reason and date range must still notify the owner",
  );
  assert.equal(resendClient.sent.length, 2);
});

test("retrying the same failed export attempt (same exportAttemptId) is suppressed as a real duplicate", async () => {
  const { db } = makeStatefulDb();
  const resendClient = makeResendClient();

  const params = {
    businessId: BUSINESS_ID,
    exportType: "pdf",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    reason: "PDF generation timed out",
    exportAttemptId: "attempt-cccc-3333",
  };

  const first = await sendExportFailedEmail(params, { db, resendClient });
  const retry = await sendExportFailedEmail(params, { db, resendClient });

  assert.equal(first, true);
  assert.equal(retry, false, "resending for the exact same exportAttemptId must be treated as a duplicate");
  assert.equal(resendClient.sent.length, 1);
});
