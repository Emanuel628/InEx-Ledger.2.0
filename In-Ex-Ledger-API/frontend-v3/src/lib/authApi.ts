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

type AuthResponse = {
  user: AuthUser | null
  error?: string
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

export async function getCurrentUser() {
  return authRequest<AuthResponse>('/api/auth/me')
}

export async function loginUser(email: string, password: string) {
  return authRequest<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function registerUser(input: {
  firstName: string
  lastName: string
  email: string
  password: string
  acceptedTerms: boolean
}) {
  return authRequest<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function logoutUser() {
  return authRequest<{ ok: boolean }>('/api/auth/logout', { method: 'POST' })
}

export async function verifyEmail() {
  return authRequest<AuthResponse>('/api/auth/verify-email', { method: 'POST' })
}

export async function createBusiness(input: { name: string; type: string; currency: string }) {
  return authRequest<AuthResponse>('/api/businesses', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function requestPasswordReset(email: string) {
  return authRequest<{ ok: boolean; message: string; resetCode?: string }>('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function resetPassword(input: { email: string; code: string; password: string }) {
  return authRequest<{ ok: boolean }>('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function requestEmailChange(input: { newEmail: string; password: string }) {
  return authRequest<{ ok: boolean; message: string; verificationCode?: string }>('/api/auth/change-email/request', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function confirmEmailChange(code: string) {
  return authRequest<AuthResponse>('/api/auth/change-email/confirm', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}

export async function listSessions() {
  return authRequest<{ sessions: AuthSession[] }>('/api/auth/sessions')
}

export async function revokeSession(sessionId: string) {
  return authRequest<{ ok: boolean }>(`/api/auth/sessions/${sessionId}`, { method: 'DELETE' })
}

export async function revokeOtherSessions() {
  return authRequest<{ ok: boolean }>('/api/auth/sessions', { method: 'DELETE' })
}

async function authRequest<T>(url: string, init: RequestInit = {}) {
  let response: Response
  try {
    response = await fetch(url, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...init.headers,
      },
      ...init,
    })
  } catch {
    throw new Error('Unable to reach the auth server. Start the app with npm run dev and try again.')
  }

  const data = await response.json() as T & { error?: string }

  if (!response.ok) {
    throw new Error(data.error || 'Request failed.')
  }

  return data
}
