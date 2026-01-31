# PDF Worker (TEE-ready)

This service is built to run inside a trusted execution environment (TEE) such as an AWS Nitro enclave or Azure Confidential Computing node. It decrypts incoming `taxId_jwe`, produces both full and redacted PDFs, and returns them without persisting any plaintext identifiers.

## Required environment

| Variable | Description |
| --- | --- |
| `PORT` | Port for the worker listener (default `9080`). |
| `PDF_WORKER_SECRET` | Shared header token (`X-Worker-Token`) to authenticate the API. Rotate alongside `EXPORT_GRANT_SECRET`. |
| `PDF_WORKER_PRIVATE_KEY_JWK` | RSA-OAEP-256 private key in JWK format. Fetch it only after enclave attestation; the key must never leave RAM. |
| `PDF_WORKER_ALLOWED_CIDRS` | Comma-separated CIDR ranges that are allowed to call the worker (e.g., the API-private subnet). Defaults to `10.0.0.0/8,172.16.0.0/12,192.168.0.0/16`. |

## Local development

1. Install dependencies: `npm install`.
2. Export the required env vars (generate a JWK pair or reuse your key infrastructure).
3. Run `npm run start` and keep the endpoint private.
4. The API calls `POST /generate` with `{ jobId, dateRange, taxId_jwe, ... }` and the shared header. The worker responds with base64-encoded `fullPdf` and `redactedPdf`.

## Security checklist

- Perform remote attestation before unsealing the private key (Nitro, Azure Confidential, etc.).
- Restrict the worker subnet: no NAT/Internet gateway, only allow the API and KMS attestation endpoints.
- Avoid logging decrypted tax IDs. Log only job IDs or statuses.
