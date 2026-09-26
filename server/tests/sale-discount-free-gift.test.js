/**
 * Acceptance tests for Direct Sales · Discounts · Free Gifts · VAT · Change.
 * Pure functions only — NO database required.
 *
 * Run from server/: node tests/sale-discount-free-gift.test.js
 *
 * The business prices are VAT-INCLUSIVE by default (see
 * sale-tax-calculation.test.js); these tests cover BOTH pricing modes and use
 * the VAT-exclusive mode (ethiopia_vat_inclusive=false) for the spec's
 * exact-number scenarios (Tests 1–3).
 */
import assert from 'node:assert/strict'
import {
  computeSaleTaxTotals,
  computeDiscountAmount,
  resolveLinePricing,
  resolveSaleDiscount,
  resolveServerUnitPrice,
  authorizeDiscountAndGift,
  computeChange,
  validateCombinedSaleStock
} from '../src/services/saleService.js'

let passed = 0
function check(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (e) { console.error(`  FAIL  ${name}\n        ${e.message}`); process.exitCode = 1 }
}
const m = (v) => Math.round((Number(v) || 0) * 100) / 100
const expectApiError = (fn, statusCode) => {
  let caught = null
  try { fn() } catch (e) { caught = e }
  assert.ok(caught, 'expected an error to be thrown')
  assert.equal(caught.statusCode, statusCode, `expected status ${statusCode}, got ${caught.statusCode ?? caught.message}`)
}

console.log('Direct Sale / Discount / Free Gift — acceptance tests\n')

// ---------------------------------------------------------------------------
// Spec Test 1 — normal sale (VAT-exclusive pricing mode)
// ---------------------------------------------------------------------------
check('Test 1 — normal sale: 6,500 · disc 0 → taxable 6,500 · VAT 975 · total 7,475', () => {
  const line = resolveLinePricing({ unitPrice: 6500, quantity: 1 })
  const r = computeSaleTaxTotals({ subtotal: line.charged, discount: 0, vatRate: 15, vatInclusive: false })
  assert.equal(m(line.gross), 6500)
  assert.equal(m(r.taxableSubtotal), 6500)
  assert.equal(m(r.vatAmount), 975)
  assert.equal(m(r.total), 7475)
})

// ---------------------------------------------------------------------------
// Spec Test 2 — percentage discount
// ---------------------------------------------------------------------------
check('Test 2 — 10% discount: 6,500 → disc 650 · taxable 5,850 · VAT 877.50 · total 6,727.50', () => {
  const line = resolveLinePricing({ unitPrice: 6500, quantity: 1, discountType: 'PERCENTAGE', discountValue: 10 })
  assert.equal(m(line.discountAmount), 650)
  const r = computeSaleTaxTotals({ subtotal: line.gross, discount: line.discountAmount, vatRate: 15, vatInclusive: false })
  assert.equal(m(line.charged), 5850)
  assert.equal(m(r.taxableSubtotal), 5850)
  assert.equal(m(r.vatAmount), 877.50)
  assert.equal(m(r.total), 6727.50)
})

// ---------------------------------------------------------------------------
// Spec Test 3 — fixed discount (the spec's headline example)
// ---------------------------------------------------------------------------
check('Test 3 — fixed Br 500: taxable 6,000 · VAT 900 · total 6,900 (NOT VAT-then-discount)', () => {
  const line = resolveLinePricing({ unitPrice: 6500, quantity: 1, discountType: 'FIXED', discountValue: 500 })
  assert.equal(m(line.discountAmount), 500)
  const r = computeSaleTaxTotals({ subtotal: line.gross, discount: line.discountAmount, vatRate: 15, vatInclusive: false })
  assert.equal(m(r.taxableSubtotal), 6000)
  assert.equal(m(r.vatAmount), 900)
  assert.equal(m(r.total), 6900)
  // The wrong order (VAT on 6,500 then subtract) would give 6,975 — ensure not.
  assert.notEqual(m(r.total), 6975)
})

// ---------------------------------------------------------------------------
// Spec Test 4 — free gift
// ---------------------------------------------------------------------------
check('Test 4 — free gift: paid 6,500 line + 500-value gift charged 0 · gift out of revenue', () => {
  const paidLine = resolveLinePricing({ unitPrice: 6500, quantity: 1 })
  const giftLine = resolveLinePricing({ unitPrice: 500, quantity: 1, isFreeGift: true, label: '10ml Perfume' })
  assert.equal(giftLine.itemType, 'FREE_GIFT')
  assert.equal(m(giftLine.charged), 0)          // customer pays nothing for the gift
  assert.equal(m(giftLine.unitPrice), 500)      // real price preserved
  assert.equal(m(giftLine.giftValue), 500)      // value kept for reporting
  assert.equal(m(giftLine.discountAmount), 0)   // NOT counted as a discount
  // Gift contributes nothing to consideration/revenue:
  const subtotal = paidLine.charged + giftLine.charged
  const r = computeSaleTaxTotals({ subtotal, discount: 0, vatRate: 15, vatInclusive: false })
  assert.equal(m(r.taxableSubtotal), 6500)
  assert.equal(m(r.total), 7475)
})

// ---------------------------------------------------------------------------
// Spec Test 5 — discount + free gift together
// ---------------------------------------------------------------------------
check('Test 5 — discount Br 500 + 500-value gift: taxable 6,000 · VAT 900 · total 6,900', () => {
  const paidLine = resolveLinePricing({ unitPrice: 6500, quantity: 1, discountType: 'FIXED', discountValue: 500 })
  const giftLine = resolveLinePricing({ unitPrice: 500, quantity: 1, isFreeGift: true })
  // Service rule: subtotal = paid gross only; discount = line + sale levels.
  const subtotal = paidLine.gross
  const totalDiscount = paidLine.discountAmount
  const r = computeSaleTaxTotals({ subtotal, discount: totalDiscount, vatRate: 15, vatInclusive: false })
  assert.equal(m(subtotal), 6500)
  assert.equal(m(totalDiscount), 500)
  assert.equal(m(r.taxableSubtotal), 6000)
  assert.equal(m(r.vatAmount), 900)
  assert.equal(m(r.total), 6900)
  // Gift is separately identified and does NOT become revenue or a discount.
  assert.equal(giftLine.itemType, 'FREE_GIFT')
  assert.equal(m(giftLine.charged), 0)
  assert.equal(m(paidLine.charged + giftLine.charged), 6000)
})

// ---------------------------------------------------------------------------
// Spec Test 6 — multiple products + sale-level discount + gift
// ---------------------------------------------------------------------------
check('Test 6 — A 6,500 + B 3,500, sale disc 1,000, gift C: taxable 9,000 · VAT 1,350 · total 10,350', () => {
  const a = resolveLinePricing({ unitPrice: 6500, quantity: 1, label: 'A' })
  const b = resolveLinePricing({ unitPrice: 3500, quantity: 1, label: 'B' })
  const giftC = resolveLinePricing({ unitPrice: 500, quantity: 1, isFreeGift: true, label: 'C' })
  const subtotal = m(a.gross + b.gross)
  const saleDiscount = resolveSaleDiscount({ eligible: subtotal, discountType: 'FIXED', discountValue: 1000 })
  assert.equal(m(saleDiscount.amount), 1000)
  const r = computeSaleTaxTotals({ subtotal, discount: saleDiscount.amount, vatRate: 15, vatInclusive: false })
  assert.equal(m(subtotal), 10000)
  assert.equal(m(r.taxableSubtotal), 9000)
  assert.equal(m(r.vatAmount), 1350)
  assert.equal(m(r.total), 10350)
  assert.equal(m(giftC.charged), 0)
})

// ---------------------------------------------------------------------------
// Paid and free-gift lines consume the same stock bucket
// ---------------------------------------------------------------------------
check('Paid and free-gift lines share the same product/size stock bucket', () => {
  const paid = { product: { id: 'p1', name: 'Perfume' }, soldSize: '50ml', available: 2, quantity: 1 }
  const gift = { product: { id: 'p1', name: 'Perfume' }, soldSize: '50ml', available: 2, quantity: 1 }
  validateCombinedSaleStock([paid, gift])
  expectApiError(() => validateCombinedSaleStock([
    paid,
    { ...gift, quantity: 2 }
  ]), 400)
})

// ---------------------------------------------------------------------------
// Spec §4 — both discount levels together (no double-application)
// ---------------------------------------------------------------------------
check('Item-level 10% + sale-level Br 500 stack on the correct bases', () => {
  const a = resolveLinePricing({ unitPrice: 6500, quantity: 1, discountType: 'PERCENTAGE', discountValue: 10, label: 'A' })
  const b = resolveLinePricing({ unitPrice: 3500, quantity: 1, label: 'B' })
  const subtotal = m(a.gross + b.gross)                        // 10,000
  const itemDiscounts = m(a.discountAmount)                    // 650
  const eligible = m(subtotal - itemDiscounts)                 // 9,350
  const saleDiscount = resolveSaleDiscount({ eligible, discountType: 'FIXED', discountValue: 500 })
  const totalDiscount = m(itemDiscounts + saleDiscount.amount) // 1,150
  const r = computeSaleTaxTotals({ subtotal, discount: totalDiscount, vatRate: 15, vatInclusive: false })
  assert.equal(m(subtotal), 10000)
  assert.equal(m(totalDiscount), 1150)
  assert.equal(m(r.taxableSubtotal), 8850)
  assert.equal(m(r.vatAmount), 1327.50)
  assert.equal(m(r.total), 10177.50)
  assert.ok(r.taxableSubtotal >= 0)
})

check('Percentage sale discount computes on the post-item-discount base', () => {
  // subtotal 10,000, item disc 1,000 → eligible 9,000 → 10% = 900
  const saleDiscount = resolveSaleDiscount({ eligible: 9000, discountType: 'PERCENTAGE', discountValue: 10 })
  assert.equal(m(saleDiscount.amount), 900)
  assert.equal(saleDiscount.type, 'PERCENTAGE')
  assert.equal(saleDiscount.value, 10)
})

// ---------------------------------------------------------------------------
// Spec §3 — validation: never allow negative / over-eligible / NaN / bad %
// ---------------------------------------------------------------------------
check('REJECT negative discount', () => {
  expectApiError(() => computeDiscountAmount({ base: 6500, discountType: 'FIXED', discountValue: -1 }), 400)
  expectApiError(() => resolveSaleDiscount({ eligible: 6500, discount: -50 }), 400)
  expectApiError(() => resolveLinePricing({ unitPrice: 6500, quantity: 1, discountType: 'PERCENTAGE', discountValue: -5 }), 400)
})

check('REJECT discount greater than the eligible amount', () => {
  expectApiError(() => computeDiscountAmount({ base: 6500, discountType: 'FIXED', discountValue: 7000 }), 400)
  expectApiError(() => resolveSaleDiscount({ eligible: 1000, discountType: 'FIXED', discountValue: 1000.01 }), 400)
  expectApiError(() => resolveLinePricing({ unitPrice: 6500, quantity: 1, discountType: 'FIXED', discountValue: 6501 }), 400)
})

check('REJECT percentage above 100 / invalid type / NaN', () => {
  expectApiError(() => computeDiscountAmount({ base: 6500, discountType: 'PERCENTAGE', discountValue: 101 }), 400)
  expectApiError(() => computeDiscountAmount({ base: 6500, discountType: 'BOGUS', discountValue: 10 }), 400)
  expectApiError(() => computeDiscountAmount({ base: 6500, discountType: 'FIXED', discountValue: 'abc' }), 400)
  expectApiError(() => resolveLinePricing({ unitPrice: 'abc', quantity: 1 }), 400)
  expectApiError(() => resolveLinePricing({ unitPrice: 6500, quantity: 0 }), 400)
  expectApiError(() => resolveLinePricing({ unitPrice: 6500, quantity: -2 }), 400)
  expectApiError(() => computeChange('abc', 100), 400)
  expectApiError(() => computeChange(-10, 100), 400)
})

check('100% discount is allowed (charged exactly 0, VAT 0)', () => {
  const line = resolveLinePricing({ unitPrice: 6500, quantity: 1, discountType: 'PERCENTAGE', discountValue: 100 })
  assert.equal(m(line.discountAmount), 6500)
  assert.equal(m(line.charged), 0)
  assert.equal(line.itemType, 'DISCOUNTED')
  const r = computeSaleTaxTotals({ subtotal: line.gross, discount: line.discountAmount, vatRate: 15, vatInclusive: false })
  assert.equal(m(r.total), 0)
  assert.equal(m(r.vatAmount), 0)
})

check('Monetary results are always 2-decimal safe (no float drift)', () => {
  const line = resolveLinePricing({ unitPrice: 0.1 + 0.2, quantity: 3, discountType: 'PERCENTAGE', discountValue: 10 })
  for (const v of [line.gross, line.discountAmount, line.charged]) assert.equal(m(v), v)
  const r = computeSaleTaxTotals({ subtotal: 1234.56, discount: 34.56, vatRate: 15, vatInclusive: false })
  for (const v of Object.values(r)) assert.equal(m(v), v, `${v} not 2-dp safe`)
  assert.equal(computeChange(7000.1, 6900), 100.1)
})

check('LEGACY amount-only sale discount keeps working exactly as before', () => {
  const s = resolveSaleDiscount({ eligible: 6500, discount: 500 })
  assert.equal(m(s.amount), 500)
  assert.equal(s.type, 'FIXED')
  const none = resolveSaleDiscount({ eligible: 6500, discount: 0 })
  assert.equal(m(none.amount), 0)
  assert.equal(none.type, null)
})

// ---------------------------------------------------------------------------
// Spec §12/§13 — permissions & configurable limits (existing session system)
// ---------------------------------------------------------------------------
const cashier = { role: 'SALES', permissions: ['product:view', 'sale:view', 'sale:create'] }
const manager = { role: 'GENERAL_MANAGER', permissions: ['sale:discount', 'sale:free_gift'] }
const superAdmin = { role: 'SUPER_ADMIN', permissions: [] }

check('Free gift REQUIRES sale:free_gift for a normal cashier', () => {
  expectApiError(() => authorizeDiscountAndGift({ user: cashier, hasFreeGift: true, discountPercent: 0, discountLimitPercent: 0 }), 403)
  expectApiError(() => authorizeDiscountAndGift({ user: null, hasFreeGift: true, discountPercent: 0, discountLimitPercent: 0 }), 403)
})

check('Manager/SUPER_ADMIN may issue free gifts', () => {
  authorizeDiscountAndGift({ user: manager, hasFreeGift: true, discountPercent: 0, discountLimitPercent: 0 })
  authorizeDiscountAndGift({ user: superAdmin, hasFreeGift: true, discountPercent: 0, discountLimitPercent: 0 })
})

check('Discount within the configured limit needs NO extra permission (historic POS behaviour)', () => {
  authorizeDiscountAndGift({ user: cashier, hasFreeGift: false, discountPercent: 15, discountLimitPercent: 20 })
  // No limit configured (0) → never gates:
  authorizeDiscountAndGift({ user: cashier, hasFreeGift: false, discountPercent: 95, discountLimitPercent: 0 })
})

check('Discount ABOVE the configured limit requires sale:discount', () => {
  expectApiError(() => authorizeDiscountAndGift({ user: cashier, hasFreeGift: false, discountPercent: 21, discountLimitPercent: 20 }), 403)
  authorizeDiscountAndGift({ user: manager, hasFreeGift: false, discountPercent: 21, discountLimitPercent: 20 })
  authorizeDiscountAndGift({ user: superAdmin, hasFreeGift: false, discountPercent: 50, discountLimitPercent: 10 })
})

// ---------------------------------------------------------------------------
// Server-authoritative pricing (browser numbers never decide money)
// ---------------------------------------------------------------------------
check('Server resolves prices from the catalog (100ml price100ml rule)', () => {
  assert.equal(resolveServerUnitPrice({ price: 6500, price100ml: 10000 }, '100ml'), 10000)
  assert.equal(resolveServerUnitPrice({ price: 6500, price100ml: 10000 }, '50ml'), 6500)
  assert.equal(resolveServerUnitPrice({ price: 6500, price100ml: null }, '100ml'), 6500)
  assert.equal(resolveServerUnitPrice({ price: 22.5 }, '2.5g'), 22.5)
  assert.equal(resolveServerUnitPrice({ price: null }, '50ml'), null) // caller falls back to a validated client value
})

// ---------------------------------------------------------------------------
// The business' default VAT-INCLUSIVE mode also discounts BEFORE VAT
// ---------------------------------------------------------------------------
check('VAT-INCLUSIVE mode: discount reduces consideration BEFORE VAT extraction', () => {
  // 6,500 − 500 = 6,000 charged; VAT 15% extracted from 6,000 → 782.61
  const line = resolveLinePricing({ unitPrice: 6500, quantity: 1, discountType: 'FIXED', discountValue: 500 })
  const r = computeSaleTaxTotals({ subtotal: line.gross, discount: line.discountAmount, vatRate: 15, vatInclusive: true })
  assert.equal(m(r.total), 6000)
  assert.equal(m(r.vatAmount), 782.61)
  assert.equal(m(r.taxableSubtotal), 5217.39)
  // The WRONG order (VAT on 6,500 first → 847.83) must not happen:
  assert.notEqual(m(r.vatAmount), 847.83)
})

// ---------------------------------------------------------------------------
// Spec §7 — payment & change
// ---------------------------------------------------------------------------
check('Change: paid 7,000 on total 6,900 → 100 · exact → 0 · underpay → 0 · none → null', () => {
  assert.equal(computeChange(7000, 6900), 100)
  assert.equal(computeChange(6900, 6900), 0)
  assert.equal(computeChange(100, 6900), 0)   // credit part-sale: no change
  assert.equal(computeChange(null, 6900), null)
  assert.equal(computeChange(undefined, 6900), null)
})

console.log(`\n${passed} checks passed${process.exitCode ? ' — with failures' : ''}`)



