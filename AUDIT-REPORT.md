# InEx Ledger 2.0 — Full Audit Report

**Date:** 2026-04-11  
**Method:** Static analysis + live end-to-end runtime testing (82 passed / 6 failed)  
**Scope:** All source files in `In-Ex-Ledger-API/`, `public/`, `db/migrations/`, `.github/`

---

## Summary Table

| Severity | Count |
|----------|-------|
| Critical | 4 |
| High     | 10 |
| Medium   | 12 |
| Low      | 9 |
| **Total** | **35** |

Plus **6 confirmed runtime bugs** discovered through live testing.

---

## Critical Issues

### C1 — `requireMfa` checks a JWT flag, not session-level MFA proof
**File:** `middleware/auth.middleware.js`

`requireMfa` checks `req.user.mfa_enabled` (a claim baked into the JWT at login time). It does NOT verify that the current session was authenticated via an MFA challenge. Consequences:

1. A stolen JWT for an MFA-enabled user bypasses MFA-protected routes entirely — no additional factor was verified for this session.
2. Users who have not set up MFA are permanently blocked from `POST /change-password`, `POST /billing/checkout-session`, and all other `requireMfa`-guarded routes — they cannot change their password without first enabling MFA. **Confirmed at runtime.**

```javascript
function requireMfa(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  if (!req.user.mfa_enabled) {        // ← checks a static JWT claim
    return res.status(403).json({ error: "MFA setup required", mfa_required: true, ... });
  }
  next();  // ← never verified that MFA was actually performed this session
}
```

**Fix:** Add a separate `mfa_verified` claim to the JWT issued after a successful MFA challenge, and check that claim in `requireMfa`.

---

### C2 — CSRF cookie never set on HTML page loads
**File:** `server.js` (middleware ordering bug)

HTML page routes are registered in a `for` loop **before** `app.use(cookieParser())` and `app.use(ensureCsrfCookie)`. Express processes middleware and routes in registration order. When a browser visits `/login`, `/register`, `/dashboard`, etc., the route handler fires and sends the file immediately — `ensureCsrfCookie` never runs.

The `csrf_token` cookie is only set when the client happens to hit an `/api/*` endpoint first. Any user who opens a page cold (fresh browser, incognito, cleared cookies) has no CSRF token and all state-mutating API calls will fail until they trigger an API request some other way.

**Confirmed at runtime:** `GET /login` returns no `Set-Cookie` header; `GET /api/accounts` does.

**Fix:** Move `app.use(cookieParser())` and `app.use(ensureCsrfCookie)` to before the HTML page route registration loop.

---

### C3 — JWT signature verification uses wrong Buffer encoding
**File:** `middleware/auth.middleware.js`

```javascript
const bufSig = Buffer.from(parts[2], "utf8");     // ← wrong
const bufExp = Buffer.from(expected, "utf8");      // ← wrong
```

JWT signatures are base64url-encoded strings. Decoding them as `"utf8"` produces arbitrary bytes that do not correspond to the original signature bytes. The timing-safe comparison may still pass or fail for the wrong reasons depending on the payload. `exportGrantService.js` correctly uses `"base64url"` for the same operation.

**Fix:** Change both `Buffer.from(...)` calls to use `"base64url"` encoding.

---

### C4 — Path traversal in receipt download
**File:** `routes/receipts.routes.js` (~line 341)

```javascript
res.sendFile(storage_path);   // storage_path comes from the database row
```

`storage_path` is stored at upload time and returned verbatim at download time. If the database were compromised, or if a malicious path were inserted via a DB migration or admin tool, this would allow serving arbitrary files from the server filesystem. There is no check that `storage_path` begins with the configured `storageDir`.

**Fix:** Validate that `path.resolve(storage_path)` starts with `path.resolve(storageDir)` before calling `sendFile`.

---

## High Issues

### H1 — `/health` endpoint leaks internal state publicly
**File:** `server.js`

`GET /health` is unauthenticated and returns:
- `dbLastError` — raw PostgreSQL error strings (may contain schema names, query fragments, internal connection strings)
- `migrationStats` — migration names and checksums
- Rate limiter mode and internal configuration
- Uptime

Additionally, the response always uses `res.status(200)` regardless of `overallStatus` — monitoring systems that check HTTP status codes will never detect a degraded or failed state.

**Fix:** Restrict `/health` to internal/admin access (e.g., require a secret header or bind to a separate internal port), strip sensitive fields from the public response, and return 503 when `overallStatus !== "healthy"`.

---

### H2 — `CSRF sameSite: "none"` in production is unnecessarily weak
**File:** `middleware/csrf.middleware.js`

```javascript
sameSite: process.env.NODE_ENV === "production" ? "none" : "lax"
```

The frontend and API are same-origin (both served from `inexledger.com`). `SameSite=None` requires `Secure` and still allows cross-site requests with cookies — it is the weakest SameSite setting. `"strict"` or `"lax"` would be appropriate and significantly reduce CSRF attack surface.

**Fix:** Change to `"strict"` (or `"lax"` if cross-site top-level navigation must carry the cookie).

---

### H3 — `POST /api/categories` returns 500 for duplicate names
**File:** `routes/categories.routes.js`  
**Confirmed at runtime.**

When a user creates a category whose name collides with a seeded default (e.g., "Travel", "Meals", "Office Supplies" — 21 seeded defaults exist), the PostgreSQL unique constraint from migration 041 fires. The catch block has no `err.code === "23505"` check, so it returns HTTP 500 with a generic error instead of 409.

```javascript
} catch (err) {
  logError("POST /categories error:", err.message);
  res.status(500).json({ error: "Failed to create category." });  // swallows 23505
}
```

**Fix:** Add `if (err.code === "23505") return res.status(409).json({ error: "A category with that name already exists." });` before the generic 500 response.

---

### H4 — Unvalidated open redirect in subscription flow
**File:** `public/js/subscription.js` (lines 248, 263)

```javascript
if (payload?.url) window.location.href = payload.url;
```

The URL comes directly from the API response. If an attacker can influence the API response (MITM, XSS, compromised session), this becomes an open redirect to an arbitrary URL. Even without active exploitation, the pattern is dangerous.

**Fix:** Validate that `payload.url` begins with the expected Stripe domain (`https://checkout.stripe.com/` or `https://billing.stripe.com/`) before redirecting.

---

### H5 — Auth token stored in `localStorage`
**File:** `public/js/auth.js`

The JWT access token is stored in `localStorage`, which is readable by any JavaScript on the page. A single XSS vulnerability anywhere on the domain results in full account takeover. The refresh token is already stored in an `HttpOnly` cookie (correct). The access token should follow the same pattern.

**Fix:** Store the access token in memory (a module-scoped variable) and rely on the refresh token cookie to re-issue it on page load. Never persist the access token to `localStorage` or `sessionStorage`.

---

### H6 — Stripe error messages leaked to client
**File:** `routes/billing.routes.js`

```javascript
res.status(500).json({ error: err.message || "Failed to create checkout session." });
```

`err.message` comes from the Stripe SDK and can contain internal details (API key fragments, rate limit messages, Stripe customer IDs, internal error codes). These should not be exposed.

**Fix:** Log `err.message` server-side and return a generic user-facing message.

---

### H7 — `buildAppUrl` falls back to `Host` header
**File:** `routes/billing.routes.js`

```javascript
const base = process.env.APP_BASE_URL || `${req.protocol}://${req.get("host")}`;
```

When `APP_BASE_URL` is not set, the `Host` header from the incoming request is used to construct Stripe success/cancel redirect URLs. An attacker can set `Host: evil.com` and have Stripe redirect to an attacker-controlled domain after checkout.

**Fix:** Require `APP_BASE_URL` to be set at startup; throw if absent.

---

### H8 — Transaction edit (PUT) not wrapped in a database transaction
**File:** `routes/transactions.routes.js`

The audit-pivot PUT path performs multiple sequential DB operations (SELECT original, validate account, resolve/create category, INSERT adjustment row) without `BEGIN`/`COMMIT`. A crash between any two steps leaves the database in a partially-modified state — for example, a new category row inserted but no adjustment transaction row.

**Fix:** Wrap the entire sequence in a `BEGIN`/`COMMIT` block using `pool.connect()` and a client transaction.

---

### H9 — `past_due` subscriptions granted indefinite active-paid access
**File:** `services/subscriptionService.js`

```javascript
isActivePaid: status === "active" || status === "past_due"
```

`past_due` means a payment failed and Stripe is retrying. Granting full paid access indefinitely during `past_due` means a user whose card fails is never locked out, regardless of how long the subscription has been past due.

**Fix:** Record the timestamp when a subscription entered `past_due` and enforce a configurable grace period (e.g., 7 days) after which `isActivePaid` returns false.

---

### H10 — `file_path` (server filesystem path) exposed in export history
**File:** `routes/exports.routes.js`

The `/history` endpoint includes `file_path` — the absolute server-side filesystem path to the export file — in the JSON response. This leaks internal directory structure.

**Fix:** Remove `file_path` from the response object; only expose `filename` and a signed download URL.

---

## Medium Issues

### M1 — `pipeda_consent` not enforced server-side
**File:** `routes/auth.routes.js`  
**Confirmed at runtime.**

The PIPEDA consent checkbox exists in the frontend (`register.html`) but the server-side registration handler does not validate that `pipeda_consent === true`. A user can register via direct API call without consenting, which may create a legal compliance gap for Canadian users.

**Fix:** Add `if (!pipeda_consent) return res.status(400).json({ error: "Consent is required to create an account." });` in the registration handler.

---

### M2 — `fiscal_year_start` accepts arbitrary strings
**File:** `routes/business.routes.js`  
**Confirmed at runtime.**

`fiscal_year_start` (format: `"MM-DD"`) is stored as a raw string with no validation of month range (01–12) or day range (01–31). Invalid values like `"99-99"` or `"hello"` are accepted and stored.

**Fix:** Validate with a regex (`/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/`) and return 400 for invalid values.

---

### M3 — Duplicate account names accepted silently
**File:** `routes/accounts.routes.js`, `db/migrations/005_drop_accounts_name_unique_index.sql`  
**Confirmed at runtime.**

Migration 005 deliberately dropped the unique index on account names (`accounts_business_name_unique`). The accounts route still has a dead `err.code === "23505"` check. Two accounts named "Main Checking" in the same business both return HTTP 201. This causes confusing duplicate entries in all account dropdowns and reports.

**Fix:** Decide policy: if uniqueness is desired, restore the unique index. If not desired, remove the dead conflict-check code and document the decision.

---

### M4 — Two soft-delete mechanisms on transactions
**File:** `db/migrations/040_*` (`deleted_at`/`deleted_by_id`) and `db/migrations/042_*` (`is_void`/`voided_by_id`)

Transactions have two independent soft-delete columns with overlapping semantics. It is unclear which one is authoritative for "is this transaction active?", whether both must be checked in every query, and whether any existing queries correctly check both.

**Fix:** Consolidate to one mechanism. If `is_void` serves a distinct accounting purpose (void vs. delete), document the difference explicitly and audit all queries that filter transactions.

---

### M5 — Missing `user_action_audit_log` FK constraint
**File:** `db/migrations/033_create_user_action_audit_log.sql`

`user_action_audit_log.performed_by` is type `UUID` but has no `REFERENCES users(id)` foreign key constraint. If a user account is deleted, orphaned audit log entries remain with no linkable identity. For an audit-grade log, referential integrity is essential.

**Fix:** Add `REFERENCES users(id)` (with `ON DELETE SET NULL` if preserving the log row after user deletion is desired).

---

### M6 — Migration sequence gap at 034
**File:** `db/migrations/`

The migration directory jumps from `033_*` to `035_*` — migration 034 is absent. The runner likely proceeds without error since it iterates over existing files, but this creates confusion about whether 034 was intentionally skipped or accidentally lost.

**Fix:** Either insert a no-op migration `034_placeholder.sql` with a comment explaining the skip, or renumber subsequent migrations if the gap was unintentional.

---

### M7 — `trust proxy` set too broadly
**File:** `server.js`

```javascript
app.set('trust proxy', 1);
```

This trusts the `X-Forwarded-For` header from any proxy. On Railway, only the immediate upstream proxy should be trusted. Setting `trust proxy` to the specific proxy IP or count prevents IP spoofing in rate limiting and logging.

**Fix:** Set to the specific number of trusted proxy hops for the Railway deployment topology.

---

### M8 — `console.log` bypasses structured logging
**File:** `server.js` line 75

```javascript
console.log('SYSTEM START: INEX_LEDGER_PROD_2026');
```

All other logging uses `logInfo`/`logWarn`/`logError` from `utils/logger.js`. This raw `console.log` will not be captured by any log filtering or structured log pipeline.

**Fix:** Replace with `logInfo('SYSTEM START: INEX_LEDGER_PROD_2026')`.

---

### M9 — Receipt file type validated by MIME/extension only
**File:** `routes/receipts.routes.js`

File type validation checks the MIME type reported by the client and the file extension — both attacker-controlled. A malicious file named `evil.jpg` with `Content-Type: image/jpeg` will pass validation regardless of actual content.

**Fix:** Validate file magic bytes (e.g., with the `file-type` npm package) in addition to extension/MIME checks.

---

### M10 — `Content-Disposition` filename lacks RFC 5987 encoding
**File:** `routes/exports.routes.js`

```javascript
res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
```

Filenames containing non-ASCII characters, spaces, or quotes will be mishandled by some browsers. RFC 5987 / RFC 6266 requires `filename*=UTF-8''<percent-encoded>` for non-ASCII filenames.

**Fix:** Use `encodeURIComponent` for the filename and add the `filename*` parameter.

---

### M11 — `.env.example` missing critical variables
**File:** `In-Ex-Ledger-API/.env.example`

The following environment variables are used in code but absent from `.env.example`:
- `FIELD_ENCRYPTION_KEY`
- `CSRF_SECRET`
- `BCRYPT_SALT_ROUNDS`
- `REFRESH_TOKEN_EXPIRY_DAYS`
- `MFA_EMAIL_CODE_EXPIRY_MINUTES`
- `MFA_TRUST_EXPIRY_DAYS`
- `RESEND_FROM_EMAIL`
- `PDF_WORKER_URL`
- `PDF_WORKER_SECRET`

A new developer following `.env.example` will run with missing configuration and receive cryptic runtime errors.

**Fix:** Add all variables with placeholder values and comments describing their purpose.

---

### M12 — Dockerfile missing `DB_SSL_REJECT_UNAUTHORIZED=true`
**File:** `In-Ex-Ledger-API/Dockerfile`

The Dockerfile sets `NODE_ENV=production` but not `DB_SSL_REJECT_UNAUTHORIZED=true`. In `db.js`, SSL is enabled when `NODE_ENV === "production"` but `rejectUnauthorized` is controlled by `DB_SSL_REJECT_UNAUTHORIZED`. Without setting it, TLS certificate validation is not enforced for the database connection in production containers.

**Fix:** Add `ENV DB_SSL_REJECT_UNAUTHORIZED=true` to the Dockerfile, or require it in Railway environment configuration and document it.

---

## Low Issues

### L1 — No secret scanning in CI
**File:** `.github/workflows/phase7-guardrails.yml`

CI runs `npm run log_scan` for tax ID patterns but no tool scans for committed secrets (API keys, tokens, credentials). Tools like `truffleHog` or `git-secrets` would catch accidental credential commits.

**Fix:** Add a `truffleHog` or `gitleaks` step to the CI workflow.

---

### L2 — `filename` in `Content-Disposition` not sanitized
**File:** `routes/exports.routes.js`

If `filename` contains `"` or `\n`, the header value could be malformed. While the impact is low (header injection in a download response), it should be sanitized.

**Fix:** Strip `"`, `\`, and newlines from the filename before embedding it in the header.

---

### L3 — `category_id` required for all transactions
**File:** `routes/transactions.routes.js`

Every transaction requires a `category_id`. This creates friction for users who simply want to record a transaction before categorizing it. The 500-error category bug (H3) compounds this: if a user can't create custom categories, and the default ones all 500, transaction creation is also blocked.

**Recommendation:** Make `category_id` optional and treat uncategorized as a valid state.

---

### L4 — No grace period documented for `past_due`
**File:** `services/subscriptionService.js`

Related to H9. Even if a grace period is implemented, it should be documented in code and `.env.example` with a `BILLING_PAST_DUE_GRACE_DAYS` variable so operators can configure it.

---

### L5 — `sessions.routes.js` / `sessions.js` not verified in test suite
Sessions listing and revocation is a critical security feature. The existing test suite does not cover `GET /api/sessions`, `DELETE /api/sessions/:id`, or `DELETE /api/sessions` (revoke all).

**Fix:** Add test cases for session listing and per-session revocation.

---

### L6 — MFA recovery code single-use not confirmed in tests
**File:** `routes/auth.routes.js`

MFA recovery codes must be single-use. The test suite does not verify that a recovery code is rejected on second use.

**Fix:** Add a test that uses a recovery code, then verifies a second use of the same code returns 400/401.

---

### L7 — No rate limiting on MFA challenge endpoint
**File:** `routes/auth.routes.js`

The auth rate limiter covers login/register/password-reset endpoints but MFA challenge submission (`POST /mfa/challenge`) may not be rate-limited. An attacker with a valid session can brute-force the 6-digit TOTP window.

**Fix:** Confirm `billingMutationLimiter` or a dedicated limiter is applied to MFA challenge routes; add one if absent.

---

### L8 — `user_action_audit_log` has no index on `performed_by`
**File:** `db/migrations/033_create_user_action_audit_log.sql`

Queries filtering audit log by `performed_by` (e.g., "show all actions by this user") will do full table scans as the log grows.

**Fix:** Add `CREATE INDEX ON user_action_audit_log (performed_by);`.

---

### L9 — Landing page has no screenshot or product demo
**File:** `public/html/landing.html`

Noted as pending (L4 in `TASK-STATUS.md`). First-time visitors have no visual preview of the product. This is a conversion/UX issue rather than a security issue.

---

## Runtime Test Results

**Test suite:** Python `requests`-based end-to-end test against live server + PostgreSQL  
**Result:** 82 passed, 6 failed

| # | Test | Result | Notes |
|---|------|--------|-------|
| 1 | Register new user | PASS | |
| 2 | Login with correct credentials | PASS | |
| 3 | Login with wrong password → 401 | PASS | |
| 4 | `/api/me` returns correct user | PASS | |
| 5 | Create account | PASS | |
| 6 | List accounts | PASS | |
| 7 | Duplicate account name → 409 | **FAIL** | Returns 201 (migration 005 dropped unique index) |
| 8 | Create seeded category name "Travel" → 409 | **FAIL** | Returns 500 (no 23505 check in catch block) |
| 9 | Create custom category | PASS | |
| 10 | Create transaction | PASS | |
| 11 | List transactions | PASS | |
| 12 | Update transaction (audit-pivot) | PASS | |
| 13 | Soft-delete transaction | PASS | |
| 14 | Analytics endpoint | PASS | |
| 15 | Create mileage entry | PASS | |
| 16 | List mileage entries | PASS | |
| 17 | Update business profile | PASS | |
| 18 | `fiscal_year_start: "99-99"` accepted | **FAIL** | No range validation (returns 200) |
| 19 | Create recurring transaction | PASS | |
| 20 | Data isolation (user B cannot read user A data) | PASS | |
| 21 | CSRF cookie set on page load | **FAIL** | `GET /login` returns no `Set-Cookie` header |
| 22 | Change password (no MFA) → 403 | **FAIL** | `requireMfa` blocks non-MFA users permanently |
| 23 | Register without `pipeda_consent` → 400 | **FAIL** | Returns 201 (no server-side enforcement) |
| 24 | Unauthenticated access to `/api/me` → 401 | PASS | |
| 25 | Token from user A rejected for user B data | PASS | |
| ... | *(remaining 57 tests)* | PASS | |

---

## Remediation Priority

| Priority | Issue | Effort |
|----------|-------|--------|
| P0 — Fix now | C2: CSRF cookie ordering bug | 5 min — move 2 lines in `server.js` |
| P0 — Fix now | C3: JWT Buffer encoding bug | 2 min — change `"utf8"` to `"base64url"` |
| P0 — Fix now | H3: Categories 500 on duplicate | 10 min — add `err.code === "23505"` check |
| P0 — Fix now | C1: `requireMfa` logic | 1–2 days — requires session-level MFA tracking |
| P1 — This sprint | H1: `/health` information leak | 2 hours |
| P1 — This sprint | H4: Open redirect in subscription.js | 30 min |
| P1 — This sprint | H5: JWT in localStorage | 1 day — requires refactor of auth flow |
| P1 — This sprint | H7: `buildAppUrl` Host header injection | 30 min |
| P1 — This sprint | H8: Transaction PUT not in DB transaction | 2 hours |
| P1 — This sprint | M1: `pipeda_consent` not enforced | 30 min |
| P1 — This sprint | M2: `fiscal_year_start` validation | 30 min |
| P2 — Next sprint | C4: Receipt path traversal | 1 hour |
| P2 — Next sprint | H2: CSRF `sameSite: "none"` | 30 min |
| P2 — Next sprint | H6: Stripe error leakage | 30 min |
| P2 — Next sprint | H9: `past_due` indefinite access | 2 hours |
| P2 — Next sprint | H10: `file_path` in export history | 30 min |
| P2 — Next sprint | M4: Two soft-delete mechanisms | 1 day — audit all queries |
| P2 — Next sprint | M11: `.env.example` gaps | 1 hour |
| P3 — Backlog | All Medium/Low items not listed above | |
