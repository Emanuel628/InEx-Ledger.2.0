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
