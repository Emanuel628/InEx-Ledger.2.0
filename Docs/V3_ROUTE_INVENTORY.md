# V3 Route Inventory

Phase 0 status: complete.

This file is the freeze and map artifact for the move to one product, one UI, and one URL. It is intentionally operational: if a route is not listed here, do not migrate, delete, or add parallel behavior until this inventory is updated and verified.

## Stop Rules

- Do not add new product features to active `public/html` or `public/js` app pages.
- Do not add a v3 page or v3 API helper without a wiring test assertion.
- Do not make `/app-v3/*` a second canonical product URL.
- Do not delete legacy HTML just because v3 exists. First prove parity, redirect, then delete or archive in a separate phase.
- Every change should reduce dual truth or explicitly document why it is temporary.

## Route Groups

- App core: must become v3-only.
- Auth bridge: legacy is allowed short-term only when `next` returns to the canonical v3 app path.
- Marketing and SEO: legacy can remain longer because it is not logged-in product chrome.
- Business tier locked pages: not part of Pro-tier v3 parity yet; keep gated until intentionally built.

## App Core Matrix

| Path | Served today | v3 page | Legacy HTML | API wired | Keep as legacy |
| --- | --- | --- | --- | --- | --- |
| `/transactions` | SPA | yes | `transactions.html` exists | yes | no |
| `/accounts` | SPA | yes | `accounts.html` exists | yes | no |
| `/categories` | SPA | yes | `categories.html` exists | yes | no |
| `/receipts` | SPA | yes | `receipts.html` exists | yes | no |
| `/mileage` | SPA | yes | `mileage.html` exists | yes | no |
| `/exports` | SPA | yes | `exports.html` exists | yes | no |
| `/invoices` | SPA | yes | `invoices.html` exists | yes | no |
| `/analytics` | SPA | yes | `analytics.html` exists | yes | no |
| `/messages` | SPA | yes | `messages.html` exists | yes | no |
| `/settings` | SPA | yes | `settings.html`, `settings-mobile.html` exist | yes | no |
| `/billing` | SPA | yes | no active `billing.html` | yes | no |
| `/subscription` | SPA | yes | `subscription.html` exists | yes | no |
| `/sessions` | SPA | yes | `sessions.html` exists | yes | no |
| `/change-email` | SPA | yes | `change-email.html` exists | yes | no |
| `/onboarding` | SPA | yes | `onboarding.html` exists | yes | no |
| `/help` | SPA | yes | `help.html` exists | partial/help content | no |
| `/upgrade` | SPA | yes | `upgrade.html` exists | yes | no |
| `/trial-setup` | legacy route today | v3 page exists but not in server v3 page set yet | `trial-setup.html` exists | partial | temporary legacy bridge |
| `/review` | legacy HTML today | no active v3 page in sidebar | `review.html` exists | legacy | temporary legacy bridge |

## Auth Bridge Matrix

| Path | Served today | v3 page | Legacy HTML | API wired | Keep as legacy |
| --- | --- | --- | --- | --- | --- |
| `/login` | legacy HTML | v3 component exists but redirects to legacy | `login.html` exists | yes | temporary |
| `/register` | legacy HTML | v3 component exists but redirects to legacy | `register.html` exists | yes | temporary |
| `/forgot-password` | legacy HTML | v3 component exists but redirects to legacy | `forgot-password.html` exists | yes | temporary |
| `/reset-password` | legacy HTML | v3 component exists but redirects to legacy | `reset-password.html` exists | yes | temporary |
| `/mfa-challenge` | legacy HTML | v3 component exists but redirects to legacy login/MFA flow | `mfa-challenge.html` exists | yes | temporary |
| `/verify-email` | legacy HTML | v3 component exists | `verify-email.html` exists | partial | temporary |

## Marketing And SEO Matrix

| Path | Served today | v3 page | Legacy HTML | API wired | Keep as legacy |
| --- | --- | --- | --- | --- | --- |
| `/` | legacy landing | v3 landing exists | `landing.html` exists | n/a | yes |
| `/pricing` | legacy/public route | v3 pricing exists | `pricing.html` exists | n/a | yes |
| `/legal` | legacy/public route | v3 legal exists | `legal.html` exists | n/a | yes |
| `/privacy` | legacy/public route | v3 privacy exists | `privacy.html` exists | n/a | yes |
| `/terms` | legacy/public route | v3 terms exists | `terms.html` exists | n/a | yes |
| `/schedule-c-bookkeeping` | legacy SEO | no | `schedule-c-bookkeeping.html` exists | n/a | yes |
| `/t2125-bookkeeping-canada` | legacy SEO | no | `t2125-bookkeeping-canada.html` exists | n/a | yes |
| `/quickbooks-alternative-for-solo-operators` | legacy SEO | no | `quickbooks-alternative-for-solo-operators.html` exists | n/a | yes |
| `/spreadsheet-alternative-bookkeeping` | legacy SEO | no | `spreadsheet-alternative-bookkeeping.html` exists | n/a | yes |
| `/cpa-ready-export` | legacy SEO | no | `cpa-ready-export.html` exists | n/a | yes |
| `/redacted-export-history` | legacy SEO | no | `redacted-export-history.html` exists | n/a | yes |
| `/invoice-replies-bookkeeping` | legacy SEO | no | `invoice-replies-bookkeeping.html` exists | n/a | yes |
| `/estimated-tax-reminders` | legacy SEO | no | `estimated-tax-reminders.html` exists | n/a | yes |

## Business Tier Locked Matrix

These pages are intentionally not Pro-tier v3 parity yet. They should remain locked or redirected until the Business tier is built deliberately.

| Path | Served today | v3 page | Legacy HTML | API wired | Keep as legacy |
| --- | --- | --- | --- | --- | --- |
| `/customers` | gated legacy/business tier | placeholder/locked only | `customers.html` exists | business tier | yes, gated |
| `/vendors` | gated legacy/business tier | placeholder/locked only | `vendors.html` exists | business tier | yes, gated |
| `/projects` | gated legacy/business tier | placeholder/locked only | `projects.html` exists | business tier | yes, gated |
| `/bills` | gated legacy/business tier | placeholder/locked only | `bills.html` exists | business tier | yes, gated |
| `/ar-ap` | gated legacy/business tier | placeholder/locked only | `ar-ap.html` exists | business tier | yes, gated |
| `/billable-expenses` | gated legacy/business tier | placeholder/locked only | `billable-expenses.html` exists | business tier | yes, gated |

## Phase 0 Completeness Review

- App-core routes are identified.
- Auth routes are identified as a temporary bridge.
- Marketing and SEO routes are identified as safe legacy.
- Business-tier routes are identified as intentionally gated.
- Legacy HTML files that still overlap with v3 app-core routes are visible and queued for Phase 2 quarantine/removal.
- Stop rules are documented.
- `tests/routeInventory.test.js` verifies this inventory covers all server-declared v3 app pages.
