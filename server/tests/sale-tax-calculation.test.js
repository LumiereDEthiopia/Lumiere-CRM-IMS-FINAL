/**
 * Pure unit tests for the Sales/POS VAT · withholding · TOTAL calculation.
 * NO database required. The tested function is the exact code path createSale
 * uses, so these assertions cover the saved sale, the POS preview and receipts.
 *
 * Run from server/: node tests/sale-tax-calculation.test.js
 *
 * BUSINESS RULE: product prices are VAT-INCLUSIVE. The shelf price is the final
 * selling price, so VAT is EXTRACTED from it (never added on top) and withholding
 * is a tax breakdown that must NOT reduce the amount the customer pays.
 */
import assert from 'node:assert/strict'
import { computeSaleTaxTotals } from '../src/services/saleService.js'

let passed = 0
function check(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (e) { console.error(`  FAIL  ${name}\n        ${e.message}`); process.exitCode = 1 }
}

// Money comparison at 2 decimals (avoids binary-float equality surprises).
const m = (v) => Math.round((Number(v) || 0) * 100) / 100

// Live production tax configuration: VAT 15% (inclusive), withholding 3%.
const TAX = {
  vatRate: 15,
  vatInclusive: true,
  withholdingRate: 3,
  withholdingEnabled: true,
  customerHasTin: true,
  applyWithholding: true
}
const calc = (subtotal, extra = {}) => computeSaleTaxTotals({ subtotal, ...TAX, ...extra })

console.log('Sales tax calculation — acceptance tests\n')

check('ACCEPTANCE — 50ml · Br 6,500 · qty 1 · disc 0 · withholding NOT applied → Br 0.00', () => {
  // Default sale: the operator has not opted into withholding (no TIN / box
  // unticked), so the breakdown must show Br 0.00 while the Total is untouched.
  const price = 6500 * 1 // Product Price: Br 6,500.00
  const r = computeSaleTaxTotals({
    subtotal: price,
    discount: 0,
    vatRate: 15,
    vatInclusive: true,
    withholdingRate: 3,
    withholdingEnabled: true,
    customerHasTin: false,    // walk-in / not applicable
    applyWithholding: false   // not opted in
  })
  assert.equal(m(price), 6500)              // Product Price:  Br 6,500.00
  assert.equal(m(r.taxableSubtotal), 5652.17) // Subtotal:     Br 5,652.17
  assert.equal(m(r.vatAmount), 847.83)        // VAT (15%):     Br 847.83
  assert.equal(m(r.withholdingAmount), 0)     // Withholding (3%) Br 0.00
  assert.equal(m(r.total), 6500)              // Total:         Br 6,500.00
})

check('100ml @ Br 10,000 · qty 1 · no discount → Total Br 10,000.00', () => {
  const r = calc(10000)
  assert.equal(m(r.total), 10000)
  assert.equal(m(r.vatAmount), 1304.35)
  assert.equal(m(r.taxableSubtotal), 8695.65)
  assert.equal(m(r.withholdingAmount), 260.87)
})

check('50ml @ Br 6,500 · qty 2 · no discount → Total Br 13,000.00', () => {
  const r = calc(6500 * 2)
  assert.equal(m(r.total), 13000)
  assert.equal(m(r.vatAmount), 1695.65)
  assert.equal(m(r.taxableSubtotal), 11304.35)
  assert.equal(m(r.withholdingAmount), 339.13)
})

check('50ml @ Br 6,500 · discount Br 500 → Total Br 6,000.00', () => {
  const r = calc(6500, { discount: 500 })
  assert.equal(m(r.total), 6000)
  assert.equal(m(r.vatAmount), 782.61)
  assert.equal(m(r.taxableSubtotal), 5217.39)
  assert.equal(m(r.withholdingAmount), 156.52)
})

check('REGRESSION: withholding never reduces the Total (must not be Br 6,330.43)', () => {
  const withWithholding = calc(6500)
  const withoutWithholding = calc(6500, { applyWithholding: false })
  assert.equal(m(withWithholding.withholdingAmount), 169.57, 'withholding is still shown')
  assert.equal(m(withWithholding.total), m(withoutWithholding.total), 'Total is identical either way')
  assert.equal(m(withWithholding.total), 6500)
  assert.notEqual(m(withWithholding.total), 6330.43)
})

check('withholding requires a TIN — no TIN → 0 and Total unchanged', () => {
  const r = calc(6500, { customerHasTin: false })
  assert.equal(m(r.withholdingAmount), 0)
  assert.equal(m(r.total), 6500)
})

check('withholding disabled in settings → 0 and Total unchanged', () => {
  const r = calc(6500, { withholdingEnabled: false })
  assert.equal(m(r.withholdingAmount), 0)
  assert.equal(m(r.total), 6500)
})

check('VAT not registered (rate 0) → no VAT, withholding on full price', () => {
  const r = calc(6500, { vatRate: 0 })
  assert.equal(m(r.vatAmount), 0)
  assert.equal(m(r.taxableSubtotal), 6500)
  assert.equal(m(r.withholdingAmount), 195) // 6,500 × 3%
  assert.equal(m(r.total), 6500)
})

check('TOTAL always equals price − discount (VAT-inclusive invariant)', () => {
  const cases = [[6500, 0], [10000, 0], [6500, 500], [13000, 0], [1234.56, 34.56], [0, 0]]
  for (const [subtotal, discount] of cases) {
    const r = calc(subtotal, { discount })
    assert.equal(m(r.total), m(subtotal - discount), `subtotal=${subtotal} discount=${discount}`)
  }
})

check('price follows the selected size (50ml 6,500 vs 100ml 10,000)', () => {
  assert.equal(m(calc(6500).total), 6500)
  assert.equal(m(calc(10000).total), 10000)
})

check('all monetary results are rounded to 2 decimals', () => {
  for (const subtotal of [6500, 10000, 1234.56, 33333.33, 7.77]) {
    const r = calc(subtotal)
    for (const [key, value] of Object.entries(r)) {
      assert.equal(m(value), value, `${key}=${value} is not 2-decimal safe`)
    }
  }
})

check('VAT + taxable base always re-adds to the VAT-inclusive amount', () => {
  for (const subtotal of [6500, 10000, 13000, 1234.56]) {
    const r = calc(subtotal)
    assert.equal(m(r.vatAmount + r.taxableSubtotal), m(r.total), `subtotal=${subtotal}`)
  }
})

console.log(`\n${passed} checks passed${process.exitCode ? ' — with failures' : ''}`)