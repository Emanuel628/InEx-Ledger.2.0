const VALID_CURRENCY_CODES = new Set(Intl.supportedValuesOf('currency'))

export function normalizeCurrencyCode(currency: unknown, fallback = 'USD'): string {
  const normalized = String(currency || '').trim().toUpperCase()
  return VALID_CURRENCY_CODES.has(normalized) ? normalized : fallback
}

let activeCurrency = 'USD'

export function setActiveCurrency(currency: unknown) {
  activeCurrency = normalizeCurrencyCode(currency)
}

export function getActiveCurrency(): string {
  return activeCurrency
}

export function getMoneyLocale(currency: string = getActiveCurrency()): string {
  switch (normalizeCurrencyCode(currency)) {
    case 'CAD':
      return 'en-CA'
    case 'AUD':
      return 'en-AU'
    case 'GBP':
      return 'en-GB'
    default:
      return 'en-US'
  }
}

export interface FormatMoneyOptions {
  /** Defaults to the browser/Intl default (2) when omitted. */
  maximumFractionDigits?: number
}

/** Formats a numeric amount using the active business currency by default. */
export function formatMoney(
  value: number,
  currency: string = getActiveCurrency(),
  options: FormatMoneyOptions = {}
): string {
  const normalizedCurrency = normalizeCurrencyCode(currency, getActiveCurrency())
  const locale = getMoneyLocale(normalizedCurrency)
  const formatted = Math.abs(value).toLocaleString(locale, {
    style: 'currency',
    currency: normalizedCurrency,
    ...(options.maximumFractionDigits !== undefined
      ? { maximumFractionDigits: options.maximumFractionDigits }
      : {}),
  })
  return value < 0 ? `-${formatted}` : formatted
}
