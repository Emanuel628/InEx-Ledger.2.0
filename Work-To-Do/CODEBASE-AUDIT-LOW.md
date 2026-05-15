# Codebase Audit Triage - Low

Source: Claude full-repo audit, reorganized for execution.

Rules used here:
- Sorted from shortest expected fix to longest expected fix.
- Grouped when the same fix shape touches nearby files.
- Estimates are rough engineering effort, not calendar time.

## Execution Program

Goal:
- Maximize checklist closure rate per pass.
- Prefer broad cleanup patterns that remove many low-grade defects at once.
- Delay lower-yield one-off polish until after shared sweeps are finished.

Working rules:
- Each phase should target one fix shape across multiple files.
- Prefer repo-wide sweeps over page-by-page cleanup when the issue is repeated.
- Do not mix CSS dedup work with route correctness work in the same pass unless the touched files are already shared.
- Close cheap backend correctness items before large visual cleanup so test coverage stays fast and confidence stays high.

Recommended execution order:

### Phase 1 - Cheap code cleanup sweep
Target outcome:
- Remove the highest number of low items with the smallest code risk.

Take together:
- Remove stale production console noise in frontend scripts.
- Remove dead placeholder production stubs in dashboard/filter/tax widget scripts.
- Improve low-value error logging and stack preservation where only `err.message` is logged.
- Remove dead imports and tiny footguns.
- Tighten over-permissive constants and comments that should not require a full future rediscovery.

Why first:
- Fastest closure density.
- Very low regression risk.
- Keeps later diffs smaller and easier to review.

Expected yield:
- 5 checklist items in one pass.

### Phase 2 - Dead selector and dead affordance sweep
Target outcome:
- Remove clearly orphaned UI/CSS/JS leftovers in one repo pass.

Take together:
- Remove or wire up obviously dead Accounts CSS/JS affordances.
- Remove dead Categories and Receipts CSS selectors that no longer match generated markup.
- Remove dead CSS and duplicate declarations in auth stylesheets.

Why second:
- Same fix shape across files.
- Little behavioral risk if verified with quick template/selector checks.

Expected yield:
- 3 checklist items in one pass.

### Phase 3 - Small HTML, i18n, and metadata polish sweep
Target outcome:
- Standardize template-level issues that are easy to verify visually.

Take together:
- Add missing favicon declarations to auth/marketing pages.
- Fix mislabeled or semantically invalid form/table markup on app pages.
- Standardize translated nav labels and missing `data-i18n` attributes.
- Update document language handling so translated pages do not keep `<html lang="en">`.
- Add missing close affordances and focus quality-of-life improvements for simpler modals.

Why third:
- Mostly isolated to templates and lightweight JS.
- Good closure count without deep system coupling.

Expected yield:
- 5 checklist items in one pass.

### Phase 4 - Small route correctness and validation sweep
Target outcome:
- Close the low-risk backend semantics work in one testing-focused batch.

Take together:
- Add row-count checks and 404 correctness to soft-delete/update paths that currently return success too loosely.
- Tighten small validation mismatches and permissive helpers that currently just "work by accident."
- Stop leaking internal helper surfaces that do not need to be public.

Why fourth:
- Same verification mode: route tests and response semantics.
- Small blast radius, strong testability.

Expected yield:
- 3 checklist items in one pass.

### Phase 5 - Shared public/auth polish sweep
Target outcome:
- Clean repeated low-value UX/copy drift in public/auth flows while files are already open.

Take together:
- Replace `window.alert()` / `window.prompt()` / `window.confirm()` fallbacks that remain as cleanup leftovers.
- Fill in currently English-only or empty localization surfaces.
- Add missing footer/canonical polish to public/legal/help pages.
- Clean up dead or misleading state/query parameters in auth flows.

Why fifth:
- These files overlap heavily.
- Best done after markup/i18n direction is already stabilized.

Expected yield:
- 4 checklist items in one pass.

### Phase 6 - CSS structure consolidation
Target outcome:
- Reduce maintenance drag from duplicated or overly broad page CSS.

Take together:
- Merge the identical legal page styles into one shared legal stylesheet.
- Merge the nearly identical settings legacy stylesheets into one shared base.
- Replace hardcoded page-level hex colors with CSS variables in Settings and auth-adjacent stylesheets.
- Remove broad unscoped CSS selectors from page-specific stylesheets.
- Clean up stale or conflicting transaction page CSS from prior design iterations.

Why sixth:
- Highest edit volume among the low items.
- Better done after the cheap HTML/template changes stop moving the target.

Expected yield:
- 5 checklist items in one pass.

### Phase 7 - Final utilities and platform sweep
Target outcome:
- Finish the remaining low-priority structural cleanup in one deliberate pass.

Take together:
- Remove dead utility code and misleading signatures that increase future maintenance cost.
- Normalize small billing/crypto/platform polish items while the related systems are already under review.
- Sweep the app for repeated "low-signal but everywhere" inconsistencies and standardize them in one pass.

Why last:
- Broadest file spread.
- Lowest urgency.
- Best handled once the visible/frontend cleanup waves are complete.

Expected yield:
- 3 checklist items in one pass.

Recommended practical sequence:
1. Phase 1
2. Phase 2
3. Phase 4
4. Phase 3
5. Phase 5
6. Phase 6
7. Phase 7

Reason for this exact order:
- It closes backend/code hygiene first.
- Then removes dead code and selector noise.
- Then locks in route correctness before the larger frontend polish waves.
- Then leaves the heaviest CSS consolidation for after the UI surface is cleaner.

## 15-30 minutes

### Dead code, dead CSS, stale logging

- [ ] 15-30 min - Remove or wire up obviously dead Accounts CSS/JS affordances.
  Files: `In-Ex-Ledger-API/public/css/pages/accounts.css`, `public/js/accounts.js`
  Group: Accounts dead UI
  Covers: `.accounts-add-btn--bottom`, `.accounts-bottom-bar`, missing `showAccountFormBottom`, unused `populateAccountTypes()`

- [ ] 15-30 min - Remove dead Categories and Receipts CSS selectors that no longer match generated markup.
  Files: `In-Ex-Ledger-API/public/css/pages/categories.css`, `public/css/pages/receipts.css`
  Group: Dead page CSS
  Covers: `.category-item-pills`, `.categories-secondary-btn`, `.empty-add-btn`, `.receipt-file-missing`, `.receipt-transaction-label`, `.upload-btn`

- [x] 15-30 min - Remove stale production console noise in frontend scripts.
  Files: `transactions.js`, `settings.js`, `i18n.js`
  Group: Console cleanup
  Covers: protected-page logs, i18n language-change logs

- [ ] 15-30 min - Remove dead CSS and duplicate declarations in auth stylesheets.
  Files: `login.css`, `register.css`, `onboarding.css`, `verify-email.css`, `forgot-password.css`, `reset-password.css`
  Group: Auth CSS cleanup
  Covers: duplicated `body/main/auth-card` rules, imported boilerplate duplication

- [x] 15-30 min - Remove dead placeholder production stubs in dashboard/filter/tax widget scripts.
  Files: `dashboard.js`, `filters.js`, `tax-widget.js`
  Group: Placeholder script cleanup
  Covers: function-guarded auth bypass pattern, `console.log` production stubs

- [ ] 15-30 min - Replace `window.alert()` / `window.prompt()` / `window.confirm()` fallbacks that remain as cleanup leftovers.
  Files: `pricing.js`, `settings.js`, `auth.js`, any remaining browser-dialog callers
  Group: Native dialog cleanup
  Covers: checkout errors, account notices, add-business fallback, other blocking browser dialogs

- [ ] 15-30 min - Add missing favicon declarations to auth/marketing pages.
  Files: auth and marketing HTML templates broadly
  Group: Head metadata polish
  Covers: repeated favicon 404s

### Small backend hygiene

- [x] 15-30 min - Improve low-value error logging and stack preservation where only `err.message` is logged.
  Files: `accounts.routes.js`, `system.routes.js`, other noted handlers
  Group: Error logging hygiene
  Covers: shallow delete logging, silent diagnostics catch

- [x] 15-30 min - Remove dead imports and tiny footguns.
  Files: `me.routes.js`, other touched files
  Group: Small code hygiene
  Covers: unused `path` import, misleading unused parameters

- [x] 15-30 min - Tighten over-permissive constants and comments that should not require a full future rediscovery.
  Files: `auth.routes.js`, `rateLimitTiers.js`
  Group: Small configuration cleanup
  Covers: upcoming reset-token TODO, high token-refresh / receipt limiter defaults, hardcoded `MAX_MFA_ATTEMPTS`

## 30-60 minutes

### HTML semantics and accessibility polish

- [ ] 30-60 min - Fix mislabeled or semantically invalid form/table markup on app pages.
  Files: `accounts.html`, `transactions.html`, `mfa-challenge.html`
  Group: Markup semantics
  Covers: non-functional account-type label, undo button inside `<th>`, page heading level cleanup

- [ ] 30-60 min - Add missing close affordances and focus quality-of-life improvements for simpler modals.
  Files: `receipts.html`, related modal JS
  Group: Modal polish
  Covers: receipts link modal lacking backdrop close

- [ ] 30-60 min - Standardize translated nav labels and missing `data-i18n` attributes.
  Files: `categories.html`, `transactions.html`, other affected templates
  Group: i18n markup polish
  Covers: Analytics link translation misses and similar template drift

- [ ] 30-60 min - Update document language handling so translated pages do not keep `<html lang="en">`.
  Files: shared page templates, i18n bootstrapping
  Group: Screen-reader pronunciation
  Covers: auth/public pages staying English-tagged after language changes

### Small route correctness

- [ ] 30-60 min - Add row-count checks and 404 correctness to soft-delete/update paths that currently return success too loosely.
  Files: `categories.routes.js`, similar endpoints
  Group: 404 semantics
  Covers: delete returning 200 after race conditions

- [ ] 30-60 min - Tighten small validation mismatches and permissive helpers that currently just "work by accident."
  Files: `sessions.routes.js`, `check-email-verified.routes.js`, `receipts.routes.js`
  Group: Validation polish
  Covers: overly broad UUID regex, weak email normalization, string-based lock-error check

- [ ] 30-60 min - Stop leaking internal helper surfaces that do not need to be public.
  Files: `receipts.routes.js`
  Group: Internal API cleanup
  Covers: `module.exports.__private` exposing internal OCR helpers

## 1-2 hours

### CSS deduplication and token cleanup

- [ ] 1-2 hours - Merge the identical legal page styles into one shared legal stylesheet.
  Files: `legal.css`, `privacy.css`, `terms.css`
  Group: Legal CSS dedup
  Covers: byte-for-byte identical files, global bare `<p>` selector drift

- [ ] 1-2 hours - Merge the nearly identical settings legacy stylesheets into one shared base.
  Files: `change-email.css`, `account-profile.css`, `region-settings.css`, `fiscal-settings.css`, `mfa.css`
  Group: Settings legacy CSS dedup
  Covers: duplicated boilerplate across five files

- [ ] 1-2 hours - Replace hardcoded page-level hex colors with CSS variables in Settings and auth-adjacent stylesheets.
  Files: `settings.css`, `login.css`, `register.css`, related page CSS
  Group: Theme token consistency
  Covers: hardcoded blues/grays/greens/browns bypassing token system

- [ ] 1-2 hours - Remove broad unscoped CSS selectors from page-specific stylesheets.
  Files: `transactions.css`, `settings.css`, legal CSS files
  Group: CSS scope cleanup
  Covers: bare `main`, `section`, `form`, `body`, `p` selectors with page bleed

- [ ] 1-2 hours - Clean up stale or conflicting transaction page CSS from prior design iterations.
  Files: `transactions.css`
  Group: Transactions CSS cleanup
  Covers: duplicate bare selectors, dead `.transactions-page` / `.summary-card` / `.tax-hero` / `.transactions-card` / `.ytd-*` rules, false-confidence `.income-only-field` modal selector

### Small product and copy polish

- [ ] 1-2 hours - Fill in currently English-only or empty localization surfaces.
  Files: `categories-backend.js`, `trial.js`, `pdf_labels.js`, `i18n.js`
  Group: Localization cleanup
  Covers: hardcoded English toast strings, hardcoded trial strings, empty `es` and `fr` PDF label maps, raw key fallback behavior

- [ ] 1-2 hours - Add missing footer/canonical polish to public/legal/help pages.
  Files: `pricing.html`, `help.html`, `privacy.html`, related templates
  Group: Public page polish
  Covers: missing pricing footer, missing help footer, missing canonical tag, inconsistent copyright

- [ ] 1-2 hours - Clean up dead or misleading state/query parameters in auth flows.
  Files: `register.js`, `verify-email.js`, `login.js`, `reset-password.js`
  Group: Auth flow polish
  Covers: unread `?email=sent`, unread `?password_reset=true`, spoofable success-query UX, hollow autofill retry array

## Half day

### Structural but low-risk cleanup

- [ ] Half day - Remove dead utility code and misleading signatures that increase future maintenance cost.
  Files: `taxReminders.js`, `pdf_export.js`, `global.js`, `theme-boot.js`, `encryptionService.js`, `taxIdService.js`
  Group: Utility cleanup
  Covers: unpruned dismissal list, dead PDF page builders, dead global theme parameter, theme version mismatch write churn, silent `encrypt(null)`, legacy decrypt returning ciphertext

- [ ] Half day - Normalize small billing/crypto/platform polish items while the related systems are already under review.
  Files: `billing.routes.js`, `businesses.routes.js`, `crypto.routes.js`, `exportGrantService.js`, `pdfWorkerClient.js`
  Group: Platform polish
  Covers: duplicated Stripe helpers, no billing-failure user notification, small advisory-lock collision risk, public-key cache semantics, export-grant cleanup doing write work on every verification call, verbose worker error messages

- [ ] Half day - Sweep the app for repeated "low-signal but everywhere" inconsistencies and standardize them in one pass.
  Files: broad template/CSS sweep
  Group: Consistency sweep
  Covers: missing `defer` on blocking scripts, relative-vs-absolute href drift, hardcoded SVG/data-URI colors, deprecated mobile scrolling rule, large typography edge cases

