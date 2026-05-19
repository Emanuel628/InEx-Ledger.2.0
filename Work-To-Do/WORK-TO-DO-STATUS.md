# Work-To-Do Status Review

Reviewed against current `main` on 2026-05-19.

Legend:

- ✅ `~~crossed out~~` = complete / already resolved in code or documentation
- ⏳ `PARTIAL` = code appears fixed, but live/runtime verification is still needed
- ❌ `INCOMPLETE` = still needs work
- 📝 `PLANNING` = roadmap/design plan, not a launch blocker unless selected for current scope

---

## `Work-To-Do/E2E-FINDINGS-NEW-USER.md`

### Critical bugs

- ✅ ~~Migrations cannot run on a fresh database~~
  - Status: Complete. `007_add_marketing_email_opt_in.sql` is now an intentional no-op and the later privacy-settings migration owns the column.

- ✅ ~~CSV and PDF exports silently lose every transaction description~~
  - Status: Complete. Export source rows now include `description_encrypted`, decrypt it, fall back to plaintext description, and strip ciphertext from the exported row.

- ⏳ PARTIAL — `GET /api/receipts` returns 500 for every authenticated user
  - Code status: Fixed in repo. The list query now uses `uploaded_at`, exposes `created_at` as an alias, and no longer sends raw `file_bytes`.
  - Runtime status: Needs live production verification because `/api/receipts 500` was still seen after one deploy.
  - Required check: live `/api/receipts` must return `200` on production.

- ✅ ~~CSV import silently drops historical rows because of a hidden default date filter~~
  - Status: Complete by commit history. The CSV modal no longer defaults the start date to today.

- ✅ ~~Stripe price env-var names do not match `.env.example` / runtime config~~
  - Status: Complete enough for launch. Production env validation now requires Stripe price env vars from `STRIPE_PRICE_ENTRIES`.
  - Follow-up: yearly Additional Business UI wiring is tracked separately in `Docs/PRODUCT-BACKLOG.md`.

- ❌ INCOMPLETE — `CSRF_SECRET` required at runtime but not required in dev validation
  - Current code still throws from `csrf.middleware.js` when `CSRF_SECRET` is missing.
  - `envValidationService.js` still only requires `CSRF_SECRET` in production.
  - Fix: require `CSRF_SECRET` in all environments or provide a safe dev/test default path documented in `.env.example`.

### High-severity functional issues

- ✅ ~~New users cannot export PDF until they hunt down hidden profile fields~~
  - Status: Complete. Onboarding now validates and collects business activity code, accounting method, material participation, address, and CA province where needed.

- ❌ INCOMPLETE / VERIFY — Privacy-consent persistence fails right after registration
  - Status: Not re-verified in this pass.
  - Required check: register a fresh user and confirm privacy settings persist server-side without a 401.

- ❌ INCOMPLETE / VERIFY — Cookie-banner POST is CSRF-blocked
  - Status: Not re-verified in this pass.
  - Required check: unauthenticated cookie consent POST should either send CSRF correctly or use an intentional exempt/audited path.

- ❌ INCOMPLETE / LOW RISK — V2 feature pages return raw `Not Found`
  - Status: Still needs live/route UX verification if those links are public or indexed.
  - Not a blocker if V2 pages are hidden and feature-gated.

- ✅ ~~`/upgrade` page exposes dev-only Activate Pro button publicly~~
  - Status: Already covered by previous billing mock hardening work in audit docs.

- ❌ INCOMPLETE / PRODUCT DECISION — Auth-page redirect relies on localStorage bearer token
  - Status: Not resolved by recent work.
  - Decision needed: keep bearer-token localStorage model or move toward cookie/session-authoritative auth.

### Medium UX / hygiene issues

- ❌ INCOMPLETE — CSP `upgrade-insecure-requests` noisy in local HTTP dev
- ❌ INCOMPLETE — Cookie banner overlaps content
- ⏳ PARTIAL — Onboarding now asks more meaningful required fields, but UX copy/design still needs final pass
- ❌ INCOMPLETE / VERIFY — Login readonly autofill suppression remains to be checked
- ❌ INCOMPLETE — Account-menu / sign-out discoverability still needs UX pass
- ✅ ~~Pricing/Subscription empty Stripe price data from env mismatch~~
  - Status: Startup validation now catches missing Stripe price env vars.
- ❌ INCOMPLETE / LOW — Invoice starter line item UX polish
- ❌ INCOMPLETE / LOW — Default income category ordering
- ❌ INCOMPLETE / LOW — Mileage form visibility consistency
- ⏳ PARTIAL — Material participation now required in onboarding, but explanatory copy still needs review
- ❌ INCOMPLETE / LOW — Invoice form field-level server error display

### Suggested fix priority from original file

- ✅ ~~Decrypt `description_encrypted` in exports~~
- ✅ ~~Fix migration 007 ordering~~
- ⏳ PARTIAL — Fix receipts endpoint, live production verification still required
- ✅ ~~Remove silent CSV import today-date default~~
- ✅ ~~Reconcile Stripe env-var names / startup validation~~
- ❌ INCOMPLETE — Dev env validation for `CSRF_SECRET` and related secrets
- ✅ ~~Add PDF-required business fields to onboarding~~
- ❌ INCOMPLETE / VERIFY — Registration privacy persistence
- ❌ INCOMPLETE / VERIFY — Cookie consent CSRF behavior
- ✅ ~~Hide/mock-disable dev-only billing path~~
- ❌ INCOMPLETE / LOW — Styled V2-gated 404

---

## `Work-To-Do/CODEBASE-AUDIT-HIGH.md`

Status: ✅ complete as written.

All task rows in this file are already checked off as `[x]`.

- ✅ ~~Auth recovery endpoint ordering~~
- ✅ ~~Sessions frontend response shape~~
- ✅ ~~Landing pricing toggle selector mismatch~~
- ✅ ~~Public billing mock exposure~~
- ✅ ~~Recurring UUID validation~~
- ✅ ~~V2 route auth/validation guards~~
- ✅ ~~Inbound email webhook auth~~
- ✅ ~~Plaid webhook signature verification~~
- ✅ ~~Business creation crypto runtime bug~~
- ✅ ~~Audit events cap~~
- ✅ ~~Pricing/checkout trust boundary~~
- ✅ ~~Email-change token hashing~~
- ✅ ~~Live MFA state for destructive deletion~~
- ✅ ~~Log sanitizer token redaction~~
- ✅ ~~Receipt upload/preview XSS hardening~~
- ✅ ~~Password confirmation for privacy erase~~
- ✅ ~~Bulk-delete RBAC~~
- ✅ ~~Accounting-lock guard on review status~~
- ✅ ~~Inline handler/CSP rollout work~~
- ✅ ~~URL token exposure cleanup~~
- ✅ ~~Transaction description storage consistency~~
- ✅ ~~Privacy service split-brain cleanup~~
- ✅ ~~Recurring consistency path~~
- ✅ ~~Core route gating fixes~~
- ✅ ~~Server-authoritative trial enforcement~~
- ✅ ~~Non-blocking receipt I/O~~
- ✅ ~~JWE bootstrap concurrency/validation~~
- ✅ ~~Mock billing safety~~
- ✅ ~~Billing checkout idempotency/state guards~~
- ✅ ~~Region detection trust model~~
- ✅ ~~PDF tax estimate correction~~
- ✅ ~~Real CSP rollout~~

No current action needed from this file unless a new audit reopens an item.

---

## `Work-To-Do/CODEBASE-AUDIT-MEDIUM.md`

Status: ✅ complete as written.

All task rows in this file are already checked off as `[x]`.

No current action needed from this file unless a new audit reopens an item.

---

## `Work-To-Do/CODEBASE-AUDIT-LOW.md`

Status: ✅ complete as written.

All task rows in this file are already checked off as `[x]`.

No current action needed from this file unless a new audit reopens an item.

---

## `Work-To-Do/UNFINISHED-CLEANUP-WORK.md`

### Phase 1 — Sidebar / Quick Add Cleanup

- ✅ ~~Delete old Quick Add sidecar files~~
- ✅ ~~Remove stale backend `/api/entitlements/quick-add` endpoint~~
- ❌ INCOMPLETE / VERIFY — Confirm `global.js` is the only owner of Quick Add visibility
- ❌ INCOMPLETE / VERIFY — Confirm Basic/Free users do not see Quick Add sidebar
- ❌ INCOMPLETE / VERIFY — Confirm Pro sees only Core Quick Add
- ❌ INCOMPLETE / VERIFY — Confirm Business sees Core + Business Quick Add
- ❌ INCOMPLETE / VERIFY — Confirm Analytics and Settings are not Quick Add options
- ❌ INCOMPLETE / VERIFY — Confirm multi-select Quick Add behavior is owned by `global.js`

### Phase 2 — Transactions Undo / Checkbox Action Cleanup

- ✅ ~~Remove separate undo route mount from `routes/index.js`~~
- ✅ ~~Delete `transactions-undo.routes.js`~~
- ✅ ~~Delete disconnected transaction frontend sidecars if behavior was not wanted~~
  - Current spot check: `transaction-undo-button.js` was not found on `main`.
- ❌ INCOMPLETE / PRODUCT DECISION — Decide whether Undo should exist at all
- ❌ INCOMPLETE / PRODUCT DECISION — Decide whether checkbox row actions should exist at all
- ❌ INCOMPLETE IF KEPT — Rebuild Undo directly in `transactions.routes.js`, `transactions.html`, `transactions.js`, and `transactions.css`
- ❌ INCOMPLETE IF KEPT — Rebuild checkbox actions directly in transaction owner files

### Phase 3 — Auth Bridge / MFA Trust Cleanup

- ✅ ~~Remove login/MFA frontend bridge cookies and handoff terms~~
- ❌ INCOMPLETE / VERIFY — Confirm `accountSwitchMfaTrust.js` is removed or no longer monkey-patches `res.json`
- ❌ INCOMPLETE IF KEPT — Move trusted-browser account-switch behavior into explicit auth/MFA owner flow

### Phase 4 — Billing / Subscription Consolidation

- ✅ ~~Remove or consolidate `billing-checkout-overrides.routes.js`~~
  - Current spot check: file was not found on `main`.
- ❌ INCOMPLETE / VERIFY — Confirm `billing-reactivation.routes.js` was consolidated or intentionally removed
- ❌ INCOMPLETE / VERIFY — Confirm `subscription-reactivation.js` was consolidated or intentionally removed
- ❌ INCOMPLETE / VERIFY — Confirm `subscriptionTrialCheckoutPatch.js` was consolidated into `subscriptionService.js` or removed
- ❌ INCOMPLETE / VERIFY — Confirm no billing/subscription patch/override sidecars remain

### Phase 5 — Theme / Dark Mode Drift Cleanup

- ⏳ PARTIAL — Dark mode is intended to stay disabled
- ❌ INCOMPLETE / VERIFY — Confirm dark mode cannot activate from localStorage
- ❌ INCOMPLETE / VERIFY — Confirm dark mode cannot activate from OS/browser preference
- ❌ INCOMPLETE / VERIFY — Confirm no visible dark-mode toggle activates dark mode
- ❌ INCOMPLETE / VERIFY — Confirm `global.js` owns theme behavior or `theme-boot.js` is documented as permanent early light-mode lock

### Phase 6 — Final Audit

- ✅ ~~`transaction-undo-button.js` spot-check not found~~
- ✅ ~~`billing-checkout-overrides.routes.js` spot-check not found~~
- ❌ INCOMPLETE — Full local filename search still needed for all `patch`, `override`, `bridge`, `-v2`, and sidecar names
- ❌ INCOMPLETE — Decide permanent owner/removal status for every remaining suspicious sidecar

### Additional Cleanup Candidates

- ✅ ~~Duplicate dark-mode CSS drift files consolidated/deleted~~
- ❌ INCOMPLETE / VERIFY — Dated recovery artifact folder cleanup
- ❌ INCOMPLETE / VERIFY — Checksum repair script consolidation/documentation
- ❌ INCOMPLETE / VERIFY — Test naming/audit drift cleanup
- ❌ INCOMPLETE / VERIFY — Documentation drift cleanup between `Docs/`, root docs, and lowercase `docs/`
- ❌ INCOMPLETE / VERIFY — Guardrail/utility script review

---

## `Work-To-Do/PRODUCTION-READINESS-PHASE-4-7.md`

### Phase 4 — Plan gating

- ⏳ PARTIAL — Code-review pass marked PASS, but live verification is still required.

Required live checks still incomplete unless manually proven:

- ❌ Basic cannot see/use Business Quick Add
- ❌ Pro cannot see/use Business Quick Add
- ❌ Business can see/use Business Quick Add
- ❌ Basic sees no export-history noise
- ❌ Pro can access export history/export features
- ❌ Basic/Pro see no recurring-template console errors
- ❌ Business can use recurring templates if enabled
- ❌ Direct API calls to Business/V2 routes block Basic/Pro
- ❌ Direct API calls to Business/V2 routes succeed for Business
- ❌ Checkout upgrade/downgrade states have friendly UI behavior

### Phase 7 — Data safety

- ⏳ PARTIAL — Code-review pass marked PASS, but live multi-business verification is still required.

Required live checks still incomplete unless manually proven:

- ❌ Business A transaction not visible in Business B
- ❌ Business B transaction not visible in Business A
- ❌ Accounts/categories scoped per business
- ❌ Receipts scoped per business
- ❌ Mileage scoped per business
- ❌ Export history/data scoped per business
- ❌ Settings/region scoped per business
- ❌ Archive/delete scoped per business
- ❌ Business Quick Add records scoped to active business
- ❌ Cross-business direct API ID access fails or returns not found

---

## `Work-To-Do/OWNER-FILE-FOLLOWUP-WORK.md`

- ✅ ~~Wire CSV Import End-to-End~~
- ✅ ~~Make Onboarding Meaningful~~
- ❌ INCOMPLETE — Add Public SEO in owner files
- ⏳ PARTIAL — Fix Stripe Webhook Host and Delivery Path
  - Code route exists.
  - Operational/live Stripe endpoint still needs verification and any failed event replay.
- ✅ ~~Fold Residual Transactions Drift CSS into Owner Styles~~
  - Spot check: `transactions-no-actions-column.css` was not found on `main`.

---

## `Work-To-Do/V2_BUILD_PLAN.md`

Status: 📝 PLANNING / ROADMAP.

This is not a completed task checklist. It is a canonical phased build plan for later V2/Business expansion.

Current status by phase:

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

## `Work-To-Do/FREELANCER_PIVOT.md`

Status: 📝 ROADMAP, partially implemented by later product work.

- ⏳ PARTIAL — Language & UX reframe
  - Some freelancer/solo-operator positioning exists, but broad terminology cleanup is not complete.

- ⏳ PARTIAL — Onboarding simplification
  - Onboarding became more meaningful, but not the exact 3-step freelancer fast-path described here.

- ✅ ~~1099-NEC / T4A income tagging foundation~~
  - `payer_name` and `tax_form_type` appear in export source rows and transaction/export logic.
  - UI/report polish may still need review.

- ⏳ PARTIAL — Self-employment tax estimate widget
  - Tax context/estimated tax UI exists, but exact SE/CPP calculation behavior needs verification against this spec.

- ⏳ PARTIAL — Quarterly estimated tax reminders
  - There are reminder services/tests in the codebase, but current UX coverage needs verification.

- ✅ ~~Schedule C / T2125 category mapping foundation~~
  - Export and category mapping are clearly present in current PDF output.
  - Categories page UX redesign is still open separately in `Docs/PRODUCT-BACKLOG.md`.

- ❌ INCOMPLETE — Mileage rate auto-update
  - No verified completion in this pass.

---

## `Work-To-Do/IMPECCABLE_STYLE_FRONTEND_ROLLOUT_PLAN.md`

Status: 📝 ROADMAP / design rollout plan.

- ⏳ PARTIAL — Phase 0: Design baseline
- ⏳ PARTIAL — Phase 1: Shared frontend foundation
- ⏳ PARTIAL — Phase 2: App shell consistency
- ⏳ PARTIAL — Phase 3: Core workflows
  - Transactions improved.
  - Categories still needs redesign and is explicitly tracked in `Docs/PRODUCT-BACKLOG.md`.
- ⏳ PARTIAL — Phase 4: Settings / Subscription / Help
- ⏳ PARTIAL — Phase 5: Secondary / Edge Surfaces
- ❌ INCOMPLETE — Phase 6: Copy pass
- ❌ INCOMPLETE — Phase 7: Interaction polish
- ❌ INCOMPLETE — Phase 8: QA and regression control

Current visible open items from recent review:

- ❌ Categories page redesign
- ❌ Landing page updates
- ❌ Settings save-button active/tap-state polish if not already committed
- ❌ PDF checklist visual badge/card polish if export still looks bad visually

---

## Final Active Work List

Launch-relevant:

1. ❌ Verify live `/api/receipts` returns `200`.
2. ❌ Verify Stripe webhook endpoint host and replay missed failed events if needed.
3. ❌ Finish full `npm run test:all` green.
4. ❌ Run `Docs/RELEASE-CHECKLIST.md` / real browser smoke pass.
5. ❌ Fix or document dev `CSRF_SECRET` validation behavior.

Product/design backlog:

1. ❌ Categories page redesign.
2. ❌ Landing page updates.
3. ❌ Yearly Additional Business UI/backend wiring check.
4. ❌ Public SEO owner-file pass.
5. ❌ V2 planning documents if/when Business tier work resumes.

Cleanup backlog:

1. ❌ Full local sidecar/patch filename search.
2. ❌ Documentation drift cleanup.
3. ❌ Recovery/checksum artifact cleanup.
4. ❌ Remaining theme/dark-mode ownership verification.
