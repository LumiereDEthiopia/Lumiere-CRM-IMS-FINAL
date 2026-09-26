/**
 * Connection-pool concurrency check — fires concurrent dashboard/report/settings
 * requests and verifies none of them fail with pool-timeout errors.
 * Requires a running server (TEST_BASE, default http://localhost:3999):
 *   node scripts/settings-pool-check.mjs
 */
const BASE = process.env.TEST_BASE || 'http://localhost:3999'

async function call(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const started = Date.now()
  try {
    const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
    const json = await res.json().catch(() => null)
    return { status: res.status, ms: Date.now() - started, json, error: null }
  } catch (e) {
    return { status: 0, ms: Date.now() - started, json: null, error: e.message }
  }
}

const login = await call('POST', '/api/auth/login', { body: { email: 'admin@lumiere.com', password: 'admin123' } })
const token = login.json?.data?.token
if (!token) {
  console.error('LOGIN FAILED:', login.status, JSON.stringify(login.json)?.slice(0, 200))
  process.exit(1)
}
console.log('login OK')

// Warm-up
await call('GET', '/api/settings', { token })

// Requests across the endpoints named in the incident report: login,
// dashboard, customers, products, inventory, POS (settings/locations), sales,
// customer-task counts (via dashboard/reports), reports, settings.
// Correct report routes are /api/reports/summary|sales|inventory|crm.
const targets = [
  ...Array(6).fill(['GET', '/api/settings']),
  ...Array(6).fill(['GET', '/api/dashboard/stats']),
  ...Array(4).fill(['GET', '/api/customers?limit=50']),
  ...Array(4).fill(['GET', '/api/products?limit=50']),
  ...Array(4).fill(['GET', '/api/inventory?limit=50']),
  ...Array(3).fill(['GET', '/api/locations?limit=50']),
  ...Array(5).fill(['GET', '/api/reports/summary']),
  ...Array(3).fill(['GET', '/api/reports/sales']),
  ...Array(3).fill(['GET', '/api/reports/crm']),
  ...Array(2).fill(['GET', '/api/reports/inventory']),
  ...Array(4).fill(['GET', '/api/sales?limit=20'])
]
// Optional concurrency level for a graded measurement:
//   POOL_CHECK_LIMIT=12 node scripts/settings-pool-check.mjs   (realistic load)
//   node scripts/settings-pool-check.mjs                        (full burst)
const limit = parseInt(process.env.POOL_CHECK_LIMIT || '0', 10)
const batch = limit > 0 ? targets.slice(0, limit) : targets
const results = await Promise.all(batch.map(([m, p]) => call(m, p, { token })))
const ok = results.filter((r) => r.status === 200).length
const poolTimeouts = results.filter((r) => JSON.stringify(r.json || '').includes('Timed out fetching')).length
const otherErrors = results.filter((r) => r.status !== 200).map((r) => `${r.status}:${(r.error || JSON.stringify(r.json)?.slice(0, 80))}`)
const maxMs = Math.max(...results.map((r) => r.ms))

console.log(`concurrent: ${results.length}, ok: ${ok}, pool-timeouts: ${poolTimeouts}, max latency: ${maxMs}ms`)
if (otherErrors.length) console.log('non-200:', otherErrors.slice(0, 6).join(' | '))
process.exit(poolTimeouts > 0 || ok < results.length ? 1 : 0)
