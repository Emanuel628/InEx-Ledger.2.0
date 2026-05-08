# InEx Ledger Docs

This folder is for important documentation related to the application itself.

Use `Docs/` for product, operational, security, privacy, deployment, runbook, authentication, style, and instructional documentation.

Do not use this folder as a dumping ground for old task trackers, stale audits, or temporary cleanup notes.

## Folder structure

### `Docs/`

Application and operational documentation.

Examples:

- README / product overview
- authentication contract
- deployment checklist
- security notes
- privacy impact assessment
- breach notification runbook
- accounting trust rules
- style/spec documents
- maintenance-script instructions
- repository governance rules

### `Work-To-Do/`

Markdown files for planned or unfinished work.

Examples:

- build plans
- rollout plans
- unfinished cleanup trackers
- production-readiness work that still requires action

### `Work-Completed/`

Markdown files for work that is done, stale, archived, or historical.

Examples:

- completed audit reports
- completed task-status files
- stale reports marked `DONE — DO NOT USE`

### `Work-Review/`

Markdown files that exist mainly for review, audit, sweep, investigation, or analysis.

Examples:

- mutation audits
- table audits
- critical sweeps
- code review notes

## Rules

- Only `.md` files belong in `Work-To-Do/`, `Work-Completed/`, and `Work-Review/`.
- Keep app-facing documentation in `Docs/`.
- Move completed/stale work documents to `Work-Completed/`.
- Move audit/review/sweep documents to `Work-Review/`.
- Move unfinished plans and active work trackers to `Work-To-Do/`.
- Do not maintain both lowercase `docs/` and uppercase `Docs/`.
- Do not create duplicate trackers for the same work.
