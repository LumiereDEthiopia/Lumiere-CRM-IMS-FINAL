/**
 * Payload normalization helpers for product create/update.
 *
 * Prisma rejects empty strings for optional relation/enum fields (e.g.
 * categoryId, gender) and for optional numeric fields that must be null.
 * This module converts invalid "" / non-finite strings into null for those
 * fields so the API can accept the same payloads the admin form naturally
 * produces (unselected <select> = "").
 *
 * Numeric fields that can legitimately be 0 keep their value (stock boxes,
 * price). Fields where 0 is not meaningful (year) still normalize empty to
 * null.
 */

/** Optional relation/enum fields that must be null, never "". */
const NULLABLE_ID_OR_ENUM_FIELDS = new Set([
  'categoryId',
  'gender',
  'country',
  'concentration',
  'size',
  'dayNight',
  'fragranceProfile',
  'seasons',
]);

/**
 * Normalize optional string fields: "" and non-finite numeric strings become
 * null so Prisma accepts the payload. Whitespace-only values are treated as
 * empty too.
 */
export function normalizeNullableStringField(value) {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return null
    // If the field was sent as a numeric string (e.g. "0"), only normalize to
    // null when it is non-finite. Real numeric values should be handled by the
    // numeric normalizer instead.
    if (!isNaN(trimmed) && trimmed !== '') {
      const num = Number(trimmed)
      return Number.isFinite(num) ? value : null
    }
    return value
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  return value
}

/**
 * Normalize the core product payload coming from the admin form or any other
 * API client before it reaches Prisma.
 *
 * Specifically:
 * - categoryId / gender / optional string fields: "" -> null (keep real values)
 * - productType: default to 'PERFUME' when empty/missing (matches existing
 *   create/update behaviour)
 * - Numeric fields that accept 0: keep 0, accept numeric strings, null out
 *   non-finite values only when the caller explicitly sent null/undefined.
 * - compareAtPrice / price100ml: the caller decides null vs a value; empty
 *   string means "set to null".
 * - year: must be a real integer or null (0 is not a valid year here).
 */
export function normalizeProductPayload(body, existing = {}) {
  const normalized = { ...body }

  // Optional relation/enum / string fields: empty string -> null
  for (const key of NULLABLE_ID_OR_ENUM_FIELDS) {
    if (key in normalized) {
      if (key === 'size') {
        // size is a display label like "50ml / 100ml"; whitespace-only means unset
        const trimmed = typeof normalized.size === 'string' ? normalized.size.trim() : ''
        normalized.size = trimmed === '' ? null : normalized.size
        continue
      }
      normalized[key] = normalizeNullableStringField(normalized[key])
    }
  }

  // productType: the form defaults to PERFUME and the controller historically
  // defaults missing/empty productType to PERFUME too. Keep that behaviour.
  if (!normalized.productType || typeof normalized.productType !== 'string' || normalized.productType.trim() === '') {
    normalized.productType = 'PERFUME'
  }

  // Optional numeric fields that can be 0 — do NOT collapse 0 into null.
  // Only turn non-finite / empty-string inputs into null when the intent is
  // "no value".
  if ('compareAtPrice' in normalized) {
    const raw = normalized.compareAtPrice
    if (raw === null || raw === undefined || raw === '') {
      normalized.compareAtPrice = null
    } else {
      const parsed = parseFloat(raw)
      normalized.compareAtPrice = Number.isFinite(parsed) ? parsed : null
    }
  }

  if ('price100ml' in normalized) {
    const raw = normalized.price100ml
    if (raw === null || raw === undefined || raw === '') {
      normalized.price100ml = null
    } else {
      const parsed = parseFloat(raw)
      normalized.price100ml = Number.isFinite(parsed) ? parsed : null
    }
  }

  // year: 0 is not a valid year in this system, so empty/0 -> null, real
  // integers kept.
  if ('year' in normalized) {
    const raw = normalized.year
    if (raw === null || raw === undefined || raw === '') {
      normalized.year = null
    } else {
      const parsed = parseInt(raw, 10)
      normalized.year = Number.isFinite(parsed) && parsed > 0 ? parsed : null
    }
  }

  return normalized
}
