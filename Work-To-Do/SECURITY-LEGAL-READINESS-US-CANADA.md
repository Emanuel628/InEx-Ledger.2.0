# Security-Legal Readiness - US and Canada

Date: 2026-05-20
Scope: Verified repo assessment for InEx Ledger based on current code, shipped docs, public legal pages, and current official legal sources.
Status: Not complete. This stays in `Work-To-Do/` because multiple verified gaps remain open.

## What This Review Is

- This is an engineering verification memo, not legal advice.
- I removed or downgraded claims that were not supported by the repo or by current official sources.
- Where a legal issue depends on facts outside the repo, I marked it as "needs legal/operational confirmation" instead of treating it as done or broken.

## Bottom Line

The codebase already has meaningful security and privacy controls, but the current written compliance posture is not accurate enough to treat as complete.

The biggest verified problem is not a missing crypto primitive. It is that `Docs/PIA.md`, `Docs/SECURITY_PLAN.md`, and parts of the incident story claim controls or legal positions that are not fully reflected in the code or are stated too strongly.

## Verified Items That Are Already In Place

These do not need to be added from scratch:

- Field encryption exists and is actively used for at least:
  - transaction descriptions
  - tax IDs
  - Plaid access tokens
  - MFA secrets
- Passwords are hashed with bcrypt.
- CSRF protection exists and is enforced on many sensitive API routes.
- Auth refresh tokens are hashed at rest.
- Privacy settings, Quebec consent logging, and cookie consent logging exist.
- User-facing privacy export and erase flows exist.
- The app has a breach runbook, a privacy policy, and internal security/privacy docs.
- The app has real security tests, including CSRF, auth, receipt handling, privacy routes, and rate limiting.

## Verified Gaps That Still Need Work

### 1. Internal compliance docs are materially stale

This is the clearest verified gap.

`Docs/PIA.md` and `Docs/SECURITY_PLAN.md` currently overstate or misstate multiple things, including:

- CPA access routes and mandatory CPA MFA controls that are not mounted server-side today
- encrypted account-number handling that is provisioned in schema/docs but not wired through active route logic
- use of `express-validator`, which is not a current dependency
- Quebec breach timing language stated as a fixed 72-hour rule, which is not what the current Quebec statute says

What needs to be done:

- Rewrite `Docs/PIA.md` to match the code exactly
- Rewrite `Docs/SECURITY_PLAN.md` to match the code exactly
- Remove claims about controls that are planned, partial, or unused

### 2. Quebec incident-notice language is wrong in the current docs

The repo docs currently treat Quebec Law 25 as a fixed 72-hour breach notice rule. The official statute requires prompt notice when an incident presents a risk of serious injury, and the official incident regulation requires the incident register to be kept for at least 5 years.

What needs to be done:

- Update all Quebec incident references in repo docs and runbooks from "72 hours" to prompt / proper diligence language
- Add the required 5-year confidentiality incident register retention rule to the operational docs

What does not need to be done:

- There is no verified basis to build around a fixed 72-hour Quebec timer

### 3. US breach-readiness documentation is still too thin

The runbook is useful, but it is still too generic for US state-law execution.

Verified from current official California law:

- California Civil Code 1798.82 now includes a 30-calendar-day notice rule, subject to listed delays

What needs to be done:

- Add a state-by-state US breach matrix to the runbook
- Track at least:
  - resident notice timing
  - regulator / attorney general notice triggers
  - substitute notice conditions
  - special content requirements where applicable

What does not need to be done:

- I did not verify the prior memo's exact "36 states require AG notice" count from an official source, so that exact number should not be used in this file

### 4. Quebec privacy-governance requirements are only partially evidenced

Quebec law requires a person in charge of personal information protection, governance policies/practices, and project PIAs for covered systems.

What is verified:

- Public contact information exists at `privacy@inexledger.com`
- Internal docs refer to a Privacy Officer
- A PIA document exists

What still needs to be done:

- Identify the actual responsible individual internally, or document the written delegation
- Update governance docs so they clearly cover retention/destruction, role responsibilities, and complaint handling using the current system, not aspirational controls

### 5. Cross-border processor coverage is incomplete in the current PIA story

The current PIA focuses heavily on Railway, but the code and dependencies show additional third parties processing personal data or receiving it in specific flows:

- Railway
- Stripe
- Resend
- Plaid
- Anthropic for receipt OCR when enabled
- ipapi.co or the configured geolocation host for sign-in geolocation

What needs to be done:

- Update privacy/compliance docs so cross-border analysis is not Railway-only
- Publish a sub-processor list publicly if that is the chosen policy position
- Confirm operationally, outside the repo, which vendor agreements and DPAs are actually in place

What cannot be marked done from the repo alone:

- DPA execution status
- vendor contract terms

### 6. Encryption coverage is incomplete

This is verified in code and schema.

Still plaintext or not fully protected at rest:

- `businesses.gst_hst_number`
- `transactions.note`
- receipt files stored on disk
- receipt bytes stored in `receipts.file_bytes`

Partially misleading today:

- `accounts.account_number_encrypted` exists in schema/docs, but I did not find active route usage proving account numbers are currently stored there end-to-end

What needs to be done:

- Either extend encryption coverage to these fields / stores, or narrow all claims that imply all sensitive financial data is encrypted at rest

### 7. The public privacy policy is still too vague on retention

The public privacy page has general retention language, but not the concrete schedule reflected in internal docs.

What needs to be done:

- Add concrete public retention periods where the company intends to stand behind them
- Make sure those periods are operationally supportable

### 8. AI receipt OCR is a real third-party data flow and is not fully surfaced in privacy materials

Verified in code:

- `POST /api/receipts/:id/extract` sends supported image receipts to Anthropic when `ANTHROPIC_API_KEY` is configured

What needs to be done:

- Update privacy disclosures to mention this third-party processing clearly
- Decide whether a separate user-facing notice or toggle is required before enabling it in production

What does not need to be done right now:

- If OCR is not enabled in production, this is a production-readiness issue, not an active live-processing issue

### 9. There is no standing incident register artifact in the repo workflow

The repo includes a runbook template, but not a maintained incident register or a clearly designated operational location for one.

What needs to be done:

- Create and maintain an incident register
- Retain it long enough for both Quebec and PIPEDA expectations

### 10. Production rate limiting degrades to in-memory fallback

Verified in `In-Ex-Ledger-API/middleware/rateLimiter.js`.

If production is running with rate limiting enabled but Redis unavailable, the system falls back to an in-memory limiter per instance.

What needs to be done:

- Treat Redis-backed rate limiting as an operational requirement for multi-instance production
- Document that a degraded fallback does not provide equivalent distributed protection

### 11. Cookie security still depends on `NODE_ENV === "production"`

Verified for auth and CSRF cookies.

What needs to be done:

- Keep this if deployment discipline is strong, or harden it further if non-production internet-facing environments are used

What does not need to be done:

- This is not a launch blocker for a correctly configured production deployment

### 12. Receipt upload validation is better than the old memo implied, but still not content-sniffed

Verified in `routes/receipts.routes.js`:

- allowed extension and MIME type pairs are enforced
- mismatched extension/MIME combinations are rejected

Still missing:

- magic-byte or file-signature validation

What needs to be done:

- Add content sniffing if you want stronger file-validation claims

What does not need to be done:

- The old memo should not describe receipt validation as if there are no file-type checks at all; there are checks, they are just not byte-level

### 13. CSV export formula-injection hardening is still missing

Verified in `routes/privacy.routes.js` CSV serialization logic: exported cells are CSV-escaped, but not prefixed or neutralized when values begin with spreadsheet formula triggers.

What needs to be done:

- Neutralize cells beginning with `=`, `+`, `-`, or `@` in CSV exports meant for spreadsheet software

## Items From the Prior Memo That Should Be Removed or Softened

These were not reliable enough to keep as stated:

- "Quebec has a 72-hour breach deadline"
- "36 states require AG notification" without an attached authoritative source
- any statement that implies GLBA Safeguards Rule definitely applies to this business model
- any statement that implies all sensitive financial fields are encrypted at rest today
- any statement that implies the repo already has live CPA access enforcement end-to-end

## Items That Do Not Need Immediate Implementation

These may still matter later, but I could not justify treating them as current must-do launch blockers from repo evidence alone:

- CCPA / CPRA full threshold-driven consumer-rights implementation unless the business meets the statutory thresholds
- full CASL unsubscribe implementation for marketing campaigns, because the repo currently shows consent capture but not an active outbound marketing system
- GLBA-specific "Qualified Individual / annual report / annual penetration test / biannual vulnerability scan" as a mandatory legal conclusion without business-model scoping by counsel

## Current Readiness Verdict

Engineering/security posture: decent, but incompletely documented.

Documentation/legal-operational readiness: not complete.

Current practical status:

- Not ready to move to `Work-Completed/`
- Ready for focused follow-up work
- Biggest immediate value is fixing documentation accuracy and breach/processor disclosures before making stronger compliance claims

## Highest-Value Next Moves

1. Rewrite `Docs/PIA.md` and `Docs/SECURITY_PLAN.md` so they match the actual code and actual legal standards.
2. Update `Docs/BREACH_NOTIFICATION_RUNBOOK.md` for:
   - prompt Quebec notice language
   - 5-year Quebec incident-register retention
   - a state-by-state US breach matrix
3. Decide whether to encrypt:
   - `gst_hst_number`
   - `transactions.note`
   - receipt storage at rest
4. Update the public privacy materials for:
   - retention specifics
   - third-party processors
   - Anthropic OCR disclosure when enabled
5. Create an operational incident register outside or alongside the repo.

## Official Legal Sources Used For Verification

- Quebec private-sector privacy act:
  - https://www.legisquebec.gouv.qc.ca/en/pdf/cs/P-39.1.pdf
- Quebec confidentiality incident regulation:
  - https://www.legisquebec.gouv.qc.ca/en/pdf/cr/A-2.1%2C%20R.%203.1%20.pdf
- California Civil Code 1798.82:
  - https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1798.82
- California Civil Code 1798.140:
  - https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1798.140
- Canada Breach of Security Safeguards Regulations:
  - https://laws-lois.justice.gc.ca/eng/Regulations/SOR-2018-64/page-1.html
- Massachusetts 201 CMR 17.00:
  - https://www.mass.gov/regulations/201-CMR-1700-standards-for-the-protection-of-personal-information-of-ma-residents
- FTC Safeguards Rule guidance:
  - https://www.ftc.gov/business-guidance/resources/ftc-safeguards-rule-what-your-business-needs-know
