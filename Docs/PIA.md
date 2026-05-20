# Privacy Impact Assessment
## InEx Ledger 2.0

Prepared by: InEx Ledger Engineering
Contact: privacy@inexledger.com
Jurisdictions considered: United States, Canada, Quebec
Document status: Living document
Last reviewed: 2026-05-20

## 1. Purpose

This Privacy Impact Assessment documents the personal information and financial data handled by InEx Ledger, the systems that process it, the third parties involved in delivery, and the safeguards currently implemented in the repository.

This document is intended to reflect the current codebase. It should not describe aspirational controls as if they are already live.

## 2. Scope of the System

InEx Ledger is a bookkeeping SaaS used to record and export transactions, receipts, mileage, invoices, subscriptions, privacy settings, and related business records.

The current repository includes:

- a Node.js / Express application in `In-Ex-Ledger-API/`
- a static frontend served by that application
- PostgreSQL-backed data storage
- receipt storage on local disk / mounted volume
- Stripe billing flows
- Resend transactional email flows
- Plaid bank-connection flows
- optional Anthropic-powered receipt OCR when enabled

## 3. Personal Information and Business Data Handled

### 3.1 Account and identity data

- email address
- password hash
- display name / profile fields
- country, province, and data-residency signals
- session and authentication metadata
- MFA-related secrets and trusted-device records

### 3.2 Business and bookkeeping data

- business name and business profile data
- tax IDs
- GST/HST registration information
- account, category, transaction, invoice, mileage, and recurring-entry data
- receipt files and receipt metadata
- export history and redacted export artifacts

### 3.3 Security, governance, and support data

- privacy-consent records
- cookie-consent records
- audit and user-action logs
- sign-in context such as IP-derived signals and user-agent strings
- support and troubleshooting communications when provided by users

## 4. Data Locations and Cross-Border Processing

The repository and current public product materials indicate that production infrastructure may process data in the United States.

Known or configured third-party processors visible from the codebase include:

- Railway for hosting and infrastructure
- Stripe for billing and payment processing
- Resend for transactional email
- Plaid for bank-linking features when enabled
- Anthropic for receipt OCR when `ANTHROPIC_API_KEY` is configured
- ipapi.co or the configured approved geolocation host for sign-in geolocation lookups

Cross-border assessment note:

- This system is not Railway-only from a privacy perspective.
- Any production privacy posture for Quebec or other cross-border regimes must consider all enabled third-party processors, not only primary hosting.

## 5. Current Safeguards Verified in the Repository

### 5.1 Encryption and credential protection

Verified in code:

- passwords are stored as bcrypt hashes
- refresh tokens are hashed at rest
- MFA secrets are encrypted
- transaction descriptions are encrypted with AES-256-GCM
- tax IDs are encrypted with AES-256-GCM
- Plaid access tokens are encrypted with AES-256-GCM
- new GST/HST numbers are now written through the field-encryption path

Implementation note:

- legacy plaintext GST/HST values can still be read through compatibility fallback until they are rewritten

### 5.2 Transport and browser security

Verified in code:

- Helmet headers are applied
- HSTS is enabled in production
- CSP is present and restrictive
- CORS is allowlisted
- auth cookies and CSRF cookies use `secure` in production

### 5.3 Access control and abuse resistance

Verified in code:

- JWT access tokens are short-lived
- refresh-token backed sessions are used
- CSRF validation is implemented and applied on many write routes
- rate limiting exists for auth, billing, receipt, and data API paths
- business-scoped data access is enforced across core ledger routes

### 5.4 Privacy and accountability tooling

Verified in code:

- privacy settings are stored server-side
- Quebec consent changes are logged
- cookie consent decisions are logged
- user data export and erase flows exist
- governance and audit records exist for sensitive user actions

## 6. Current Verified Gaps

### 6.1 Incomplete encryption coverage

The following areas are not fully encrypted at rest end-to-end in the current repository:

- transaction notes
- receipt files stored on disk
- receipt bytes stored in `receipts.file_bytes`

### 6.2 Legacy or partial data states

- GST/HST values written going forward are encrypted, but existing plaintext rows may remain until rewritten

### 6.3 Documentation consistency risk

Before this update, internal privacy/security docs overstated several controls. This PIA should now be treated as the authoritative repo-aligned version, and related docs should stay synchronized with it.

### 6.4 Operational and legal facts outside the repo

This PIA cannot prove, from code alone:

- which DPAs are executed
- who the formally designated privacy officer is as an individual
- whether OCR is enabled in production
- the exact production vendor and data-flow configuration at any moment

## 7. Privacy by Default and Consent

Verified in code:

- Quebec users default to stronger privacy settings
- analytics opt-in is off by default
- explicit Quebec privacy preference changes are logged in `privacy_consent_log`
- cookie consent is tracked independently in `cookie_consent_log`

## 8. Retention

The product currently exposes or documents these practical retention positions:

- live user data persists until the user deletes it or the account is removed
- certain security, consent, export, and audit records may persist longer for compliance and security purposes
- redacted export history is retained as part of auditability and user history

Policy requirement:

- public-facing retention statements must remain aligned with actual operational retention and backup practices

## 9. Incident Handling

The repository includes an incident response runbook and now includes a standing incident-register artifact in `Docs/CONFIDENTIALITY_INCIDENT_REGISTER.md`.

Quebec and Canadian incident handling should be based on:

- prompt assessment and notice where legal thresholds are met
- maintenance of an incident register
- retention of incident records for the applicable statutory period

## 10. Review and Update Trigger

This PIA must be updated when any of the following change:

- new third-party processors are introduced
- a sensitive field is added or reclassified
- receipt handling changes
- OCR or analytics behavior changes
- privacy rights flows change
- data residency or production hosting changes
