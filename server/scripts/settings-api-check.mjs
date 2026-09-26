/**
 * Settings API end-to-end check — GET / PUT / validation / auth / persistence.
 *
 * Run against a REAL server instance (no data is destroyed: the only writes
 * are (a) writing an existing setting back with its current value and
 * (b) creating + deleting a temporary `settings_selftest_key` row):
 *
 *   # terminal 1
 *   PORT=3999 node src/app.js
 *   # terminal 2 (from server/)
 *   node scripts/settings-api-check.mjs
 */
import prisma from '../src/config/prisma.js'

const BASE = process.env.TEST_BASE || 'http://localhost:3999'
let passed = 0
let failed = 0

function check(name, ok, extra = '') {
  if (ok) { passed++; console.log(`  PASS  ${name}`) }
  else { failed++; console.error(`  FAIL  ${name}${extra ? ' — ' + extra : ''}`); process.exitCode = 1 }
}

async function call(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  let json = null
  try { json = await res.json() } catch {}
  return { status: res.status, json }
}

async function main() {
  // 0. Health
  const health = await call('GET', '/api/health')
  check('Server is reachable', health.status === 200 || health.status === 204, `status=${health.status}`)

  // 1. Authentication required for settings
  const anon = await call('GET', '/api/settings')
  check('GET /api/settings requires authentication', anon.status === 401, `status=${anon.status}`)

  // 2. Login as admin
  const login = await call('POST', '/api/auth/login', { body: { email: 'admin@lumiere.com', password: 'admin123' } })
  const token = login.json?.data?.token
  check('Admin login', login.status === 200 && !!token, `status=${login.status}`)
  if (!token) return

  // 3. GET list — defaults seeded, shape correct
  const list = await call('GET', '/api/settings', { token })
  const settings = list.json?.data || []
  const byKey = Object.fromEntries(settings.map((s) => [s.key, s]))
  check('GET /api/settings returns 200 + array', list.status === 200 && Array.isArray(settings), `status=${list.status}`)
  check('Known settings present (currency, ethiopia_vat_rate, notifications_enabled)',
    !!byKey.currency && !!byKey.ethiopia_vat_rate && !!byKey.notifications_enabled)

  // 4. GET single + 404
  const single = await call('GET', '/api/settings/currency', { token })
  check('GET /api/settings/currency works', single.status === 200 && single.json?.data?.key === 'currency')
  const missing = await call('GET', '/api/settings/not_a_real_setting_xyz', { token })
  check('GET unknown key → 404', missing.status === 404, `status=${missing.status}`)

  // 5. Persistence roundtrip — write the CURRENT value of business_name back
  //    (no data change) and verify the value that comes back is stored.
  const originalName = byKey.business_name?.value ?? 'Lumière Perfume'
  const putSame = await call('PUT', '/api/settings', { token, body: { settings: [{ key: 'business_name', value: originalName, type: 'string' }] } })
  check('PUT /api/settings (valid batch) → 200', putSame.status === 200, `status=${putSame.status} ${JSON.stringify(putSame.json).slice(0, 120)}`)
  const afterPut = await call('GET', '/api/settings/business_name', { token })
  check('Persisted value read back after PUT', afterPut.json?.data?.value === originalName,
    `expected="${originalName}" got="${afterPut.json?.data?.value}"`)

  // 6. Validation — numbers must be numeric
  const badNumber = await call('PUT', '/api/settings', { token, body: { settings: [{ key: 'ethiopia_vat_rate', value: 'abc', type: 'number' }] } })
  check('PUT invalid number → 400 with message', badNumber.status === 400 && /valid number/i.test(badNumber.json?.message || ''), `status=${badNumber.status}`)

  // 7. Validation — booleans must be true/false
  const badBool = await call('PUT', '/api/settings', { token, body: { settings: [{ key: 'notifications_enabled', value: 'maybe', type: 'boolean' }] } })
  check('PUT invalid boolean → 400 with message', badBool.status === 400 && /true or false/i.test(badBool.json?.message || ''), `status=${badBool.status}`)

  // 8. Validation — invalid key rejected
  const badKey = await call('PUT', '/api/settings', { token, body: { settings: [{ key: 'BAD KEY!', value: 'x' }] } })
  check('PUT invalid key → 400', badKey.status === 400, `status=${badKey.status}`)

  // 9. New key can be created and removed again (net zero change)
  const tempPut = await call('PUT', '/api/settings', { token, body: { settings: [{ key: 'settings_selftest_key', value: 'temp-value', type: 'string' }] } })
  const tempGet = tempPut.status === 200 ? await call('GET', '/api/settings/settings_selftest_key', { token }) : null
  check('PUT creates a new setting key', tempPut.status === 200 && tempGet?.json?.data?.value === 'temp-value')
  const tempDel = await call('DELETE', '/api/settings/settings_selftest_key', { token })
  const tempGetAfter = await call('GET', '/api/settings/settings_selftest_key', { token })
  check('DELETE removes the temporary key (net zero)', tempDel.status === 200 && tempGetAfter.status === 404, `del=${tempDel.status} get=${tempGetAfter.status}`)

  // 10. Authorization — writes without a token are rejected and change nothing.
  const anonPut = await call('PUT', '/api/settings', { body: { settings: [{ key: 'currency', value: 'USD' }] } })
  check('Anonymous PUT /api/settings is rejected', anonPut.status === 401, `status=${anonPut.status}`)
  const currencyStill = await call('GET', '/api/settings/currency', { token })
  check('Currency unchanged after rejected write', currencyStill.json?.data?.value === byKey.currency?.value)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exitCode = 1
}

try {
  await main()
} finally {
  await prisma.$disconnect()
}

