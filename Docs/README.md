# InEx Ledger Docs

This folder holds the active documentation for the application itself.

Use `Docs/` for current product, operational, security, privacy, deployment, runbook, authentication, style, and instructional documentation.

Do not use this folder for stale blockers, finished roadmap phases, or historical cleanup notes.

## Current entry points

- product overview: [PROJECT-README.md](PROJECT-README.md)
- current status: [CURRENT_STATUS.md](CURRENT_STATUS.md)
- production gate: [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md)
- release steps: [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md)

## Architecture notes

Short, code-verified notes on how specific subsystems actually work, kept
close to the code they describe rather than duplicated into a single giant
architecture doc:

- authentication (cookie session model, MFA, backend error handling): [AUTHENTICATION.md](AUTHENTICATION.md)
- startup and migration safety: [STARTUP_AND_MIGRATIONS.md](STARTUP_AND_MIGRATIONS.md)
- V3 frontend routing and migration status: [V3_ROUTE_INVENTORY.md](V3_ROUTE_INVENTORY.md)
- dynamic SQL construction rules: [DYNAMIC_SQL_RULES.md](DYNAMIC_SQL_RULES.md)
- paid-feature/plan enforcement: [PAID_FEATURE_ENFORCEMENT.md](PAID_FEATURE_ENFORCEMENT.md)
- mounted API surface inventory: [API_ROUTE_INVENTORY.md](API_ROUTE_INVENTORY.md)

## Folder structure

### `Docs/`

Active application and operational documentation.

### `Work-To-Do/`

Markdown files for planned or unfinished work.

### `Work-Completed/`

Markdown files for work that is done, stale, archived, or historical.

### `Work-Review/`

Markdown files that exist mainly for review, audit, sweep, investigation, or analysis.

## Rules

- Keep app-facing documentation in `Docs/`.
- Move completed or stale work documents to `Work-Completed/`.
- Move audit, review, and sweep documents to `Work-Review/`.
- Move unfinished plans and active work trackers to `Work-To-Do/`.
- Do not maintain both lowercase `docs/` and uppercase `Docs/`.
- Do not create duplicate trackers for the same work.
