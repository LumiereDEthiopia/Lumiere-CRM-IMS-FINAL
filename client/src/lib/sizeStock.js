/**
 * Bottle-size stock rules (50ml / 100ml perfumes) — client mirror
 *
 * Must stay in step with server/src/services/sizeStockService.js: the point of
 * sale shows the same availability the API enforces, so a cashier never gets a
 * surprise "insufficient stock" at confirm time.
 */

export const BOTTLE_SIZES = ['50ml', '100ml']

export function isPerfume(productType) {
  return (productType || 'PERFUME') === 'PERFUME'
}

export function sizeLabelOf(value) {
  const s = String(value ?? '').trim().toLowerCase()
  if (s.includes('100ml') || s.includes('100 ml')) return '100ml'
  if (s.includes('50ml') || s.includes('50 ml')) return '50ml'
  return null
}

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

/** Per-size stock boxes; `tracked` is true once they are in use (sum > 0) */
export function sizeBuckets(product) {
  const s50 = Number(product?.stock50ml || 0)
  const s100 = Number(product?.stock100ml || 0)
  return { s50, s100, tracked: isPerfume(product?.productType) && s50 + s100 > 0 }
}

/** Bottles on hand for one size (null when the product is not size-tracked) */
export function sizeStockOf(product, size) {
  const buckets = sizeBuckets(product)
  if (!buckets.tracked || !size) return null
  return size === '100ml' ? buckets.s100 : buckets.s50
}

/**
 * Sellable quantity for a chosen size at a location.
 * Size-tracked perfumes read their size box; everything else keeps the previous
 * behaviour (per-location stock when present, otherwise the product total).
 */
export function availableForSize({ product, inventory, size }) {
  const box = sizeStockOf(product, size)
  if (box == null) {
    if (inventory) return Number(inventory.availableQuantity || 0)
    return Number(product?.stockQuantity || 0)
  }
  return box
}

/** Find a product's per-location inventory row */
export function inventoryAt(product, locationId) {
  if (!locationId) return null
  return product?.inventory?.find((row) => row.locationId === locationId) || null
}

/** "50ml 5 · 100ml 7" summary for the products table / sale cards */
export function sizeStockSummary(product) {
  const buckets = sizeBuckets(product)
  if (!buckets.tracked) return null
  return `50ml ${buckets.s50} · 100ml ${buckets.s100}`
}

export default {
  BOTTLE_SIZES, isPerfume, sizeLabelOf, sizeMlOf, offeredSizes,
  sizeBuckets, sizeStockOf, availableForSize, inventoryAt, sizeStockSummary
}