# Database Table Audit (Categories, Receipts, Mileage, Exports, Export Metadata)

## Goal
Provide the DBA with repeatable commands that capture the schema of each critical table before we introduce the zero-trust export pipeline.

## Recommended commands
Replace `<PGHOST>`, `<PGPORT>`, `<PGUSER>`, and `<PGDATABASE>` with your environment values. Use a service account that has read-only access to the schema.

### 1. `categories`
```bash
PGPASSWORD="$PGPASSWORD" \
PGOPTIONS="--search_path=public" \
psql "postgresql://$PGUSER@$PGHOST:$PGPORT/$PGDATABASE" \
  -c "\d+ categories" > artifacts/categories-schema.txt
```

### 2. `receipts`
```bash
pg_dump "postgresql://$PGUSER@$PGHOST:$PGPORT/$PGDATABASE" \
  --schema-only --table=receipts > artifacts/receipts-schema.sql
```

### 3. `mileage`
```bash
pg_dump "postgresql://$PGUSER@$PGHOST:$PGPORT/$PGDATABASE" \
  --schema-only --table=mileage > artifacts/mileage-schema.sql
```

### 4. `exports`
```bash
pg_dump "postgresql://$PGUSER@$PGHOST:$PGPORT/$PGDATABASE" \
  --schema-only --table=exports > artifacts/exports-schema.sql
```

### 5. `export_metadata`
```bash
pg_dump "postgresql://$PGUSER@$PGHOST:$PGPORT/$PGDATABASE" \
  --schema-only --table=export_metadata > artifacts/export-metadata-schema.sql
```

## Notes
- Store these artifacts in a secure location (the `artifacts/` directory above is only illustrative).
- Never add or expose plaintext tax identifiers (EIN/BN) in any of these dumps.
