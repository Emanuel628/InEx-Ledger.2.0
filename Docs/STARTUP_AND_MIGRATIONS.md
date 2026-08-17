# Startup And Migration Safety

## Boot order

`server.js`'s `startServer()` does exactly three things, in this order, and
does not open the HTTP listener until the first two finish:

1. `initializeRateLimiterProtection()` — connects the shared rate-limit
   backend (Redis if `REDIS_URL` is set; an in-memory store otherwise, or a
   hard failure if `RATE_LIMIT_ENABLED=true` in production and neither is
   reachable).
2. `initializeReceiptStorage()` — verifies the receipt storage directory is
   writable and logs its mode.
3. `await initializeDatabaseWithRetry()` — runs pending migrations (see
   below). Only after this resolves does `app.listen(PORT, ...)` run.

This ordering is deliberate and covered by a real test
(`tests/startupMigrationSafety.test.js`'s "server does not listen for
traffic before database initialization completes"): the test requires the
real `server.js`/`db.js`, spies on `initDatabase` and `app.listen`, and
asserts the actual call order rather than inspecting source text — a load
balancer or health check must never see the process as "up" before its
schema is ready.

If database initialization fails at process startup (only when run directly,
i.e. `require.main === module`), the process logs the failure and exits
(`process.exit(1)`) rather than serving traffic against an unknown schema
state.

## Migration runner — `db.js`'s `initDatabase()`

- Migration files live in `db/migrations/*.sql`, applied in filename-sorted
  order inside a transaction each (`BEGIN` / run / `INSERT INTO
  schema_migrations` / `COMMIT`, rolled back as a unit on failure).
- Applied migrations are tracked in `schema_migrations (filename,
  checksum)`. On every boot, every migration file's current on-disk checksum
  is compared against what's recorded for it.
- **A checksum mismatch on an already-applied migration is treated as
  unsafe by default** and throws `MigrationContentDriftError`, which fails
  startup — silently re-running a previously-applied migration whose content
  changed is exactly the kind of drift that corrupts schema state across
  environments. The fix for a genuine schema change is always a *new*
  migration file, never editing an old one.
- A narrow, explicit allowlist (`canAcceptHistoricalMigrationDrift`) accepts
  specific, already-reviewed historical checksum drift (e.g. a known
  formatting-only diff on one named migration) without modifying migration
  metadata — this is a deliberate, reviewed exception list, not a general
  escape hatch.
- If a transient DB connection error occurs during startup (not a content
  drift), `initializeDatabaseWithRetry()` retries indefinitely on a fixed
  delay (`DB_RETRY_DELAY_MS`, default 15s) rather than failing fast — this
  is what lets the app recover from the database not being ready yet during
  a coordinated deploy.

## Checksum repair tooling — `scripts/repair-migration-checksums.js`

- `npm run migrations:verify-checksums` — **read-only** by default. Reports
  drift between `schema_migrations`' stored checksums and the current file
  contents; makes no writes.
- `npm run migrations:repair-checksums` (`--write`) — the only way to
  actually update stored checksums, and is explicitly **not** wired into
  `prestart` or any automatic path (`tests/startupMigrationSafety.test.js`
  also asserts this directly: no `prestart` script exists, and `npm start`
  is exactly `node server.js`). Repairing checksums is an operator action
  taken after manual review, never something that runs unattended.
