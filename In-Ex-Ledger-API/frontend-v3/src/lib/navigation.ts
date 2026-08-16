export function normalizeInternalPath(rawPath: string, fallback = '/transactions') {
  const candidate = String(rawPath || '').trim()
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) {
    return fallback
  }

  try {
    const url = new URL(candidate, 'https://inex-ledger.local')
    if (url.origin !== 'https://inex-ledger.local') {
      return fallback
    }
    return `${url.pathname}${url.search}`
  } catch {
    return fallback
  }
}

export function normalizeLegacyAppV3Path(rawPath: string, canonicalPath: string) {
  const path = String(rawPath || '')
  if (path !== '/app-v3' && (!path.startsWith('/app-v3/') || path.startsWith('/app-v3/assets'))) {
    return null
  }

  return normalizeInternalPath(canonicalPath)
}

export function resolvePageFromInternalPath<Page extends string>(
  rawPath: string,
  pagesBySlug: ReadonlyMap<string, Page>,
  fallbackPage: Page,
  blockedPages: ReadonlySet<Page> = new Set(),
) {
  const normalizedPath = normalizeInternalPath(rawPath)
  const slug = normalizedPath
    .toLowerCase()
    .split(/[?#]/)[0]
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
  const page = pagesBySlug.get(slug)
  return page && !blockedPages.has(page) ? page : fallbackPage
}
