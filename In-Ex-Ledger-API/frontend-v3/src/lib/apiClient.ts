export async function apiRequest<T>(url: string, init: RequestInit = {}) {
  let response = await fetchWithAuth(url, init)
  if (response.status === 403 && await isCsrfFailure(response)) {
    await refreshCsrfToken()
    response = await fetchWithAuth(url, init)
  }
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
  if (response.status === 403 && await isCsrfFailure(response)) {
    await refreshCsrfToken()
    response = await fetchWithAuth(url, init)
  }
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
      const headers = new Headers()
      const csrfToken = readCookie('csrf_token')
      if (csrfToken) {
        headers.set('X-CSRF-Token', csrfToken)
      }
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers,
      })
      return response.ok
    } catch {
      return false
    } finally {
      pendingRefresh = null
    }
  })()

  return pendingRefresh
}

async function isCsrfFailure(response: Response) {
  const data = await readJson<{ error?: string }>(response.clone())
  return data.error === 'CSRF token missing or invalid.'
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

async function refreshCsrfToken() {
  try {
    await fetch('/api/me', {
      credentials: 'include',
      cache: 'no-store',
    })
  } catch {
    // The retry will surface the original request failure if CSRF cannot refresh.
  }
}

function redirectToLogin() {
  const next = encodeURIComponent(getCurrentCanonicalPath())
  window.location.assign(`/login?reason=expired&next=${next}`)
}

function getCurrentCanonicalPath() {
  const path = normalizeCanonicalPath(window.location.pathname || '/transactions')
  return `${path}${window.location.search || ''}${window.location.hash || ''}`
}

function normalizeCanonicalPath(path: string) {
  if (path === '/app-v3') {
    return '/transactions'
  }
  if (path.startsWith('/app-v3/')) {
    const barePath = path.slice('/app-v3'.length)
    return barePath === '/' ? '/transactions' : barePath
  }
  return path || '/transactions'
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
