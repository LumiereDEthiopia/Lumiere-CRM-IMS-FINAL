/**
 * Activate Ethiopian VAT (15%) + Withholding (3%) in the Settings table so the
 * New Sale summary, receipts and the backend all calculate them for real.
 *
 * Uses the app's own validated API (PUT /api/settings) so the change is
 * audit-logged. Rates are NOT changed here — only the two on/off switches.
 * Revert anytime with:  PUT { ethiopia_vat_registered: "false",
 *                             ethiopia_withholding_enabled: "false" }
 *
 * Run against a running server (default http://localhost:3999):
 *   node scripts/activate-tax-settings.mjs
 */
const BASE = process.env.TEST_BASE || 'http://localhost:3999'

async function call(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const json = await res.json().catch(() => null)
  return { status: res.status, json }
}

const login = await call('POST', '/api/auth/login', { body: { email: 'admin@lumiere.com', password: 'admin123' } })
const token = login.json?.data?.token
if (!token) {
  console.error('LOGIN FAILED:', login.status, JSON.stringify(login.json)?.slice(0, 200))
  process.exit(1)
}
console.log('login OK')

const before = await call('GET', '/api/settings', { token })
const byKey = Object.fromEntries((before.json?.data || []).map((s) => [s.key, s.value]))
console.log('before:', JSON.stringify({
  vat_registered: byKey.ethiopia_vat_registered,
  vat_rate: byKey.ethiopia_vat_rate,
  vat_inclusive: byKey.ethiopia_vat_inclusive,
  withholding_enabled: byKey.ethiopia_withholding_enabled,
  withholding_rate: byKey.ethiopia_withholding_rate
}))

const put = await call('PUT', '/api/settings', {
  token,
  body: {
    settings: [
      { key: 'ethiopia_vat_registered', value: 'true', type: 'boolean' },
      { key: 'ethiopia_withholding_enabled', value: 'true', type: 'boolean' }
    ]
  }
})
console.log('PUT status:', put.status)
if (put.status !== 200) {
  console.error(JSON.stringify(put.json)?.slice(0, 300))
  process.exit(1)
}

const after = await call('GET', '/api/settings', { token })
const afterByKey = Object.fromEntries((after.json?.data || []).map((s) => [s.key, s.value]))
console.log('after:', JSON.stringify({
  vat_registered: afterByKey.ethiopia_vat_registered,
  vat_rate: afterByKey.ethiopia_vat_rate,
  vat_inclusive: afterByKey.ethiopia_vat_inclusive,
  withholding_enabled: afterByKey.ethiopia_withholding_enabled,
  withholding_rate: afterByKey.ethiopia_withholding_rate
}))
console.log('VAT active:', afterByKey.ethiopia_vat_registered === 'true' && Number(afterByKey.ethiopia_vat_rate) > 0)
console.log('Withholding active:', afterByKey.ethiopia_withholding_enabled === 'true' && Number(afterByKey.ethiopia_withholding_rate) > 0)
