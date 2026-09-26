/**
 * Audit Service
 * Records important business actions — never stores secrets/passwords/tokens
 */
import prisma from '../config/prisma.js'

const SENSITIVE_KEYS = ['password', 'passwordHash', 'token', 'accessKey', 'secret', 'encryptionKey', 'refreshToken', 'Authorization']

function sanitizeDetails(details) {
  if (details == null) return null
  if (typeof details === 'string') {
    try { return sanitizeDetails(JSON.parse(details)) } catch { return details }
  }
  if (typeof details !== 'object') return details
  const clean = Array.isArray(details) ? [] : {}
  for (const [key, value] of Object.entries(details)) {
    if (SENSITIVE_KEYS.some((k) => key.toLowerCase().includes(k.toLowerCase()))) {
      clean[key] = '[REDACTED]'
    } else if (value && typeof value === 'object') {
      clean[key] = sanitizeDetails(value)
    } else {
      clean[key] = value
    }
  }
  return clean
}

export async function createAuditLog({ userId, action, entity, entityId, details, ipAddress, db = prisma }) {
  try {
    const safe = sanitizeDetails(details)
    return await db.auditLog.create({
      data: {
        userId: userId || null,
        action,
        entity,
        entityId: entityId || null,
        details: safe == null ? null : (typeof safe === 'string' ? safe : JSON.stringify(safe)),
        ipAddress: ipAddress || null
      }
    })
  } catch (error) {
    console.error('Audit log creation failed:', error.message)
    return null
  }
}

export async function getAuditLogs({ page = 1, limit = 50, entity, action, userId }) {
  const safeLimit = Math.min(Math.max(1, limit), 100)
  const where = {}
  if (entity) where.entity = entity
  if (action) where.action = action
  if (userId) where.userId = userId

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * safeLimit,
      take: safeLimit
    }),
    prisma.auditLog.count({ where })
  ])

  return { data: logs, pagination: { page, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) } }
}

export default { createAuditLog, getAuditLogs }
