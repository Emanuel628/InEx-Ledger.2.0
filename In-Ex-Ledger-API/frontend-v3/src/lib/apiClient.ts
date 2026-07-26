export async function apiRequest<T>(url: string, init: RequestInit = {}) {
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

  let response: Response
  try {
    response = await fetch(url, {
      credentials: 'include',
      ...init,
      headers,
    })
  } catch {
    throw new Error('Unable to reach the server.')
  }

  const data = await readJson<T & { error?: string }>(response)
  if (!response.ok) {
    throw new Error(data.error || 'Request failed.')
  }

  return data
}

export async function apiBlobRequest(url: string, init: RequestInit = {}) {
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

  let response: Response
  try {
    response = await fetch(url, {
      credentials: 'include',
      ...init,
      headers,
    })
  } catch {
    throw new Error('Unable to reach the server.')
  }

  if (!response.ok) {
    const data = await readJson<{ error?: string }>(response)
    throw new Error(data.error || 'Request failed.')
  }

  return response.blob()
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
