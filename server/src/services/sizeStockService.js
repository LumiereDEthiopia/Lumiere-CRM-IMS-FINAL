/**
 * Bottle-size stock rules (50ml / 100ml perfumes)
 *
 * Perfumes are stocked per bottle size: `Product.stock50ml` and
 * `Product.stock100ml` are the two stock boxes on the Add/Edit Product form,
 * and `Product.stockQuantity` is always their sum — the "Stock (bottles)"
 * total. Oil / Pure Oil products are sold by gram and keep using
 * `stockQuantity` in grams only.
 *
 * These helpers are pure (no Prisma) so the product endpoints and the sales
 * flow apply exactly the same rules, and so the client can mirror them.
 */

export const BOTTLE_SIZES = ['50ml', '100ml']

export function isPerfume(productType) {
  return (productType || 'PERFUME') === 'PERFUME'
}

/** Normalize any user input ('50ML', '50 ml', 'both') to a bottle size label */
export function sizeLabelOf(value) {
  const s = String(value ?? '').trim().toLowerCase()
  if (s.includes('100ml') || s.includes('100 ml')) return '100ml'
  if (s.includes('50ml') || s.includes('50 ml')) return '50ml'
  return null
}

/** ml per bottle for a size label — 50 or 100 (null for gram products) */
export function sizeMlOf(value) {
  const label = sizeLabelOf(value)
  return label === '100ml' ? 100 : label === '50ml' ? 50 : null
}

/** Bottle sizes a product is sold in, from its `size` field ([] = not specified) */
export function offeredSizes(productSize) {
  const s = String(productSize ?? '').trim().toLowerCase()
  const sizes = []
  if (s.includes('50ml')) sizes.push('50ml')
  if (s.includes('100ml')) sizes.push('100ml')
  return sizes
}

/** Current size buckets; `tracked` is true once per-size stock is in use */
export function sizeBuckets(product) {
  const s50 = Number(product?.stock50ml || 0)
  const s100 = Number(product?.stock100ml || 0)
  return { s50, s100, tracked: isPerfume(product?.productType) && s50 + s100 > 0 }
}

/**
 * Which bottle size this sale line is for.
 * Returns '50ml' | '100ml' | null (null = not a size-tracked perfume line,
 * e.g. oils sold by gram or a product whose stock boxes are unused).
 */
export function resolveSoldSize({ product, requested }) {
  if (!isPerfume(product?.productType)) return null
  const offered = offeredSizes(product.size)
  const asked = sizeLabelOf(requested)
  if (asked) return offered.length === 0 || offered.includes(asked) ? asked : null
  if (offered.length === 1) return offered[0]
  // Perfume sold in both sizes without an explicit choice → same default the
  // point of sale uses (50ml). The stock check below still guards the sale.
  return '50ml'
}

/** Available quantity for a size (falls back to location/product stock when untracked) */
export function availableForSize({ product, inventory, size }) {
  const buckets = sizeBuckets(product)
  if (!buckets.tracked || !size) {
    return inventory ? Number(inventory.availableQuantity || 0) : Number(product?.stockQuantity || 0)
  }
  return size === '100ml' ? buckets.s100 : buckets.s50
}

/**
 * Prisma update payload for a product after a sale ('decrement') or after a
 * cancellation ('increment'). Absolute values are used so the total can never
 * drift away from the sum of the two boxes.
 * `product` must be the freshly read row inside the transaction.
 */
export function productStockPatch(product, { size, quantity, mode = 'decrement' }) {
  const qty = Number(quantity) || 0
  const sign = mode === 'increment' ? 1 : -1
  const buckets = sizeBuckets(product)

  if (!buckets.tracked || !size) {
    return { stockQuantity: Number(product?.stockQuantity || 0) + sign * qty }
  }
  const s50 = buckets.s50 + (size === '50ml' ? sign * qty : 0)
  const s100 = buckets.s100 + (size === '100ml' ? sign * qty : 0)
  return { stock50ml: s50, stock100ml: s100, stockQuantity: s50 + s100 }
}

/** Total ml sold/restored on a line — how a sale is identified "by ml" */
export function lineMl({ size, quantity }) {
  const ml = sizeMlOf(size)
  if (!ml) return null
  return Math.round(ml * (Number(quantity) || 0))
}

export default {
  BOTTLE_SIZES, isPerfume, sizeLabelOf, sizeMlOf, offeredSizes,
  sizeBuckets, resolveSoldSize, availableForSize, productStockPatch, lineMl
}
