# Security Plan & Privacy Impact Assessment (PIA)
## InEx Ledger 2.0

**Prepared by:** InEx Ledger Privacy Team  
**Contact:** privacy@inexledger.com  
**Jurisdictions:** United States · Canada (PIPEDA) · Quebec (Law 25 / Bill 64)  
**Document status:** Living — updated as features change  
**Last reviewed:** 2026-04-08

---

## 1. Purpose

This document serves as the Security Plan and Privacy Impact Assessment (PIA) for **InEx Ledger 2.0**. It describes how sensitive data is collected, handled, stored, and protected, and identifies risks and mitigations relevant to compliance with:

- **USA:** FTC Act (Section 5), Gramm-Leach-Bliley Act, U.S.A. Patriot Act (data subject to government access when stored in the United States), state privacy laws (CCPA/CPRA for California residents)
- **Canada:** *Personal Information Protection and Electronic Documents Act* (PIPEDA)
- **Quebec:** *Act respecting the protection of personal information in the private sector* (Law 25 / Bill 64) — mandatory PIA before cross-border transfers, Privacy by Default, 72-hour breach notification

---

## 2. Sensitive Data Handling

### 2.1 Social Insurance Number (SIN) and Business Number (BN)

InEx Ledger may accept a user's Canadian Business Number (BN) or U.S. Employer Identification Number (EIN) for inclusion on CPA-ready PDF exports.

| Handling stage | Approach |
|---|---|
| Input | Entered by the user in the Settings → Business Profile form |
| Transmission | Encrypted in transit over TLS 1.3 |
| Storage | Stored as `businesses.tax_id_encrypted` using AES-256-GCM before persistence; the raw value is never written to disk in plaintext |
| Display | Retrieved and decrypted only for the authenticated business owner; masked in UI as `***-***-XXXX` except when the user explicitly chooses to include it on an export |
| Export inclusion | Optional — user must actively check "Include tax ID on exported document"; not included by default |
| Post-export | The plaintext value is used ephemerally during PDF generation and is not logged, cached, or written to any intermediate file |
| Deletion | Removed when the user deletes the business or the account (`DELETE /api/businesses/:id`, `POST /api/privacy/delete`) |

**Ephemeral processing:** When the PDF worker receives a tax ID for rendering, it decrypts the value in memory immediately before template rendering and does not persist it to the PDF worker's storage, logs, or temporary files. The decrypted value exists only for the duration of the PDF generation process.

### 2.2 Other Sensitive Financial Fields

| Field | Storage | Encryption |
|---|---|---|
| Transaction descriptions | `transactions.description_encrypted` | AES-256-GCM |
| Account numbers | `accounts.account_number_encrypted` | AES-256-GCM |
| MFA secrets | `users.mfa_secret_encrypted` | AES-256-GCM |
| Passwords | `users.password_hash` | bcrypt (cost 12) — one-way, not reversible |

All AES-256-GCM keys are stored in the `FIELD_ENCRYPTION_KEY` Railway Secret environment variable and are never committed to source code or included in logs.

---

## 3. Cross-Border Data Transfer Risks (Railway Hosting)

### 3.1 Infrastructure Location

| Resource | Provider | Region |
|---|---|---|
| Production API | Railway.app | United States (US East) |
| PostgreSQL database | Railway.app managed PostgreSQL | United States (US East) |
| Object storage (receipts) | Railway.app object storage | United States (US East) |
| PDF worker | Railway.app | United States (US East) |

All infrastructure is hosted in the United States. Data from Canadian and Quebec users therefore crosses the Canada–U.S. border on every write operation.

### 3.2 U.S.A. Patriot Act Risk

The USA PATRIOT Act (Uniting and Strengthening America by Providing Appropriate Tools Required to Intercept and Obstruct Terrorism Act of 2001) grants U.S. law enforcement authorities the ability to compel U.S.-based service providers (including cloud infrastructure companies such as Railway) to disclose customer data, potentially without notifying the affected customers.

**Risk assessment:**
- **Likelihood:** Low for small-business bookkeeping data — government access orders are targeted at specific investigations
- **Impact:** Medium — exposure of financial records including income, expenses, and tax identifiers
- **Residual risk:** Present and cannot be fully eliminated while using U.S.-based infrastructure

**Disclosure to users:** A cross-border disclosure notice is displayed on the Privacy Policy page and on the export workflow confirmation to ensure informed consent.

### 3.3 Quebec Law 25 Cross-Border Transfer Requirement

Under Quebec Law 25, transferring personal information outside Quebec requires a prior PIA and contractual protections. This document constitutes that PIA. The following safeguards justify the transfer:

1. AES-256-GCM at-rest encryption for all sensitive fields
2. TLS 1.3 in-transit encryption
3. Mandatory MFA for all CPA (professional) access
4. Contractual data processing terms with Railway (Railway's Terms of Service and Data Processing Agreement)
5. Opt-in analytics — analytics data is not collected unless a Quebec user explicitly consents
6. Privacy by Default — data-sharing is OFF by default for Quebec residents

---

## 4. Mitigation Strategies

### 4.1 Encryption

- **At rest:** AES-256-GCM for all personally identifiable and financially sensitive fields
- **In transit:** TLS 1.3 enforced by Railway's edge proxy
- **Passwords:** bcrypt (cost factor 12); never stored in plaintext or reversible form
- **Key management:** `FIELD_ENCRYPTION_KEY` stored as a Railway Secret; rotated in accordance with the Key Rotation SOP

### 4.2 Opt-In Analytics (Quebec Compliance)

Analytics data collection is disabled by default for all users. Quebec residents are subject to an additional layer:

- The `user_privacy_settings.analytics_opt_in` field defaults to `FALSE`
- The analytics toggle in Settings is only displayed when the user's `data_residency` equals `QC`
- Enabling analytics triggers a mandatory consent modal displaying the required Law 25 legal text
- Every consent change is recorded in `privacy_consent_log` with timestamp, action type, IP address, and user-agent
- Opting out is always available without confirmation

### 4.3 Access Control

- JWT access tokens: 15-minute expiry
- Rotating refresh tokens: 7-day lifespan, stored as SHA-256 hashes
- MFA required for all CPA portfolio access
- Row-level business scoping: all data queries are scoped to `business_id` owned by the authenticated user

### 4.4 Rate Limiting & Abuse Prevention

- Authentication endpoints: 20 requests per 15-minute window per IP
- Data API endpoints: 100 requests per minute (configurable)
- Billing mutation endpoints: 5 requests per hour (for destructive operations)
- Helmet security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options) on all responses
- Parameterized queries only — no dynamic SQL string concatenation

### 4.5 Audit Trail

- Transaction edits use an append-only model: edits create a new `is_adjustment = true` row referencing `original_transaction_id`; no existing rows are overwritten
- CPA access grants and all CPA activity are recorded in `cpa_audit_logs`
- Privacy consent changes are recorded in `privacy_consent_log`

---

## 5. Incident Response

### 5.1 Breach Notification Obligations

| Regulator | Threshold | Deadline |
|---|---|---|
| FTC (US) | Material breach | Prompt (good-faith standard) |
| OPC (Canada / PIPEDA) | Real risk of significant harm | Promptly after discovery |
| CAI (Quebec / Law 25) | Confidentiality incident | **72 hours** after awareness |

### 5.2 Response Steps

1. Contain — revoke exposed tokens, rotate affected credentials, disable compromised endpoints
2. Investigate — determine scope, affected users, and data categories
3. Document — record timeline, root cause, and remediation in the incident log
4. Notify — notify affected users and regulators within required deadlines
5. Remediate — deploy fix, verify, and update this PIA

---

## 6. Review History

| Date | Author | Summary |
|---|---|---|
| 2026-04-08 | InEx Ledger Privacy Team | Phase 2 — cross-border risk analysis, SIN/BN ephemeral processing, mitigation strategies |
| 2026-04-07 | InEx Ledger Engineering | Phase 1 — initial PIA for analytics opt-in and field encryption |

---

*This document must be updated whenever a new feature, data collection change, third-party integration, or infrastructure change is introduced that could affect privacy obligations.*
