# Maintenance Scripts

This document lists intentional maintenance scripts in the repo and explains why they exist.

Rule: scripts are allowed only when they are intentional, wired, and documented. If a script is no longer needed, remove it instead of leaving it as a loose repair file.

## API package scripts

These live under `In-Ex-Ledger-API/scripts/` and are wired through `In-Ex-Ledger-API/package.json`.

### `repair-migration-checksums.js`

Commands:

```bash
npm run migrations:verify-checksums
npm run migrations:repair-checksums
```

Also currently used by:

```bash
npm run prestart
```

Purpose:

- Verifies migration checksum consistency.
- Repairs known checksum drift when intentionally run with `--write`.

Owner area:

- migration runner / migration checksum process
- `In-Ex-Ledger-API/scripts/`

Policy:

- Keep while migration checksum repair is required.
- Do not create additional checksum repair scripts with overlapping behavior.
- If checksum repair becomes permanent owner logic, move that behavior into the migration runner and retire this script.

### `log_scan.js`

Command:

```bash
npm run log_scan
```

Also used by:

- `.github/workflows/phase7-guardrails.yml`

Purpose:

- Scans logs/source output for sensitive patterns before code is considered safe.

Owner area:

- `In-Ex-Ledger-API/scripts/`
- Phase 7 guardrails workflow

Policy:

- Keep while CI uses it.
- Do not duplicate it at the repo root unless the root version is intentionally documented as a wrapper.

### `i18n-audit.js`

Command:

```bash
npm run i18n:audit
```

Purpose:

- Checks translation coverage and identifies missing or inconsistent i18n keys.

Owner area:

- i18n maintenance scripts
- `In-Ex-Ledger-API/public/js/i18n.js`

Policy:

- This is a maintenance/audit script, not an automated test.
- Keep it under `scripts/`, not under `tests/`.
- If it becomes a required quality gate, add it to CI intentionally.

### `i18n-fix.js`

Command:

```bash
npm run i18n:fix
```

Purpose:

- Applies intentional i18n key fixes or formatting repairs.

Owner area:

- i18n maintenance scripts
- `In-Ex-Ledger-API/public/js/i18n.js`

Policy:

- Keep only while it performs a clearly useful maintenance task.
- Do not run casually without reviewing the diff.
- If the behavior becomes normal application logic, move it into the proper i18n owner file and retire the script.

### `verify-redacted-storage.mjs`

Command:

```bash
npm run verify:redacted-storage
```

Also used by:

- `.github/workflows/phase7-guardrails.yml`

Purpose:

- Verifies that export storage remains redacted/zero-trust as intended.

Owner area:

- export storage safety checks
- export/metadata services

Policy:

- Keep while export storage safety depends on this guardrail.

### `test-*.mjs` helper scripts

Examples:

- `test-export-grant.mjs`
- `test-region-tax.mjs`
- `test-accounts-put.mjs`
- `test-mileage-put.mjs`
- `test-email.mjs`

Purpose:

- Focused operational/regression checks for specific flows.

Policy:

- Keep if wired in `package.json` and still useful.
- Prefer real `node --test` test files when a script becomes long-term regression coverage.

## Root scripts

### `scripts/check-bundle-drift.js`

Used by:

- `.github/workflows/phase7-guardrails.yml`

Purpose:

- Checks frontend bundle/source drift so stale copied frontend files do not silently diverge.

Policy:

- Keep while CI uses it.
- If frontend source structure changes, update this script instead of bypassing it.

### `scripts/log_scan.js`

Current status:

- Review required.

Purpose:

- Appears to duplicate or overlap with `In-Ex-Ledger-API/scripts/log_scan.js`.

Policy:

- Keep only if it is intentionally referenced by root-level documentation or root-level workflows.
- Otherwise remove it and point documentation to `In-Ex-Ledger-API/scripts/log_scan.js`.

## Retired / historical recovery scripts

Dated recovery artifacts should not remain as active maintenance tools.

If a dated recovery folder exists, review and either archive it intentionally or delete it after confirming it is unused by runtime, package scripts, and CI.

Do not create future dated repair folders unless the contents are intentionally archived and documented.

## Script review checklist

Before keeping any script, answer:

1. Is it wired in `package.json` or CI?
2. Does this document explain why it exists?
3. Does it have a clear owner area?
4. Is it safer as a script, or should the behavior move into the real owner file?
5. Is there another script doing the same job?

If the answer is unclear, do not add more scripts. Consolidate or delete.
