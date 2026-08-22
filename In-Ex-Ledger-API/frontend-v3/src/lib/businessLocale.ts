export function isCanadaBusiness(region?: string | null, currency?: string | null) {
  return String(region || '').toUpperCase() === 'CA' || String(currency || '').toUpperCase() === 'CAD'
}
