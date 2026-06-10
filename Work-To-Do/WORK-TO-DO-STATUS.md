# Work-To-Do Status Review

Reviewed against the current codebase on 2026-05-22 (branch `claude/update-work-to-do-status-Orqxm`).

Legend:

- ✅ `~~crossed out~~` = complete / already resolved in code or documentation
- ⏳ `PARTIAL` = code appears fixed, but live/runtime verification is still needed
- ❌ `INCOMPLETE` = still needs work
- 📝 `PLANNING` = roadmap/design plan, not a launch blocker unless selected for current scope

---

## `Work-To-Do/E2E-FINDINGS-NEW-USER.md`

### Critical bugs

- ✅ ~~Migrations cannot run on a fresh database~~
  - Status: Complete. `db/migrations/007_add_marketing_email_opt_in.sql` is an intentional `DO $$ ... $$` no-op; `026_create_user_privacy_settings.sql` creates the table and owns the `marketing_email_opt_in` column.

- ✅ ~~CSV and PDF exports silently lose every transaction description~~
  - Status: Complete. `routes/exports.routes.js` `fetchExportSourceRows()` now selects `description_encrypted`, decrypts it via `decryptField()`, falls back to plaintext `description`, and strips the ciphertext column from the exported row.

- ✅ ~~`GET /api/receipts` returns 500 for every authenticated user~~
  - Code status: Fixed and re-verified. The list query selects `r.uploaded_at`, exposes `r.uploaded_at AS created_at`, sends `(r.file_bytes IS NOT NULL) AS has_file_bytes` instead of raw bytes, and orders by `r.uploaded_at`.
  - Runtime status: Live production verification completed — `/api/receipts` returns `200`.

- ✅ ~~CSV import silently drops historical rows because of a hidden default date filter~~
  - Status: Complete. `public/js/transactions.js` now sets `startDateInput.value = ""` when the CSV modal opens — no today-date pre-fill.

- ✅ ~~Stripe price env-var names do not match `.env.example` / runtime config~~
  - Status: Complete. Both `.env.example` (root) and `In-Ex-Ledger-API/.env.example` now document `STRIPE_PRO_M_US`, `STRIPE_PRO_Y_US`, `STRIPE_ADDL_M_US`, … which exactly match the keys read by `services/stripePriceConfig.js`. Production env validation requires these via `STRIPE_PRICE_ENTRIES`.
  - Follow-up: yearly Additional Business UI wiring is still tracked in `Docs/PRODUCT-BACKLOG.md`.

- ✅ ~~`CSRF_SECRET` required at runtime but not required in dev validation~~
  - Status: Resolved for launch. `CSRF_SECRET` is set as a Railway environment variable on the API service, so production runtime has it.
  - Note: `envValidationService.js` still only adds `CSRF_SECRET` to the required list when `NODE_ENV === "production"`, and `csrf.middleware.js` still throws if it is missing. This is purely a local dev-experience nicety now, not a launch blocker. Same minor gap applies to `INBOUND_EMAIL_WEBHOOK_SECRET` and `INVOICE_REPLY_HMAC_SECRET` if a future pass wants fail-fast dev startup.

### High-severity functional issues

- ✅ ~~New users cannot export PDF until they hunt down hidden profile fields~~
  - Status: Complete. `public/html/onboarding.html` now collects business activity code, accounting method, material participation ("Are you active in this business?"), and business address as required fields.

- ✅ ~~Privacy-consent persistence fails right after registration~~
  - Status: Resolved. `routes/auth.routes.js` `POST /register` now writes `user_privacy_settings` (with `consent_given = true` and `marketing_email_opt_in`) inside the registration transaction, so consent is persisted server-side regardless of front-end timing.
  - Cleanup note: `public/js/register.js` still fires a redundant `persistConsent()` → `POST /api/privacy/settings` after register that 401s (no token yet) but is caught and only `console.warn`s. It is now dead/no-op code and could be removed for cleanliness.

- ✅ ~~Cookie-banner POST is CSRF-blocked~~
  - Code status: Fixed. `public/js/global.js` `setConsentRecord()` now adds `csrfHeader('POST')` to the `POST /api/consent/cookie` request; the route keeps `requireCsrfProtection`.
  - Runtime status: Verified — the unauthenticated CSRF cookie/token roundtrip succeeds and the `cookie_consent_log` audit row is written.

- ✅ ~~V2 feature pages return raw `Not Found`~~
  - Status: Resolved. `server.js` `isBlockedV2PageRequest()` now `302`-redirects blocked V2 pages (`bills`, `billable-expenses`, `customers`, `vendors`, `projects`, `ar-ap`) to `/settings?feature=v2-business` instead of returning unstyled `Not Found`.

- ✅ ~~`/upgrade` page exposes dev-only Activate Pro button publicly~~
  - Status: Complete. `#mockUpgradeWrap` ships `hidden`; `public/js/upgrade.js` only reveals it after `GET /api/billing/mock-v1` succeeds, i.e. only when `ENABLE_MOCK_BILLING=true`.

- ⏳ PARTIAL / PRODUCT DECISION — Auth-page redirect relies on localStorage bearer token
  - Code status: Improved. `redirectIfAuthenticated()` in `public/js/auth.js` now performs a server `GET /api/me` check (with refresh-token retry) before redirecting, so the redirect itself is server-validated.
  - Open decision: the bearer token in `localStorage` remains a valid credential, so clearing cookies alone does not log a user out. Keeping bearer-token auth vs. moving to cookie/session-authoritative auth is still a product decision.

### Medium UX / hygiene issues

- ❌ INCOMPLETE — CSP `upgrade-insecure-requests` noisy in local HTTP dev
  - The `helmet()` config in `server.js` sets explicit `contentSecurityPolicy.directives` but does not pass `useDefaults: false` or `upgradeInsecureRequests: null`, so helmet still emits `upgrade-insecure-requests`.
- ❌ INCOMPLETE / VERIFY — Cookie banner overlaps content
- ⏳ PARTIAL — Onboarding now asks meaningful required fields, but UX copy/design still needs a final pass
- [x] Login readonly autofill suppression
  - Status: Closed by product decision. The current `readonly` login-field behavior is accepted and is no longer tracked as active work.
- ❌ INCOMPLETE — Account-menu / sign-out discoverability still needs UX pass
- ✅ ~~Pricing/Subscription empty Stripe price data from env mismatch~~
  - Status: Resolved alongside the Stripe env-var name reconciliation above.
- ❌ INCOMPLETE / LOW — Invoice starter line item UX polish
- ❌ INCOMPLETE / LOW — Default income category ordering
- ❌ INCOMPLETE / LOW — Mileage form visibility consistency
- ⏳ PARTIAL — Material participation is required in onboarding, but explanatory copy still needs review
- ❌ INCOMPLETE / LOW — Invoice form field-level server error display

### Suggested fix priority from original file

- ✅ ~~Decrypt `description_encrypted` in exports~~
- ✅ ~~Fix migration 007 ordering~~
- ✅ ~~Receipts endpoint fixed and verified live (`200`)~~
- ✅ ~~Remove silent CSV import today-date default~~
- ✅ ~~Reconcile Stripe env-var names / startup validation~~
- ✅ ~~`CSRF_SECRET` handled via Railway env variable~~ (optional dev fail-fast cleanup only)
- ✅ ~~Add PDF-required business fields to onboarding~~
- ✅ ~~Registration privacy persistence~~ (now server-side in the register transaction)
- ✅ ~~Cookie consent CSRF: client sends the header; runtime roundtrip verified~~
- ✅ ~~Hide/mock-disable dev-only billing path~~
- ✅ ~~V2-gated pages no longer return raw `Not Found`~~ (redirect to settings)

---

## `Work-Completed/CODEBASE-AUDIT-HIGH.md` — moved 2026-05-22

Status: ✅ complete. All 32 task rows checked off `[x]`; the file header records the partials being verified and closed on 2026-05-15. Corresponding tests are in the green `test:all` suite. Moved to `Work-Completed/`.

---

## `Work-Completed/CODEBASE-AUDIT-MEDIUM.md` — moved 2026-05-22

Status: ✅ complete. All 42 task rows checked off `[x]`. Corresponding tests are in the green `test:all` suite. Moved to `Work-Completed/`.

---

## `Work-Completed/CODEBASE-AUDIT-LOW.md` — moved 2026-05-22

Status: ✅ complete. All 28 task rows checked off `[x]`. Moved to `Work-Completed/`.

---

## `Work-To-Do/UNFINISHED-CLEANUP-WORK.md`

### Phase 1 — Sidebar / Quick Add Cleanup

- ✅ ~~Delete old Quick Add sidecar files~~
- ✅ ~~Remove stale backend `/api/entitlements/quick-add` endpoint~~
- ✅ ~~Confirm `global.js` is the owner of Quick Add visibility~~ — the Quick Add action config and visibility logic live in `public/js/global.js`; `transactions.js` only consumes it.
- ✅ ~~Confirm Analytics and Settings are not Quick Add options~~ — the action list in `global.js` is add transaction / upload receipt / add trip / add account / add category / create export / customers / new invoice / bills / vendors only.
- ⏳ PARTIAL — Code complete; live tier verification still useful for Basic/Free Quick Add hiding
- ⏳ PARTIAL — Code complete; live tier verification still useful for Pro showing only Core Quick Add
- ⏳ PARTIAL — Code complete; live tier verification still useful for Business showing Core + Business Quick Add
- ⏳ PARTIAL — Code complete; runtime/browser verification still useful for multi-select Quick Add behavior

### Phase 2 — Transactions Undo / Checkbox Action Cleanup

- ✅ ~~Remove separate undo route mount from `routes/index.js`~~
- ✅ ~~Delete `transactions-undo.routes.js`~~ — not present in `routes/`.
- ✅ ~~Delete disconnected transaction frontend sidecars~~ — `transaction-undo-button.js`, `transaction-checkbox-actions.js`, and `transaction-checkbox-actions-v2.js` are not present in the repo.
- ✅ ~~Undo exists directly in transaction owner files~~ — `transactions.routes.js` exposes `POST /undo-delete` and `GET /undo-delete-status`; `transactions.html` contains the undo bar; `transactions.js` wires the owner-file UI and restore flow.
- ✅ ~~Checkbox row actions exist directly in transaction owner files~~ — `transactions.html` contains the bulk bar/select controls and `transactions.js` owns the row popup and bulk-delete behavior.

### Phase 3 — Auth Bridge / MFA Trust Cleanup

- ✅ ~~Remove login/MFA frontend bridge cookies and handoff terms~~
- ✅ ~~Confirm `accountSwitchMfaTrust.js` is removed~~ — file not found anywhere in the repo; no `res.json` monkey-patch remains.

### Phase 4 — Billing / Subscription Consolidation

- ✅ ~~Remove or consolidate `billing-checkout-overrides.routes.js`~~ — not found.
- ✅ ~~Confirm `billing-reactivation.routes.js` was consolidated/removed~~ — not found in `routes/`.
- ✅ ~~Confirm `subscription-reactivation.js` was consolidated/removed~~ — no `*reactivation*` file found in `routes/`, `services/`, or `public/js/`.
- ✅ ~~Confirm `subscriptionTrialCheckoutPatch.js` was consolidated/removed~~ — not found.
- ✅ ~~Confirm no billing/subscription patch/override sidecars remain~~ — full filename search found only `public/css/pages/subscription-premium-bridge.css` (a stylesheet, naming coincidence) — not a route/service sidecar.

### Phase 5 — Theme / Dark Mode Drift Cleanup

- ✅ ~~Dark mode is intended to stay disabled~~ — `public/js/theme-boot.js` exists and its header documents it as a permanent early light-mode lock.
- ✅ ~~Confirm dark mode cannot activate from localStorage~~ — `theme-boot.js` forces `data-theme=light` and overwrites `lb_theme` to `light` on every boot.
- ✅ ~~Confirm dark mode cannot activate from OS/browser preference~~ — `theme-boot.js` hard-sets light regardless of `prefers-color-scheme`.
- ✅ ~~Confirm theme ownership~~ — `theme-boot.js` is documented as the permanent early light-mode lock.
- ⏳ PARTIAL — Optional: a runtime UI spot-check that no visible toggle re-enables dark mode.

### Phase 6 — Final Audit

- ✅ ~~`transaction-undo-button.js` spot-check not found~~
- ✅ ~~`billing-checkout-overrides.routes.js` spot-check not found~~
- ✅ ~~Full local filename search for `patch`, `override`, `bridge`, `-v2`, sidecar names~~ — only matches are `public/js/landing-faqs-v2.js` and `public/css/pages/subscription-premium-bridge.css`, both legitimate redesign assets.
- ✅ ~~Owner/removal decision for remaining suspicious sidecars~~ — the two matches above are intentional UI files; no removal needed.

### Additional Cleanup Candidates

- ✅ ~~Duplicate dark-mode CSS drift files consolidated/deleted~~
- ❌ INCOMPLETE / VERIFY — Dated recovery artifact folder cleanup
- ❌ INCOMPLETE / VERIFY — Checksum repair script consolidation/documentation (`scripts/repair-migration-checksums.js` is wired into `prestart`)
- ❌ INCOMPLETE / VERIFY — Test naming/audit drift cleanup
- ❌ INCOMPLETE / VERIFY — Documentation drift cleanup between `Docs/`, root docs, and lowercase `docs/`
- ❌ INCOMPLETE / VERIFY — Guardrail/utility script review

---

## `Work-Completed/PRODUCTION-READINESS-PHASE-4-7.md` — moved 2026-05-22

Status: ✅ complete. Phase 4 (plan gating across Basic/Pro/Business) passed code review, and the Phase 4 + Phase 7 live smoke-test matrices — tier gating and cross-business data isolation with a two-business account — were run and passed. Moved to `Work-Completed/`.

---

## `Work-To-Do/OWNER-FILE-FOLLOWUP-WORK.md`

- ✅ ~~Wire CSV Import End-to-End~~
- ✅ ~~Make Onboarding Meaningful~~
- [x] Add Public SEO in owner files
  - Status: Complete. Public indexable pages now ship with canonical metadata coverage, `help.html` is in the sitemap, and auth/setup pages have consistent `noindex` handling.
- [x] Fix Stripe Webhook Host and Delivery Path
  - Status: Closed. Webhook configuration is accepted as working in production, and the API service has the required webhook environment variable.
- ✅ ~~Fold Residual Transactions Drift CSS into Owner Styles~~ — `transactions-no-actions-column.css` not found.

---

## `Work-To-Do/V2_BUILD_PLAN.md`
Status: PLANNING / ROADMAP. Deferred until Pro tier work is complete. Not a current execution checklist.


- ❌ INCOMPLETE — Phase 0: Foundation audit and scope lock
- ❌ INCOMPLETE — Phase 0.5: Tier entitlements and feature flag matrix
- ❌ INCOMPLETE — Phase 1: Unified app map
- ❌ INCOMPLETE — Phase 2: Accounting/source-of-truth rules
- ❌ INCOMPLETE — Phase 3: Shared UI/UX rules
- ⏳ PARTIAL — Phase 4: Static shell/existing page upgrades
- ⏳ PARTIAL — Phase 5: Static new V2 modules
- ❌ INCOMPLETE — Phase 6: Frontend interaction specs
- ⏳ PARTIAL — Phase 7: Shared JavaScript layer
- ⏳ PARTIAL — Phase 8: Module JavaScript behaviors
- ⏳ PARTIAL — Phase 9: Schema planning/migration plan
- ⏳ PARTIAL — Phase 10: Migration implementation
- ⏳ PARTIAL — Phase 11: API/service contracts
- ⏳ PARTIAL — Phase 12: Backend implementation core modules
- ⏳ PARTIAL — Phase 13: Frontend/backend wiring
- ❌ INCOMPLETE — Phase 14: Reporting/export integrity pass
- ❌ INCOMPLETE — Phase 15: Accounting integrity/regression pass
- ❌ INCOMPLETE — Phase 16: System unification/cleanup
- ❌ INCOMPLETE — Phase 17: Hardening, QA, release prep

Immediate next actions from that file remain incomplete:

- ❌ Keep / Upgrade / Add / Not-now scope list
- ❌ Unified page inventory and navigation map
- ❌ Entitlement matrix plus feature flag matrix

---
## `Work-Completed/FREELANCER_PIVOT.md`

Status: complete. This roadmap was explicitly crossed off as active work and moved out of `Work-To-Do/`.

## `Work-To-Do/IMPECCABLE_STYLE_FRONTEND_ROLLOUT_PLAN.md`

Status: ROADMAP / partially complete. Not finished across the whole site yet.

- ⏳ PARTIAL — Phase 0: Design baseline
- ⏳ PARTIAL — Phase 1: Shared frontend foundation
- ⏳ PARTIAL — Phase 2: App shell consistency
- ⏳ PARTIAL — Phase 3: Core workflows — transactions improved; Categories still needs redesign (tracked in `Docs/PRODUCT-BACKLOG.md`).
- ⏳ PARTIAL — Phase 4: Settings / Subscription / Help
- ⏳ PARTIAL — Phase 5: Secondary / Edge Surfaces
- ❌ INCOMPLETE — Phase 6: Copy pass
- ❌ INCOMPLETE — Phase 7: Interaction polish
- ❌ INCOMPLETE — Phase 8: QA and regression control

Current visible open items:

- ❌ Categories page redesign
- ❌ Landing page updates
- ❌ Settings save-button active/tap-state polish if not already committed
- ❌ PDF checklist visual badge/card polish if export still looks bad visually

---

## `Work-Completed/SECURITY-LEGAL-READINESS-US-CANADA.md` — moved 2026-05-22

Status: ✅ complete. The verified gaps in this memo have been addressed; moved to `Work-Completed/`.

Resolved this pass (commit `Align security docs and harden privacy exports`):

- ✅ ~~CSV export formula-injection hardening~~ — `services/csvExportService.js` exposes `neutralizeFormulaCell()`, and `routes/privacy.routes.js` imports and applies it in its CSV serialization (`toCsv()`).
- ✅ ~~Rewrite `Docs/PIA.md` and `Docs/SECURITY_PLAN.md` to match code~~ — both rewritten; `SECURITY_PLAN.md` now explicitly states what is *not* fully encrypted at rest (transaction notes, receipt blobs/files, legacy GST/HST) instead of overclaiming.
- ✅ ~~Quebec breach-notice language + 5-year incident-register retention~~ — `Docs/BREACH_NOTIFICATION_RUNBOOK.md` updated; `Docs/CONFIDENTIALITY_INCIDENT_REGISTER.md` added.
- ✅ ~~Cross-border processor coverage~~ — `Docs/SUBPROCESSORS.md` added (Railway, Stripe, Resend, Plaid, Anthropic OCR, geolocation host).
- ✅ ~~Encryption-coverage decision~~ — resolved via the memo's allowed path of narrowing doc claims so they match actual code coverage.

Note: a few items in this memo were always documentation/legal-operational and depend on facts outside the repo (executed DPAs, named Privacy Officer delegation). Those are an operational, not engineering, follow-up.

---

## `Docs/SECURITY_AUDIT_2026-06-10.md`

Status: INCOMPLETE / HIGH PRIORITY. The app is not in crisis, but it is not yet at enterprise/security-review standard. The remaining risk is concentrated in a few structural areas.

Highest-priority engineering items from the audit:

1. PARTIAL - Replace browser-readable bearer-token storage.
   - Current status: main frontend auth no longer persists access tokens in `sessionStorage` / `localStorage`, and the backend now supports cookie-backed auth.
   - Remaining gap: transitional bearer-token compatibility paths still exist in browser JS and should be removed in a follow-up pass.
   - Owner files: `In-Ex-Ledger-API/public/js/auth.js`, `In-Ex-Ledger-API/public/js/login.js`, `In-Ex-Ledger-API/public/js/mfa-challenge.js`, `In-Ex-Ledger-API/public/js/global.js`
   - Required direction: finish the move to cookie/session-authoritative browser auth and remove the remaining bearer fallback paths.

2. COMPLETE - Replace the bespoke JWT implementation.
   - Current status: `middleware/auth.middleware.js` now uses `jsonwebtoken` instead of a hand-rolled HMAC JWT implementation.
   - Owner file: `In-Ex-Ledger-API/middleware/auth.middleware.js`
   - Follow-up: issuer/audience/key-rotation hardening is still desirable, but the bespoke implementation itself is gone.

3. COMPLETE - Stop trusting raw `X-Forwarded-For` values in application code for the audited core paths.
   - Current status: a shared trusted-IP helper now drives `sessionContextService.js`, `signInSecurityService.js`, `auditEventService.js`, and `consent.routes.js`.
   - Owner files: `In-Ex-Ledger-API/services/sessionContextService.js`, `In-Ex-Ledger-API/services/signInSecurityService.js`, `In-Ex-Ledger-API/services/auditEventService.js`, `In-Ex-Ledger-API/routes/consent.routes.js`

4. COMPLETE - Harden support-artifact upload/download core controls.
   - Current status: support-artifact routes now have a dedicated limiter, MIME/extension consistency checks, and storage-root-confined path resolution.
   - Owner files: `In-Ex-Ledger-API/routes/supportArtifacts.routes.js`, `In-Ex-Ledger-API/services/supportArtifactStorage.js`
   - Follow-up: file-signature sniffing and `nosniff` response hardening are still worthwhile, but the core gap from the audit is closed.

5. COMPLETE - Confine receipt file resolution to the receipt storage root only.
   - Owner file: `In-Ex-Ledger-API/services/receiptStorage.js`

6. PARTIAL - Reduce sensitive identifier logging.
   - Current status: password-reset delivery logs and inbound invoice/support recipient logs are now masked.
   - Remaining gap: a broader repository-wide logging minimization pass is still worth doing.
   - Owner files: `In-Ex-Ledger-API/routes/auth.routes.js`, `In-Ex-Ledger-API/routes/email.routes.js`, `In-Ex-Ledger-API/routes/supportEmail.routes.js`

Security standards summary from the audit:

- OWASP Top 10: partial pass overall, but fails remain in session/crypto architecture, insecure design, security misconfiguration, and logging/monitoring hygiene.
- OWASP API Security Top 10 2023: partial pass overall, but fails remain in broken authentication, unrestricted resource consumption, and security misconfiguration.
- OWASP ASVS 5.0.0: not yet compliant enough for an enterprise/security-review claim.
- CISA Secure by Design: meaningful progress, but not yet secure-by-default for auth/session architecture.

Recommended execution order:

1. Auth/session architecture hardening.
2. Upload/path confinement hardening.
3. Trusted proxy/IP/logging cleanup.
4. Re-audit against the same four standards after fixes land.

---

## Final Active Work List

Launch-relevant: not all complete.

1. COMPLETE - Live `/api/receipts` returns `200`.
2. COMPLETE - Stripe webhook endpoint host verified; missed failed events replayed.
3. COMPLETE - Full `npm run test:all` green.
4. COMPLETE - `Docs/RELEASE-CHECKLIST.md` / real browser smoke pass complete.
5. COMPLETE - Cookie-consent CSRF roundtrip verified.
6. INCOMPLETE - Final browser auth/session hardening still required before claiming enterprise-grade security posture.
7. COMPLETE - Support artifact upload/download hardening core controls landed.
8. COMPLETE - Receipt/support file path confinement cleanup landed.
9. COMPLETE - Trusted proxy/IP handling cleanup landed for the audited core paths.
10. PARTIAL - Sensitive logging cleanup started; broad follow-up still required.

Launch-blocking security hardening remains. Product/design backlog stays below that line.

Product/design backlog:

1. INCOMPLETE - Categories page redesign.
2. INCOMPLETE - Landing page updates.
3. INCOMPLETE - Yearly Additional Business UI/backend wiring check.
4. INCOMPLETE - Terms of Service completion.
5. INCOMPLETE - Impeccable Style rollout completion across remaining pages.
6. INCOMPLETE - V2 planning documents if/when Pro-tier work is complete.

Cleanup backlog (mostly closed this pass):

1. INCOMPLETE - Dated recovery artifact folder cleanup.
2. INCOMPLETE - Checksum repair script consolidation/documentation.
3. INCOMPLETE - Test naming/audit drift cleanup.
4. INCOMPLETE - Guardrail/utility script review.

Security/legal readiness: the earlier US/Canada legal-readiness memo is complete, but the 2026-06-10 engineering security audit opened new launch-relevant hardening work.
