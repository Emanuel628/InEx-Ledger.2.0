# Security Plan
## InEx Ledger 2.0

Owner contact: privacy@inexledger.com
Document status: Living document
Last reviewed: 2026-05-20

## 1. Purpose

This document describes the security controls currently implemented in the repository and the operational controls that the deployment should maintain. It is written to match the current system rather than planned features.

## 2. System Overview

The production system consists of:

- the main Express application in `In-Ex-Ledger-API/`
- PostgreSQL storage
- local-disk or mounted-volume receipt storage
- Stripe billing integrations
- Resend email delivery
- Plaid integrations when enabled
- optional Anthropic receipt OCR when enabled

## 3. Security Objectives

Primary objectives:

- protect account credentials and sessions
- limit unauthorized cross-business data access
- preserve the integrity of bookkeeping records and exports
- provide auditability for privacy and user-governance actions
- reduce abuse, brute-force, and unsafe file-handling risks

## 4. Implemented Technical Controls

### 4.1 Credential and session controls

Verified controls:

- bcrypt password hashing
- short-lived access tokens
- hashed refresh tokens
- MFA challenge flows
- trusted-device records for MFA
- session listing and revocation

### 4.2 Data protection controls

Verified controls:

- AES-256-GCM field encryption for tax IDs
- AES-256-GCM field encryption for transaction descriptions
- AES-256-GCM field encryption for Plaid access tokens
- AES-256-GCM field encryption for MFA secrets
- encrypted writes for GST/HST numbers going forward

Known non-goal of this document:

- it does not claim that every sensitive field or every receipt artifact is encrypted at rest today

### 4.3 Browser and request protections

Verified controls:

- Helmet with CSP and HSTS in production
- CSRF token issuance and validation
- CORS origin allowlisting
- no-store cache headers for sensitive outputs
- secure cookie flags in production

### 4.4 Abuse controls

Verified controls:

- auth rate limiting
- data API rate limiting
- receipt-upload rate limiting
- billing mutation rate limiting

Operational caveat:

- when Redis is unavailable in production, the rate-limiter degrades to in-memory per-instance enforcement

### 4.5 Logging and governance

Verified controls:

- user action audit logging
- privacy consent logging
- cookie consent logging
- export history tracking
- structured logging around receipt and auth failures

## 5. Known Gaps

These gaps remain open as of 2026-05-20:

- transaction notes are not fully encrypted at rest end-to-end
- receipt blobs and receipt files are not fully encrypted at rest end-to-end
- legacy plaintext GST/HST values may still exist until rewritten
- U.S. breach-law operational detail is not yet state-by-state in the runbook
- processor / DPA status cannot be proven from the repository

## 6. Operational Requirements

The deployment should maintain:

- HTTPS-only public access
- production secrets outside source control
- `FIELD_ENCRYPTION_KEY` configured where encrypted fields are read or written
- `RATE_LIMIT_ENABLED=true` in production
- Redis configured for production deployments that scale beyond a single instance
- persistent receipt storage before production receipt uploads are enabled
- documented incident-handling and incident-register maintenance

## 7. Third-Party Processing and External Dependencies

Security and privacy operations depend on:

- Railway
- Stripe
- Resend
- Plaid when enabled
- Anthropic when receipt OCR is enabled
- approved geolocation provider configuration

This plan does not treat any third-party DPA or contract as verified unless that evidence exists outside the repo.

## 8. Incident Response

Operational incident handling is defined in:

- `Docs/BREACH_NOTIFICATION_RUNBOOK.md`
- `Docs/CONFIDENTIALITY_INCIDENT_REGISTER.md`

The runbook should be followed for:

- containment
- risk assessment
- regulator and user notice decisions
- lessons learned and remediation

## 9. Document Maintenance

This document must be updated when:

- a new third-party processor is enabled
- encryption coverage changes
- auth/session architecture changes
- receipt handling changes
- incident response procedures change
