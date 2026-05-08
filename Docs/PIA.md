# Privacy Impact Assessment (PIA)
## InEx Ledger 2.0 — Living Document

**Prepared by:** InEx Ledger Engineering & Compliance  
**Jurisdictions:** United States of America · Canada (PIPEDA) · Quebec (Law 25 / Bill 64)  
**Document status:** Living — updated as features change  
**Last reviewed:** 2026-04-07

---

## 1. Purpose

This Privacy Impact Assessment (PIA) documents the personal and financial data collected by **InEx Ledger 2.0**, explains how it is stored, transmitted, and protected, and identifies the risks and mitigations in place to comply with:

- **USA:** FTC Act (Section 5 unfair/deceptive practices), Gramm-Leach-Bliley Act (financial data), state privacy laws (e.g., CCPA/CPRA for California residents)
- **Canada:** *Personal Information Protection and Electronic Documents Act* (PIPEDA)
- **Quebec:** *Act respecting the protection of personal information in the private sector* (Law 25 / formerly Bill 64), which imposes stricter rules including Privacy by Default, mandatory breach notification within 72 hours, and a right to data portability

---

## 2. Data Collected

### 2.1 Personal Details

| Field | Purpose | Stored in |
|---|---|---|
| Email address | Account authentication, transactional emails | `users.email` |
| Full name / Display name | User profile | `users.full_name`, `users.display_name` |
| Country & Province | Data-residency tagging; jurisdictional privacy defaults | `users.country`, `users.province` |
| Password hash (bcrypt, 12 rounds) | Authentication | `users.password_hash` |
| MFA credentials (encrypted) | Two-factor authentication | `users.mfa_secret_encrypted` |

### 2.2 Financial Data

| Field | Purpose | Stored in |
|---|---|---|
| Transaction amounts, types, dates | Bookkeeping | `transactions.*` |
| Transaction descriptions (AES-256-GCM encrypted) | Audit trail | `transactions.description_encrypted` |
| Account names & numbers (AES-256-GCM encrypted) | Banking reference | `accounts.account_number_encrypted` |
| Tax ID (AES-256-GCM encrypted) | Tax reporting | `businesses.tax_id_encrypted` |
| Receipt files | Expense documentation | Object storage (Railway) |
| Mileage logs | Business travel deductions | `mileage.*` |

### 2.3 Metadata & Logs

| Field | Purpose | Stored in |
|---|---|---|
| Session tokens (hashed) | Authenticated sessions | `refresh_tokens`, `mfa_trusted_devices` |
| CPA access grants | Professional access audit | `cpa_access_grants`, `cpa_audit_logs` |
| Privacy consent log | Quebec Law 25 explicit opt-in tracking | `privacy_consent_log` |
| IP address (consent events) | Consent attribution | `privacy_consent_log.ip_address` |

---

## 3. Data Residency

| Environment | Infrastructure | Region |
|---|---|---|
| Production API | Railway.app | United States (US East) |
| Database (PostgreSQL) | Railway.app managed PostgreSQL | United States (US East) |
| File storage (receipts) | Railway.app object storage | United States (US East) |

> **Cross-border transfer note (Quebec):** Data from Quebec residents is stored in Railway's US data centers. Under Quebec Law 25, a Privacy Impact Assessment (this document) is required before transferring personal information outside Quebec. The following safeguards justify the transfer: AES-256-GCM at-rest encryption, TLS 1.3 in-transit encryption, mandatory MFA for professional (CPA) access, and contractual data processing terms with Railway.

---

## 4. Safeguards

### 4.1 Encryption

- **At rest:** Sensitive database fields (`description_encrypted`, `account_number_encrypted`, `tax_id_encrypted`, `mfa_secret_encrypted`) are encrypted using **AES-256-GCM** before persistence. The encryption key is stored as a Railway Secret (`FIELD_ENCRYPTION_KEY`) and never committed to source code.
- **In transit:** All API endpoints are served over **TLS 1.3** (enforced by Railway's edge).
- **Passwords:** Stored as **bcrypt** hashes (cost factor 12), never in plain text.

### 4.2 Authentication & Access Control

- **JWT access tokens** with 15-minute expiry; **rotating refresh tokens** (7-day, stored as SHA-256 hashes).
- **Multi-Factor Authentication (MFA):** Email-based OTP, mandatory for all CPA (professional) accounts. Users without MFA enabled are blocked from accessing CPA portfolio routes (`/api/cpa-access/*`) until setup is complete.
- **Role-based access:** Regular users (`role: user`) and CPA users (`role: cpa`) have distinct permission levels enforced in middleware.

### 4.3 Audit Trail (Append-Only Transactions)

Transaction edits do **not** overwrite existing records. Instead, each edit inserts a new **adjustment row** (`is_adjustment = true`) referencing the original transaction (`original_transaction_id`). This provides an immutable, tamper-evident ledger that satisfies CPA audit requirements under both GAAP and IFRS, and aligns with PIPEDA accountability obligations.

### 4.4 Rate Limiting & Abuse Protection

- Auth endpoints: 20 requests per 15-minute window per IP.
- Data API endpoints: configurable via `createDataApiLimiter()` (default 100 req/min).
- Helmet security headers (CSP, HSTS, X-Frame-Options) on all responses.

---

## 5. Privacy by Default (Quebec Law 25)

For users who register with `country = CA` and `province = QC`:

1. **Data sharing defaults to OFF** — `user_privacy_settings.data_sharing_opt_out` is set to `true` at registration.
2. **Consent tracking** — Every explicit change to data-sharing preferences by a Quebec resident is recorded in `privacy_consent_log` with a timestamp, action type (`opt_in` / `opt_out`), IP address, and user-agent string.
3. **Right to data portability** — `POST /api/privacy/export` delivers a machine-readable JSON archive of all personal and financial data.
4. **Right to erasure** — `POST /api/privacy/delete` scrubs all transactional and business data while retaining the audit-required minimum (user account ID for referential integrity).

---

## 6. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Data breach (database exfiltration) | Medium | High | AES-256-GCM field encryption; row-level business scoping; no plaintext keys in code |
| Unauthorized account access | Medium | High | bcrypt passwords; MFA enforcement; rotating refresh tokens |
| CPA unauthorized client access | Low | High | requireMfa middleware on all CPA routes; explicit client grant workflow; full audit log |
| Cross-border data transfer (Quebec) | Present | Medium | This PIA; contractual safeguards with Railway; AES-GCM encryption |
| Privacy breach notification failure | Low | High | Automated monitoring (planned); 72-hour CAI notification SOP in Incident Response Plan |
| Insider threat (employee) | Low | High | Railway Secrets for encryption keys; no production DB access in dev environments |
| Injection / XSS attacks | Low | High | Parameterized queries only; Helmet CSP headers; `express-validator` on inputs |

---

## 7. User Rights

| Right | Mechanism |
|---|---|
| Access | `GET /api/privacy/export` — full JSON export |
| Portability | `GET /api/privacy/export` — machine-readable JSON |
| Rectification | Update profile at `PUT /api/me`; update business at `PUT /api/business` |
| Erasure | `POST /api/privacy/delete` (data scrub); `DELETE /api/me` (full account delete) |
| Withdraw consent | `POST /api/privacy/settings` with `dataSharingOptOut: true` |
| Complaint | Email: privacy@inexledger.com; CAI (Quebec): www.cai.gouv.qc.ca; OPC (Canada): www.priv.gc.ca |

---

## 8. Breach Notification Obligations

| Regulator | Threshold | Deadline | Contact |
|---|---|---|---|
| FTC (US) | Material breach | Prompt (no fixed deadline, good-faith standard) | ftc.gov/contact |
| OPC (Canada / PIPEDA) | Real risk of significant harm | Promptly after discovery | priv.gc.ca |
| CAI (Quebec / Law 25) | Confidentiality incident | **72 hours** after awareness | cai.gouv.qc.ca |

Refer to the Incident Response Plan (`/docs/IncidentResponsePlan.md`) for step-by-step breach procedures.

---

## 9. Retention & Deletion Schedule

| Data type | Retention | Rationale |
|---|---|---|
| Transaction records | 7 years | CRA / IRS tax record retention requirement |
| Audit adjustment rows | 7 years | Immutable by design; required for financial audits |
| Session / refresh tokens | Revoked at logout; auto-expired | Minimization |
| Privacy consent log | 5 years | Quebec Law 25 accountability |
| CPA audit logs | 7 years | Professional accountability |
| Receipt files | 7 years | Tax documentation |
| Email verification tokens | 15 minutes | Minimization |
| Password reset tokens | 20 minutes | Minimization |

---

## 10. Changes & Review History

| Date | Author | Summary |
|---|---|---|
| 2026-04-07 | InEx Ledger Engineering | Initial PIA — Phase 1 & 2 compliance implementation |

---

*This document is a living record. It must be updated whenever a new feature, data collection, or third-party integration is introduced that could affect privacy obligations.*
