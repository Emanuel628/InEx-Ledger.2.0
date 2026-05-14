"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

function withEnv(overrides, fn) {
  const before = {};
  for (const key of Object.keys(overrides)) {
    before[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(before)) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  }
}

const {
  buildInvoiceEmailBody,
  buildReplyToken,
  parseReplyToken,
  buildReplyToAddress,
  extractTokenFromRecipient,
  sendInvoiceEmail,
  getInvoiceFromEmail
} = require("../services/invoiceEmailService.js");

const SAMPLE_INVOICE = {
  id: "11111111-1111-4111-8111-111111111111",
  invoice_number: "INV-2026-0001",
  customer_name: "Acme Co",
  customer_email: "billing@acme.com",
  issue_date: "2026-05-10",
  due_date: "2026-05-31",
  currency: "USD",
  line_items: [
    { description: "Consulting", quantity: 4, unit_price: 250, amount: 1000 }
  ],
  subtotal: 1000,
  tax_rate: 0.13,
  tax_amount: 130,
  total_amount: 1130
};

test("getInvoiceFromEmail falls back through INVOICE_FROM_EMAIL -> RESEND_FROM_EMAIL -> EMAIL_FROM", () => {
  withEnv({ INVOICE_FROM_EMAIL: undefined, RESEND_FROM_EMAIL: undefined, EMAIL_FROM: undefined }, () => {
    assert.ok(getInvoiceFromEmail().includes("invoices@inexledger.com"));
  });
  withEnv({ INVOICE_FROM_EMAIL: undefined, RESEND_FROM_EMAIL: "no-reply@app.com", EMAIL_FROM: "old@app.com" }, () => {
    assert.equal(getInvoiceFromEmail(), "no-reply@app.com");
  });
  withEnv({ INVOICE_FROM_EMAIL: "InEx <pay@inex.app>", RESEND_FROM_EMAIL: "x@x.com" }, () => {
    assert.equal(getInvoiceFromEmail(), "InEx <pay@inex.app>");
  });
});

test("buildReplyToken returns plain id when no HMAC secret configured", () => {
  withEnv({ INVOICE_REPLY_HMAC_SECRET: undefined, CSRF_SECRET: undefined }, () => {
    assert.equal(buildReplyToken(SAMPLE_INVOICE.id), SAMPLE_INVOICE.id.replace(/-/g, "").toLowerCase());
  });
});

test("buildReplyToken + parseReplyToken round-trip with HMAC secret", () => {
  withEnv({ INVOICE_REPLY_HMAC_SECRET: "test-hmac-secret-32-bytes-long-aaaaaaaa" }, () => {
    const token = buildReplyToken(SAMPLE_INVOICE.id);
    assert.notEqual(token, SAMPLE_INVOICE.id, "token should include a signature segment");
    assert.equal(parseReplyToken(token), SAMPLE_INVOICE.id);
  });
});

test("parseReplyToken rejects tampered signature", () => {
  withEnv({ INVOICE_REPLY_HMAC_SECRET: "test-hmac-secret-32-bytes-long-aaaaaaaa" }, () => {
    const token = buildReplyToken(SAMPLE_INVOICE.id);
    const tampered = token.replace(/.$/, (c) => (c === "A" ? "B" : "A"));
    assert.equal(parseReplyToken(tampered), null);
  });
});

test("parseReplyToken rejects malformed input when no secret is configured", () => {
  withEnv({ INVOICE_REPLY_HMAC_SECRET: undefined, CSRF_SECRET: undefined }, () => {
    assert.equal(parseReplyToken(""), null);
    assert.equal(parseReplyToken(null), null);
    assert.equal(parseReplyToken("not-a-uuid"), null);
    // Without a secret, the signature segment is not verified — we still
    // accept a token whose head is a valid UUID. This is the documented
    // lenient mode for environments that haven't set INVOICE_REPLY_HMAC_SECRET yet.
    assert.equal(parseReplyToken("11111111-1111-4111-8111-111111111111.bogus"), "11111111-1111-4111-8111-111111111111");
  });
});

test("parseReplyToken rejects a tampered signature segment when secret IS configured", () => {
  withEnv({ INVOICE_REPLY_HMAC_SECRET: "test-hmac-secret-32-bytes-long-aaaaaaaa" }, () => {
    assert.equal(parseReplyToken("11111111-1111-4111-8111-111111111111.bogus"), null);
    assert.equal(parseReplyToken("11111111-1111-4111-8111-111111111111"), null, "missing signature must be rejected");
  });
});

test("buildReplyToAddress is null when INVOICE_REPLY_BASE_EMAIL is not set", () => {
  withEnv({ INVOICE_REPLY_BASE_EMAIL: undefined }, () => {
    assert.equal(buildReplyToAddress(SAMPLE_INVOICE.id), null);
  });
});

test("buildReplyToAddress plus-addresses the configured base", () => {
  withEnv({
    INVOICE_REPLY_BASE_EMAIL: "invoices@inexledger.com",
    INVOICE_REPLY_HMAC_SECRET: undefined,
    CSRF_SECRET: undefined
  }, () => {
    const addr = buildReplyToAddress(SAMPLE_INVOICE.id);
    assert.equal(addr, `invoices+${SAMPLE_INVOICE.id.replace(/-/g, "").toLowerCase()}@inexledger.com`);
  });
});

test("extractTokenFromRecipient pulls the plus-addressed token", () => {
  assert.equal(
    extractTokenFromRecipient("invoices+token-abc@inexledger.com"),
    "token-abc"
  );
  assert.equal(
    extractTokenFromRecipient('"Inbox" <invoices+xyz@inexledger.com>'),
    "xyz"
  );
});

test("extractTokenFromRecipient returns null for non-plus-addressed recipients", () => {
  assert.equal(extractTokenFromRecipient("invoices@inexledger.com"), null);
  assert.equal(extractTokenFromRecipient(""), null);
  assert.equal(extractTokenFromRecipient(null), null);
});

test("extractTokenFromRecipient + parseReplyToken round-trip", () => {
  withEnv({
    INVOICE_REPLY_BASE_EMAIL: "invoices@inexledger.com",
    INVOICE_REPLY_HMAC_SECRET: "test-hmac-secret-32-bytes-long-aaaaaaaa"
  }, () => {
    const addr = buildReplyToAddress(SAMPLE_INVOICE.id);
    const token = extractTokenFromRecipient(addr);
    assert.equal(parseReplyToken(token), SAMPLE_INVOICE.id);
  });
});

test("buildInvoiceEmailBody contains invoice number, total, and line items", () => {
  const body = buildInvoiceEmailBody({
    invoice: SAMPLE_INVOICE,
    businessName: "Sample Co",
    senderName: "Jane Owner",
    customMessage: "Hi — see attached."
  });
  assert.ok(body.subject.includes("INV-2026-0001"));
  assert.ok(body.subject.includes("$1,130.00"));
  assert.ok(body.html.includes("Consulting"));
  assert.ok(body.html.includes("$1,000.00"));
  assert.ok(body.html.includes("$1,130.00"));
  assert.ok(body.text.includes("Consulting"));
  assert.ok(body.text.includes("Hi — see attached."));
});

test("buildInvoiceEmailBody handles line_items stored as a JSON string", () => {
  const stringy = { ...SAMPLE_INVOICE, line_items: JSON.stringify(SAMPLE_INVOICE.line_items) };
  const body = buildInvoiceEmailBody({ invoice: stringy, businessName: "X" });
  assert.ok(body.html.includes("Consulting"));
});

test("sendInvoiceEmail throws 503 when no resend client is provided", async () => {
  await assert.rejects(
    () => sendInvoiceEmail(null, { invoice: SAMPLE_INVOICE, recipientEmail: "to@x.com", businessName: "X" }),
    (err) => err.status === 503 && err.code === "email_not_configured"
  );
});

test("sendInvoiceEmail rejects missing or malformed recipient", async () => {
  const stub = { emails: { send: async () => ({ data: { id: "id" } }) } };
  await assert.rejects(
    () => sendInvoiceEmail(stub, { invoice: SAMPLE_INVOICE, recipientEmail: "", businessName: "X" }),
    (err) => err.status === 400
  );
  await assert.rejects(
    () => sendInvoiceEmail(stub, { invoice: SAMPLE_INVOICE, recipientEmail: "no-at-sign", businessName: "X" }),
    (err) => err.status === 400
  );
});

test("sendInvoiceEmail passes from, to, subject, reply_to to the Resend client", async () => {
  const calls = [];
  const stub = {
    emails: {
      async send(payload) {
        calls.push(payload);
        return { data: { id: "resend-id-1" } };
      }
    }
  };
  await withEnv({
    INVOICE_FROM_EMAIL: "InEx <pay@inex.app>",
    INVOICE_REPLY_BASE_EMAIL: "invoices@inex.app",
    INVOICE_REPLY_HMAC_SECRET: undefined,
    CSRF_SECRET: undefined
  }, async () => {
    const result = await sendInvoiceEmail(stub, {
      invoice: SAMPLE_INVOICE,
      recipientEmail: "billing@acme.com",
      businessName: "Sample Co",
      senderName: "Jane"
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].from, "InEx <pay@inex.app>");
    assert.equal(calls[0].to, "billing@acme.com");
    assert.ok(calls[0].subject.includes("INV-2026-0001"));
    assert.equal(
      calls[0].reply_to,
      `Sample Co Billing <invoices+${SAMPLE_INVOICE.id.replace(/-/g, "").toLowerCase()}@inex.app>`
    );
    assert.equal(result.data.id, "resend-id-1");
  });
});
