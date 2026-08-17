## Authentication Contract

This project enforces the authentication contract used by the live v3 frontend SPA (`In-Ex-Ledger-API/frontend-v3`), served from `In-Ex-Ledger-API/public/app-v3`. The v3 SPA is the canonical logged-in product experience and also owns the full auth bridge (login, register, forgot/reset password, email verification, MFA challenge) — see `Docs/V3_ROUTE_INVENTORY.md`.

- `/api/me` is the **only** source of truth for session validity. `getCurrentUser()` in `frontend-v3/src/lib/authApi.ts` is the canonical call site; `App.tsx` calls it on load to decide the authenticated vs. public app state.
- Session and CSRF tokens are cookie-only (`httpOnly` access/refresh tokens, a readable `csrf_token` cookie mirrored into an `X-CSRF-Token` header on mutating requests). No bearer token is ever stored in `localStorage` or read by client code — see `frontend-v3/src/lib/apiClient.ts`.
- `apiClient.ts`'s `apiRequest`/`apiBlobRequest` helpers retry a request exactly once after a `401` by POSTing to `/api/auth/refresh` (cookie-based silent refresh, no token exposed to JS); if that refresh fails, or the retried request still 401s, the client redirects to `/login?reason=expired&next=<canonical path>` unless the caller opted out via `skipAuthRedirect` (used by identity probes such as `getCurrentUser()` and by auth-flow calls where a 401/expected failure is normal, e.g. wrong password or wrong MFA code, and must not trigger a hard navigation away from the form).
- Guards never short-circuit based on token presence alone; every protected page's authenticated/public decision comes from an actual `/api/me` response, not from cookie or storage presence.

Auth-related frontend changes must be applied in `In-Ex-Ledger-API/frontend-v3/src` (primarily `lib/apiClient.ts`, `lib/authApi.ts`, `lib/i18n.ts`, and the `pages/Login.tsx` / `Register.tsx` / `ForgotPassword.tsx` / `ResetPassword.tsx` / `VerifyEmail.tsx` / `MfaChallenge.tsx` pages), then rebuilt with `npm run build:frontend-v3`. The legacy `In-Ex-Ledger-API/public/js` auth scripts are no longer reachable — the auth routes are served by the v3 SPA.

## Backend Session Model

- **Cookies, not tokens in JS.** `access_token` (JWT, default 1h via
  `ACCESS_TOKEN_EXPIRY_SECONDS`) and `refresh_token` (opaque random token,
  default 7d via `REFRESH_TOKEN_EXPIRY_DAYS`, hashed before storage) are both
  set with `httpOnly: true`, `secure` in production, `sameSite: "lax"`
  (`utils/authUtils.js`'s `COOKIE_OPTIONS`) — never readable by client JS.
  Refresh rotates the access token via `POST /api/auth/refresh`, invisibly to
  the SPA (see `apiClient.ts`'s auto-retry above).
- **Passwords** are hashed with bcrypt; a legacy scrypt format is still
  verified (`isLegacyScryptHash`/`verifyPassword` in `utils/authUtils.js`)
  for accounts created before the bcrypt migration, transparently upgraded on
  next successful login.
- **MFA is email-code based**, not TOTP: a challenge emails a 6-digit code,
  capped at `MAX_MFA_ATTEMPTS` (default 8) guesses before the challenge must
  be restarted. A separate "trust this device" cookie
  (`mfa_trust`/`mfa_global_trust`) lets a verified device skip re-challenging
  for a bounded window.
- **Error handling**: every route in `routes/auth.routes.js` uses the
  project-wide `asyncRoute`/`ApiError` pattern (see the codebase's central
  Express error handler in `server.js`) — a thrown `ApiError(status,
  message)` becomes that exact response; an unexpected error becomes a
  generic 500. Routes carrying extra response fields the central handler
  can't emit (e.g. a 423 account-lockout response's `code`/`locked_until`),
  or a deliberately custom *5xx* message (the central handler always
  replaces a >=500 message with a generic one, by design, to avoid leaking
  internal detail), use a direct `res.status(...).json(...)` instead of
  throwing — both patterns coexist deliberately in the same file.
- **Rate limiting**: login, MFA verification, password reset, and token
  refresh each have their own limiter tier (see `middleware/rateLimitTiers.js`)
  independent of the global API limiter.
