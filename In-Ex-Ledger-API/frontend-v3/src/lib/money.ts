/**
 * Shared money formatting and currency resolution.
 *
 * Previously each page (Transactions, Mileage, Analytics, Invoices, Exports,
 * RecurringTemplatesWorkflow) redefined its own formatMoney/getActiveCurrency.
 * That duplication let two real bugs ship: Invoices.tsx collapsed every
 * non-CAD currency (including EUR/GBP/AUD, which its own currency <select>
 * offers) down to a hardcoded USD symbol, and RecurringTemplatesWorkflow.tsx
 * hardcoded getActiveCurrency() to always return 'USD' regardless of the
 * business's real currency. Centralizing this here removes the duplication
 * and both bugs at the source.
 */

export function getActiveCurrency(): string {
  return window.__LUNA_ME__?.business?.currency?.toUpperCase() === 'CAD' ? 'CAD' : 'USD'
}

export function getMoneyLocale(currency: string = getActiveCurrency()): string {
  return currency.toUpperCase() === 'CAD' ? 'en-CA' : 'en-US'
}

export interface FormatMoneyOptions {
  /** Defaults to the browser/Intl default (2) when omitted. */
  maximumFractionDigits?: number
}

/**
 * Formats a numeric amount as currency.
 *
 * Unlike the old per-page copies, this passes the given currency code
 * through to Intl formatting as-is (uppercased) rather than collapsing
 * anything that isn't CAD down to USD — any valid ISO 4217 code (USD, CAD,
 * EUR, GBP, AUD, ...) renders with its real symbol. When no currency is
 * given, falls back to the business's real active currency.
 */
export function formatMoney(
  value: number,
  currency: string = getActiveCurrency(),
  options: FormatMoneyOptions = {}
): string {
  const normalizedCurrency = String(currency || getActiveCurrency()).toUpperCase()
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
