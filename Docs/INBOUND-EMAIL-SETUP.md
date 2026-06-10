# Inbound email replies (Resend Inbound)

Outbound invoice/support emails work as soon as `RESEND_API_KEY` and a verified
sending domain are configured. **Inbound replies are a separate system** and do
not work until the steps below are done. The most common symptom of a missing
step is: *the customer replies, but nothing ever reaches Resend and nothing ever
hits `/api/email/inbound`.* That is almost always a delivery/configuration gap,
not an application bug — the request handler only runs once Resend forwards the
mail.

## How a reply flows back into the app

1. An outbound invoice is sent with a plus-addressed `Reply-To`, e.g.
   `invoices+<token>@reply.inexledger.com`, where `<token>` encodes the invoice
   id (`services/invoiceEmailService.js`).
2. The customer replies. Their mail server delivers to the **MX records** of the
   reply domain.
3. If those MX records point at Resend, Resend stores the email and fires an
   `email.received` webhook to `POST /api/email/inbound`.
4. The handler verifies the Svix signature, fetches the body via
   `resend.emails.receiving.get(email_id)`, matches the token to the invoice (or
   support thread), and inserts a message so it appears on the Messages page.

If any of steps 2–4 is not wired, the reply silently never appears.

## Required configuration

### 1. DNS — MX records (so Resend can RECEIVE the reply)
Add MX records for the reply domain in Resend. Resend recommends a dedicated
**subdomain** (e.g. `reply.inexledger.com`) so it doesn't disturb existing mail
on the root domain. Sending DKIM/SPF on the root domain does **not** give you
inbound — this is a separate record set.

> Do not use the `noreply@` sending address for replies — that domain typically
> has no inbound MX and will black-hole every reply.

### 2. Resend webhook (so Resend POSTs to the app)
Create a webhook in the Resend dashboard:
- **Event:** `email.received`
- **Endpoint:** `https://<your-api-host>/api/email/inbound`
- Copy the signing secret (`whsec_...`).

### 3. Environment variables
| Variable | Purpose |
| --- | --- |
| `INVOICE_REPLY_BASE_EMAIL` | Reply-To base address, on the **inbound (MX) domain**. Required, or no Reply-To is set and replies go to the noreply From address. |
| `INBOUND_EMAIL_WEBHOOK_SECRET` | The Resend/Svix signing secret (`whsec_...`). Without it the webhook is rejected (503/401). |
| `INVOICE_REPLY_HMAC_SECRET` | Signs the reply token (falls back to `CSRF_SECRET`). |
| `SUPPORT_REPLY_BASE_EMAIL` *(optional)* | Same wiring for support-thread replies. |
| `SUPPORT_INBOUND_WEBHOOK_SECRET` *(optional)* | Separate secret for the support webhook; falls back to `INBOUND_EMAIL_WEBHOOK_SECRET`. |

A single Resend webhook to `/api/email/inbound` handles **both** invoice and
support replies — that route checks both token types.

## Verifying

Hit the authenticated diagnostics endpoint and check `email.inbound`:

```
GET /api/system/diagnostics
```
```jsonc
"email": {
  "configured": true,
  "from_configured": true,
  "inbound": {
    "ready": true,                                  // all reply vars present
    "invoice_reply_routing_configured": true,       // INVOICE_REPLY_BASE_EMAIL set
    "support_reply_routing_configured": true,
    "webhook_secret_configured": true,              // INBOUND_EMAIL_WEBHOOK_SECRET set
    "reply_token_secret_configured": true,
    "reply_domain_differs_from_send_domain": true   // reply domain != noreply send domain (expected)
  }
}
```

If `ready` is `false`, the corresponding variable is missing. If
`reply_domain_differs_from_send_domain` is `false`, your Reply-To is on the same
domain as your `noreply@` From address — confirm that domain actually has
inbound MX records, otherwise replies will never reach Resend.

The endpoint returns booleans only and never the secret/address values.

## Quick end-to-end check
1. `/api/system/diagnostics` → `email.inbound.ready === true`.
2. Send a test invoice to yourself; confirm the `Reply-To` header is
   `invoices+<token>@<your-inbound-domain>`.
3. Reply to it. Within a moment the reply should appear in the Resend dashboard
   (proves MX + receiving) and as a message in-app (proves the webhook + handler).
4. If it shows in Resend but not in-app, the webhook/secret is the gap; if it
   never shows in Resend, the MX/reply-domain is the gap.
