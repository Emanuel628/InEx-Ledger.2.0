# Repository Governance

This document defines how InEx Ledger should stay organized as the codebase matures.

## Documentation structure

`Docs/` is the current working documentation folder.

Root-level documents should be limited to files that GitHub or project visitors expect at the repository root, such as:

- `README.md`
- `SECURITY.md` if needed later
- license or contribution files if added later

Historical audit or status files may remain at the root only if they are clearly marked stale at the top. They should not be used as current source-of-truth documents.

## Stale document policy

If a document is no longer current:

1. Mark it clearly at the top with `STATUS: DONE`, `STATUS: STALE`, or `STATUS: ARCHIVED`.
2. Explain what document should be used instead.
3. Do not let stale audit/status documents drive new work.

Current stale root files:

- `AUDIT-REPORT.md`
- `AUDIT-REPORT-2026-04-13.md`
- `TASK-STATUS.md`

Current source of truth for cleanup work:

- `Docs/UNFINISHED-CLEANUP-WORK.md`

## Owner-file rule

Useful behavior belongs in the real owner file for that feature.

Do not create sidecar files whose only job is to patch, hide, override, intercept, monkey-patch, or inject behavior that belongs elsewhere.

Bad patterns:

- `*-patch.js`
- `*-override*.js`
- `*-bridge.js`
- `*-handoff.js`
- `*-quickfix.js`
- `*-hotfix.js`
- `*-v2.js` when it duplicates an existing owner file
- files that mutate another module after importing it
- files that hide UI after render instead of fixing the renderer
- middleware that monkey-patches `res.json` or similar framework methods

Acceptable separate files:

- real services with reusable business logic
- route modules mounted as the feature owner
- page-specific JS/CSS files
- intentional scripts wired through `package.json` or CI
- documented maintenance tools
- parked design work with a clear owner and reason

## Owner map

### Global navigation, theme, and Quick Add

Owner files:

- `In-Ex-Ledger-API/public/js/global.js`
- `In-Ex-Ledger-API/public/css/core/`

Rules:

- Quick Add visibility and feature gating belong in `global.js`.
- Do not create hide-after-render Quick Add scripts.
- Theme runtime behavior belongs in `global.js` unless an early boot file is intentionally documented.

### Transactions

Owner files:

- `In-Ex-Ledger-API/routes/transactions.routes.js`
- `In-Ex-Ledger-API/public/html/transactions.html`
- `In-Ex-Ledger-API/public/js/transactions.js`
- `In-Ex-Ledger-API/public/css/pages/transactions.css`

Rules:

- Row actions, checkbox actions, undo behavior, and transaction UI behavior belong in these files.
- Do not create transaction action sidecars.

### Billing and subscription

Owner files:

- `In-Ex-Ledger-API/routes/billing.routes.js`
- `In-Ex-Ledger-API/services/subscriptionService.js`
- `In-Ex-Ledger-API/public/js/subscription.js`

Rules:

- Checkout normalization belongs in `billing.routes.js`.
- Subscription snapshot rules belong in `subscriptionService.js`.
- Subscription page behavior belongs in `subscription.js`.
- Do not create billing override routes or subscription patch modules.

### Auth and MFA

Owner files:

- `In-Ex-Ledger-API/routes/auth.routes.js`
- `In-Ex-Ledger-API/middleware/auth.middleware.js`
- dedicated auth/MFA service files if needed

Rules:

- Login/MFA flow behavior should be explicit in the auth flow.
- Do not monkey-patch response methods from middleware.

## Parked dark mode policy

Dark mode is intentionally parked until colors and surfaces are redesigned.

This is not considered cleanup junk.

Current policy:

- Light mode is the only active runtime theme.
- Dark-mode CSS may remain as parked design work.
- Do not delete dark-mode CSS just because dark mode is disabled.
- Do not allow dark mode to activate accidentally from localStorage, OS/browser settings, or a visible toggle.
- Any future dark-mode restart should be a planned design pass, not a hidden patch.

Related owner files:

- `In-Ex-Ledger-API/public/js/global.js`
- `In-Ex-Ledger-API/public/js/settings.js`
- `In-Ex-Ledger-API/public/css/core/dark-mode.css`
- parked dark-mode files under `In-Ex-Ledger-API/public/css/core/`

## Maintenance script policy

Scripts are allowed when they are intentional and documented.

A script should either be:

- wired in `package.json`,
- wired in GitHub Actions,
- documented in `Docs/MAINTENANCE-SCRIPTS.md`, or
- deleted.

Do not leave one-off repair scripts in random folders.

## CI policy

CI should stay green before merging or deploying.

Green CI means the automated GitHub checks passed. This protects the app from accidental breaks in migrations, tests, logs, exports, and critical flows.

If CI is red, fix or intentionally update the check before treating the code as ready.
