/**
 * TIN Verification test suite
 * Run: cd server && node tests/tin.test.js
 *
 * Boots a local MOCK of the official eTrade business license checker API and
 * starts the real Express app in-process (port 3099) pointed at the mock via
 * ETRADE_BASE_URL, so every upstream path (found / not found / HTTP error /
 * timeout / garbage response / connection reset / referer validation) is
 * exercised deterministically without touching the government service.
 *
 * Uses the dev database, same as tests/stage4.test.js.
 */
process.env.PORT = process.env.PORT || '3099'
process.env.ETRADE_BASE_URL = process.env.ETRADE_BASE_URL || 'http://127.0.0.1:3999'
process.env.ETRADE_TIMEOUT_MS = process.env.ETRADE_TIMEOUT_MS || '1500'
process.env.TIN_VERIFY_RATE_LIMIT_MAX = process.env.TIN_VERIFY_RATE_LIMIT_MAX || '20'
process.env.AUTOMATION_ENABLED = 'false'
process.env.NODE_ENV = process.env.NODE_ENV || 'test'

import http from 'http'
import { randomInt } from 'crypto'

const BASE = process.env.TEST_API_URL || `http://127.0.0.1:${process.env.PORT}`
const MOCK_PORT = 3999
const REFERER = 'https://etrade.gov.et/business-license-checker'

let passed = 0
let failed = 0
const failures = []

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

// Unique-per-run TINs so repeated runs never hit stale cache rows
const randTin = () => String(1000000000 + randomInt(0, 8999999999))
const TIN_FOUND_1 = randTin()   // registered + active license
const TIN_NOTFOUND = randTin()  // eTrade returns 204 (not registered)
const TIN_EMPTY = randTin()     // eTrade returns 200 with empty body
const TIN_GARBAGE = randTin()   // eTrade returns non-JSON
const TIN_NONAME = randTin()    // eTrade returns JSON without BusinessName
const TIN_SLOW = randTin()      // eTrade hangs → timeout
const TIN_500 = randTin()       // eTrade HTTP 500
const TIN_RESET = randTin()     // eTrade drops the connection

const upstreamCalls = new Map()

function etradePayload(tin, withLicense = true) {
  const business = withLicense
    ? [{ MainGuid: 'mock-guid', OwnerTIN: tin, TradesName: 'BLUESKILL TECHNOLOGY PLC', LicenceNumber: 'KK/AA/14/706/MOCK/2017', RenewedFrom: '10/29/2024', RenewedTo: '7/7/2027', SubGroups: [{ Code: 39141, Description: 'Software development' }] }]
    : []
  return {
    Tin: tin,
    LegalCondtion: '2',
    RegNo: 'KK/AA/2/0026126/MOCK',
    RegDate: '10/23/2024',
    BusinessName: 'BLUESKILL TECHNOLOGY PLC',
    BusinessNameAmh: 'ብሉስኪል ቴክኖሎጂ',
    PaidUpCapital: 50000.0,
    AssociateShortInfos: [{ Position: null, ManagerName: 'Mock Manager', ManagerNameEng: 'Mock Manager', Photo: 'base64-photo-should-never-be-stored' }],
    Businesses: business
  }
}

const mock = http.createServer((req, res) => {
  const match = req.url.match(/\/api\/Registration\/GetRegistrationInfoByTin\/(\d+)\/(\w+)/)
  const tin = match ? match[1] : null

  // Mirror the real API: it rejects requests without the checker referer
  if (req.headers.referer !== REFERER) {
    res.writeHead(417, { 'Content-Type': 'text/plain' })
    res.end('Invalid referer headerr')
    return
  }

  upstreamCalls.set(tin, (upstreamCalls.get(tin) || 0) + 1)

  const json = (payload) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(payload)) }

  if (tin === TIN_FOUND_1) return json(etradePayload(tin, true))
  if (tin === TIN_NOTFOUND) { res.writeHead(204); return res.end() }
  if (tin === TIN_EMPTY) return res.end('')
  if (tin === TIN_GARBAGE) { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<html>Service Unavailable</html>') }
  if (tin === TIN_NONAME) return json({ Tin: tin, LegalCondtion: '1', Businesses: [] })
  if (tin === TIN_SLOW) { const t = setTimeout(() => json(etradePayload(tin)), 3000); t.unref?.(); return }
  if (tin === TIN_500) { res.writeHead(500, { 'Content-Type': 'text/plain' }); return res.end('Internal Server Error') }
  if (tin === TIN_RESET) return req.socket.destroy()

  res.writeHead(204)
  res.end()
})

async function waitForApp() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/api/health`)
      if (res.ok) return true
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250))
  }
  return false
}

async function run() {
  console.log('\n=== TIN VERIFICATION TEST SUITE ===\n')
  console.log(`Target: ${BASE} (eTrade mock at :${MOCK_PORT})\n`)

  await new Promise((resolve) => mock.listen(MOCK_PORT, resolve))
  await import('../src/app.js') // boots the real API server on process.env.PORT
  const appUp = await waitForApp()
  assert('App started', appUp)

  // Login
  const login = await req('POST', '/api/auth/login', { body: { email: 'admin@lumiere.com', password: 'admin123' } })
  assert('Admin login', login.status === 200 && !!login.json.data?.token)
  const token = login.json.data?.token
  const v = (tin, extra = {}) => req('POST', '/api/tin/verify', { token, body: { tin, ...extra } })

  console.log('\nAuthorization')
  {
    const noAuth = await req('POST', '/api/tin/verify', { body: { tin: TIN_FOUND_1 } })
    assert('Reject unauthenticated verify request', noAuth.status === 401 && noAuth.json.success === false)
    const badAuth = await req('POST', '/api/tin/verify', { token: 'garbage-token', body: { tin: TIN_FOUND_1 } })
    assert('Reject invalid token', badAuth.status === 401)

    // TIN verification is open to every signed-in role — only authentication
    // and the shared rate limit protect the government service, so even a role
    // with zero permissions must be able to verify.
    // Imported dynamically: a static import would pull in dotenv before the
    // test picks its own PORT, colliding with a running dev server.
    const { default: prisma } = await import('../src/config/prisma.js')
    const { hashPassword } = await import('../src/services/authService.js')
    const limitedRole = await prisma.role.upsert({
      where: { name: 'TIN_TEST_VIEWER' },
      update: { permissions: { set: [] } },
      create: { name: 'TIN_TEST_VIEWER', description: 'Test role without sales/customer permissions' }
    })
    const limitedEmail = 'tin-limited@lumiere.com'
    const limitedPassword = 'tin-limited-test-123'
    await prisma.user.upsert({
      where: { email: limitedEmail },
      update: { passwordHash: hashPassword(limitedPassword), roleId: limitedRole.id, isActive: true },
      create: { name: 'TIN Limited Tester', email: limitedEmail, passwordHash: hashPassword(limitedPassword), roleId: limitedRole.id, isActive: true }
    })
    const limitedLogin = await req('POST', '/api/auth/login', { body: { email: limitedEmail, password: limitedPassword } })
    assert('Limited-role user can log in', limitedLogin.status === 200 && !!limitedLogin.json.data?.token)
    const limited = await req('POST', '/api/tin/verify', { token: limitedLogin.json.data?.token, body: { tin: TIN_FOUND_1 } })
    assert('Role without any permissions can still verify (no permission gate)', limited.status === 200, `status=${limited.status}`)
  }

  console.log('\nFormat validation')
  {
    const short = await v('12345')
    assert('Reject too-short TIN', short.status === 400 && /10 digits/i.test(short.json.message || ''))
    const letters = await v('abcdefghij')
    assert('Reject letters-only TIN', letters.status === 400)
    const missing = await v('')
    assert('Reject empty TIN', missing.status === 400)
    const spaces = await v('  0092 1832 01  ')
    assert('Accept TIN with spaces (sanitized)', spaces.status === 200 && spaces.json.tin === '0092183201')
  }

  console.log('\nValid TIN (official eTrade mock)')
  let firstCalls = 0
  {
    const res = await v(TIN_FOUND_1)
    assert('Verified response shape', res.status === 200 && res.json.success === true && res.json.verified === true)
    assert('Registered name returned', res.json.name === 'BLUESKILL TECHNOLOGY PLC', JSON.stringify(res.json).slice(0, 150))
    assert('License details returned', !!res.json.license?.licenseNumber)
    assert('Source is ETRADE', res.json.source === 'ETRADE')
    assert('No base64 photo data leaked', !JSON.stringify(res.json).includes('base64-photo'))
    firstCalls = upstreamCalls.get(TIN_FOUND_1) || 0
    assert('Upstream was called with valid referer (no 417)', firstCalls >= 1, `calls=${firstCalls}`)
  }

  console.log('\nCaching')
  {
    const res = await v(TIN_FOUND_1)
    assert('Duplicate verification served from cache', res.json.cached === true && res.json.verified === true)
    const calls = upstreamCalls.get(TIN_FOUND_1) || 0
    assert('No extra upstream call for cached TIN', calls === firstCalls, `before=${firstCalls} after=${calls}`)
  }

  console.log('\nNot found / unexpected upstream responses')
  {
    const nf = await v(TIN_NOTFOUND)
    assert('204 → TIN not found', nf.status === 200 && nf.json.success === true && nf.json.verified === false && nf.json.message === 'TIN not found')
    const empty = await v(TIN_EMPTY)
    assert('Empty body → TIN not found', empty.json.verified === false && empty.json.message === 'TIN not found')
    const noName = await v(TIN_NONAME)
    assert('Payload without BusinessName → not found', noName.json.verified === false)
    const garbage = await v(TIN_GARBAGE)
    assert('Non-JSON response → friendly unavailable', garbage.json.success === false && garbage.json.retryable === true && /Unable to verify TIN/i.test(garbage.json.message || ''))
  }

  console.log('\neTrade unavailable (HTTP error / connection reset / timeout)')
  {
    const e500 = await v(TIN_500)
    assert('HTTP 500 → friendly retryable message', e500.json.success === false && e500.json.retryable === true && /Unable to verify TIN/i.test(e500.json.message || ''))
    const reset = await v(TIN_RESET)
    assert('Connection reset → friendly retryable message', reset.json.success === false && reset.json.retryable === true)
    const slowStart = Date.now()
    const slow = await v(TIN_SLOW)
    const slowMs = Date.now() - slowStart
    assert('Timeout → friendly retryable message', slow.json.success === false && slow.json.retryable === true && /Unable to verify TIN/i.test(slow.json.message || ''))
    assert('Timeout respected (~ETRADE_TIMEOUT_MS, not 3s)', slowMs < 3000, `${slowMs}ms`)
  }

  // Reset the circuit breaker opened by the failure tests above
  const tinService = await import('../src/services/tinVerificationService.js')
  tinService.resetCircuitBreaker()

  console.log('\nCustomer records')
  let customerId = null
  {
    const created = await req('POST', '/api/customers', { token, body: { name: 'eTrade Test Customer', email: `tin-test-${TIN_FOUND_1}@example.com`, tinNumber: TIN_FOUND_1 } })
    assert('Customer created with verified TIN', created.status === 201 && created.json.data?.tinNumber === TIN_FOUND_1)
    assert('Customer marked tinVerified from cache', created.json.data?.tinVerified === true && created.json.data?.tinVerificationSource === 'ETRADE')
    customerId = created.json.data?.id

    const dup = await req('POST', '/api/customers', { token, body: { name: 'Duplicate TIN Co', email: `tin-dup-${TIN_FOUND_1}@example.com`, tinNumber: TIN_FOUND_1 } })
    assert('Duplicate TIN customer rejected (409)', dup.status === 409)

    const reverify = await v(TIN_FOUND_1, { customerId })
    assert('Verify with customerId links + marks customer', reverify.json.linkedCustomer?.id === customerId && reverify.json.linkedCustomer?.tinVerified === true)
    const existing = await v(TIN_FOUND_1)
    assert('existingCustomer returned for known TIN', existing.json.existingCustomer?.id === customerId)
  }

  console.log('\nSales with verified TIN')
  {
    // Minimal location + product with stock
    const loc = await req('POST', '/api/locations', { token, body: { name: `TIN Test Shop ${Date.now()}`, code: `TIN${Date.now().toString().slice(-6)}` } })
    assert('Location created', loc.status === 201 && !!loc.json.data?.id)
    const locationId = loc.json.data?.id

    const brand = await req('POST', '/api/brands', { token, body: { name: `TIN Test Brand ${Date.now()}`, slug: `tin-test-brand-${Date.now()}` } })
    assert('Brand created', brand.status === 201 && !!brand.json.data?.id)
    const productId = brand.json.data?.id
      ? (await req('POST', '/api/products', { token, body: { name: 'TIN Test Perfume', slug: `tin-test-${Date.now()}`, brandId: brand.json.data.id, productType: 'PERFUME', price: 500, stockQuantity: 100, size: '50ml' } })).json.data?.id
      : null
    assert('Product created', !!productId)

    if (locationId && productId && customerId) {
      const sale = await req('POST', '/api/sales', { token, body: { customerId, locationId, items: [{ productId, quantity: 1, unitPrice: 500 }], paymentMethod: 'CASH' } })
      assert('Sale created with verified customer', sale.status === 201, JSON.stringify(sale.json).slice(0, 200))
      const detail = sale.json.data?.id ? await req('GET', `/api/sales/${sale.json.data.id}`, { token }) : null
      assert('Sale stores customer TIN', detail?.json.data?.customerTin === TIN_FOUND_1)
      assert('Sale stores verified name', !!detail?.json.data?.customerTinName)
      assert('Sale flags TIN as verified', detail?.json.data?.customerTinVerified === true)

      const walkIn = await req('POST', '/api/sales', { token, body: { locationId, items: [{ productId, quantity: 1, unitPrice: 500 }], paymentMethod: 'CASH', customerTin: TIN_FOUND_1 } })
      assert('Walk-in sale with verified TIN created', walkIn.status === 201)
      const walkInDetail = walkIn.json.data?.id ? await req('GET', `/api/sales/${walkIn.json.data.id}`, { token }) : null
      assert('Walk-in sale stores TIN + government name', walkInDetail?.json.data?.customerTin === TIN_FOUND_1 && walkInDetail?.json.data?.customerTinName === 'BLUESKILL TECHNOLOGY PLC' && walkInDetail?.json.data?.customerTinVerified === true, JSON.stringify(walkInDetail?.json.data?.customerTinName || ''))

      const unverifiedTin = randTin() // never verified — cache has no entry
      const unverified = await req('POST', '/api/sales', { token, body: { locationId, items: [{ productId, quantity: 1, unitPrice: 500 }], paymentMethod: 'CASH', customerTin: unverifiedTin } })
      const unverifiedDetail = unverified.status === 201 && unverified.json.data?.id ? await req('GET', `/api/sales/${unverified.json.data.id}`, { token }) : null
      assert('Walk-in sale with unverified TIN: TIN kept, no verified name', unverifiedDetail?.json.data?.customerTin === unverifiedTin && unverifiedDetail?.json.data?.customerTinVerified === false && unverifiedDetail?.json.data?.customerTinName == null)

      const badTinSale = await req('POST', '/api/sales', { token, body: { locationId, items: [{ productId, quantity: 1, unitPrice: 500 }], paymentMethod: 'CASH', customerTin: '12345' } })
      assert('Sale rejects invalid TIN format', badTinSale.status === 400)
    } else {
      assert('Sale fixtures available', false, 'location/product/customer setup failed')
    }
  }

  console.log('\nRate limiting')
  {
    // Main suite used ~16 verify calls; burst to exceed TIN_VERIFY_RATE_LIMIT_MAX (20)
    const burst = await Promise.all(Array.from({ length: 10 }, () => v('9999999')))
    const got429 = burst.some((r) => r.status === 429)
    assert('Excessive verification attempts are rate limited', got429, `statuses=${burst.map((r) => r.status).join(',')}`)
    if (got429) {
      const limited = burst.find((r) => r.status === 429)
      assert('Rate limit response is friendly', /too many/i.test(limited.json.message || ''))
    }
  }

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`)
  if (failures.length) {
    console.log('\nFailures:')
    for (const f of failures) console.log(`  ✗ ${f}`)
  }
}

run()
  .catch((e) => { console.error('Suite crashed:', e); failed++ })
  .finally(() => {
    mock.close()
    process.exit(failed > 0 ? 1 : 0)
  })
