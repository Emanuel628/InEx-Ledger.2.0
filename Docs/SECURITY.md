# Security Notes for Zero-Trust Export Pipeline

## Core invariants
1. **Plaintext tax identifiers must never hit the API stack.** The API does not store, log, or transmit EIN/BN/taxId values—only ciphertext.
2. **No tax identifier columns in the data model.** The database schema must not contain any column named `taxId`, `ein`, `bn`, `*_tax_id`, etc. Metadata-only tables (exports and export_metadata) may record redaction indicators, hashes, and storage keys but no plaintext value.
3. **Export history stores only redacted PDFs.** Full versions are streamed on demand; we never persist them on disk, DB, or object storage attached to the API.
4. **Grant tokens are one-time and short-lived.** Each grant includes a `jti` that is consumed once and expires after 60 seconds.
5. **Logging is immune.** The API, edge, and worker must not emit `taxId`, `taxId_jwe`, `ein`, or `bn` in any message.

## Threat model reminders
- The API is a conduit for metadata and encrypted payloads only. Decryption happens inside a non-Internet TEE worker.
- The worker fetches its private key via attestation from a Key Vault; the key never leaves enclave RAM.
- CSV exports never include tax IDs under any circumstance.
- Any future retention of export files should only reference redacted artifacts.

## Phase 4–7 checklist
- **Phase 4 (Redacted history)** – Store only the redacted PDF (`storage/redacted-exports`) and keep `full_version_available=true` in the metadata. History downloads must call `/api/exports/history/:id/redacted`. UI should always request a new grant before attempting to fetch a full version.
- **Phase 5 (Egress lockdown)** – Run `pdf-worker` in a subnet without NAT or Internet Gateway, exposing only a private VPC endpoint to the API and the provider’s attestation/KMS services. Rotate `PDF_WORKER_SECRET` and release a new worker image whenever you rotate `EXPORT_GRANT_SECRET`.
- Ensure `PDF_WORKER_ALLOWED_CIDRS` lists only the approved private CIDR(s) so the worker enforces inbound traffic restrictions at the application layer.
- Reference `pdf-worker/DEPLOYMENT.md` for the exact configuration needed to keep the worker fully isolated (no egress, attestation-only key retrieval, private endpoint access).
- **Phase 6 (Immune logging)** – Never log `taxId`, `taxId_jwe`, `ein`, `bn`, or any `*_tax_id` field in API/worker/edge logs. Disable request mirroring for `/api/exports/*`, and always sanitize job IDs before logging.
- Add a monitoring job (grep/alert) that scans recent logs for those sensitive keywords hourly and fails if any appear.
- You can use `node In-Ex-Ledger-API/scripts/log_scan.js` with `LOG_DIR=/var/log/inex-ledger` on a schedule to enforce this.
- Run `npm run log_scan` from `In-Ex-Ledger-API` whenever you rotate logging tiers. The CI workflow already executes it on every push/PR, so any sensitive pattern will fail the guardrails job immediately.
- **Phase 7 (DRM/ephemeral delivery)** – Stream the full PDF immediately from the worker response. If you must expose a signed URL, keep it ephemeral (minutes) and never persist full-tax-id versions anywhere in storage.
- Run `npm run verify:redacted-storage` (from `In-Ex-Ledger-API`) regularly to ensure only `.redacted.pdf` files remain in `storage/exports`.

## Testing guard rails
 - Run `npm run test:export-grant` inside `In-Ex-Ledger-API` whenever you rotate `EXPORT_GRANT_SECRET`/`PDF_WORKER_SECRET` to verify one-time grant usage and expiration behavior.

## Operational guidance
- Apply strict egress controls on the worker (no NAT, only private endpoints to the API and KMS).
- When rotating keys, publish the new public `kid` via `/api/crypto/export-public-key` and retire old `kid` values once caches expire.
- Use the runbook (`RUNBOOK.md`) for step-by-step rotation and attestation checks.
