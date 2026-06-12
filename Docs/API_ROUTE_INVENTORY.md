# API Route Inventory

Last reviewed: 2026-06-12

This inventory documents the mounted API surface from [server.js](/c:/Projects/InEx-Ledger.2.0/In-Ex-Ledger-API/server.js) and [routes/index.js](/c:/Projects/InEx-Ledger.2.0/In-Ex-Ledger-API/routes/index.js). It is intended as a security and operations reference, not a full endpoint-by-endpoint API spec.

## Global API Controls

These controls apply before most route modules:

| Control | Scope | Notes |
|---|---|---|
| `helmet` | app-wide | CSP, HSTS, referrer/permissions policy, no `x-powered-by`. |
| CORS allowlist | app-wide | Originless unsafe API writes are blocked except for signed webhook endpoints. |
| `cookieParser()` | app-wide | Enables cookie-backed auth and CSRF token reads. |
| `ensureCsrfCookie` | app-wide | Sets a CSRF cookie for browser flows. |
| Global limiter | `/api/*` | Applied in `server.js` via `createGlobalLimiter()`. |
| JSON body size limit | app-wide JSON routes | `express.json({ limit: '100kb' })`, except raw webhook mounts. |
| Raw-body webhook parsing | selected routes | `/api/billing/webhook`, `/api/email/inbound`, `/api/support-email/inbound`. |

## Legend

| Column | Meaning |
|---|---|
| Authn | Primary authentication model used by the mounted route family. |
| Authz / Scope | Main authorization or scope checks beyond authentication. |
| CSRF | Whether mutating browser requests are CSRF-protected at the router level. |
| Rate Limit | Route-local limiter in addition to the global API limiter. |

Authn values:

| Value | Meaning |
|---|---|
| `Public` | No session required. |
| `Cookie Session` | Browser/user auth through `requireAuth`. |
| `Signed Webhook` | HMAC/Svix or provider-signed inbound integration. |
| `Support Secret` | Internal secret header gate for support-only endpoints. |

## Mounted Route Inventory

| Mount Prefix | Source | Authn | Authz / Scope | CSRF | Rate Limit | Notes |
|---|---|---|---|---|---|---|
| `/api/transactions` | `transactions.routes.js` mounted directly in `server.js` | `Cookie Session` | Business-scoped ownership checks, accounting lock checks | Required | `createTransactionLimiter()` | Core transaction CRUD and mapping surface. |
| `/api/auth` | `auth.routes.js` | Mixed: `Public` plus authenticated subflows | MFA state, verified-email checks on selected flows, session rotation | Required on mutating browser flows | Auth/password/MFA/refresh-specific limiters | Login, register, refresh, password reset, MFA, email verification. |
| `/api/internal/support` | `internalSupport.routes.js` | `Support Secret` | Read-only internal support lookups | N/A | None at router level | Never for customer frontend use. |
| `/api/accounts` | `accounts.routes.js` | `Cookie Session` | Business-scoped data access | Required | `createDataApiLimiter()` | Financial account CRUD. |
| `/api/bank-connections` | `bank-connections.routes.js` | `Cookie Session` | Business-scoped | Required | `createDataApiLimiter()` | Linked bank connection management. |
| `/api/email` | `email.routes.js` | Mixed: `Signed Webhook` plus selected user-auth flows | Reply-token validation, invoice ownership, webhook signature validation | Exempt for inbound webhook path; browser mutations protected where applicable | Module-specific | Includes inbound invoice reply processing. |
| `/api/unsubscribe` | `unsubscribe.routes.js` | `Public` | Signed unsubscribe token only | N/A | None at router level | Public one-click optional-email unsubscribe surface. |
| `/api/support-email` | `supportEmail.routes.js` | Mixed: `Signed Webhook` plus selected authenticated support flows | Support reply token validation, thread ownership, webhook signature validation | Exempt for inbound webhook path; browser mutations protected where applicable | Module-specific | Support inbox threading and inbound mail handling. |
| `/api/plaid` | `plaid.routes.js` | Mixed | Authenticated user/business scope on app routes; provider callback handling where applicable | Mixed by route | Module-specific | Plaid link, exchange, sync, and webhook-like surfaces. |
| `/api/receipts` | `receipts.routes.js` | `Cookie Session` | Business-scoped ownership and accounting-period checks | Required | `createReceiptLimiter()` | Receipt upload/download and linking. |
| `/api/support-artifacts` | `supportArtifacts.routes.js` | `Cookie Session` | Business-scoped transaction ownership | Required | `createRouteLimiter({ keyPrefix: "rl:support-artifacts" })` | Supporting evidence uploads and notes. |
| `/api/categories` | `categories.routes.js` | `Cookie Session` | Business-scoped, region-aware category rules | Required | `createDataApiLimiter()` | Category CRUD and filing metadata. |
| `/api/exports` | `exports.routes.js` | `Cookie Session` | Business-scoped, email-verified gate, export grants | Required | Module-specific export protections | Secure export, grant, snapshot, and history operations. |
| `/api/business` | `business.routes.js` | `Cookie Session` | Business-scoped | Required | None at router level | Active business profile operations. |
| `/api/system` | `system.routes.js` | Mixed: `Public` and `Cookie Session` | Public health/links; authenticated diagnostics | Not required for public GETs | `publicSystemLimiter` on public routes | Diagnostics is auth-only. |
| `/api/me` | `me.routes.js` | `Cookie Session` | Current-user and active-business scoped | Required | `createDataApiLimiter()` | Current profile, preferences, onboarding, deletion flows. |
| `/api/crypto` | `crypto.routes.js` | Mixed | Public key and export-crypto support; route-specific checks | Mixed by route | Module-specific | Export crypto bootstrap surfaces. |
| `/api/privacy` | `privacy.routes.js` | `Cookie Session` | Current-user and business data rights flows | Required | `createDataApiLimiter()` | Export/delete/erase/privacy settings. |
| `/api/region` | `region.routes.js` | `Public` | None beyond request inspection | N/A | `detectLimiter` | Region detection helper. |
| `/api/entitlements` | `entitlements.routes.js` | `Cookie Session` | Subscription/plan-derived capabilities | Mixed | None at router level | Plan entitlement checks for UI gating. |
| `/api/mileage` | `mileage.routes.js` | `Cookie Session` | Business-scoped | Required | `createDataApiLimiter()` | Mileage logs, costs, summary. |
| `/api/review` | `review.routes.js` | `Cookie Session` | Business-scoped review queues and fix flows | Required | None at router level | Export/readiness review data. |
| `/api/sessions` | `sessions.routes.js` | `Cookie Session` | Current-user session ownership, MFA-sensitive revocation | Required | `createDataApiLimiter()` | Session list and revoke operations. |
| `/api/billing` | `billing.routes.js` | Mixed | Current-user/business scope, Stripe customer/subscription ownership | Required for browser mutations; webhook exempt | Read limiter, mutation limiter, webhook limiter | Checkout, portal, cancel/reactivate, Stripe webhook. |
| `/api/recurring` | `recurring.routes.js` | `Cookie Session` | Business-scoped plus Pro-plan gating | Required | `createDataApiLimiter({ max: 80 })` | Recurring transaction engine. |
| `/api/businesses` | `businesses.routes.js` | `Cookie Session` | User-owned business roster, Stripe slot sync, MFA-sensitive delete | Required | Module-specific | Multi-business management and add-on provisioning. |
| `/api/analytics` | `analytics.routes.js` | `Cookie Session` | Business-scoped analytics and what-if flows | Required | `createDataApiLimiter()` | Dashboard and forecasting data. |
| `/api/invoices-v1` | `invoices-v1.routes.js` | `Cookie Session` | Business-scoped invoice ownership and messaging | Required | None at router level | Production invoice system used by current app. |
| `/api/messages` | `messages.routes.js` | `Cookie Session` | User/business-scoped mailbox access | Required | `createDataApiLimiter({ max: 120 })` | Support/invoice mailbox and compose flows. |
| `/api/consent` | `consent.routes.js` | Mixed | Optional user association via cookie/access token | Required on mutation | `createRouteLimiter({ keyPrefix: "rl:consent" })` | Cookie-consent logging and persistence. |
| `/api/check-email-verified` | `check-email-verified.routes.js` | `Public` | Signed verification-state token only | N/A | None at router level | Poll/check endpoint for email verification flow. |
| `/api/vehicle-claims` | `vehicleClaims.routes.js` | `Cookie Session` | Business-scoped | Required | None at router level | Vehicle deduction/claim support. |
| `/api/capital-assets` | `capitalAssets.routes.js` | `Cookie Session` | Business-scoped | Required | None at router level | Capital asset support schedules/data. |
| `/api/home-office-worksheet` | `homeOffice.routes.js` | `Cookie Session` | Business-scoped | Required | None at router level | Home-office worksheet support. |
| `/api/vendors` | `vendors.routes.js` when `ENABLE_V2_BUSINESS=true` | `Cookie Session` | V2 feature flag + V2 entitlement + business scope | Required on mutation | `createDataApiLimiter({ keyPrefix: "rl:v2:vendors" })` | Legacy V2 business-tier surface. |
| `/api/customers` | `customers.routes.js` when `ENABLE_V2_BUSINESS=true` | `Cookie Session` | V2 feature flag + V2 entitlement + business scope | Required on mutation | `createDataApiLimiter({ keyPrefix: "rl:v2:customers" })` | Legacy V2 business-tier surface. |
| `/api/invoices` | `invoices.routes.js` when `ENABLE_V2_BUSINESS=true` | `Cookie Session` | V2 feature flag + V2 entitlement + business scope | Required on mutation | Router-level CSRF only | Legacy V2 invoice CRUD surface. |
| `/api/bills` | `bills.routes.js` when `ENABLE_V2_BUSINESS=true` | `Cookie Session` | V2 feature flag + V2 entitlement + business scope | Required on mutation | `createDataApiLimiter({ keyPrefix: "rl:v2:bills" })` | Legacy V2 bill CRUD surface. |
| `/api/projects` | `projects.routes.js` when `ENABLE_V2_BUSINESS=true` | `Cookie Session` | V2 feature flag + V2 entitlement + business scope | Required on mutation | `createDataApiLimiter({ keyPrefix: "rl:v2:projects" })` | Legacy V2 project CRUD surface. |
| `/api/billable-expenses` | `billable-expenses.routes.js` when `ENABLE_V2_BUSINESS=true` | `Cookie Session` | V2 feature flag + V2 entitlement + business scope | Required on mutation | `createDataApiLimiter({ keyPrefix: "rl:v2:billable-expenses" })` | Legacy V2 billable-expense CRUD surface. |

## Special Cases Worth Watching

| Surface | Why it matters |
|---|---|
| `/api/billing/webhook` | Raw-body Stripe webhook; exempt from browser-origin requirements and CSRF because signature verification is the control. |
| `/api/email/inbound` | Raw inbound invoice email webhook; public reachability but signed-request validation required. |
| `/api/support-email/inbound` | Raw inbound support email webhook; public reachability but signed-request validation required. |
| `/api/internal/support/*` | Secret-gated internal support API. Must never be called from the customer frontend. |
| `ENABLE_V2_BUSINESS` mounts | These route families only exist when the V2 business feature flag is enabled. |

## Suggested Next Steps

1. Add a CI check that fails if a new mounted route prefix is added without updating this inventory.
2. Expand this inventory to endpoint granularity for the highest-risk routers: `auth`, `billing`, `exports`, `email`, `support-email`, and `messages`.
3. Link this document from the release/security checklist so route-surface changes get reviewed intentionally.
