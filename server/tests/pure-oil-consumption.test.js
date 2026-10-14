/**
 * Pure Oil consumption rule — acceptance tests for the centralized business
 * rule and the sale-time helper. NO database required.
 *
 * Covers spec §5/§6/§18:
 *   50 ml Cream/Jelly -> 4 ml Pure Oil per unit
 *   100 ml Cream/Jelly -> 6 ml Pure Oil per unit
 *
 * Run from server/: node tests/pure-oil-consumption.test.js
 */
import assert from 'node:assert/strict'
import {
  PURE_OIL_ML_PER_UNIT,
  CREAM_SIZES,
  creamSizeLabel,
  pureOilPerUnit,
  pureOilConsumptionMl,
  pureOilConsumptionLabel,
  pureOilCostPerMl,
  pureOilCostForCream
} from '../src/services/pureOilService.js'
import { creamPureOilNeed } from '../src/services/saleService.js'

let passed = 0
function check(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (e) { console.error(`  FAIL  ${name}\n        ${e.message}`); process.exitCode = 1 }
}

console.log('Pure Oil consumption rule — acceptance tests\n')

// ---------------------------------------------------------------------------
// The single source of truth for the rule
// ---------------------------------------------------------------------------
check('Rule table: 50 ml -> 4 ml, 100 ml -> 6 ml (no other sizes)', () => {
  assert.deepEqual(PURE_OIL_ML_PER_UNIT, { '50 ml': 4, '100 ml': 6 })
  assert.deepEqual(CREAM_SIZES, ['50 ml', '100 ml'])
})

check('creamSizeLabel normalizes 50ml / 100 ml / 50ML variants', () => {
  assert.equal(creamSizeLabel('50 ml'), '50 ml')
  assert.equal(creamSizeLabel('50ml'), '50 ml')
  assert.equal(creamSizeLabel('50ML'), '50 ml')
  assert.equal(creamSizeLabel('100 ml'), '100 ml')
  assert.equal(creamSizeLabel('100ml'), '100 ml')
  assert.equal(creamSizeLabel('100ml'), null)
  assert.equal(creamSizeLabel(''), null)
  assert.equal(creamSizeLabel(null), null)
})

check('pureOilPerUnit: 4 for 30 ml, 6 for 50 ml, 0 otherwise', () => {
  assert.equal(pureOilPerUnit('50 ml'), 4)
  assert.equal(pureOilPerUnit('100 ml'), 6)
  assert.equal(pureOilPerUnit('100ml'), 0)
})

check('Read-only display label used by the UI', () => {
  assert.equal(pureOilConsumptionLabel('50 ml'), '4 ml per unit')
  assert.equal(pureOilConsumptionLabel('100 ml'), '6 ml per unit')
  assert.equal(pureOilConsumptionLabel('100ml'), null)
})

// ---------------------------------------------------------------------------
// spec 18 — Cream 50 ml: Pure Oil 100 ml, sell 5 -> 20 ml consumed
// ---------------------------------------------------------------------------
check('Cream 50 ml · sell 5 -> 20 ml Pure Oil consumed', () => {
  assert.equal(pureOilConsumptionMl({ size: '50 ml', quantity: 5 }), 20)
})

// ---------------------------------------------------------------------------
// spec §18 — Cream 50 ml: Pure Oil 100 ml, sell 5 -> 30 ml consumed
// ---------------------------------------------------------------------------
check('Cream 100 ml · sell 5 -> 30 ml Pure Oil consumed', () => {
  assert.equal(pureOilConsumptionMl({ size: '100 ml', quantity: 5 }), 30)
})

// ---------------------------------------------------------------------------
// spec §18 — Different Pure Oils: 2×A(30ml→PO-001) + 3×B(50ml→PO-002)
//   PO-001 = -8 ml, PO-002 = -18 ml
// ---------------------------------------------------------------------------
check('Different Pure Oils: 2×50ml -> 8 ml, 3×100ml -> 18 ml', () => {
  assert.equal(pureOilConsumptionMl({ size: '50 ml', quantity: 2 }), 8)
  assert.equal(pureOilConsumptionMl({ size: '100 ml', quantity: 3 }), 18)
})

// ---------------------------------------------------------------------------
// spec §18 — Insufficient stock: available 3 ml, sell 1×30 ml (needs 4) -> reject
// ---------------------------------------------------------------------------
check('Insufficient stock scenario: 1×50 ml requires 4 ml (> 3 available)', () => {
  const required = pureOilConsumptionMl({ size: '50 ml', quantity: 1 })
  assert.equal(required, 4)
  assert.ok(3 < required, 'sale must be rejected when available(3) < required(4)')
})

// ---------------------------------------------------------------------------
// Non-Cream products never consume Pure Oil (Perfume / Oil / Pure Oil / Musk)
// ---------------------------------------------------------------------------
check('Non-Cream products consume 0 Pure Oil', () => {
  assert.equal(pureOilConsumptionMl({ size: '100ml', quantity: 5 }), 0)
  assert.equal(pureOilConsumptionMl({ size: null, quantity: 5 }), 0)
  assert.equal(pureOilConsumptionMl({ size: '50 ml', quantity: 0 }), 0)
})

// ---------------------------------------------------------------------------
// creamPureOilNeed — the sale-time helper (null for non-Cream lines)
// ---------------------------------------------------------------------------
check('creamPureOilNeed returns the per-line Pure Oil requirement', () => {
  const need = creamPureOilNeed({ productType: 'CREAM', size: '50 ml', pureOilProductId: 'po-001' }, 5)
  assert.equal(need.requiredMl, 20)
  assert.equal(need.perUnitMl, 4)
  assert.equal(need.creamSize, '50 ml')
  assert.equal(need.pureOilProductId, 'po-001')
})

check('creamPureOilNeed 100 ml -> 6 ml per unit', () => {
  const need = creamPureOilNeed({ productType: 'CREAM', size: '100 ml', pureOilProductId: 'po-002' }, 3)
  assert.equal(need.requiredMl, 18)
  assert.equal(need.perUnitMl, 6)
})

check('creamPureOilNeed is null for Perfume / Oil / Pure Oil / Musk lines', () => {
  assert.equal(creamPureOilNeed({ productType: 'PERFUME', size: '50ml', pureOilProductId: null }, 5), null)
  assert.equal(creamPureOilNeed({ productType: 'OIL', size: '2.5g', pureOilProductId: null }, 5), null)
  assert.equal(creamPureOilNeed({ productType: 'PURE_OIL', size: '10g', pureOilProductId: null }, 5), null)
  assert.equal(creamPureOilNeed({ productType: 'MUSK', size: '3 ml', pureOilProductId: null }, 5), null)
  assert.equal(creamPureOilNeed({ productType: 'CREAM', size: '100ml', pureOilProductId: 'x' }, 5), null)
})

// ---------------------------------------------------------------------------
// spec §9 — Cream cost includes the cost of the consumed Pure Oil
// ---------------------------------------------------------------------------
check('pureOilCostForCream: 50 ml cream uses 4 ml of Pure Oil (cost ÷ size × 4)', () => {
  // Pure Oil: 100 ml size, cost 50 → costPerMl 0.5 → 4 ml costs 2.00
  const oil = { costPrice: 50, size: '100 ml' }
  assert.equal(pureOilCostForCream({ size: '50 ml', pureOil: oil }), 2)
})

check('pureOilCostForCream: 100 ml cream uses 6 ml of Pure Oil', () => {
  const oil = { costPrice: 50, size: '100 ml' } // 0.5/ml × 6 = 3.00
  assert.equal(pureOilCostForCream({ size: '100 ml', pureOil: oil }), 3)
})

check('Cream/Jelly actual unit cost = catalog base cost + consumed Pure Oil cost', () => {
  const creamBaseCost = 12.5
  const oil = { costPrice: 50, size: '100 ml' }
  assert.equal(creamBaseCost + pureOilCostForCream({ size: '50 ml', pureOil: oil }), 14.5)
  assert.equal(creamBaseCost + pureOilCostForCream({ size: '100 ml', pureOil: oil }), 15.5)
})

check('pureOilCostForCream is 0 for non-Cream sizes / missing oil / gram oil', () => {
  assert.equal(pureOilCostForCream({ size: '100ml', pureOil: { costPrice: 50, size: '100 ml' } }), 0)
  assert.equal(pureOilCostForCream({ size: '50 ml', pureOil: null }), 0)
  // Gram-based oil has no ml size → never invent a cost
  assert.equal(pureOilCostForCream({ size: '50 ml', pureOil: { costPrice: 50, size: '10g' } }), 0)
})

check('pureOilCostPerMl derives from the existing Pure Oil costing method', () => {
  assert.equal(pureOilCostPerMl({ costPrice: 600, size: '100 ml' }), 6)
  assert.equal(pureOilCostPerMl({ costPrice: 0, size: '100 ml' }), 0)
  assert.equal(pureOilCostPerMl(null), 0)
})

console.log(`\n${passed} checks passed${process.exitCode ? ' — with failures' : ''}`)

