# Backup and Restore

This document is the canonical reference for backing up and restoring the
InEx Ledger production environment. Closes item 25 of the production
readiness list.

Sensitive fields (transaction descriptions, MFA secrets, recovery codes,
bank connection access tokens, CPA grant payloads) are stored encrypted at
rest under `FIELD_ENCRYPTION_KEY`. The encryption key is **not** in the
database — losing the key means encrypted columns are unrecoverable.
Back the key up separately from the database.

## What needs backing up

| Item | Storage | Owner | Frequency |
|---|---|---|---|
| Postgres database | Railway managed Postgres | Engineering | Daily snapshot + weekly off-site |
| Receipt files | `RECEIPT_STORAGE_DIR` (Railway volume) | Engineering | Daily |
| Redacted exports | `EXPORT_REDACTED_DIR` / object store | Engineering | Daily |
| `FIELD_ENCRYPTION_KEY` | Secrets manager (1Password / Railway env) | Founders | Versioned, never rotated without a re-encryption plan |
| `EXPORT_GRANT_SECRET`, `JWT_SECRET`, `CSRF_SECRET` | Secrets manager | Founders | Versioned |
| Stripe price / webhook env vars | Railway env vars + Stripe dashboard | Founders | On change |

## Backup schedule

- **Postgres**: Railway PITR retains 7 days by default. Take a manual logical
  dump (`pg_dump --format=custom`) weekly and store off-site (S3 bucket or
  encrypted Drive).
- **Receipts + redacted exports**: Daily `tar` to off-site storage. Rotate
  weekly to keep size manageable.
- **Secrets**: Snapshot the secrets-manager vault on any change.

### Postgres backup command

```bash
pg_dump \
  --format=custom \
  --no-owner \
  --file=inex-$(date +%Y%m%d-%H%M).dump \
  "$DATABASE_URL"
```

Verify the dump is non-empty (`>1MB` typically) before deleting the previous
backup.

### Receipt storage backup command

```bash
tar -C "$RECEIPT_STORAGE_DIR" -czf receipts-$(date +%Y%m%d).tar.gz .
```

## Restore procedure

### Database restore

1. Stop the API (Railway: scale to 0).
2. Provision an empty Postgres database matching the original major version.
3. Set `DATABASE_URL` to point at the new database.
4. Run the migration runner (it ships with the app and runs on boot via
   `initDatabase`). For a clean target, this populates the schema.
5. Restore the dump:

   ```bash
   pg_restore \
     --no-owner \
     --clean --if-exists \
     --dbname "$DATABASE_URL" \
     inex-<timestamp>.dump
   ```

6. Re-run `npm run migrations:verify-checksums` to ensure stored checksums
   match the migration files on disk.
7. Boot the API. Confirm `/health` returns `200` and migrations are reported
   as applied.

### Receipt restore

```bash
mkdir -p "$RECEIPT_STORAGE_DIR"
tar -C "$RECEIPT_STORAGE_DIR" -xzf receipts-<timestamp>.tar.gz
```

Confirm `getReceiptStorageStatus()` reports `mode = 'local'` and that a few
receipts open in the app.

### Secret restore

- `FIELD_ENCRYPTION_KEY`: must match the value present at the time the
  oldest encrypted row was written. Rotating this key requires re-encrypting
  every encrypted column.
- `EXPORT_GRANT_SECRET`: rotating this invalidates active export download
  links — schedule a maintenance window.
- `JWT_SECRET`: rotating this signs out every user. Communicate before
  rolling.

## Test the restore (quarterly)

Restore work is a procedure, not a guarantee. Schedule a quarterly drill:

1. Pull the most recent off-site dump into a throwaway database.
2. Boot a staging copy of the API against it.
3. Verify `/health`, `/api/me`, `/api/sessions`, and `/api/system/diagnostics`.
4. Verify a sample receipt opens and a sample export downloads.
5. Tear down the staging copy.

Record the date of the last successful drill in this file (below) so the
team can see at a glance when the restore path was last exercised.

## Access list

| Role | Postgres | Receipts | Secrets |
|---|---|---|---|
| Founders | Read/write | Read/write | Read/write |
| Engineering | Read/write | Read/write | Read |

Anyone outside this list does not have backup or restore privileges.

## Restore drill log

| Date | Operator | Outcome | Notes |
|---|---|---|---|
| _add a row every drill_ | | | |
