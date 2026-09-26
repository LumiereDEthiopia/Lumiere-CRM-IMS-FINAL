/**
 * Refresh the pinned eTrade TLS chain (server/certs/etrade-chain.pem).
 *
 * Why this exists
 * ---------------
 * etrade.gov.et serves an INCOMPLETE certificate chain: it sends only its leaf
 * certificate and omits the intermediate CA ("GlobalSign GCC R3 EV TLS CA
 * ..."). Browsers silently repair this from their cached intermediates, but
 * Node/OpenSSL cannot build a trust path and fails with
 * UNABLE_TO_VERIFY_LEAF_SIGNATURE.
 *
 * Rather than disabling TLS verification (never acceptable), we pin the issuing
 * intermediate CA. This script rebuilds that file automatically from the live
 * server using the certificate's own AIA "CA Issuers" extension, so the pin can
 * be refreshed whenever eTrade renews its certificate.
 *
 * Usage
 * -----
 *   cd server
 *   node scripts/refresh-etrade-cert.mjs [hostname]
 *
 * TLS verification is NOT weakened: the issuing CA is fetched over plain HTTP
 * from the CA's own repository (as listed inside the leaf certificate), then the
 * relationship is proven cryptographically before anything is written.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tls, { rootCertificates } from 'node:tls'
import { X509Certificate } from 'node:crypto'

const hostname = process.argv[2] || 'etrade.gov.et'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outFile = process.env.ETRADE_EXTRA_CA_FILE || path.join(__dirname, '..', 'certs', 'etrade-chain.pem')

const toPem = (der) => {
  const b64 = der.toString('base64').replace(/(.{64})/g, '$1\n').replace(/\n$/, '')
  return `-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----\n`
}

/**
 * Read every GeneralName [6] IA5String (AIA, OID 1.3.6.1.5.5.7.1.1) from a DER
 * buffer. DER encodes these as `0x86 <length> <bytes>`, so the length prefix
 * tells us exactly where the URI ends (a naive "printable characters" scan
 * would swallow the following length byte).
 */
function extractHttpUris(der) {
  const uris = []
  for (let i = 0; i < der.length - 2; i++) {
    if (der[i] !== 0x86) continue // context tag [6] = uniformResourceIdentifier
    let len = der[i + 1]
    let offset = i + 2
    if (len & 0x80) {
      const n = len & 0x7f
      if (n < 1 || n > 2 || offset + n > der.length) continue
      len = 0
      for (let k = 0; k < n; k++) len = (len << 8) | der[offset + k]
      offset += n
    }
    if (len < 8 || offset + len > der.length) continue
    const value = der.subarray(offset, offset + len).toString('latin1')
    if (/^https?:\/\//.test(value)) uris.push(value)
  }
  return uris
}

/** Fetch a DER or PEM certificate over http(s) */
async function fetchCert(url) {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const text = buf.toString('latin1')
  if (text.includes('-----BEGIN CERTIFICATE-----')) {
    return new X509Certificate(text.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/)[0])
  }
  return new X509Certificate(buf)
}

const subjectOf = (cert) => String(cert.subject).replace(/\n/g, ' | ')

/** The leaf certificate eTrade presents on 443 (the chain itself is not trusted here). */
function fetchLeaf() {
  return new Promise((resolve, reject) => {
    // rejectUnauthorized:false is used ONLY to read the leaf so we can discover
    // its issuer. Nothing is trusted from this connection — the issuer is
    // fetched independently and verified cryptographically below.
    const socket = tls.connect({ host: hostname, port: 443, servername: hostname, rejectUnauthorized: false, timeout: 15000 }, () => {
      const leaf = socket.getPeerCertificate(false)
      socket.end()
      if (!leaf || !leaf.raw) return reject(new Error('No peer certificate returned'))
      resolve(new X509Certificate(leaf.raw))
    })
    socket.on('timeout', () => { socket.destroy(); reject(new Error('TLS connection timed out')) })
    socket.on('error', reject)
  })
}

console.log(`\n--- eTrade certificate chain refresh (${hostname}) ---\n`)

const leaf = await fetchLeaf()
console.log('leaf subject :', subjectOf(leaf))
console.log('leaf issuer  :', String(leaf.issuer).replace(/\n/g, ' | '))
console.log('leaf valid   :', leaf.validFrom, '->', leaf.validTo)

const uris = extractHttpUris(Buffer.from(leaf.raw))
const caIssuerUrls = uris.filter((u) => !/ocsp/i.test(u))
console.log('CA Issuers   :', caIssuerUrls)

if (!caIssuerUrls.length) {
  console.error('\nNo CA Issuers URI found in the leaf certificate. Update certs/etrade-chain.pem manually.')
  process.exit(1)
}

let intermediate = null
for (const url of caIssuerUrls) {
  try {
    const cert = await fetchCert(url)
    // `x509.verify(key)` proves *this* certificate was signed by `key`, so the
    // intermediate must verify the leaf — not the other way round.
    if (!leaf.verify(cert.publicKey)) {
      console.warn(`  ${url} -> does NOT sign the leaf, skipping`)
      continue
    }
    intermediate = cert
    console.log('intermediate :', subjectOf(cert), `(valid to ${cert.validTo})`)
    console.log('               source:', url)
    break
  } catch (e) {
    console.warn(`  ${url} -> ${e.message}`)
  }
}

if (!intermediate) {
  console.error('\nCould not obtain an intermediate CA that signs the leaf certificate.')
  process.exit(1)
}

// Find the root that issued the intermediate: prefer Node's bundled trust store,
// otherwise follow the intermediate's own AIA extension.
let root = rootCertificates
  .map((pem) => new X509Certificate(pem))
  .find((c) => c.subject === intermediate.issuer && intermediate.verify(c.publicKey))

if (!root) {
  for (const url of extractHttpUris(Buffer.from(intermediate.raw)).filter((u) => !/ocsp/i.test(u))) {
    try {
      const cert = await fetchCert(url)
      if (cert.ca && intermediate.verify(cert.publicKey)) { root = cert; break }
    } catch { /* try the next URI */ }
  }
}

console.log('root         :', root ? `${subjectOf(root)} (valid to ${root.validTo})` : "already in Node's trust store (not pinned)")

// Only issuing CAs are pinned — including the leaf would turn it into a trust anchor.
const pem = [intermediate, root].filter(Boolean).map((c) => toPem(Buffer.from(c.raw))).join('')
const header = `# Pinned issuing CA(s) for the official Ethiopian eTrade service (${hostname}).\n` +
  `# etrade.gov.et omits its intermediate CA, which breaks Node's chain building\n` +
  `# (UNABLE_TO_VERIFY_LEAF_SIGNATURE). Regenerate with:\n` +
  `#   cd server && node scripts/refresh-etrade-cert.mjs\n` +
  `# TLS verification remains fully enabled - these are the real issuing CAs.\n` +
  `# Generated: ${new Date().toISOString()}\n`

fs.mkdirSync(path.dirname(outFile), { recursive: true })
if (fs.existsSync(outFile)) fs.copyFileSync(outFile, `${outFile}.bak`)
fs.writeFileSync(outFile, header + pem, 'utf8')
console.log(`\nWrote ${outFile} (previous version saved as .bak)`)
console.log('Restart the API server to pick up the new chain.\n')