/**
 * Application Configuration
 * Centralizes all config values from environment variables
 */
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
dotenv.config()

// <server>/src/config/index.js -> <server>
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const serverRoot = path.resolve(__dirname, '..', '..')

export const config = {
  // Server
  port: parseInt(process.env.PORT, 10) || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database
  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',

  // Cloudflare R2
  r2: {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucketName: process.env.R2_BUCKET_NAME,
    endpoint: process.env.R2_ENDPOINT,
    publicUrl: process.env.R2_PUBLIC_URL
  },

  // CORS
  corsOrigin: process.env.CORS_ORIGIN || '*',

  // Ethiopian eTrade (Ministry of Trade & Regional Integration) business
  // license checker — official public verification API used by
  // https://etrade.gov.et/business-license-checker
  etrade: {
    baseUrl: process.env.ETRADE_BASE_URL || 'https://etrade.gov.et',
    checkerPath: process.env.ETRADE_CHECKER_PATH || '/api/Registration/GetRegistrationInfoByTin',
    checkerReferer: process.env.ETRADE_CHECKER_REFERER || 'https://etrade.gov.et/business-license-checker',
    language: process.env.ETRADE_LANGUAGE || 'en',
    timeoutMs: parseInt(process.env.ETRADE_TIMEOUT_MS, 10) || 10000,
    cacheTtlHours: parseInt(process.env.ETRADE_CACHE_TTL_HOURS, 10) || 72,
    maxConsecutiveFailures: parseInt(process.env.ETRADE_MAX_CONSECUTIVE_FAILURES, 10) || 3,
    circuitOpenMs: parseInt(process.env.ETRADE_CIRCUIT_OPEN_MS, 10) || 30000,
    // eTrade serves an incomplete TLS chain (the GlobalSign intermediate is not
    // sent), so Node cannot build the trust path. We pin the official
    // intermediate here — TLS verification stays fully enabled.
    extraCaFile: process.env.ETRADE_EXTRA_CA_FILE || path.join(serverRoot, 'certs', 'etrade-chain.pem')
  }
}

export default config
