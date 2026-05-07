# Unfinished Cleanup Work

This is the current cleanup source of truth for patch, sidecar, duplicate, and drift work that still needs review.

Verified against the local checkout on 2026-05-07.

## Canonical Docs Path

Use `docs/` as the canonical path in links and notes.

`Docs/` and `docs/` are not two separate folders in this checkout. This repo is on Windows, so that casing difference is path drift, not duplicate on-disk content.

## Owner-File Work Completed In This Pass

### Theme ownership

Owner files:

- `In-Ex-Ledger-API/public/js/global.js`
- `In-Ex-Ledger-API/public/js/settings.js`

Completed:

- `global.js` now hard-forces light mode and resets stale `lb_theme` values back to `light`.
- `global.js` no longer allows `setGlobalTheme("dark")` to activate dark mode.
- `settings.js` now treats light mode as the only valid preference state.
- `settings.js` hides and disables the visible dark-mode toggle so the settings page cannot re-enable dark mode.

Follow-up still pending:

- Cache-bust the `global.js` HTML references in a dedicated pass. Most HTML files already have unrelated local edits, so that bulk version bump should be done carefully.

### Dynamic sidebar ownership

Owner file:

- `In-Ex-Ledger-API/public/js/global.js`

Completed:

- Quick Add gating now happens in `global.js` instead of sidecar behavior.
- Free/basic users no longer qualify for the Quick Add sidebar.
- Analytics and Settings were removed from the Quick Add library.
- Business-only items are filtered by subscription tier.
- The Quick Add library stays open while adding items and closes only when the user clicks `Done`.
- `billable-expenses` was added to the real Business feature list in the owner file.

## Files Verified Gone Locally

These files from the earlier cleanup draft are already absent in the local checkout:

- `In-Ex-Ledger-API/public/js/transaction-undo-button.js`
- `In-Ex-Ledger-API/public/js/transaction-checkbox-actions.js`
- `In-Ex-Ledger-API/public/js/transaction-checkbox-actions-v2.js`
- `In-Ex-Ledger-API/routes/billing-checkout-overrides.routes.js`
- `In-Ex-Ledger-API/services/subscriptionTrialCheckoutPatch.js`
- `In-Ex-Ledger-API/public/js/theme-boot.js`
- `In-Ex-Ledger-API/middleware/accountSwitchMfaTrust.js`
- `In-Ex-Ledger-API/public/css/core/dark-mode-final.css`
- `In-Ex-Ledger-API/public/css/core/dark-mode-disabled.css`
- `In-Ex-Ledger-API/public/js/global-patches.js`
- `In-Ex-Ledger-API/public/js/quick-add-entitlements.js`

Do not keep tracking these as active sidecars unless they reappear.

## Owner Files Already Carrying Real Behavior

### Transactions selection and row actions

Owner files:

- `In-Ex-Ledger-API/public/html/transactions.html`
- `In-Ex-Ledger-API/public/js/transactions.js`
- `In-Ex-Ledger-API/public/css/pages/transactions.css`

Verified:

- The select-all checkbox lives in `transactions.html`.
- Row selection state, select-all behavior, and row popup actions already live in `transactions.js`.
- Related styling already lives in `transactions.css`.

Still unresolved:

- The explicit undo-delete flow is not present in the owner route/UI yet.
- If undo is still a product requirement, rebuild it only in:
  `In-Ex-Ledger-API/routes/transactions.routes.js`
  `In-Ex-Ledger-API/public/js/transactions.js`
  `In-Ex-Ledger-API/public/html/transactions.html`
  `In-Ex-Ledger-API/public/css/pages/transactions.css`

## Remaining Cleanup Candidates That Still Exist

### Recovery and checksum artifacts

Present:

- `In-Ex-Ledger-API/recovery-artifacts/2026-04-11/`
- `In-Ex-Ledger-API/scripts/repair-migration-checksums.js`

Verified wiring:

- `repair-migration-checksums.js` is intentional right now. It is wired in `In-Ex-Ledger-API/package.json` through `prestart`, `migrations:verify-checksums`, and `migrations:repair-checksums`.
- The dated `recovery-artifacts/2026-04-11/` folder does not appear to be part of runtime or CI. It is still present as historical recovery material and should be archived or removed in a separate pass after review.

### Guardrail scripts

Present:

- `scripts/check-bundle-drift.js`
- `scripts/log_scan.js`
- `In-Ex-Ledger-API/scripts/log_scan.js`

Verified wiring:

- `scripts/check-bundle-drift.js` is intentional. It is used by `.github/workflows/phase7-guardrails.yml`.
- `In-Ex-Ledger-API/scripts/log_scan.js` is intentional. It is used by `In-Ex-Ledger-API/package.json` and the same guardrails workflow.
- Root `scripts/log_scan.js` is a duplicate implementation. It is referenced by `SECURITY.md`, not by package scripts or CI. Decide whether to keep it as the documented root wrapper or delete it after updating the documentation to point at the API-owned script.

### Test naming drift

Present:

- `In-Ex-Ledger-API/tests/i18nFix.js`
- `In-Ex-Ledger-API/tests/i18nAudit.js`
- `In-Ex-Ledger-API/tests/billingSubscriptionRecovery.test.js`

Verified status:

- `i18nFix.js` is not a test. It is a one-off mutation script that edits `public/js/i18n.js`.
- `i18nAudit.js` is not a test. It is an audit script that inspects translation coverage.
- `billingSubscriptionRecovery.test.js` is a real regression test, but it is not included in `npm run test:all`.

Required cleanup:

- Move `i18nFix.js` and `i18nAudit.js` out of `tests/` into an intentional script or audit location, or delete them if they are no longer needed.
- Rename `billingSubscriptionRecovery.test.js` only if the current name is judged too recovery-specific, then ensure the intended regression coverage is actually included in the test suite.

### Root documentation drift

Present:

- `AUDIT-REPORT.md`
- `AUDIT-REPORT-2026-04-13.md`
- `TASK-STATUS.md`

Required cleanup:

- Decide which of these remain current working documents.
- Preserve useful content under `docs/`.
- Keep root `README.md` for repository landing if desired, but avoid scattering working status documents across the repo root.

## Immediate Remaining Work

1. Decide whether the transactions undo flow is still required. If yes, rebuild it only in the transaction owner files.
2. Decide whether root `scripts/log_scan.js` stays as a documented wrapper or gets removed in favor of `In-Ex-Ledger-API/scripts/log_scan.js`.
3. Move or delete `tests/i18nFix.js` and `tests/i18nAudit.js`; they should not live under `tests/` as pseudo-tests.
4. Review and archive or delete `In-Ex-Ledger-API/recovery-artifacts/2026-04-11/`.
5. Consolidate or retire root status/audit docs after preserving any still-useful content under `docs/`.

## Rule

No hidden patches. No script injection. No disconnected sidecars. No duplicate drift files without a named owner.
