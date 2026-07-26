import { apiRequest } from './apiClient'

export type AuthBusiness = {
  id: string
  name: string
  type: string
  currency: string
  tier: string
}

export type AuthUser = {
  id: string
  email: string
  firstName: string
  lastName: string
  emailVerified: boolean
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
  const legacyUser = await authRequest<LegacyUser>('/api/me')
  return { user: mapLegacyUser(legacyUser) }
}

export async function loginUser(email: string, password: string) {
  const response = await authRequest<{ mfa_required?: boolean }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })

  if (response.mfa_required) {
    throw new Error('MFA is required. Please use the current sign-in page to finish verification.')
  }

  return getCurrentUser()
}

export async function registerUser(input: {
  firstName: string
  lastName: string
  email: string
  password: string
  acceptedTerms: boolean
}) {
  await authRequest('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      first_name: input.firstName,
      last_name: input.lastName,
      email: input.email,
      password: input.password,
      tos_consent: input.acceptedTerms,
    }),
  })
  return { user: null }
}

export async function logoutUser() {
  await authRequest('/api/auth/logout', { method: 'POST' })
  return { ok: true }
}

export async function verifyEmail() {
  return getCurrentUser()
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
    }),
  })
  return { ok: true, message: response.message, verificationCode: undefined as string | undefined }
}

export async function confirmEmailChange(code: string) {
  window.location.assign(`/api/auth/confirm-email-change?token=${encodeURIComponent(code)}`)
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

async function authRequest<T>(url: string, init: RequestInit = {}) {
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
    tier,
    currentBusinessId: user.active_business_id || user.business_id || activeBusiness?.id || null,
    business: activeBusiness?.id ? {
      id: activeBusiness.id,
      name: activeBusiness.name || 'Business',
      type: activeBusiness.region || 'business',
      currency: activeBusiness.currency || (activeBusiness.region === 'CA' ? 'CAD' : 'USD'),
      tier,
    } : null,
  }
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
