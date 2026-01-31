# Phase 5 Deployment Checklist

This checklist covers the secure deployment of pdf-worker inside a Trusted Execution Environment (TEE) with no egress, fulfilling Phase 5 requirements.

## Network & VPC
1. Create a private subnet with no Internet Gateway and no NAT Gateway.
2. Only allow inbound traffic from the API service via a private VPC endpoint or service mesh connection.
3. Allow outbound traffic only to the cloud provider's attestation/KMS endpoints used to unwrap PDF_WORKER_PRIVATE_KEY_JWK.
4. Block all other outbound access (use provider-private DNS resolvers if necessary).

## Worker Configuration
1. Provision the worker inside the TEE (AWS Nitro enclave, Azure Confidential VM, etc.).
2. Perform remote attestation on every boot before fetching the private JWK.
3. After attestation succeeds, request the private key from KMS/Secret Manager with a restricted IAM role.
4. Store the private key only in enclave RAM; never write it to disk or logs.
5. Set PDF_WORKER_SECRET to a strong random token and rotate it when EXPORT_GRANT_SECRET rotates.

## Authentication & Secrets
1. Configure the API to call https://<private-endpoint>/generate using the shared PDF_WORKER_SECRET header.
2. Ensure the worker verifies the header before processing jobs.
3. Use IAM policies so that only the API and attestation service can request the private key.

## Monitoring & Health
1. Enable health checks inside the subnet that do not expose tax IDs (e.g., GET /health).
2. Log only job IDs and high-level success/failure statuses; never log decrypted tax IDs.
3. On attestation failure, abort startup and alert the security team.

## Rollout Notes
- After deploying a worker update, confirm the API can still reach it via the private endpoint and the grant-to-worker handshake succeeds.
- Document the rotated secrets (PDF_WORKER_SECRET, EXPORT_GRANT_SECRET) and when each rotation occurs.
