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

1. **Access tokens are stored in browser session storage and used as JavaScript-readable Bearer tokens.**
2. **JWT signing and verification are implemented manually instead of using a vetted token library.**
3. **Client IP attribution trusts `X-Forwarded-For` directly in multiple security-sensitive paths.**
4. **Support artifact upload is materially weaker than receipt upload: no dedicated rate limit, MIME-only validation, and path resolution is not storage-confined.**
5. **File path resolution for stored artifacts accepts arbitrary existing paths instead of enforcing managed-directory confinement.**
6. **Some logging paths still capture more user-identifying detail than necessary for a finance app.**

## Highest-Risk Findings

### 1. Browser-readable access tokens

- Status: `FAIL`
- Standards impact:
  - OWASP Top 10 2021: A04 Insecure Design, A07 Identification and Authentication Failures
  - ASVS 5.0.0: Session management, credential/token handling
  - OWASP API 2023: API2 Broken Authentication
  - CISA Secure by Design: secure defaults / reduce impact of compromise

At-risk files/functions:

- `In-Ex-Ledger-API/public/js/auth.js`
  - `getToken()`
  - `setToken(token)`
  - `authHeader()`
- `In-Ex-Ledger-API/public/js/global.js`
  - API helper paths that read token state and build `Authorization` headers
- `In-Ex-Ledger-API/public/js/login.js`
  - stores auth token after login
- `In-Ex-Ledger-API/public/js/mfa-challenge.js`
  - stores auth token after MFA

Why this is a problem:

- Any successful XSS becomes full session compromise because the access token is readable by JavaScript.
- This weakens otherwise good CSRF and refresh-token protections because the attacker can just steal the bearer token directly.

Recommended patch:

1. Replace SPA-held access tokens with an `HttpOnly`, `Secure`, `SameSite=Lax` or `Strict` session cookie.
2. Move from client-built `Authorization: Bearer ...` to cookie-backed authenticated requests.
3. If you need a split-token architecture, keep the short-lived access token server-side and expose only a session cookie to the browser.
4. Remove all token persistence logic from frontend JS.

Implementation direction:

- Introduce a server session or signed/encrypted auth cookie in `auth.routes.js`.
- Remove `TOKEN_KEY`, `getToken`, `setToken`, and `authHeader` usage from `public/js/auth.js`.
- Update `requireAuth` to read the cookie or a server session instead of bearer headers for browser traffic.

### 2. Custom JWT implementation

- Status: `FAIL`
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

- The implementation is simple and not obviously broken, but it is still bespoke security code.
- There is no issuer/audience validation, no key rotation model, no `jti`, and no library-level hardening.
- Bespoke JWT handling creates avoidable long-term maintenance risk.

Recommended patch:

1. Replace the custom implementation with `jose`.
2. Validate `iss`, `aud`, `exp`, `nbf`, and optionally `jti`.
3. Add explicit key identifiers and a rotation path.
4. Separate access-token signing keys from any other HMAC uses.

Implementation direction:

- Replace `signToken` and `verifyToken` in `middleware/auth.middleware.js`.
- Add `JWT_ISSUER`, `JWT_AUDIENCE`, and versioned signing key configuration.

### 3. Spoofable client IP handling

- Status: `FAIL`
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

Why this is a problem:

- These functions prefer `X-Forwarded-For` directly from the request header.
- In app code, that header should be consumed via Express trusted proxy handling (`req.ip` / `req.ips`) after `app.set('trust proxy', ...)`, not by trusting the raw header value.
- Today a client can spoof the source IP used for device fingerprinting, audit trails, and some security analytics.

Recommended patch:

1. Centralize client IP resolution in one helper that uses `req.ip` only.
2. Stop reading `x-forwarded-for` directly in application code.
3. If you need the full chain for diagnostics, store it separately as untrusted metadata and never as the canonical client IP.

Implementation direction:

- Add one helper, e.g. `getTrustedClientIp(req)`, and use it everywhere.
- Update:
  - `services/sessionContextService.js`
  - `services/signInSecurityService.js`
  - `services/auditEventService.js`
  - `routes/consent.routes.js`

### 4. Support artifact upload/download hardening gap

- Status: `FAIL`
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

Why this is a problem:

- Uploads are accepted into memory with a 10 MB limit but no dedicated rate limiter.
- Validation is MIME-only; there is no extension/content-signature verification.
- Stored path resolution accepts arbitrary existing paths and basename fallbacks instead of enforcing the managed storage root.
- Download responses do not add a dedicated `X-Content-Type-Options: nosniff` header here.

Recommended patch:

1. Add a dedicated upload limiter similar to receipts.
2. Mirror receipt validation:
   - allowlist extensions
   - require MIME/extension consistency
   - inspect file signature for PDF/JPEG/PNG/WebP where possible
3. Constrain file resolution:
   - resolve only under the managed support-artifact directory
   - reject any path that escapes that root
4. Add `X-Content-Type-Options: nosniff` on downloads.
5. Prefer storing an internal object key or filename only, not an arbitrary path.

Implementation direction:

- Bring `supportArtifacts.routes.js` up to the same standard as `receipts.routes.js`.
- Rewrite `resolveSupportArtifactFilePath` to reject non-managed paths.

### 5. Receipt path resolution should also be storage-confined

- Status: `FAIL`
- Standards impact:
  - ASVS 5.0.0: file storage / path safety
  - OWASP Top 10 2021: A05 Security Misconfiguration

At-risk files/functions:

- `In-Ex-Ledger-API/services/receiptStorage.js`
  - `resolveReceiptFilePath(filePath)`

Why this is a problem:

- It checks multiple candidate paths and accepts any existing file, including absolute paths.
- That is safer than an unauthenticated arbitrary file endpoint, but still not strict enough for a finance application.

Recommended patch:

- Only permit files whose resolved path stays within `getReceiptStorageDir()`.
- Remove candidate logic that accepts arbitrary absolute/raw paths.

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

Why this is a problem:

- The log sanitizer helps, but some call sites still log raw email addresses or recipient arrays directly in error flows.
- In a bookkeeping product, log minimization should be stricter than generic web-app defaults.

Recommended patch:

- Mask email addresses before logging.
- Log counts or hashed identifiers where possible.
- Treat inbound recipient arrays as sensitive operational metadata.

## Framework Checklist

## OWASP Top 10 2021

| Category | Status | Notes |
|---|---|---|
| A01 Broken Access Control | `PASS / PARTIAL` | Business scoping is broadly good; object ownership checks are present in core routes. Remaining file-path issues are more storage-safety than classic BOLA. |
| A02 Cryptographic Failures | `FAIL` | Custom JWT implementation in `middleware/auth.middleware.js`. |
| A03 Injection | `PASS` | SQL is parameterized broadly; no obvious command injection surface found in mounted app code. |
| A04 Insecure Design | `FAIL` | Browser-readable bearer token architecture in `public/js/auth.js` and related frontend auth flows. |
| A05 Security Misconfiguration | `FAIL` | Spoofable `X-Forwarded-For` handling; weaker support-artifact upload/download controls. |
| A06 Vulnerable and Outdated Components | `PARTIAL` | No full SCA result is embedded in repo. Dependency posture should be validated separately in CI. |
| A07 Identification and Authentication Failures | `FAIL` | Token handling architecture and bespoke JWT logic are below best practice. |
| A08 Software and Data Integrity Failures | `PARTIAL PASS` | Webhooks are verified; no obvious unsafe auto-update path found. Token library replacement still recommended. |
| A09 Security Logging and Monitoring Failures | `PARTIAL FAIL` | Good audit coverage exists, but client-IP spoofing and some over-detailed logging weaken trustworthiness. |
| A10 SSRF | `PASS` | `signInSecurityService.js` uses HTTPS-only geolocation host allowlisting. |

## OWASP API Security Top 10 2023

| Category | Status | Notes |
|---|---|---|
| API1 Broken Object Level Authorization | `PASS / PARTIAL` | Core resource routes scope by `business_id` and validate ownership. |
| API2 Broken Authentication | `FAIL` | Access tokens in session storage; bespoke JWT handling. |
| API3 Broken Object Property Level Authorization | `PARTIAL` | Several V2 services accept loose `metadata` objects without schema enforcement. |
| API4 Unrestricted Resource Consumption | `FAIL` | `supportArtifacts.routes.js` lacks a dedicated limiter while accepting in-memory 10 MB uploads. |
| API5 Broken Function Level Authorization | `PASS` | Mounted route gating is generally present. Internal support endpoints are secret-protected. |
| API6 Unrestricted Access to Sensitive Business Flows | `PARTIAL PASS` | Billing and privacy flows are gated; no obvious unauthenticated business-flow bypass found in mounted code. |
| API7 Server-Side Request Forgery | `PASS` | Geolocation outbound call is allowlisted and HTTPS-only. |
| API8 Security Misconfiguration | `FAIL` | Raw `X-Forwarded-For` trust and weak support-artifact file resolution. |
| API9 Improper Inventory Management | `PARTIAL` | Route surface is large and mixed V1/V2; should be formally inventoried and tagged in CI. |
| API10 Unsafe Consumption of APIs | `PASS / PARTIAL` | Stripe/Plaid/webhook verification is present; continue enforcing strict response and dependency validation. |

## OWASP ASVS 5.0.0 (chapter-level)

| Area | Status | Notes |
|---|---|---|
| Architecture, Design and Threat Modeling | `PARTIAL FAIL` | Secure patterns exist, but browser-readable bearer tokens are a design-level weakness. |
| Authentication | `PASS / PARTIAL` | Password strength, verification, lockout, MFA, and email verification are present. |
| Session Management | `FAIL` | Frontend stores access tokens in session storage instead of fully `HttpOnly` session handling. |
| Access Control | `PASS / PARTIAL` | Core business scoping is good; continue expanding object/property tests. |
| Validation and Sanitization | `PARTIAL FAIL` | Receipt upload validation is solid; support-artifact validation is weaker. |
| Stored Cryptography | `FAIL` | Custom JWT signing/verification should be replaced with a vetted library. |
| Error Handling and Logging | `PARTIAL FAIL` | Audit coverage is good, but canonical client-IP handling and log minimization need work. |
| Data Protection | `PASS / PARTIAL` | Refresh tokens are hashed; Plaid token encryption exists; token exposure in browser lowers the overall score. |
| Communications | `PASS` | HTTPS-oriented settings, HSTS, CORS allowlisting, CSP, and webhook validation are present. |
| Malicious Code / Supply Chain | `PARTIAL` | No CI-enforced dependency/vuln policy was evident from this review alone. |
| Business Logic | `PARTIAL PASS` | Billing and trial logic are reasonably guarded; keep abuse-case tests expanding. |
| File Handling | `FAIL` | Support-artifact upload/download path needs stronger validation and path confinement. |
| API and Web Service Security | `PARTIAL FAIL` | Core API patterns are solid, but authentication/storage and resource-consumption gaps remain. |
| Configuration / Operations | `PARTIAL PASS` | Strong startup validation exists; strengthen inventory and dependency control evidence. |

## CISA Secure by Design

| Principle | Status | Notes |
|---|---|---|
| Take ownership of customer security outcomes | `PARTIAL` | Many controls exist, but browser token storage and weak artifact handling still shift too much risk to the app/user boundary. |
| Embrace radical transparency and accountability | `PARTIAL PASS` | Audit events and system diagnostics exist; security debt should be tracked explicitly in release criteria. |
| Build security in from the start / secure defaults | `FAIL` | The current auth architecture is not the safest default for a finance app SPA. |
| Reduce attack surface | `PARTIAL FAIL` | Good CSP/CORS work, but support artifact endpoints remain broader than they need to be. |
| Make exploitation expensive | `PARTIAL PASS` | Rate limiting, CSRF, refresh rotation, and MFA help, but XSS impact remains too high because of token storage. |

## Recommended Patch Plan

### Priority 0 - Before broad launch

1. Replace browser-stored bearer tokens with `HttpOnly` authenticated cookies.
2. Replace custom JWT code with `jose`.
3. Centralize trusted client-IP derivation on `req.ip`.
4. Harden `supportArtifacts.routes.js` to match `receipts.routes.js`.
5. Restrict `resolveSupportArtifactFilePath` and `resolveReceiptFilePath` to managed storage roots only.

### Priority 1

1. Mask email addresses and recipient arrays in all auth/inbound-email log paths.
2. Add schema validation for V2 `metadata` payloads.
3. Add a dedicated security regression suite for:
   - spoofed `X-Forwarded-For`
   - support artifact upload MIME/signature mismatch
   - path escape attempts
   - session theft resistance after XSS simulation assumptions

### Priority 2

1. Add CI SCA/dependency vulnerability gates.
2. Add a route inventory with authn/authz/rate-limit annotations.
3. Add ASVS-mapped tests for session, upload, and audit controls.

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
