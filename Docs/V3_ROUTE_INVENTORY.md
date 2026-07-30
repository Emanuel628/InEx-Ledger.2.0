# V3 Route Inventory

Phase 0 status: complete.
Phase 1 (canonical bare URLs): complete. Client `pushState` and `login?next=` use `/transactions`-style paths; `/app-v3` and `/app-v3/<page>` 301 to bare paths; assets remain under `/app-v3/assets`.
Phase 2 (one active app UI): complete. Migrated app-core legacy HTML files moved from active `public/html` into `In-Ex-Ledger-API/legacy/public-html/app-core`; old `.html` URLs redirect to canonical v3 routes.
Phase 3 (one auth door, Strategy A): complete. Login, register, forgot/reset password, email verification, and MFA challenge are served by the v3 SPA with a real MFA-required login flow and register -> verify-email polling flow; expired-session, idle, and auth-guard redirects preserve canonical v3 `next` paths.
Phase 4 (data plane correctness): complete. Transactions uses server-driven `limit`/`offset`, API filter query params, API summary totals, id-based saves, CSRF retry, and reachable high-page pagination. Accounts no longer scans a capped transaction window for counts.

This file is the freeze and map artifact for the move to one product, one UI, and one URL. It is intentionally operational: if a route is not listed here, do not migrate, delete, or add parallel behavior until this inventory is updated and verified.

## Stop Rules

- Do not add new product features to active `public/html` or `public/js` app pages.
- Do not add a v3 page or v3 API helper without a wiring test assertion.
- Do not make `/app-v3/*` a second canonical product URL (page hosts only; assets may live under `/app-v3/assets`).
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
| `/transactions` | SPA | yes | `transactions.html` archived | yes | no |
| `/accounts` | SPA | yes | `accounts.html` archived | yes | no |
| `/categories` | SPA | yes | `categories.html` archived | yes | no |
| `/receipts` | SPA | yes | `receipts.html` archived | yes | no |
| `/mileage` | SPA | yes | `mileage.html` archived | yes | no |
| `/exports` | SPA | yes | `exports.html` archived | yes | no |
| `/invoices` | SPA | yes | `invoices.html` archived | yes | no |
| `/analytics` | SPA | yes | `analytics.html` archived | yes | no |
| `/messages` | SPA | yes | `messages.html` archived | yes | no |
| `/settings` | SPA | yes | `settings.html`, `settings-mobile.html` archived | yes | no |
| `/billing` | SPA | yes | no active `billing.html` | yes | no |
| `/subscription` | SPA | yes | `subscription.html` archived | yes | no |
| `/sessions` | SPA | yes | `sessions.html` archived | yes | no |
| `/change-email` | SPA | yes | `change-email.html` archived | yes | no |
| `/onboarding` | SPA | yes | `onboarding.html` archived | yes | no |
| `/help` | SPA | yes | `help.html` archived | partial/help content | no |
| `/upgrade` | SPA | yes | `upgrade.html` archived | yes | no |
| `/trial-setup` | SPA | yes | `trial-setup.html` archived | partial | no |
| `/review` | legacy HTML today | no active v3 page in sidebar | `review.html` exists | legacy | temporary legacy bridge |

Deprecated: `/app-v3` -> `/transactions`; `/app-v3/<slug>` -> `/<slug>` (301).

## Auth Bridge Matrix

| Path | Served today | v3 page | Legacy HTML | API wired | Keep as legacy |
| --- | --- | --- | --- | --- | --- |
| `/login` | SPA | yes, with real MFA-required handoff to `/mfa-challenge` | `login.html` unreachable, still on disk | yes | no |
| `/register` | SPA | yes, hands off to `/verify-email` | `register.html` unreachable, still on disk | yes | no |
| `/forgot-password` | SPA | yes | `forgot-password.html` unreachable, still on disk | yes | no |
| `/reset-password` | SPA | yes | `reset-password.html` unreachable, still on disk | yes | no |
| `/mfa-challenge` | SPA | yes, verifies against `/api/auth/mfa/verify` for login and `/api/auth/confirm-email-change` for email changes | `mfa-challenge.html` unreachable, still on disk | yes | no |
| `/verify-email` | SPA | yes, polls `/api/check-email-verified` and completes via `/api/auth/complete-verified-signup` | `verify-email.html` unreachable, still on disk | yes | no |

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
- Legacy HTML files that overlap with v3 app-core routes are visible and queued for Phase 2 archive/removal.
- Stop rules are documented.
- `tests/routeInventory.test.js` verifies this inventory covers all server-declared v3 app pages.

## Phase 1 Completeness Review

- Bare app routes are canonical.
- `/app-v3` page hosts redirect to canonical bare routes.
- Built assets remain under `/app-v3/assets`.
- `login?next=` uses bare app routes.

## Phase 2 Completeness Review

- Migrated app-core HTML files are no longer active under `public/html`.
- Archived copies are kept under `In-Ex-Ledger-API/legacy/public-html/app-core`.
- Canonical app routes still serve the v3 shell.
- Old `/html/<page>`, `/html/<page>.html`, and `/<page>.html` app URLs redirect to canonical v3 routes.
- `settings-mobile.html` redirects to `/settings`.
- `tests/v3LegacyHtmlRetirement.test.js` verifies the archive and redirects.

## Phase 3 Completeness Review

- Auth pages remain intentionally legacy for Strategy A.
- Stale `/app-v3` `next` values canonicalize to bare paths before login or MFA return.
- Expired, idle, network, and unauthenticated guard redirects include `next`.
- API-triggered 401 redirects use `/login?reason=expired&next=<canonical>`.
- `tests/authBridgeRedirects.test.js` verifies the legacy auth bridge.

## Phase 4 Completeness Review

- Transactions list requests include `limit`, `offset`, search, account, category, status, and date range filters.
- Transactions KPIs use the API `summary`, not a client-side reduction of the current page.
- Transaction and recurring saves send account/category ids to the API.
- CSV import keeps the legacy account and date range safeguards.
- Pagination no longer renders only the first five pages; first, nearby, and last pages remain reachable for large ledgers.
- Accounts list rows receive `transaction_count` from `/api/accounts`, instead of loading `/api/transactions?limit=500&offset=0` and reducing locally.
- `tests/transactionsListFilters.test.js` and `tests/frontendV3Wiring.test.js` verify the route and UI contracts.

## Post-Phase-4 Data Plane Fixes

Additional data-plane correctness fixes landed on other app-core pages after Phase 4 closed:

- Invoices: `invoices_v1` gained an independent `title` column so editing the line item description no longer overwrites the invoice title; outbound invoice emails support file attachments.
- Receipts: the receipt list JOIN now excludes soft-deleted (`deleted_at`) transactions, so a receipt correctly flips to "Unlinked" once its linked transaction is deleted.
- Exports: CSV history downloads are regenerated on demand from `export_metadata` instead of relying on a persisted file (only PDF redacted files were ever persisted).
- Messages: delete and archive now clear both sender- and receiver-side visibility flags for self-authored rows (`sender_id === receiver_id`, e.g. compose/invoice/notification copies), fixing rows that previously stayed visible in the Sent lane forever.
- Accounts: the account-type `<select>` now sets an explicit `value` on every `<option>`, so translated display text can never leak into the submitted account type.
