# Migration Naming

New migrations must use sortable date prefixes:

```text
YYYYMMDD_short_description.sql
```

The older `NNN_*.sql` files are historical and remain in place because applied
filenames are tracked in `schema_migrations`. Do not rename them. If an old
migration was renamed before this policy existed, keep that compatibility in
`db.js` through `HISTORICAL_MIGRATION_FILENAME_ALIASES`.

When multiple migrations are needed on the same date, append a clear suffix that
keeps lexical order deterministic, for example:

```text
20260822_add_v2_business_soft_delete_columns.sql
20260822_validate_v2_business_soft_delete_columns.sql
```
