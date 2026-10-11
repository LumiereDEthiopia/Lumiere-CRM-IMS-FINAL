/**
 * Pure Oil consumption rule for Cream/Jelly — CLIENT MIRROR.
 *
 * Must stay in step with server/src/services/pureOilService.js (the single
 * source of truth). The UI only DISPLAYS this read-only; the backend always
 * recalculates and enforces the rule during the sale, so staff can never
 * override the consumption amount. This module exists so the "4 / 6 ml" numbers
 * appear in exactly ONE frontend place instead of being scattered.
 */

// ml of Pure Oil consumed per unit, keyed by the Cream/Jelly size label.
export const PURE_OIL_ML_PER_UNIT = {
  '30 ml': 4,
  '50 ml': 6
}

/** Normalize any size input ('30ML', '30 ml', '30ml') to '30 ml' | '50 ml' | null. */
export function creamSizeLabel(value) {
  const s = String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (s === '30ml' || s === '30 ml' || s === '30') return '30 ml'
  if (s === '50ml' || s === '50 ml' || s === '50') return '50 ml'
  return null
}

/** ml of Pure Oil consumed for ONE unit of a given Cream/Jelly size (0 when unknown). */
export function pureOilPerUnit(size) {
  const label = creamSizeLabel(size)
  return label ? PURE_OIL_ML_PER_UNIT[label] : 0
}

/** Read-only display string, e.g. "4 ml per unit" (null when not a Cream size). */
export function pureOilConsumptionLabel(size) {
  const per = pureOilPerUnit(size)
  return per > 0 ? `${per} ml per unit` : null
}

/** Total ml consumed for `quantity` units of a Cream/Jelly size (0 otherwise). */
export function pureOilConsumptionMl({ size, quantity }) {
  const qty = Number(quantity)
  if (!Number.isFinite(qty) || qty <= 0) return 0
  return pureOilPerUnit(size) * qty
}

export default {
  PURE_OIL_ML_PER_UNIT,
  creamSizeLabel,
  pureOilPerUnit,
  pureOilConsumptionLabel,
  pureOilConsumptionMl
}
