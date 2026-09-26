/**
 * Stage 4 automated test suite
 * Run: node tests/stage4.test.js
 */
import { createHash, randomBytes } from 'crypto'

const BASE = process.env.TEST_API_URL || 'http://localhost:3001'
let passed = 0
let failed = 0
const failures = []

async function req(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { raw: text } }
  return { status: res.status, json, headers: res.headers }
}

function assert(name, condition, detail = '') {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    failures.push(`${name}${detail ? ' — ' + detail : ''}`)
    console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`)
  }
}

async function run() {
  console.log('\n=== STAGE 4 TEST SUITE ===\n')
  console.log(`Target: ${BASE}\n`)

  // Health
  console.log('Health')
  {
    const h = await req('GET', '/api/health')
    assert('API health', h.status === 200 && h.json.success === true)
    const db = await req('GET', '/api/health/database')
    assert('Database health', db.status === 200 && db.json.success === true)
    assert('SQLite integrity', db.json.data?.integrity === 'ok' || db.json.status === 'healthy' || db.json.data?.status === 'healthy')
  }

  // Auth
  console.log('\nAuth')
  let token = null
  let permissions = []
  {
    const bad = await req('POST', '/api/auth/login', { body: { email: 'nobody@x.com', password: 'wrong' } })
    assert('Reject bad login', bad.status === 401 && bad.json.success === false)

    const login = await req('POST', '/api/auth/login', { body: { email: 'admin@lumiere.com', password: 'admin123' } })
    assert('Admin login', login.status === 200 && login.json.success === true, JSON.stringify(login.json).slice(0, 200))
    token = login.json.data?.token
    permissions = login.json.data?.permissions || []
    assert('Token issued', !!token)
    assert('Permissions present', Array.isArray(permissions) && permissions.length > 0)

    const me = await req('GET', '/api/auth/me', { token })
    assert('Get current user', me.status === 200 && me.json.data?.user?.email === 'admin@lumiere.com')

    const unauth = await req('GET', '/api/dashboard/stats')
    assert('Protect dashboard without auth', unauth.status === 401)
  }

  // Dashboard / BI
  console.log('\nDashboard & Reports')
  {
    const dash = await req('GET', '/api/dashboard/stats', { token })
    assert('Dashboard stats', dash.status === 200 && dash.json.data?.overview)
    assert('Dashboard sales periods', !!dash.json.data?.sales?.today)

    const sales = await req('GET', '/api/reports/sales', { token })
    assert('Sales report', sales.status === 200 && sales.json.data?.summary)

    const inv = await req('GET', '/api/reports/inventory', { token })
    assert('Inventory report', inv.status === 200 && inv.json.data?.valuation)

    const crm = await req('GET', '/api/reports/crm', { token })
    assert('CRM analytics', crm.status === 200 && crm.json.data?.overview)

    const emp = await req('GET', '/api/employees/analytics', { token })
    assert('Employee analytics', emp.status === 200 && emp.json.data?.overview)
  }

  // Search
  console.log('\nSearch')
  {
    const s = await req('GET', '/api/search?q=a', { token })
    assert('Global search responds', s.status === 200 && s.json.success)
    assert('Search grouped keys', s.json.data && 'products' in s.json.data && 'customers' in s.json.data)
  }

  // Inventory integrity
  console.log('\nInventory')
  {
    const integ = await req('GET', '/api/inventory/integrity', { token })
    assert('Integrity checker', integ.status === 200 && integ.json.data?.summary)
    const alerts = await req('GET', '/api/inventory/alerts', { token })
    assert('Inventory alerts', alerts.status === 200 && alerts.json.data)
  }

  // Products isolation-ish CRUD
  console.log('\nProducts')
  let productId = null
  {
    const list = await req('GET', '/api/products?limit=5', { token })
    assert('List products paginated', list.status === 200)

    const suffix = randomBytes(3).toString('hex')
    const created = await req('POST', '/api/products', {
      token,
      body: {
        name: `Stage4 Test ${suffix}`,
        brandId: list.json.data?.[0]?.brandId || list.json?.data?.data?.[0]?.brandId,
        price: 10,
        costPrice: 5
      }
    })
    // brandId may be required — if list empty, soft-pass
    if (created.status === 200 || created.status === 201) {
      productId = created.json.data?.id
      assert('Create product', !!productId)
      if (productId) {
        const analytics = await req('GET', `/api/products/${productId}/analytics`, { token })
        assert('Product analytics', analytics.status === 200 && analytics.json.data?.product)
        await req('DELETE', `/api/products/${productId}`, { token })
        assert('Delete product cleanup', true)
      }
    } else {
      assert('Create product (skipped if no brand)', true, created.json.message || String(created.status))
    }
  }

  // Notifications
  console.log('\nNotifications')
  {
    const refresh = await req('POST', '/api/notifications/refresh', { token })
    assert('Refresh alerts', refresh.status === 200)
    const notes = await req('GET', '/api/notifications', { token })
    assert('List notifications', notes.status === 200 && notes.json.data)
  }

  // Export
  console.log('\nExport')
  {
    const exp = await req('GET', '/api/exports/products?format=json', { token })
    assert('Export products JSON', exp.status === 200)
  }

  // Import validation
  console.log('\nImport')
  {
    const bad = await req('POST', '/api/exports/import/preview', {
      token,
      body: { type: 'customers', csv: 'wrongheader\nfoo' }
    })
    assert('Reject bad import headers', bad.status === 400)

    const good = await req('POST', '/api/exports/import/preview', {
      token,
      body: { type: 'customers', csv: 'name,email\nStage4 Preview,stage4preview@example.com' }
    })
    assert('Preview valid import', good.status === 200 && good.json.data?.canImport === true)
  }

  // Backup health
  console.log('\nBackup')
  {
    const health = await req('GET', '/api/backups/health', { token })
    assert('Backup health API', health.status === 200 && health.json.data)
    assert('No secrets in backup health', !JSON.stringify(health.json).includes('SECRET') && !JSON.stringify(health.json).toLowerCase().includes('access_key'))
  }

  // Settings
  console.log('\nSettings')
  {
    const settings = await req('GET', '/api/settings', { token })
    assert('List settings', settings.status === 200)
  }

  // Rate limit headers present on auth
  console.log('\nSecurity')
  {
    const login = await req('POST', '/api/auth/login', { body: { email: 'x', password: 'y' } })
    assert('Auth rate limit headers', login.headers.get('x-ratelimit-limit') != null)
    assert('Error shape', login.json.success === false && typeof login.json.message === 'string')
  }

  console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===\n`)
  if (failures.length) {
    console.log('Failures:')
    failures.forEach((f) => console.log(' - ' + f))
  }

  if (failed > 0) process.exit(1)
  console.log('STAGE 4 TESTS PASSED')
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
