/**
 * Currency formatting for the whole interface.
 * The active currency comes from the saved Settings (SettingsContext applies
 * it via setActiveCurrency once settings load), with ETB/Birr as the default
 * so existing behaviour is unchanged when no currency setting exists.
 */
let CURRENCY_CODE = 'ETB'
let CURRENCY_SYMBOL = 'Br'

// Symbol mapping for the currencies the business may configure in Settings.
const SYMBOL_BY_CODE = {
  ETB: 'Br',
  USD: '$',
  EUR: '€',
  GBP: '£',
  AED: 'AED',
  KES: 'KSh'
}

/**
 * Apply the saved currency setting (Settings → General → Currency).
 * Safe to call with an unknown/empty code — falls back to ETB.
 */
export function setActiveCurrency(code) {
  const normalized = String(code || '').trim().toUpperCase()
  if (!normalized) return
  CURRENCY_CODE = normalized
  CURRENCY_SYMBOL = SYMBOL_BY_CODE[normalized] || normalized
}

export function getActiveCurrency() {
  return { code: CURRENCY_CODE, symbol: CURRENCY_SYMBOL }
}

export function formatCurrency(value, { withCode = false } = {}) {
  const n = Number(value || 0)
  const formatted = n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return withCode ? `${CURRENCY_CODE} ${formatted}` : `${CURRENCY_SYMBOL} ${formatted}`
}

// Backwards-compatible alias — every existing call site keeps working.
export const etb = formatCurrency

export default formatCurrency