import { apiRequest, type ApiRequestInit } from './apiClient'

export type AuthBusiness = {
  id: string
  name: string
  type: string
  currency: string
  tier: string
  region?: string | null
  language?: string | null
}

export type AuthUser = {
  id: string
  email: string
  firstName: string
  lastName: string
  emailVerified: boolean
  mfaEnabled: boolean
  onboardingCompleted: boolean
  tier: 'free' | 'pro' | 'business'
  currentBusinessId: string | null
  business: AuthBusiness | null
}

export type AuthSession = {
  id: string
  userAgent: string
  ip: string
  createdAt: string
  lastSeenAt: string
  expiresAt: string
  current: boolean
}

type LegacyBusiness = {
  id?: string
  name?: string
  region?: string
  language?: string
  currency?: string
}

type LegacyUser = {
  id?: string
  email?: string
  full_name?: string
  display_name?: string
  role?: string
  email_verified?: boolean
  mfa_enabled?: boolean
  onboarding_completed?: boolean
  onboarding?: { completed?: boolean } | null
  business_id?: string | null
  active_business_id?: string | null
  active_business?: LegacyBusiness | null
  subscription?: {
    effectiveTier?: string
    tier?: string
    planCode?: string
  } | null
}

type LegacySession = {
  id: string
  user_agent?: string | null
  ip_address?: string | null
  created_at?: string
  last_active_at?: string
  expires_at?: string
  is_current?: boolean
}

export async function getCurrentUser() {
  // This is an identity probe, not a page load that requires auth: it's
  // expected to 401 for anonymous visitors (e.g. on the public landing page).
  // Callers (App.tsx) already branch correctly on a rejected promise vs a
  // resolved user, so only the global redirect-to-login side effect needs
  // to be suppressed here — the 401 should still reject as before.
  const legacyUser = await authRequest<LegacyUser>('/api/me', { skipAuthRedirect: true })
  return { user: mapLegacyUser(legacyUser) }
}

export type LoginResult =
  | { mfaRequired: false; user: AuthUser | null }
  | { mfaRequired: true; mfaToken: string }

export async function loginUser(email: string, password: string): Promise<LoginResult> {
  // A wrong password is an ordinary, expected 401 here — not a signal that
  // an existing session expired — so it must not trigger the global
  // redirect-to-login side effect (that would wipe the form before the
  // caller's own catch block ever runs).
  const response = await authRequest<{ mfa_required?: boolean; mfa_token?: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    skipAuthRedirect: true,
  })

  if (response.mfa_required) {
    return { mfaRequired: true, mfaToken: response.mfa_token || '' }
  }

  const { user } = await getCurrentUser()
  return { mfaRequired: false, user }
}

export async function verifyLoginMfa(mfaToken: string, code: string, trustDevice = true) {
  // Same reasoning as loginUser: a wrong or expired code is an expected
  // failure the caller handles inline, not a "your session expired" signal.
  await authRequest('/api/auth/mfa/verify', {
    method: 'POST',
    body: JSON.stringify({ mfaToken, code, trustDevice }),
    skipAuthRedirect: true,
  })
  return getCurrentUser()
}

export async function resendLoginMfa(mfaToken: string) {
  return authRequest<{ mfa_token?: string; message?: string }>('/api/auth/mfa/resend', {
    method: 'POST',
    body: JSON.stringify({ mfaToken }),
    skipAuthRedirect: true,
  })
}

export async function registerUser(input: {
  firstName: string
  lastName: string
  email: string
  password: string
  acceptedTerms: boolean
}) {
  // Registration now signs the user straight into an authenticated session
  // (see routes/auth.routes.js POST /register) instead of gating access
  // behind a magic-link click, so the caller can navigate directly into
  // Onboarding once we've fetched the fresh user record.
  await authRequest<{ next?: string }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      first_name: input.firstName,
      last_name: input.lastName,
      email: input.email,
      password: input.password,
      tos_consent: input.acceptedTerms,
    }),
  })
  const { user } = await getCurrentUser()
  return { user }
}

export async function checkEmailVerified(verificationState: string) {
  return authRequest<{ verified?: boolean }>(`/api/check-email-verified?state=${encodeURIComponent(verificationState)}`, {
    skipAuthRedirect: true,
  })
}

export async function resendVerificationEmail(verificationState: string, email?: string) {
  return authRequest<{ message?: string; verification_state?: string }>('/api/auth/send-verification', {
    method: 'POST',
    body: JSON.stringify(verificationState ? { verificationState } : { email }),
  })
}

export async function completeVerifiedSignup(signupBootstrapToken: string) {
  return authRequest<{ next?: string }>('/api/auth/complete-verified-signup', {
    method: 'POST',
    body: JSON.stringify({ signupBootstrapToken }),
  })
}

// Onboarding's one-time email verification code. The same code both verifies
// the email and (if wantsMfa was true when it was requested) turns on MFA --
// there is no separate MFA verification round during onboarding.
export async function sendOnboardingVerificationCode(wantsMfa: boolean) {
  return authRequest<{ mfa_token?: string; message?: string }>('/api/auth/onboarding/send-verification-code', {
    method: 'POST',
    body: JSON.stringify({ wantsMfa }),
  })
}

export async function verifyOnboardingCode(mfaToken: string, code: string) {
  return authRequest<{ email_verified?: boolean; mfa_enabled?: boolean }>('/api/auth/onboarding/verify-code', {
    method: 'POST',
    body: JSON.stringify({ mfaToken, code }),
    skipAuthRedirect: true,
  })
}

export async function logoutUser() {
  await authRequest('/api/auth/logout', { method: 'POST' })
  return { ok: true }
}

export async function createBusiness(input: { name: string; type: string; currency: string }) {
  await authRequest('/api/businesses', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      region: input.currency.toLowerCase() === 'cad' ? 'CA' : 'US',
      language: 'en',
    }),
  })
  return getCurrentUser()
}

export async function requestPasswordReset(email: string) {
  const response = await authRequest<{ message: string }>('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
  return { ok: true, message: response.message, resetCode: undefined as string | undefined }
}

export async function resetPassword(input: { email: string; code: string; password: string }) {
  await authRequest('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({
      token: input.code,
      password: input.password,
      confirmPassword: input.password,
    }),
  })
  return { ok: true }
}

export async function requestEmailChange(input: { newEmail: string; password: string }) {
  const response = await authRequest<{ message: string }>('/api/auth/request-email-change', {
    method: 'POST',
    body: JSON.stringify({
      newEmail: input.newEmail,
      currentPassword: input.password,
      verificationMode: 'mfa_code',
    }),
  })
  return { ok: true, message: response.message, verificationCode: undefined as string | undefined }
}

export async function confirmEmailChange(code: string) {
  await authRequest('/api/auth/confirm-email-change', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
  return { user: null }
}

export async function listSessions() {
  const response = await authRequest<{ sessions: LegacySession[] }>('/api/sessions')
  return {
    sessions: response.sessions.map(mapLegacySession),
  }
}

export async function revokeSession(sessionId: string) {
  await authRequest(`/api/sessions/${sessionId}`, { method: 'DELETE' })
  return { ok: true }
}

export async function revokeOtherSessions() {
  await authRequest('/api/sessions', { method: 'DELETE' })
  return { ok: true }
}

async function authRequest<T>(url: string, init: ApiRequestInit = {}) {
  return apiRequest<T>(url, init)
}

function mapLegacyUser(user: LegacyUser | null): AuthUser | null {
  if (!user?.id || !user.email) {
    return null
  }

  const fullName = String(user.full_name || user.display_name || '').trim()
  const [firstName = '', ...lastNameParts] = fullName.split(/\s+/).filter(Boolean)
  const activeBusiness = user.active_business || null
  const tier = normalizeTier(
    user.subscription?.effectiveTier ||
    user.subscription?.tier ||
    user.subscription?.planCode,
  )

  return {
    id: user.id,
    email: user.email,
    firstName: firstName || user.display_name || '',
    lastName: lastNameParts.join(' '),
    emailVerified: Boolean(user.email_verified),
    mfaEnabled: Boolean(user.mfa_enabled),
    onboardingCompleted: Boolean(user.onboarding_completed ?? user.onboarding?.completed),
    tier,
    currentBusinessId: user.active_business_id || user.business_id || activeBusiness?.id || null,
    business: activeBusiness?.id ? {
      id: activeBusiness.id,
      name: activeBusiness.name || 'Business',
      type: activeBusiness.region || 'business',
      currency: activeBusiness.currency || (activeBusiness.region === 'CA' ? 'CAD' : 'USD'),
      tier,
      region: activeBusiness.region || null,
      language: activeBusiness.language || null,
    } : null,
  }
}

export async function loadMfaStatus() {
  return authRequest<{ enabled?: boolean; enabled_at?: string | null; delivery?: string }>('/api/auth/mfa/status')
}

export async function requestAccountDeleteReauth(input: { currentPassword: string; code?: string; mfaToken?: string }) {
  return authRequest<{ pending_verification?: boolean; mfa_token?: string; reauth_token?: string; message?: string }>(
    '/api/auth/mfa/reauth',
    {
      method: 'POST',
      body: JSON.stringify({
        currentPassword: input.currentPassword,
        ...(input.code ? { code: input.code } : {}),
        ...(input.mfaToken ? { mfaToken: input.mfaToken } : {}),
      }),
    },
  )
}

export async function deleteMyAccount(input: { password: string; mfaReauthToken?: string }) {
  await authRequest('/api/me', {
    method: 'DELETE',
    body: JSON.stringify({
      password: input.password,
      ...(input.mfaReauthToken ? { mfaReauthToken: input.mfaReauthToken } : {}),
    }),
  })
  return { ok: true }
}

export async function requestMfaToggle(enabled: boolean) {
  return authRequest<{ pending_verification?: boolean; mfa_token?: string; message?: string; status?: { enabled?: boolean } }>(
    enabled ? '/api/auth/mfa/enable' : '/api/auth/mfa/disable',
    { method: 'POST', body: JSON.stringify({}) },
  )
}

export async function confirmMfaToggle(enabled: boolean, mfaToken: string, code: string) {
  // A wrong/expired MFA toggle code is a normal inline error for the
  // Settings modal to show, not a reason to bounce an authenticated user
  // out to the login screen.
  return authRequest<{ message?: string; status?: { enabled?: boolean } }>(
    enabled ? '/api/auth/mfa/enable' : '/api/auth/mfa/disable',
    {
      method: 'POST',
      body: JSON.stringify({ mfaToken, code }),
      skipAuthRedirect: true,
    },
  )
}

function normalizeTier(value?: string | null): AuthUser['tier'] {
  const normalized = String(value || '').toLowerCase()
  if (normalized.includes('business')) {
    return 'business'
  }
  if (normalized.includes('pro') || normalized.includes('plan_v1')) {
    return 'pro'
  }
  return 'free'
}

function mapLegacySession(session: LegacySession): AuthSession {
  return {
    id: session.id,
    userAgent: session.user_agent || '',
    ip: session.ip_address || '',
    createdAt: session.created_at || '',
    lastSeenAt: session.last_active_at || session.created_at || '',
    expiresAt: session.expires_at || '',
    current: Boolean(session.is_current),
  }
}
