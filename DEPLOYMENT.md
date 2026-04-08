# InEx Ledger - Deployment Checklist

Use this checklist every time you deploy to production to ensure nothing is missed.

---

## Pre-Deployment

### Environment Variables
- [ ] `DATABASE_URL` is set and points to the production database
- [ ] `DB_SSL_REJECT_UNAUTHORIZED` is set appropriately (`true` for production)
- [ ] `JWT_SECRET` is a strong random string (>= 32 characters), unique to production
- [ ] `JWT_EXPIRY_SECONDS` is set (default: 900)
- [ ] `EXPORT_GRANT_SECRET` is a strong random string, unique to production
- [ ] `EXPORT_GRANT_TTL_MS` is set (default: 300000)
- [ ] `RESEND_API_KEY` is set with a valid Resend API key
- [ ] `EMAIL_FROM` is set to a verified sender address
- [ ] `APP_BASE_URL` is set to the public app origin, for example `https://inexledger.com`
- [ ] `FRONTEND_URL` is set when older flows still expect it
- [ ] `DEFAULT_TRIAL_DAYS` is set as intended (default: 30)
- [ ] `STRIPE_SECRET_KEY` is set
- [ ] `STRIPE_PRICE_V1_MONTHLY` is set to the live recurring price id
- [ ] `STRIPE_WEBHOOK_SECRET` is set from the Stripe webhook endpoint
- [ ] `STRIPE_API_VERSION` matches the version used by the app
- [ ] `NODE_ENV` is set to `production`
- [ ] `PORT` is set (default: 8080)

### Security Review
- [ ] No `.env` files are committed to the repository
- [ ] CORS `ALLOWED_ORIGINS` in `server.js` contains only expected production origins
- [ ] Content Security Policy is enabled and not globally disabled
- [ ] Rate limiting is configured on all auth endpoints
- [ ] Database SSL is enforced (`DB_SSL_REJECT_UNAUTHORIZED=true`)

### Database
- [ ] Production database backup has been taken
- [ ] All pending migrations have been reviewed
- [ ] Migration rollback plan is documented for this release

### Frontend Bundle
- [ ] Verify `In-Ex-Ledger-API/public/html/landing.html` is present and up to date
- [ ] Verify `In-Ex-Ledger-API/public/html/settings.html` is present and up to date
- [ ] Verify static assets (CSS, JS, images) are present in `In-Ex-Ledger-API/public/`
- [ ] Ignore the repo-root `public/` legacy mirror when validating the live bundle; Railway serves from `In-Ex-Ledger-API/public/`

---

## Deployment Steps

1. Pull latest code to the server / push to Railway/Render/etc.
2. Install dependencies: `npm install --omit=dev`
3. Restart the application process (or rely on the platform auto-restart)
4. Monitor logs for any startup errors

---

## Post-Deployment Verification

- [ ] `GET /health` returns `{"status":"healthy"}`
- [ ] Landing page loads at `/`
- [ ] Login endpoint responds (does not return 500)
- [ ] `GET /api/billing/subscription` responds for an authenticated user
- [ ] Stripe checkout starts from `/html/subscription.html`
- [ ] Stripe billing portal opens for an active customer
- [ ] A test transaction can be created and retrieved
- [ ] Receipt upload completes for a file > 1 MB
- [ ] Export grant flow completes without errors
- [ ] No sensitive data (tax IDs, EINs) appears in logs (`npm run log_scan`)
- [ ] No non-redacted PDFs in `storage/exports/` (`npm run verify:redacted-storage`)

---

## Rollback Plan

1. Redeploy the previous release tag
2. If a database migration was applied, run the corresponding `DOWN` migration (if available)
3. Restore database from pre-deployment backup if data integrity is at risk
4. Notify affected users if data loss occurred

---

## Remaining Product Hardening

| Feature | Status | Blocks |
|---------|--------|--------|
| Stripe production secrets configured in Railway | Pending | Live billing activation |
| Stripe webhook endpoint verified against production deploy | Pending | Subscription sync reliability |
| Full end-to-end regression coverage for auth, billing, settings | Pending | Safer releases |
| Locked accounting periods | Pending | Audit-grade accounting controls |
| Immutable delete/archive path for transactions | Pending | Audit-grade accounting controls |

> Billing code, MFA, and server-side subscription state already exist in the app. The remaining work is production configuration, verification, and audit hardening.
