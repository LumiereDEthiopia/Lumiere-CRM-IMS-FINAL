/**
 * Authorization Middleware
 * Enforces backend permission checks — never trust frontend permissions
 */
import { ApiError } from './errorHandler.js'
import { getSession } from '../services/authService.js'
import prismaClient from '../config/prisma.js'

let prisma = prismaClient
export function setAuthorizePrismaForTests(client) { prisma = client || prismaClient }

export function requirePermission(...required) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        const session = getSession(req.token)
        if (!session) return next(new ApiError(401, 'Authentication required'))
        req.user = session
      }

      if (req.authMethod === 'api_key') {
        if (req.scopes?.includes('admin:all') || required.every((permission) => req.scopes?.includes(permission))) return next()
        return next(new ApiError(403, 'Insufficient API key scope'))
      }
      const trusted = await getTrustedSessionUser(req)
      if (!trusted) return next(new ApiError(401, 'Authentication required'))
      req.user = trusted
      const perms = trusted.permissions
      const role = trusted.role

      if (role === 'SUPER_ADMIN') return next()

      const missing = required.filter((p) => !perms.includes(p))
      if (missing.length) {
        return next(new ApiError(403, 'Insufficient permissions'))
      }
      next()
    } catch (e) {
      next(e)
    }
  }
}

export function requireAnyPermission(...required) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        const session = getSession(req.token)
        if (!session) return next(new ApiError(401, 'Authentication required'))
        req.user = session
      }

      if (req.authMethod === 'api_key') {
        if (req.scopes?.includes('admin:all') || required.some((permission) => req.scopes?.includes(permission))) return next()
        return next(new ApiError(403, 'Insufficient API key scope'))
      }
      const trusted = await getTrustedSessionUser(req)
      if (!trusted) return next(new ApiError(401, 'Authentication required'))
      req.user = trusted
      const perms = trusted.permissions
      const role = trusted.role

      if (role === 'SUPER_ADMIN') return next()
      if (required.some((p) => perms.includes(p))) return next()
      return next(new ApiError(403, 'Insufficient permissions'))
    } catch (e) {
      next(e)
    }
  }
}

async function getTrustedSessionUser(req) {
  const session = getSession(req.token)
  if (!session?.userId) return null
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, isActive: true, role: { select: { name: true, permissions: { select: { name: true } } } } }
  })
  if (!user?.isActive) return null
  const permissions = user.role?.permissions?.map((permission) => permission.name) || []
  session.role = user.role?.name || 'STAFF'
  session.permissions = permissions
  return { ...session, id: user.id, userId: user.id, role: session.role, permissions }
}

export function attachUser(req, res, next) {
  try {
    if (!req.token) return next()
    const session = getSession(req.token)
    if (session) {
      req.user = session
      req.userId = session.userId
    }
    next()
  } catch {
    next()
  }
}

export default { requirePermission, requireAnyPermission, attachUser }
