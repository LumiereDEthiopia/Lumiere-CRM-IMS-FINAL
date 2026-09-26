/**
 * End-to-end verification of the product UPDATE path (no data mutation).
 *
 * Simulates the exact admin-form edit payload that previously triggered the
 * Prisma validation error, calls the real updateProduct controller (real
 * prisma.product.update), asserts the response, then restores the original
 * values. Nothing is deleted; the DB is left as it was.
 */
import { readFileSync } from 'node:fs'

// Load server/.env manually before PrismaClient is constructed
for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && process.env[m[1]] === undefined) {
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

const { default: prisma } = await import('../src/config/prisma.js')
const { updateProduct } = await import('../src/controllers/productController.js')

const product = await prisma.product.findFirst({
  where: { productType: 'PERFUME' },
  orderBy: { createdAt: 'desc' }
})
if (!product) {
  console.log('NO_PERFUME_PRODUCT_FOUND')
  await prisma.$disconnect()
  process.exit(1)
}
console.log('Testing product:', product.id, '-', product.name)

// Payload mapped EXACTLY like client/src/pages/admin/ProductsPage.jsx does on edit
const payload = {
  name: product.name,
  slug: product.slug,
  description: product.description || '',
  shortDescription: product.shortDescription || '',
  brandId: product.brandId,
  categoryId: product.categoryId || '',
  gender: product.gender || '',
  productType: product.productType || 'PERFUME',
  price: String(product.price),
  price100ml: product.price100ml != null ? String(product.price100ml) : '',
  compareAtPrice: product.compareAtPrice != null ? String(product.compareAtPrice) : '',
  stockQuantity: String(product.stockQuantity),
  stock50ml: String(product.stock50ml),
  stock100ml: String(product.stock100ml),
  sku: product.sku || '',
  size: product.size || '',
  concentration: product.concentration || '',
  year: product.year ? String(product.year) : '',
  country: product.country || '',
  isActive: product.isActive,
  isFeatured: product.isFeatured,
  isNew: product.isNew,
  isLuxury: product.isLuxury
}
// The exact values that previously triggered the Prisma validation error:
payload.categoryId = ''
payload.gender = ''
payload.compareAtPrice = null
payload.productType = 'PERFUME'
payload.stock100ml = 0

const req = { params: { id: product.id }, body: payload }
let response = null
let nextError
const res = { json: (o) => { response = o } }
const next = (e) => { nextError = e }

await updateProduct(req, res, next)

let pass = true
const check = (label, ok, extra = '') => {
  console.log((ok ? 'PASS' : 'FAIL') + ' - ' + label + (extra ? ' (' + extra + ')' : ''))
  if (!ok) pass = false
}

check('no error passed to next()', !nextError,
  nextError ? nextError.name + ': ' + nextError.message : '')
check('response success:true', !!(response && response.success),
  response ? JSON.stringify(response).slice(0, 140) : 'no response')

if (response && response.success) {
  const d = response.data
  check('categoryId "" -> null', d.categoryId === null, String(d.categoryId))
  check('gender "" -> null', d.gender === null, String(d.gender))
  check('compareAtPrice null -> null', d.compareAtPrice === null, String(d.compareAtPrice))
  check('productType preserved as PERFUME', d.productType === 'PERFUME', d.productType)
  check('stock100ml numeric 0 preserved', Number(d.stock100ml) === 0, String(d.stock100ml))
  check('stockQuantity = stock50ml + stock100ml',
    Number(d.stockQuantity) === Number(d.stock50ml) + Number(d.stock100ml), String(d.stockQuantity))
}

// Restore original values — DB left exactly as before (no deletes, no resets)
await prisma.product.update({
  where: { id: product.id },
  data: {
    categoryId: product.categoryId,
    gender: product.gender,
    compareAtPrice: product.compareAtPrice,
    productType: product.productType,
    stock50ml: product.stock50ml,
    stock100ml: product.stock100ml,
    stockQuantity: product.stockQuantity,
    price100ml: product.price100ml
  }
})
console.log('Original values restored for', product.id)

await prisma.$disconnect()
console.log(pass ? 'ALL_CHECKS_PASSED' : 'SOME_CHECKS_FAILED')
process.exit(pass ? 0 : 1)
