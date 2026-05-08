# InEx Ledger Docs

This folder is the working documentation home for InEx Ledger.

Use this folder for current planning, cleanup, governance, architecture notes, and maintenance references. Root-level reports may remain for GitHub visibility or historical reference, but current work should point back here.

## Current docs

- `UNFINISHED-CLEANUP-WORK.md` — cleanup tracker for unfinished owner-file, sidecar, drift, and patch work.
- `REPO-GOVERNANCE.md` — repository organization rules, owner-file rules, parked dark mode policy, and stale document policy.
- `MAINTENANCE-SCRIPTS.md` — intentional maintenance scripts, why they exist, and when to run them.

## Root-level document status

These root-level files are historical and should not be used as current status sources:

- `AUDIT-REPORT.md`
- `AUDIT-REPORT-2026-04-13.md`
- `TASK-STATUS.md`

Those files are retained only as historical snapshots. Current status should live in this folder.

## Documentation rules

- Do not create duplicate cleanup docs for the same effort.
- Do not create new phase docs when the work belongs in `UNFINISHED-CLEANUP-WORK.md`.
- Prefer one owner document per topic.
- If a document becomes stale, mark it clearly at the top before leaving it in the repo.
- Keep root `README.md` only as the repository landing page; detailed working docs belong here.
