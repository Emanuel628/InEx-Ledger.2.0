"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { sendInvoiceOwnerActivityEmail } = require("../services/invoiceOwnerEmailService.js");

const BUSINESS_ID = "00000000-0000-4000-8000-000000000901";

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
        return { data: { id: "email-owner-1" } };
      }
    }
  };
}

test("sendInvoiceOwnerActivityEmail reserves a dedupe key before sending", async () => {
  const { db, queries } = makeDb();
  const resendClient = makeResendClient();

  const sent = await sendInvoiceOwnerActivityEmail(
    {
      businessId: BUSINESS_ID,
      kind: "replied",
      actionUrl: "/messages",
      details: [{ label: "Invoice", value: "INV-001" }]
    },
    { db, resendClient }
  );

  assert.equal(sent, true);
  assert.equal(resendClient.sent.length, 1);

  const reserveCall = queries.find((q) => /INSERT INTO email_delivery_dedupe/i.test(q.sql));
  assert.ok(reserveCall, "expected a dedupe reservation query");
  assert.equal(reserveCall.params[1], "invoice.owner-activity");
  assert.equal(reserveCall.params[2], BUSINESS_ID);
  assert.equal(reserveCall.params[3], "owner@example.com");

  const sentUpdateCall = queries.find((q) => /SET status = 'sent'/i.test(q.sql));
  assert.ok(sentUpdateCall, "expected the dedupe row to be marked sent");
  assert.equal(sentUpdateCall.params[1], "email-owner-1");
});

test("sendInvoiceOwnerActivityEmail skips the send when the dedupe reservation is already taken", async () => {
  const { db } = makeDb({ reserveResult: false });
  const resendClient = makeResendClient();

  const sent = await sendInvoiceOwnerActivityEmail(
    {
      businessId: BUSINESS_ID,
      kind: "replied",
      actionUrl: "/messages",
      details: [{ label: "Invoice", value: "INV-001" }]
    },
    { db, resendClient }
  );

  assert.equal(sent, false);
  assert.equal(resendClient.sent.length, 0, "a duplicate webhook delivery must not re-send the email");
});

test("sendInvoiceOwnerActivityEmail marks the dedupe row failed on provider error", async () => {
  const { db, queries } = makeDb();
  const resendClient = makeResendClient({ shouldError: true });

  const sent = await sendInvoiceOwnerActivityEmail(
    {
      businessId: BUSINESS_ID,
      kind: "replied",
      actionUrl: "/messages",
      details: [{ label: "Invoice", value: "INV-001" }]
    },
    { db, resendClient }
  );

  assert.equal(sent, false);
  const failedUpdateCall = queries.find((q) => /SET status = 'failed'/i.test(q.sql));
  assert.ok(failedUpdateCall, "expected the dedupe row to be marked failed so a retry can reserve again");
});

test("a distinct reply (different body) gets its own dedupe key and is not suppressed", async () => {
  const { db } = makeDb();
  const resendClient = makeResendClient();

  const first = await sendInvoiceOwnerActivityEmail(
    {
      businessId: BUSINESS_ID,
      kind: "replied",
      actionUrl: "/messages",
      details: [{ label: "Reply preview", value: "Looks good, thanks!" }]
    },
    { db, resendClient }
  );
  const second = await sendInvoiceOwnerActivityEmail(
    {
      businessId: BUSINESS_ID,
      kind: "replied",
      actionUrl: "/messages",
      details: [{ label: "Reply preview", value: "Actually, one question..." }]
    },
    { db, resendClient }
  );

  assert.equal(first, true);
  assert.equal(second, true);
  assert.equal(resendClient.sent.length, 2);
});
