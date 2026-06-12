# Security Audit - 2026-06-10

Scope: `In-Ex-Ledger-API` and API-hosted frontend security controls reviewed against:

- OWASP Top 10 2021 / reference project page for latest top-10 context
- OWASP ASVS 5.0.0
- OWASP API Security Top 10 2023
- CISA Secure by Design principles

Official references:

- https://owasp.org/Top10/2021/
- https://owasp.org/www-project-application-security-verification-standard/
- https://owasp.org/API-Security/editions/2023/en/0x00-header/
- https://www.cisa.gov/securebydesign

This is a code audit, not a penetration test. Ratings below are based on the code paths present in the repo on June 10, 2026.

## Executive Summary

Overall posture: **mixed / not launch-blocked everywhere, but not yet standards-clean**.

What is strong:

- Parameterized SQL is used broadly across the API.
- Authenticated mutating routes generally enforce CSRF.
- Helmet, CSP, HSTS, CORS allowlisting, and `x-powered-by` disabling are present in the main server.
- Refresh tokens are hashed at rest and rotated.
- Stripe, Plaid, and inbound email webhook verification paths exist.
- Receipt upload is materially more hardened than average.

What currently fails or needs remediation:

1. **Browser auth still needs a final cookie-first cleanup pass, but session/storage persistence of access tokens has been removed from the main frontend flow.**
2. **JWT signing and verification were implemented manually; this has now been migrated to `jsonwebtoken`, but issuer/audience/key-rotation hardening is still open.**
3. **Trusted client IP handling has been centralized; raw forwarded-header chains are no longer used as the canonical client IP in the audited security-sensitive paths.**
4. **Support artifact upload is materially weaker than receipt upload: no dedicated rate limit, MIME-only validation, and path resolution is not storage-confined.**
5. **File path resolution for stored artifacts accepts arbitrary existing paths instead of enforcing managed-directory confinement.**
6. **Some logging paths still capture more user-identifying detail than necessary for a finance app.**

## Highest-Risk Findings

### 1. Browser auth token handling

- Status: `PARTIAL PASS`
- Standards impact:
  - OWASP Top 10 2021: A04 Insecure Design, A07 Identification and Authentication Failures
  - ASVS 5.0.0: Session management, credential/token handling
  - OWASP API 2023: API2 Broken Authentication
  - CISA Secure by Design: secure defaults / reduce impact of compromise

At-risk files/functions:

- `In-Ex-Ledger-API/public/js/auth.js`
  - `getToken()`
  - `setToken(token)`
  - `refreshAccessToken()`
  - `requireValidSessionOrRedirect()`
- `In-Ex-Ledger-API/public/js/global.js`
  - unread-count polling and consent fetch paths
- `In-Ex-Ledger-API/public/js/login.js`
  - no longer requires a returned token to complete login
- `In-Ex-Ledger-API/public/js/mfa-challenge.js`
  - no longer requires a returned token to complete MFA
- `In-Ex-Ledger-API/middleware/auth.middleware.js`
  - now accepts secure auth cookies in addition to bearer headers
- `In-Ex-Ledger-API/routes/auth.routes.js`
  - now sets/clears an `HttpOnly` access-token cookie alongside refresh-token rotation

What changed in this pass:

- Access-token persistence in `sessionStorage` / `localStorage` was removed from the main auth helper.
- The browser frontend now relies on cookie-backed auth flows end-to-end.
- Login, MFA, onboarding, privacy, settings-mobile, unread polling, and consent paths were updated so they no longer require a stored browser token to function.

Residual risk:

- A successful same-origin XSS can still act within the user session; the reduction here is removal of browser-held bearer tokens, not elimination of all session abuse risk.

Recommended patch:

1. Keep browser auth cookie-only with `HttpOnly`, `Secure`, `SameSite=Lax` or `Strict` cookies.
2. Keep client requests same-origin and CSRF-protected instead of reintroducing browser-managed bearer tokens.
3. If a future native/mobile client needs bearer semantics, keep that path isolated from the browser bundle.

### 2. Custom JWT implementation

- Status: `PARTIAL PASS`
- Standards impact:
  - OWASP Top 10 2021: A02 Cryptographic Failures
  - ASVS 5.0.0: cryptographic architecture and token verification controls
  - OWASP API 2023: API2 Broken Authentication
  - CISA Secure by Design: use proven components, reduce bespoke security logic

At-risk files/functions:

- `In-Ex-Ledger-API/middleware/auth.middleware.js`
  - `signToken(payload, expiresInSeconds)`
  - `verifyToken(token)`

Why this is a problem:

- The original implementation was bespoke security code.
- This pass moved signing and verification to `jsonwebtoken`, which removes the highest-risk maintenance issue.
- Issuer/audience validation, `jti`, and key-rotation discipline are still not implemented.

Recommended patch:

1. Keep the library-based implementation.
2. Add `iss`, `aud`, `exp`, `nbf`, and optionally `jti` validation.
3. Add explicit key identifiers and a rotation path.
4. Separate access-token signing keys from any other HMAC uses.

Implementation direction:

- Replace `signToken` and `verifyToken` in `middleware/auth.middleware.js`.
- Add `JWT_ISSUER`, `JWT_AUDIENCE`, and versioned signing key configuration.

### 3. Spoofable client IP handling

- Status: `PASS`
- Standards impact:
  - OWASP Top 10 2021: A09 Security Logging and Monitoring Failures
  - ASVS 5.0.0: logging, trusted infrastructure metadata, fraud/security telemetry
  - OWASP API 2023: API8 Security Misconfiguration
  - CISA Secure by Design: trustworthy telemetry and abuse resistance

At-risk files/functions:

- `In-Ex-Ledger-API/services/sessionContextService.js`
  - `extractRequestContext(req)`
- `In-Ex-Ledger-API/services/signInSecurityService.js`
  - `extractClientIp(req)`
- `In-Ex-Ledger-API/services/auditEventService.js`
  - `extractRequestContext(req)`
- `In-Ex-Ledger-API/routes/consent.routes.js`
  - direct use of `req.headers["x-forwarded-for"]`
- Secondary impact in `routes/auth.routes.js`
  - `buildSignInDeviceContext`
  - `createRefreshToken`
  - login alert/device-recognition paths

What changed in this pass:

- A shared `requestIpService.js` now owns client-IP normalization and extraction.
- `sessionContextService.js`, `signInSecurityService.js`, `auditEventService.js`, and `consent.routes.js` now use trusted proxy-derived `req.ip` / socket fallback instead of trusting raw `X-Forwarded-For` as canonical identity.
- The forwarded chain can still be gathered separately for diagnostics, but it is no longer the source of truth for audit/security attribution in these paths.

Result:

- This spoofable-client-IP finding is closed for the audited core auth/session/audit/consent paths.

### 4. Support artifact upload/download hardening gap

- Status: `PASS / PARTIAL`
- Standards impact:
  - OWASP Top 10 2021: A05 Security Misconfiguration
  - ASVS 5.0.0: file upload validation, resource controls, safe file retrieval
  - OWASP API 2023: API4 Unrestricted Resource Consumption, API8 Security Misconfiguration
  - CISA Secure by Design: reduce attack surface, secure defaults

At-risk files/functions:

- `In-Ex-Ledger-API/routes/supportArtifacts.routes.js`
  - `upload` multer config
  - `router.post("/upload", ...)`
  - `router.get("/:id", ...)`
- `In-Ex-Ledger-API/services/supportArtifactStorage.js`
  - `resolveSupportArtifactFilePath(filePath)`

What changed in this pass:

- A dedicated per-user route limiter was added to support-artifact routes.
- Upload validation now enforces MIME/extension consistency instead of MIME-only acceptance.
- Support-artifact file resolution is now confined to the managed support-artifact storage root.

Remaining gap:

- File-signature sniffing and explicit `nosniff` response hardening are still worth adding.
- Uploads still use in-memory buffering with a 10 MB limit; that is acceptable for now, but not ideal forever.

Implementation direction:

- Bring `supportArtifacts.routes.js` up to the same standard as `receipts.routes.js`.
- Rewrite `resolveSupportArtifactFilePath` to reject non-managed paths.

### 5. Receipt path resolution should also be storage-confined

- Status: `PASS`
- Standards impact:
  - ASVS 5.0.0: file storage / path safety
  - OWASP Top 10 2021: A05 Security Misconfiguration

At-risk files/functions:

- `In-Ex-Ledger-API/services/receiptStorage.js`
  - `resolveReceiptFilePath(filePath)`

What changed in this pass:

- `resolveReceiptFilePath(filePath)` now resolves only inside the managed receipt storage directory and no longer accepts arbitrary absolute/raw paths.

Result:

- This specific path-confinement finding is closed.

### 6. Excessive identifier logging in some error paths

- Status: `PARTIAL FAIL`
- Standards impact:
  - OWASP Top 10 2021: A09 Security Logging and Monitoring Failures
  - ASVS 5.0.0: log minimization and sensitive-data handling
  - CISA Secure by Design: accountability without unnecessary customer exposure

At-risk files/functions:

- `In-Ex-Ledger-API/routes/auth.routes.js`
  - `logError("[forgot-password] failed to send reset email to", email, ...)`
- `In-Ex-Ledger-API/routes/email.routes.js`
  - logs raw recipient context when reply token matching fails
- `In-Ex-Ledger-API/routes/supportEmail.routes.js`
  - similar inbound recipient logging

What changed in this pass:

- Password-reset delivery failures in `auth.routes.js` now mask recipient email addresses before logging.
- Inbound invoice/support mail handlers now mask recipient arrays and sender email values before logging.

Remaining gap:

- A broader repository-wide logging sweep is still warranted, but the concrete high-signal call sites identified in this audit are now reduced.

## Framework Checklist

## OWASP Top 10 2021

| Category | Status | Notes |
|---|---|---|
| A01 Broken Access Control | `PASS / PARTIAL` | Business scoping is broadly good; object ownership checks are present in core routes. Remaining file-path issues are more storage-safety than classic BOLA. |
| A02 Cryptographic Failures | `PARTIAL FAIL` | The bespoke JWT implementation is gone, but issuer/audience/key-rotation hardening is still open. |
| A03 Injection | `PASS` | SQL is parameterized broadly; no obvious command injection surface found in mounted app code. |
| A04 Insecure Design | `PASS / PARTIAL` | Browser auth is now cookie-only in the audited web bundle; residual risk is standard same-origin session exposure if XSS lands. |
| A05 Security Misconfiguration | `PARTIAL FAIL` | Trusted-IP handling is fixed in the audited core paths; support-artifact controls are improved but not fully identical to receipts. |
| A06 Vulnerable and Outdated Components | `PARTIAL` | No full SCA result is embedded in repo. Dependency posture should be validated separately in CI. |
| A07 Identification and Authentication Failures | `PASS / PARTIAL` | JWT handling now uses a maintained library and the audited browser flow is cookie-only. Further issuer/audience/key-rotation hardening still remains. |
| A08 Software and Data Integrity Failures | `PARTIAL PASS` | Webhooks are verified; no obvious unsafe auto-update path found. Token library replacement still recommended. |
| A09 Security Logging and Monitoring Failures | `PARTIAL FAIL` | Good audit coverage exists, but client-IP spoofing and some over-detailed logging weaken trustworthiness. |
| A10 SSRF | `PASS` | `signInSecurityService.js` uses HTTPS-only geolocation host allowlisting. |

## OWASP API Security Top 10 2023

| Category | Status | Notes |
|---|---|---|
| API1 Broken Object Level Authorization | `PASS / PARTIAL` | Core resource routes scope by `business_id` and validate ownership. |
| API2 Broken Authentication | `PASS / PARTIAL` | Persistent browser token storage is removed, JWTs use a maintained library, and the audited browser flow is cookie-only. |
| API3 Broken Object Property Level Authorization | `PASS / PARTIAL` | Shared validation now constrains V2 `metadata` payloads in the audited project/bill/invoice/expense routes; broader field-level schema enforcement can still expand over time. |
| API4 Unrestricted Resource Consumption | `PARTIAL FAIL` | Support-artifact routes now have a dedicated limiter, but in-memory 10 MB uploads still deserve future tightening. |
| API5 Broken Function Level Authorization | `PASS` | Mounted route gating is generally present. Internal support endpoints are secret-protected. |
| API6 Unrestricted Access to Sensitive Business Flows | `PARTIAL PASS` | Billing and privacy flows are gated; no obvious unauthenticated business-flow bypass found in mounted code. |
| API7 Server-Side Request Forgery | `PASS` | Geolocation outbound call is allowlisted and HTTPS-only. |
| API8 Security Misconfiguration | `PARTIAL FAIL` | Trusted-IP handling is fixed in the audited core paths, and support-artifact/receipt file resolution is now storage-confined. |
| API9 Improper Inventory Management | `PARTIAL` | Route surface is large and mixed V1/V2; should be formally inventoried and tagged in CI. |
| API10 Unsafe Consumption of APIs | `PASS / PARTIAL` | Stripe/Plaid/webhook verification is present; continue enforcing strict response and dependency validation. |

## OWASP ASVS 5.0.0 (chapter-level)

| Area | Status | Notes |
|---|---|---|
| Architecture, Design and Threat Modeling | `PASS / PARTIAL` | Secure patterns exist and the audited browser flow is cookie-only, but issuer/audience/key-rotation hardening and broader threat-model regression coverage still remain. |
| Authentication | `PASS / PARTIAL` | Password strength, verification, lockout, MFA, and email verification are present. |
| Session Management | `PASS / PARTIAL` | The audited browser flow now relies on `HttpOnly` cookie-backed auth; keep expanding session abuse and fixation/regression coverage. |
| Access Control | `PASS / PARTIAL` | Core business scoping is good; continue expanding object/property tests. |
| Validation and Sanitization | `PASS / PARTIAL` | Receipt upload validation is solid, support-artifact type checks are covered, and V2 metadata validation now exists; continue broadening schema enforcement. |
| Stored Cryptography | `PASS / PARTIAL` | The bespoke JWT implementation is gone, but issuer/audience/key-rotation hardening is still recommended. |
| Error Handling and Logging | `PARTIAL FAIL` | Audit coverage is good, but canonical client-IP handling and log minimization need work. |
| Data Protection | `PASS / PARTIAL` | Refresh tokens are hashed, Plaid token encryption exists, and browser-held bearer token exposure was removed; continue minimizing sensitive logs. |
| Communications | `PASS` | HTTPS-oriented settings, HSTS, CORS allowlisting, CSP, and webhook validation are present. |
| Malicious Code / Supply Chain | `PARTIAL` | No CI-enforced dependency/vuln policy was evident from this review alone. |
| Business Logic | `PARTIAL PASS` | Billing and trial logic are reasonably guarded; keep abuse-case tests expanding. |
| File Handling | `PASS / PARTIAL` | Support-artifact and receipt storage are storage-root confined, and targeted regression tests now cover MIME mismatch and traversal-style inputs; add signature sniffing if desired. |
| API and Web Service Security | `PASS / PARTIAL` | Core API patterns are solid, browser auth is cookie-only, and targeted upload/path/session regressions exist; resource-consumption and inventory work still remain. |
| Configuration / Operations | `PARTIAL PASS` | Strong startup validation exists; strengthen inventory and dependency control evidence. |

## CISA Secure by Design

| Principle | Status | Notes |
|---|---|---|
| Take ownership of customer security outcomes | `PASS / PARTIAL` | Many controls exist and key browser-token/artifact gaps have been reduced, but dependency policy and log minimization still need tightening. |
| Embrace radical transparency and accountability | `PARTIAL PASS` | Audit events and system diagnostics exist; security debt should be tracked explicitly in release criteria. |
| Build security in from the start / secure defaults | `PASS / PARTIAL` | The audited browser auth flow now uses cookie-backed sessions by default; continue raising the floor with dependency gates and broader regression coverage. |
| Reduce attack surface | `PASS / PARTIAL` | Good CSP/CORS work, storage-root confinement, and stricter upload validation reduce exposure; route inventory and further trimming are still worthwhile. |
| Make exploitation expensive | `PASS / PARTIAL` | Rate limiting, CSRF, refresh rotation, MFA, and removal of browser-held bearer tokens all raise attacker cost; continue with logging and dependency hardening. |

## Recommended Patch Plan

### Priority 0 - Before broad launch

1. Replace browser-stored bearer tokens with `HttpOnly` authenticated cookies.
2. Replace custom JWT code with `jose`.
3. Centralize trusted client-IP derivation on `req.ip`.
4. Harden `supportArtifacts.routes.js` to match `receipts.routes.js`.
5. Restrict `resolveSupportArtifactFilePath` and `resolveReceiptFilePath` to managed storage roots only.

### Priority 1

1. Add CI SCA/dependency vulnerability gates.

### Priority 2

1. Expand targeted regression coverage beyond the current upload/path/session suite to more abuse-case scenarios.
2. Continue repository-wide logging minimization and redaction review.
3. Keep the route inventory current as new mounts are added or retired.

## Good Controls Already Present

- `server.js`
  - Helmet CSP/HSTS/referrer/permissions policy
  - CORS origin allowlisting
  - no-store caching for HTML/CSS/JS
- `middleware/csrf.middleware.js`
  - signed double-submit CSRF token model
- `routes/auth.routes.js`
  - password strength checks
  - login lockout
  - email verification
  - MFA support
  - refresh-token rotation
- `routes/receipts.routes.js`
  - ownership checks
  - accounting-lock checks
  - receipt-count limits
  - stronger upload MIME/extension validation
- `routes/plaid.routes.js`
  - Plaid webhook verification
- `routes/billing.routes.js`
  - Stripe webhook route and gated billing mutations

## Bottom Line

This app is not in bad shape technically, but it is **not yet clean against the requested standards**.

The two most important structural fixes are:

1. **stop exposing auth bearer tokens to browser JavaScript**
2. **stop trusting raw proxy headers and harden the weaker file-upload path**

Once those are fixed, the remaining gaps are much more manageable and the app will move materially closer to an enterprise-grade security baseline.
