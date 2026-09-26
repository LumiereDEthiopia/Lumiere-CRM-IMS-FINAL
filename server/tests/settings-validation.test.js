/**
 * Pure unit tests for the settings validation logic — NO database required.
 * Run from server/: node tests/settings-validation.test.js
 */
import assert from 'node:assert/strict'
import { validateSettingEntry } from '../src/controllers/settingController.js'

let passed = 0
function check(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (e) { console.error(`  FAIL  ${name}\n        ${e.message}`); process.exitCode = 1 }
}

check('valid string entry passes through', () => {
  assert.deepEqual(validateSettingEntry({ key: 'business_name', value: 'Lumière Perfume', type: 'string' }),
    { key: 'business_name', value: 'Lumière Perfume', type: 'string' })
})

check('null/undefined value becomes empty string', () => {
  assert.equal(validateSettingEntry({ key: 'business_phone', value: null }).value, '')
  assert.equal(validateSettingEntry({ key: 'business_phone' }).value, '')
})

check('boolean: only true/false accepted', () => {
  assert.equal(validateSettingEntry({ key: 'notifications_enabled', value: 'true' }).value, 'true')
  assert.equal(validateSettingEntry({ key: 'notifications_enabled', value: false }).value, 'false')
  assert.throws(() => validateSettingEntry({ key: 'notifications_enabled', value: 'maybe' }), /true or false/)
  assert.throws(() => validateSettingEntry({ key: 'ethiopia_vat_registered', value: 'yes' }), /true or false/)
})

check('boolean: empty value normalises to false', () => {
  assert.equal(validateSettingEntry({ key: 'notifications_enabled', value: '' }).value, 'false')
})

check('number: rejects non-numeric values', () => {
  assert.equal(validateSettingEntry({ key: 'ethiopia_vat_rate', value: '15' }).value, '15')
  assert.throws(() => validateSettingEntry({ key: 'ethiopia_vat_rate', value: 'abc' }), /valid number/)
  assert.throws(() => validateSettingEntry({ key: 'backup_interval_hours', value: '6h' }), /valid number/)
})

check('type comes from the known-key registry even when omitted', () => {
  assert.equal(validateSettingEntry({ key: 'low_stock_threshold', value: '7' }).type, 'number')
  assert.equal(validateSettingEntry({ key: 'notifications_enabled', value: 'true' }).type, 'boolean')
})

check('invalid type value is rejected', () => {
  assert.throws(() => validateSettingEntry({ key: 'business_name', value: 'x', type: 'object' }), /Invalid type/)
})

check('invalid key format is rejected', () => {
  assert.throws(() => validateSettingEntry({ key: 'BAD KEY!', value: 'x' }), /Invalid setting key/)
  assert.throws(() => validateSettingEntry({ key: '', value: 'x' }), /Invalid setting key/)
  assert.throws(() => validateSettingEntry({ key: 'x'.repeat(101), value: 'x' }), /Invalid setting key/)
})

check('oversized values are rejected', () => {
  assert.throws(() => validateSettingEntry({ key: 'business_name', value: 'x'.repeat(2001) }), /too long/)
})

check('pos_payment_methods: normalised to upper-case code list', () => {
  assert.equal(validateSettingEntry({ key: 'pos_payment_methods', value: 'cash, bank_transfer , telebirr' }).value, 'CASH,BANK_TRANSFER,TELEBIRR')
  assert.throws(() => validateSettingEntry({ key: 'pos_payment_methods', value: 'cash;card' }), /comma-separated/)
})

check('pos_default_payment_method: normalised to an upper-case code', () => {
  assert.equal(validateSettingEntry({ key: 'pos_default_payment_method', value: 'cash' }).value, 'CASH')
  assert.throws(() => validateSettingEntry({ key: 'pos_default_payment_method', value: 'cash;card' }), /code like CASH/)
})

console.log(`\n${passed} checks passed${process.exitCode ? ' — FAILURES ABOVE' : ''}`)
