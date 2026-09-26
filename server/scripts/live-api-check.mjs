/**
 * End-to-end check of the TIN verification feature against the RUNNING API,
 * which in turn talks to the real official eTrade service.
 *
 * Usage: node scripts/live-api-check.mjs [tin] [notFoundTin]
 */
const BASE = process.env.API_BASE || 'http://127.0.0.1:3001'
const TIN = process.argv[2] || '0092183201'
const NOT_FOUND_TIN = process.argv[3] || '9999999998'

async function call(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { raw: text.slice(0, 300) } }
  return { status: res.status, json }
}

const stamp = Date.now()
const login = await call('POST', '/api/auth/login', { body: { email: 'admin@lumiere.com', password: 'admin123' } })
console.log('login:', login.status, login.json.success)
const token = login.json.data?.token

console.log('\n1) unauthenticated request ->')
console.log(JSON.stringify(await call('POST', '/api/tin/verify', { body: { tin: TIN } })))

console.log('\n2) invalid TIN format ->')
console.log(JSON.stringify(await call('POST', '/api/tin/verify', { token, body: { tin: '12345' } })))

console.log(`\n3) LIVE verify ${TIN} (forceRefresh) ->`)
console.log(JSON.stringify(await call('POST', '/api/tin/verify', { token, body: { tin: TIN, forceRefresh: true } })))

console.log(`\n4) cached repeat ${TIN} (no forceRefresh) ->`)
console.log(JSON.stringify(await call('POST', '/api/tin/verify', { token, body: { tin: TIN } })))

console.log(`\n5) LIVE not-found ${NOT_FOUND_TIN} ->`)
console.log(JSON.stringify(await call('POST', '/api/tin/verify', { token, body: { tin: NOT_FOUND_TIN, forceRefresh: true } })))

console.log('\n6) customer flow: create -> verify(customerId) -> re-read')
const created = await call('POST', '/api/customers', {
  token,
  body: { name: `Placeholder ${stamp}`, tinNumber: TIN, email: `tin.e2e.${stamp}@example.com`, customerType: 'BUSINESS' }
})
console.log('   create:', created.status, created.json.data?.customerCode, JSON.stringify(created.json.message || ''))
const customerId = created.json.data?.id
if (customerId) {
  const linked = await call('POST', '/api/tin/verify', { token, body: { tin: TIN, customerId, forceRefresh: true } })
  console.log('   verify:', JSON.stringify(linked.json.linkedCustomer || linked.json.message))
  const reread = await call('GET', `/api/customers/${customerId}`, { token })
  const c = reread.json.data
  console.log('   stored name:', c?.name, '| tin:', c?.tinNumber, '| verified:', c?.tinVerified, '| source:', c?.tinVerificationSource)

  const dup = await call('POST', '/api/customers', { token, body: { name: 'Duplicate Try', tinNumber: TIN, email: `dup.${stamp}@example.com` } })
  console.log('   duplicate TIN ->', dup.status, JSON.stringify(dup.json.message))

  const loc = await call('GET', '/api/locations?limit=1', { token })
  const prod = await call('GET', '/api/products?limit=1', { token })
  const locationId = loc.json.data?.[0]?.id
  const product = prod.json.data?.[0]
  if (locationId && product) {
    const sale = await call('POST', '/api/sales', {
      token,
      body: {
        customerId,
        locationId,
        customerTin: TIN,
        items: [{ productId: product.id, productName: product.name, quantity: 1, unitPrice: Number(product.price || 100) }]
      }
    })
    console.log('   sale:', sale.status, sale.json.data?.saleNumber, JSON.stringify(sale.json.message || ''))
    const saleId = sale.json.data?.id
    if (saleId) {
      const detail = await call('GET', `/api/sales/${saleId}`, { token })
      const s = detail.json.data
      console.log('   sale TIN:', s?.customerTin, '| verified name:', s?.customerTinName, '| verified flag:', s?.customerTinVerified)
    }
    const walkIn = await call('POST', '/api/sales', {
      token,
      body: { locationId, customerTin: TIN, items: [{ productId: product.id, productName: product.name, quantity: 1, unitPrice: Number(product.price || 100) }] }
    })
    const wid = walkIn.json.data?.id
    if (wid) {
      const d = await call('GET', `/api/sales/${wid}`, { token })
      console.log('   walk-in sale TIN:', d.json.data?.customerTin, '| name:', d.json.data?.customerTinName)
    }
  }
  await call('DELETE', `/api/customers/${customerId}`, { token })
  console.log('   (cleanup) customer removed:', customerId.slice(0, 8) + '...')
}