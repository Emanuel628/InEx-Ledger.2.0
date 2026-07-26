export async function apiRequest<T>(url: string, init: RequestInit = {}) {
  let response = await fetchWithAuth(url, init)
  if (response.status === 401 && await refreshAccessToken()) {
    response = await fetchWithAuth(url, init)
  }

  const data = await readJson<T & { error?: string }>(response)
  if (!response.ok) {
    if (response.status === 401) {
      redirectToLogin()
    }
    throw new Error(data.error || 'Request failed.')
  }

  return data
}

export async function apiBlobRequest(url: string, init: RequestInit = {}) {
  let response = await fetchWithAuth(url, init)
  if (response.status === 401 && await refreshAccessToken()) {
    response = await fetchWithAuth(url, init)
  }

  if (!response.ok) {
    const data = await readJson<{ error?: string }>(response)
    if (response.status === 401) {
      redirectToLogin()
    }
    throw new Error(data.error || 'Request failed.')
  }

  return response.blob()
}

async function fetchWithAuth(url: string, init: RequestInit = {}) {
  const method = String(init.method || 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  const isFormData = init.body instanceof FormData

  if (!headers.has('Content-Type') && init.body && !isFormData) {
    headers.set('Content-Type', 'application/json')
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrfToken = await getCsrfToken()
    if (csrfToken) {
      headers.set('X-CSRF-Token', csrfToken)
    }
  }

  try {
    return await fetch(url, {
      credentials: 'include',
      ...init,
      headers,
    })
  } catch {
    throw new Error('Unable to reach the server.')
  }
}

let pendingRefresh: Promise<boolean> | null = null

async function refreshAccessToken() {
  if (pendingRefresh) {
    return pendingRefresh
  }

  pendingRefresh = (async () => {
    try {
      const response = await fetchWithAuth('/api/auth/refresh', { method: 'POST' })
      return response.ok
    } catch {
      return false
    } finally {
      pendingRefresh = null
    }
  })()

  return pendingRefresh
}

async function getCsrfToken() {
  let token = readCookie('csrf_token')
  if (token) {
    return token
  }

  try {
    await fetch('/api/me', { credentials: 'include' })
  } catch {
    return ''
  }

  token = readCookie('csrf_token')
  return token || ''
}

function redirectToLogin() {
  const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`)
  window.location.assign(`/login?reason=expired&next=${next}`)
}

function readCookie(name: string) {
  return document.cookie
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.slice(name.length + 1) || ''
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text()
  if (!text) {
    return {} as T
  }
  try {
    return JSON.parse(text) as T
  } catch {
    return {} as T
  }
}
