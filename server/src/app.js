/**
 * Express Application Entry Point
 * Perfume Business Management API Server
 *
 * Two supported deployment shapes:
 *
 *  1. Single service (default) — this server ALSO serves the built React client
 *     from ../client/dist (override with CLIENT_DIST). App + API share one origin,
 *     so the client's default base URL (same-origin "/api") works exactly like the
 *     Vite dev proxy does locally. No CORS and no VITE_API_URL needed.
 *
 *  2. Split deploy — client on Vercel/CDN, API here. Set CORS_ORIGIN to the client
 *     origin(s) and build the client with VITE_API_URL = this API's public URL.
 *
 * Database schema and data are never touched here: migrations stay a manual,
 * deliberate operation (see PRODUCTION_DEPLOYMENT.md).
 */
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import dotenv from 'dotenv'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import { apiRouter } from './routes/index.js'
import { startBackupScheduler } from './jobs/backupScheduler.js'
import { startAutomationScheduler } from './jobs/automationScheduler.js'
import prisma from './config/prisma.js'

dotenv.config()

// <server>/src/app.js -> <server> -> repository root
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const serverRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(serverRoot, '..')

const app = express()
const PORT = process.env.PORT || 3001

// Managed platforms (Railway / Render / Vercel / nginx) terminate TLS and forward
// the real client IP in X-Forwarded-For. Trust one hop so rate limiting keys on the
// visitor instead of the proxy. Set TRUST_PROXY=false to disable.
app.set('trust proxy', process.env.TRUST_PROXY === 'false' ? false : 1)

// ---------------------------------------------------------------- client build
// Serve the SPA from this service when a build exists (single-service deploy).
const clientDist = path.resolve(process.env.CLIENT_DIST || path.join(repoRoot, 'client', 'dist'))
const clientIndex = path.join(clientDist, 'index.html')
const serveClient = process.env.SERVE_CLIENT === 'false' ? false : existsSync(clientIndex)

// --------------------------------------------------------------------- headers
// Explicit CSP: the SPA is served from this origin, fonts come from Google Fonts,
// and product/document images may come from R2 (https) or data:/blob: URLs.
const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  // React components render inline <style> blocks and inline style attributes.
  styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
  imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
  connectSrc: ["'self'", 'https:', 'wss:'],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'self'"]
}

app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? { directives: cspDirectives } : false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}))

// ----------------------------------------------------------------------- CORS
// CORS_ORIGIN accepts a comma separated list and simple wildcards, e.g.
//   CORS_ORIGIN=https://crm.example.com,https://lumiere-crm.vercel.app,https://*.vercel.app
function parseOrigins(value) {
  return String(value || '').split(',').map((o) => o.trim()).filter(Boolean)
}

const allowedOrigins = parseOrigins(process.env.CORS_ORIGIN)
const originMatchers = allowedOrigins
  .filter((origin) => origin !== '*')
  .map((origin) => new RegExp('^' + origin.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^.]+') + '$'))

function corsOrigin(origin, callback) {
  // Same-origin requests, curl and server-to-server calls send no Origin header.
  if (!origin) return callback(null, true)
  if (allowedOrigins.includes('*')) return callback(null, true)
  if (originMatchers.some((re) => re.test(origin))) return callback(null, true)
  // Nothing configured: allow everything in development, but in production a
  // separately hosted client must declare its origin explicitly (serving the
  // client from this same service never needs CORS at all).
  return callback(null, allowedOrigins.length === 0 && process.env.NODE_ENV !== 'production')
}

app.use(
  cors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  })
)

app.use(express.json({ limit: '8mb' }))
app.use(express.urlencoded({ extended: true, limit: '8mb' }))

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'))
}
// Static assets of the built client. index.html is never cached; hashed assets are.
if (serveClient) {
  app.use(
    express.static(clientDist, {
      index: false,
      etag: true,
      setHeaders(res, filePath) {
        if (filePath.endsWith(`${path.sep}index.html`)) {
          res.setHeader('Cache-Control', 'no-cache')
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        }
      }
    })
  )
}

app.use('/api', apiRouter)
app.use('/api', notFoundHandler)

// SPA history fallback: deep links such as /admin/reports must render the app on
// refresh. API paths never reach this because they are handled above.
if (serveClient) {
  app.get('*', (req, res) => res.sendFile(clientIndex, { headers: { 'Cache-Control': 'no-cache' } }))
} else {
  // API-only mode keeps the tiny liveness response at /.
  app.get('/', (req, res) => res.status(200).json({ success: true, message: 'OK' }))
}

app.use(errorHandler)

const server = app.listen(PORT, () => {
  const publicUrl = process.env.PUBLIC_URL || `http://localhost:${PORT}`
  console.log(`\n🚀 Server running on ${publicUrl}`)
  console.log(`📋 API available at ${publicUrl}/api`)
  console.log(`🏥 Health check at ${publicUrl}/api/health`)
  console.log(
    serveClient
      ? `🖥️  Serving client build from ${clientDist}`
      : '🖥️  No client build found — API only (build the client or set CLIENT_DIST)'
  )
  if (process.env.NODE_ENV === 'production' && !serveClient && allowedOrigins.length === 0) {
    console.warn('⚠️  CORS_ORIGIN is not set and no client build was found — a separately hosted client will be blocked by CORS.')
  }
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}\n`)

  // Start the automated backup scheduler (enabled/disabled via env)
  startBackupScheduler()
  // Start the Stage 5 automation scheduler (intelligence, CRM, alerts)
  startAutomationScheduler()
})

// Graceful shutdown — stop accepting requests and release the database
// connection pool immediately on restart/stop (nodemon, Ctrl+C, platform
// restarts) instead of leaving connections to linger until the database
// server times them out.
async function shutdown(signal) {
  console.log(`\n${signal} received — shutting down gracefully...`)
  server.close()
  try { await prisma.$disconnect() } catch { /* pool may already be closed */ }
  process.exit(0)
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

export default app
