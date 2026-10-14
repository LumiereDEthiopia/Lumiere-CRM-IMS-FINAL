/**
 * Pure Oil consumption rule for Cream/Jelly products — the SINGLE source of
 * truth for how much Pure Oil a Cream/Jelly sale consumes.
 *
 * BUSINESS RULE (spec §5/§6):
 *   50 ml Cream/Jelly  ->  4 ml Pure Oil per unit
 *   100 ml Cream/Jelly  ->  6 ml Pure Oil per unit
 *
 * The UI only DISPLAYS this (read-only); staff never enters or overrides the
 * amount. The rule lives here in backend logic and is consumed by the sales
 * transaction, the product form, and the reports — never scattered as bare
 * "4" / "6" literals across the frontend.
 *
 * These helpers are pure (no Prisma) so they are unit-tested directly
 * (tests/pure-oil-consumption.test.js) and mirrored exactly by the client.
 */

// ml of Pure Oil consumed per single unit, keyed by the Cream/Jelly size label.
export const PURE_OIL_ML_PER_UNIT = {
  '50 ml': 4,
  '100 ml': 6
}

/** The two supported Cream/Jelly size labels. */
export const CREAM_SIZES = ['50 ml', '100 ml']

/** Normalize any user/size input ('30ML', '30 ml', '30ml') to '30 ml' | '50 ml' | null. */
export function creamSizeLabel(value) {
  const s = String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (s === '50ml' || s === '50 ml' || s === '50') return '50 ml'
  if (s === '100ml' || s === '100 ml' || s === '100') return '100 ml'
  return null
}

/** ml of Pure Oil consumed for ONE unit of a given Cream/Jelly size (0 when unknown). */
export function pureOilPerUnit(size) {
  const label = creamSizeLabel(size)
  return label ? PURE_OIL_ML_PER_UNIT[label] : 0
}

/**
 * Total ml of Pure Oil consumed for `quantity` units of a Cream/Jelly product
 * of the given size. Returns 0 for non-Cream sizes (e.g. a perfume line).
 */
export function pureOilConsumptionMl({ size, quantity }) {
  const qty = Number(quantity)
  if (!Number.isFinite(qty) || qty <= 0) return 0
  return pureOilPerUnit(size) * qty
}

/**
 * Read-only display string for the product form / sale UI, e.g. "4 ml per unit".
 * Returns null when the size is not a recognized Cream/Jelly size.
 */
export function pureOilConsumptionLabel(size) {
  const per = pureOilPerUnit(size)
  return per > 0 ? `${per} ml per unit` : null
}

/**
 * Cost of ONE ml of a Pure Oil, from the existing Pure Oil costing method:
 *   costPerMl = Pure Oil costPrice / its size in ml.
 * `pureOil` must expose { costPrice, size }. Returns 0 when the size is not a
 * parseable ml value (e.g. a gram-based oil) so callers never invent a cost.
 */
export function pureOilCostPerMl(pureOil) {
  if (!pureOil) return 0
  const cost = Number(pureOil.costPrice || 0)
  if (!(cost > 0)) return 0
  const ml = creamSizeMl(pureOil.size)
  if (!ml) return 0
  return cost / ml
}

/** Parse a size label like "100 ml" / "100ml" to its ml number (null otherwise). */
function creamSizeMl(value) {
  const s = String(value ?? '').trim().toLowerCase()
  const m = s.match(/(\d+(?:\.\d+)?)\s*m\s*l?/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Extra cost a Cream/Jelly unit carries from the Pure Oil it consumes
 * (spec §9): perUnitMl × Pure Oil cost per ml. Rounded to 2 decimals.
 * `pureOil` is the linked Pure Oil product row ({ costPrice, size }).
 */
export function pureOilCostForCream({ size, pureOil }) {
  const per = pureOilPerUnit(size)
  if (!per) return 0
  const perMl = pureOilCostPerMl(pureOil)
  return Math.round(per * perMl * 100) / 100
}

export default {
  PURE_OIL_ML_PER_UNIT,
  CREAM_SIZES,
  creamSizeLabel,
  pureOilPerUnit,
  pureOilConsumptionMl,
  pureOilConsumptionLabel,
  pureOilCostPerMl,
  pureOilCostForCream
}
