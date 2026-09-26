/**
 * Authentication Service
 * Handles login, logout, session management, and password hashing
 */
import prisma from '../config/prisma.js'
import { ApiError } from '../middleware/errorHandler.js'
import { createAuditLog } from './auditService.js'
import { randomBytes, createHash, timingSafeEqual } from 'crypto'

const activeSessions = new Map()
const SESSION_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = createHash('sha256').update(salt + password).digest('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false
  const [salt, hash] = stored.split(':')
  const testHash = createHash('sha256').update(salt + password).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(testHash, 'hex'))
  } catch {
    return false
  }
}

function purgeExpiredSessions() {
  const now = Date.now()
  for (const [token, session] of activeSessions.entries()) {
    if (now - session.createdAt.getTime() > SESSION_TTL_MS) {
      activeSessions.delete(token)
    }
  }
}

export function getSession(token) {
  if (!token) return null
  purgeExpiredSessions()
  const session = activeSessions.get(token)
  if (!session) return null
  if (Date.now() - session.createdAt.getTime() > SESSION_TTL_MS) {
    activeSessions.delete(token)
    return null
  }
  return session
}

export async function login(email, password, ipAddress) {
  const user = await prisma.user.findUnique({
    where: { email: String(email).toLowerCase().trim() },
    include: { role: { include: { permissions: true } } }
  })

  if (!user || !user.isActive) {
    await createAuditLog({ action: 'LOGIN_FAILED', entity: 'User', details: { email }, ipAddress })
    throw new ApiError(401, 'Invalid email or password')
  }

  if (!verifyPassword(password, user.passwordHash)) {
    await createAuditLog({ userId: user.id, action: 'LOGIN_FAILED', entity: 'User', entityId: user.id, details: { email }, ipAddress })
    throw new ApiError(401, 'Invalid email or password')
  }

  const token = randomBytes(32).toString('hex')
  const permissions = user.role?.permissions?.map((p) => p.name) || []
  const role = user.role?.name || 'STAFF'

  activeSessions.set(token, {
    userId: user.id,
    role,
    permissions,
    createdAt: new Date()
  })

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  await createAuditLog({ userId: user.id, action: 'LOGIN', entity: 'User', entityId: user.id, details: { email: user.email }, ipAddress })

  return {
    token,
    user: { id: user.id, name: user.name, email: user.email, role, isActive: user.isActive },
    permissions
  }
}

export async function logout(token, ipAddress) {
  const session = activeSessions.get(token)
  if (session) {
    await createAuditLog({ userId: session.userId, action: 'LOGOUT', entity: 'User', entityId: session.userId, ipAddress })
    activeSessions.delete(token)
  }
  return { success: true }
}

export async function getCurrentUser(token) {
  const session = getSession(token)
  if (!session) throw new ApiError(401, 'Session expired')

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { role: { include: { permissions: true } } }
  })

  if (!user || !user.isActive) {
    activeSessions.delete(token)
    throw new ApiError(401, 'Session expired')
  }

  const permissions = user.role?.permissions?.map((p) => p.name) || []
  const role = user.role?.name || 'STAFF'

  // Refresh cached permissions
  session.permissions = permissions
  session.role = role

  return {
    user: { id: user.id, name: user.name, email: user.email, role, isActive: user.isActive },
    permissions
  }
}

export function verifyToken(token) {
  return !!getSession(token)
}

export { hashPassword, verifyPassword }

export default { login, logout, getCurrentUser, verifyToken, hashPassword, getSession }
