/**
 * TIN Verification Service — Ethiopian eTrade Business License Checker
 *
 * Verifies Ethiopian Tax Identification Numbers (TIN) against the official
 * Ministry of Trade & Regional Integration eTrade system
 * (https://etrade.gov.et/business-license-checker).
 *
 * Integration notes (verified against the live eTrade system):
 *  - The business license checker page calls the public JSON API
 *      GET {baseUrl}/api/Registration/GetRegistrationInfoByTin/{tin}/{lang}
 *  - The API requires a browser-like `Referer` header pointing at the
 *    official checker page (the site rejects other referers with HTTP 417).
 *    We send exactly what the official page sends — no CAPTCHA, no auth
 *    bypass, no scraping: it is the same public API the government page uses.
 *  - Found: HTTP 200 JSON with { Tin, BusinessName, Businesses: [...] }
 *  - Not found: empty response body (this is how the official SPA decides)
 *  - The upstream payload includes base64 manager photos
 *    (AssociateShortInfos) — stripped immediately, never stored or logged.
 *
 * Resilience: request timeout, circuit breaker (stops hammering the
 * government service after consecutive failures), DB-backed result cache.
 */
import prisma from '../config/prisma.js'
import { config } from '../config/index.js'
import { createAuditLog } from './auditService.js'
import fs from 'node:fs'
import { request as httpsRequest } from 'node:https'
import { request as httpRequest } from 'node:http'
import { rootCertificates } from 'node:tls'

/** Ethiopian TINs are exactly 10 digits */
export const TIN_REGEX = /^\d{10}$/

/** Circuit breaker state (in-memory, per process) */
let consecutiveFailures = 0
let circuitOpenUntil = 0

export function isCircuitOpen() {
  return Date.now() < circuitOpenUntil
}

export function resetCircuitBreaker() {
  consecutiveFailures = 0
  circuitOpenUntil = 0
}

/**
 * Validate + sanitize a raw TIN string.
 * Returns { ok: true, tin } or { ok: false, message }.
 */
export function sanitizeTin(raw) {
  if (raw == null) return { ok: false, message: 'TIN is required' }
  const tin = String(raw).replace(/\D/g, '')
  if (!tin) return { ok: false, message: 'TIN is required' }
  if (!TIN_REGEX.test(tin)) {
    return { ok: false, message: 'Invalid TIN format — an Ethiopian TIN must be exactly 10 digits' }
  }
  return { ok: true, tin }
}

/** Fresh (non-cached) result envelope shape */
function resultEnvelope({ verified, tin, name = null, license = null, cached = false, message = null, retryable = false }) {
  return { verified, tin, name, license, cached, message, retryable }
}

/**
 * Look up a TIN in the cache. Positive entries live for
 * config.etrade.cacheTtlHours, negative entries for 1 hour.
 */
async function readCache(tin) {
  const entry = await prisma.tinVerificationCache.findUnique({ where: { tin } })
  if (!entry) return null
  const ttlHours = entry.verified ? config.etrade.cacheTtlHours : 1
  const expiresAt = new Date(entry.checkedAt).getTime() + ttlHours * 60 * 60 * 1000
  if (Date.now() > expiresAt) return null
  return entry
}

async function writeCache(tin, { verified, name, license }) {
  const data = {
    verified,
    name: name || null,
    licenseNumber: license?.licenseNumber || null,
    licenseValidTo: license?.renewedTo || null,
    source: 'ETRADE',
    checkedAt: new Date()
  }
  const existing = await prisma.tinVerificationCache.findUnique({ where: { tin } })
  if (existing) {
    await prisma.tinVerificationCache.update({ where: { tin }, data: { ...data, lookupCount: { increment: 1 } } })
  } else {
    await prisma.tinVerificationCache.create({ data: { tin, ...data } })
  }
}

/** Find an existing customer that already uses this TIN (duplicate prevention) */
async function findCustomerByTin(tin) {
  return prisma.customer.findFirst({
    where: { tinNumber: tin },
    select: { id: true, customerCode: true, name: true, tinVerified: true, tinVerifiedAt: true }
  })
}

/**
 * Mark a customer as TIN-verified after a successful eTrade lookup.
 * The government-registered name is authoritative, so it replaces the stored
 * name; the previous value is kept in the audit trail so an admin can still
 * update customer information later per the application's business rules.
 */
export async function markCustomerVerified(customerId, tin, name) {
  const before = await prisma.customer.findUnique({ where: { id: customerId }, select: { name: true, tinNumber: true } })
  const verifiedName = typeof name === 'string' && name.trim() ? name.trim() : null

  const customer = await prisma.customer.update({
    where: { id: customerId },
    data: {
      tinNumber: tin,
      tinVerified: true,
      tinVerifiedAt: new Date(),
      tinVerificationSource: 'ETRADE',
      ...(verifiedName ? { name: verifiedName } : {})
    },
    select: { id: true, customerCode: true, name: true, tinNumber: true, tinVerified: true, tinVerifiedAt: true, tinVerificationSource: true }
  })
  await createAuditLog({
    action: 'CUSTOMER_TIN_VERIFIED',
    entity: 'Customer',
    entityId: customerId,
    details: {
      tin,
      verifiedName,
      previousName: before?.name || null,
      previousTin: before?.tinNumber || null,
      nameChanged: !!verifiedName && before?.name !== verifiedName
    }
  })
  return customer
}

/**
 * Parse the eTrade JSON payload into our envelope.
 * The payload may be null/empty (TIN not registered in eTrade).
 */
function parseEtradePayload(tin, payload) {
  if (payload == null || payload === '' || (typeof payload === 'object' && !payload.BusinessName && !payload.Businesses)) {
    return resultEnvelope({ verified: false, tin, message: 'TIN not found' })
  }
  const name = typeof payload.BusinessName === 'string' ? payload.BusinessName.trim() : ''
  if (!name) {
    // Registration record without a usable business name — treat cautiously
    return resultEnvelope({ verified: false, tin, message: 'TIN not found' })
  }
  const business = Array.isArray(payload.Businesses) ? payload.Businesses.find((b) => b && (b.TradesName || b.LicenceNumber)) : null
  const license = business
    ? {
        tradeName: (business.TradesName || '').trim() || null,
        licenseNumber: (business.LicenceNumber || '').trim() || null,
        renewedFrom: (business.RenewedFrom || '').trim() || null,
        renewedTo: (business.RenewedTo || '').trim() || null
      }
    : null
  const envelope = resultEnvelope({ verified: true, tin, name, license })
  // A registration without any active business license — still a verified
  // registered business name, but flag it so the cashier knows.
  if (!license) envelope.message = 'Registered business found — no active trade license on record'
  return envelope
}

/**
 * eTrade's TLS endpoint does not send its intermediate certificate, so Node's
 * built-in trust store alone cannot build the chain. We load the pinned
 * official intermediate CA (server/certs/etrade-chain.pem by default) and add
 * it to Node's Mozilla root store — certificate verification stays ON.
 * Returns null when no extra CA file is configured/available.
 */
let extraCaCache = null
let extraCaMtimeMs = 0

function loadExtraCa() {
  const file = config.etrade.extraCaFile
  if (!file) return null
  try {
    const stat = fs.statSync(file)
    if (!extraCaCache || stat.mtimeMs !== extraCaMtimeMs) {
      extraCaCache = fs.readFileSync(file, 'utf8')
      extraCaMtimeMs = stat.mtimeMs
    }
    return extraCaCache || null
  } catch {
    // Missing/unreadable bundle — fall back to Node's default trust store.
    return null
  }
}

/** Minimal HTTP(S) GET with hard timeout. Resolves { status, body } */
function httpGet(url, { timeoutMs, headers }) {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const secure = target.protocol === 'https:'
    // https.request speaks TLS only — the test suite's local mock is plain HTTP.
    const request = secure ? httpsRequest : httpRequest
    const options = {
      method: 'GET',
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (secure ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      headers
    }
    if (secure) {
      const extraCa = loadExtraCa()
      if (extraCa) options.ca = [...rootCertificates, extraCa]
    }

    const req = request(options, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }))
      res.on('error', reject)
    })

    req.setTimeout(timeoutMs, () => {
      const err = new Error(`Request timed out after ${timeoutMs}ms`)
      err.name = 'AbortError'
      req.destroy(err)
    })
    req.on('error', reject)
    req.end()
  })
}

/** Single upstream call to the official eTrade license checker */
async function callEtrade(tin) {
  const { baseUrl, checkerPath, checkerReferer, language, timeoutMs } = config.etrade
  const url = `${baseUrl.replace(/\/+$/, '')}${checkerPath}/${tin}/${encodeURIComponent(language)}`
  const startedAt = Date.now()
  try {
    const res = await httpGet(url, {
      timeoutMs,
      headers: {
        Accept: 'application/json, text/plain, */*',
        // Required by eTrade — mirrors the official checker page request
        Referer: checkerReferer,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })
    const durationMs = Date.now() - startedAt

    // Not found: the official checker treats an empty body as "doesn't exist"
    if (res.status === 204) return { kind: 'not_found', durationMs }
    if (res.status === 404) return { kind: 'not_found', durationMs }

    if (res.status < 200 || res.status >= 300) {
      // e.g. 417 = request rejected (referer validation changed)
      console.error(`[TIN] eTrade responded HTTP ${res.status} for TIN lookup (${durationMs}ms): ${String(res.body).slice(0, 200)}`)
      return { kind: 'unavailable', status: res.status, durationMs }
    }

    const text = res.body
    if (!text || !text.trim()) return { kind: 'not_found', durationMs }

    let payload
    try {
      payload = JSON.parse(text)
    } catch {
      console.error('[TIN] eTrade returned a non-JSON response — treating as unavailable')
      return { kind: 'unexpected', durationMs }
    }
    return { kind: 'ok', payload, durationMs }
  } catch (err) {
    const durationMs = Date.now() - startedAt
    const isTimeout = err.name === 'AbortError'
    console.error(`[TIN] eTrade request ${isTimeout ? 'timed out' : 'failed'} after ${durationMs}ms: ${err.message}`)
    return { kind: isTimeout ? 'timeout' : 'network_error', error: err.message, durationMs }
  }
}

/**
 * Verify a TIN against eTrade.
 * Returns { ok, status, ...envelope } where status is
 * 'verified' | 'not_found' | 'unavailable' | 'invalid'.
 */
export async function verifyTin(rawTin, { userId, forceRefresh = false } = {}) {
  const sanitized = sanitizeTin(rawTin)
  if (!sanitized.ok) return { ok: false, status: 'invalid', ...resultEnvelope({ verified: false, tin: null, message: sanitized.message }) }
  const tin = sanitized.tin

  // Cache first (unless explicitly refreshed) — avoids hammering eTrade
  if (!forceRefresh) {
    const cached = await readCache(tin)
    if (cached) {
      const envelope = resultEnvelope({
        verified: cached.verified,
        tin,
        name: cached.name,
        license: cached.licenseNumber ? { licenseNumber: cached.licenseNumber, renewedTo: cached.licenseValidTo } : null,
        cached: true,
        message: cached.verified ? null : 'TIN not found'
      })
      return { ok: true, status: cached.verified ? 'verified' : 'not_found', existingCustomer: await findCustomerByTin(tin), ...envelope }
    }
  }

  // Circuit breaker — the government service is struggling; fail fast and
  // politely so the cashier can keep working.
  if (isCircuitOpen()) {
    return { ok: false, status: 'unavailable', ...resultEnvelope({ verified: false, tin, retryable: true, message: 'Unable to verify TIN right now. Please try again shortly.' }) }
  }

  const outcome = await callEtrade(tin)

  // Empty/204 upstream body — the official checker's "not registered" signal
  if (outcome.kind === 'not_found') {
    resetCircuitBreaker()
    const envelope = resultEnvelope({ verified: false, tin, message: 'TIN not found' })
    await writeCache(tin, envelope)
    await createAuditLog({
      userId,
      action: 'TIN_NOT_FOUND',
      entity: 'TinVerification',
      entityId: tin,
      details: { verified: false, cached: false, durationMs: outcome.durationMs, source: 'ETRADE' }
    })
    return { ok: true, status: 'not_found', existingCustomer: await findCustomerByTin(tin), ...envelope }
  }

  if (outcome.kind === 'ok') {
    resetCircuitBreaker()
    const envelope = parseEtradePayload(tin, outcome.payload)
    await writeCache(tin, envelope)
    const existingCustomer = await findCustomerByTin(tin)
    await createAuditLog({
      userId,
      action: envelope.verified ? 'TIN_VERIFIED' : 'TIN_NOT_FOUND',
      entity: 'TinVerification',
      entityId: tin,
      details: { verified: envelope.verified, cached: false, durationMs: outcome.durationMs, source: 'ETRADE' }
    })
    return { ok: true, status: envelope.verified ? 'verified' : 'not_found', existingCustomer, ...envelope }
  }

  // Upstream problem — count it and open the circuit after N consecutive failures
  consecutiveFailures += 1
  if (consecutiveFailures >= config.etrade.maxConsecutiveFailures) {
    circuitOpenUntil = Date.now() + config.etrade.circuitOpenMs
    consecutiveFailures = 0
  }
  await createAuditLog({
    userId,
    action: 'TIN_VERIFY_UNAVAILABLE',
    entity: 'TinVerification',
    entityId: tin,
    details: { reason: outcome.kind, durationMs: outcome.durationMs },
    success: false
  })
  return { ok: false, status: 'unavailable', ...resultEnvelope({ verified: false, tin, retryable: true, message: 'Unable to verify TIN right now. Please try again.' }) }
}

export default { verifyTin, sanitizeTin, markCustomerVerified, TIN_REGEX, resetCircuitBreaker }
