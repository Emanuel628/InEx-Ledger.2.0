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

## Operational guidance
- Apply strict egress controls on the worker (no NAT, only private endpoints to the API and KMS).
- When rotating keys, publish the new public `kid` via `/api/crypto/export-public-key` and retire old `kid` values once caches expire.
- Use the runbook (`RUNBOOK.md`) for step-by-step rotation and attestation checks.
