# Repository Governance

This document defines how InEx Ledger should stay organized as the codebase matures.

## Documentation structure

The repository uses four top-level documentation folders:

- `Docs/` — important documentation related to the application itself.
- `Work-To-Do/` — unfinished or planned work.
- `Work-Completed/` — completed, stale, archived, or historical work files.
- `Work-Review/` — audits, sweeps, investigations, and review notes.

Only `.md` files belong in the three work folders.

Root-level documents should be limited to files that GitHub or project visitors expect at the repository root, such as:

- `README.md`
- license or contribution files if added later

Do not maintain both lowercase `docs/` and uppercase `Docs/`.

## Folder rules

### `Docs/`

Use this for application-facing documentation:

- README/product overview copies
- terms/privacy/security references
- deployment instructions
- authentication instructions
- operational runbooks
- privacy impact assessments
- accounting trust rules
- style/spec documents
- maintenance-script instructions
- repository governance rules

### `Work-To-Do/`

Use this for unfinished or planned work:

- build plans
- rollout plans
- unfinished cleanup trackers
- production-readiness work that still needs live validation
- feature roadmap documents

### `Work-Completed/`

Use this for completed or stale work files:

- old audit reports marked done
- stale task-status documents
- archived historical reports
- documents marked `DONE — DO NOT USE`

### `Work-Review/`

Use this for review material:

- mutation audits
- table audits
- critical sweeps
- security reviews
- investigation notes

## Stale document policy

If a document is no longer current:

1. Mark it clearly at the top with `STATUS: DONE`, `STATUS: STALE`, or `STATUS: ARCHIVED`.
2. Explain what document should be used instead.
3. Move it to `Work-Completed/` if it is historical.
4. Do not let stale audit/status documents drive new work.

Current source of truth for cleanup work:

- `Work-To-Do/UNFINISHED-CLEANUP-WORK.md`

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
