# Export Key Rotation & Enclave Attestation Runbook

## 1. Public key rotation
- Generate the new RSA-OAEP-256 key pair outside the API (e.g., in a secure HSM or locally in a TEE worker).
- Store **only the new public JWK** (including `kid`, `alg`, `e`, `n`) in the environment variable `EXPORT_PUBLIC_KEY_JWK`. The API never sees the private key.
- Update `EXPORT_PUBLIC_KEY_KID` with the new `kid` and make sure the previous `kid` remains valid for at least one deployment to allow clients to refresh.
- Deploy the API, then verify `GET /api/crypto/export-public-key` returns the new key and the old `kid` has been retired.

## 2. Grant token attestation health
- Check that the environment variable `EXPORT_GRANT_SECRET` was rotated when the key rotation occurs (token invalidation time should be coordinated).
- Monitor the `/api/exports/request-grant` logs to ensure only metadata is stored and no body fields contain plaintext tax IDs.
- After deploying a new worker image, verify `pdf-worker` attestation and ensure it successfully decrypts `taxId_jwe` (see `pdf-worker/README.md` for local testing notes).

## 3. Worker key retrieval
- Start the TEE worker and perform remote attestation against the cloud provider’s attestation service (e.g., AWS Nitro, Azure Confidential Computing).
- Once attested, have the worker authenticate to the Key Vault/KMS and unwrap the private RSA key inside the enclave.
- The worker must not expose this key outside RAM. Use the attestation ID + sealed storage handshake defined in the architecture team’s runbook.
- While spinning up a new worker, follow `pdf-worker/DEPLOYMENT.md` to enforce Phase 5 networking constraints (no NAT/IGW, private endpoint, attestation-only KMS access) and rotate `PDF_WORKER_SECRET` along with `EXPORT_GRANT_SECRET`.
- Confirm `PDF_WORKER_ALLOWED_CIDRS` covers only the API-private subnet so the worker enforces the inbound-only policy at the application level.

## 4. Export validation
- Trigger a PDF export with `includeTaxId=true` to ensure the worker receives the `taxId_jwe`. Verify API logs do not contain `taxId` or `taxId_jwe`.
- Confirm the worker returns both `fullPdf` (streamed immediately) and `redactedPdf` (stored in history). Download the redacted history entry and confirm the tax ID is masked.
- Recreate a grant and ensure reused `jti` fails (401).
- To automate that, run `npm run test:export-grant` from `In-Ex-Ledger-API`; it issues a grant, verifies one-time use, waits for the TTL, and confirms expired tokens are rejected.

## 5. Ongoing checks
- Periodically grep logs for `taxId` or `taxId_jwe`. Use a monitoring job that fails if either string appears anywhere in `logs/*.log`.
- Ensure CSV exports continue to block `includeTaxId`.
