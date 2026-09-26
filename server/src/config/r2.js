/**
 * Cloudflare R2 Configuration
 * Uses AWS S3-compatible SDK for object storage.
 *
 * R2 stores: actual image files
 * SQLite stores: metadata, imageUrl, objectKey references
 */

import { S3Client } from '@aws-sdk/client-s3'

/**
 * Validate required environment variables
 */
function validateConfig() {
  const required = [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
    'R2_ENDPOINT'
  ]

  const missing = required.filter((key) => !process.env[key])

  if (missing.length > 0) {
    console.warn(
      '\n⚠️  Missing R2 environment variables: ' + missing.join(', ')
    )
    console.warn('R2 file storage will not be available.\n')
    return false
  }

  return true
}

let r2Client = null
let isR2Configured = false

/**
 * Initialize the R2 S3-compatible client
 */
function initR2Client() {
  if (r2Client) return r2Client

  isR2Configured = validateConfig()

  if (!isR2Configured) {
    return null
  }

  r2Client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
    }
  })

  console.log('☁️  Cloudflare R2 client initialized')
  return r2Client
}

/**
 * Get the R2 client instance
 * @returns {S3Client|null}
 */
export function getR2Client() {
  if (!r2Client) {
    return initR2Client()
  }
  return r2Client
}

/**
 * Check if R2 is properly configured
 * @returns {boolean}
 */
export function isR2Ready() {
  return isR2Configured && r2Client !== null
}

/**
 * Get the R2 bucket name
 * @returns {string|undefined}
 */
export function getBucketName() {
  return process.env.R2_BUCKET_NAME
}

/**
 * Get the public URL for R2 assets
 * @returns {string|undefined}
 */
export function getPublicUrl() {
  return process.env.R2_PUBLIC_URL
}

/**
 * Generate a predictable object key for product images
 * @param {string} productId
 * @param {string} filename
 * @param {number} [index]
 * @returns {string}
 */
export function generateProductImageKey(productId, filename, index = null) {
  const ext = filename.split('.').pop() || 'webp'
  if (index !== null) {
    return 'products/' + productId + '/image-' + index + '.' + ext
  }
  return 'products/' + productId + '/main.' + ext
}

/**
 * Generate object key for site assets
 * @param {string} category - e.g., 'banners', 'site', 'brands'
 * @param {string} filename
 * @returns {string}
 */
export function generateAssetKey(category, filename) {
  return category + '/' + filename
}

// Auto-initialize on import
initR2Client()

export default {
  getR2Client,
  isR2Ready,
  getBucketName,
  getPublicUrl,
  generateProductImageKey,
  generateAssetKey
}
