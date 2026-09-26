/**
 * Rate Limiting Middleware
 * In-memory sliding window limiter for auth and sensitive endpoints
 */
const buckets = new Map()

function cleanup(now) {
  for (const [key, entry] of buckets.entries()) {
    if (now - entry.windowStart > entry.windowMs * 2) buckets.delete(key)
  }
}

export function rateLimit({ windowMs = 15 * 60 * 1000, max = 100, keyPrefix = 'global' } = {}) {
  return (req, res, next) => {
    const now = Date.now()
    if (buckets.size > 10000) cleanup(now)

    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown'
    const key = `${keyPrefix}:${ip}`
    let entry = buckets.get(key)

    if (!entry || now - entry.windowStart >= windowMs) {
      entry = { windowStart: now, count: 0, windowMs, max }
      buckets.set(key, entry)
    }

    entry.count += 1
    res.setHeader('X-RateLimit-Limit', max)
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - entry.count))

    if (entry.count > max) {
      return res.status(429).json({ success: false, message: 'Too many requests. Please try again later.' })
    }
    next()
  }
}

export const authRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, keyPrefix: 'auth' })
export const sensitiveRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyPrefix: 'sensitive' })
export const apiRateLimit = rateLimit({ windowMs: 60 * 1000, max: 200, keyPrefix: 'api' })

export default { rateLimit, authRateLimit, sensitiveRateLimit, apiRateLimit }
