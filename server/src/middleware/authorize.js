/**
 * Authorization Middleware
 * Enforces backend permission checks — never trust frontend permissions
 */
import { ApiError } from './errorHandler.js'
import { getSession } from '../services/authService.js'

export function requirePermission(...required) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        const session = getSession(req.token)
        if (!session) return next(new ApiError(401, 'Authentication required'))
        req.user = session
      }

      const perms = req.user.permissions || []
      const role = req.user.role

      if (role === 'SUPER_ADMIN' || perms.includes('*')) return next()

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

      const perms = req.user.permissions || []
      const role = req.user.role

      if (role === 'SUPER_ADMIN' || perms.includes('*')) return next()
      if (required.some((p) => perms.includes(p))) return next()
      return next(new ApiError(403, 'Insufficient permissions'))
    } catch (e) {
      next(e)
    }
  }
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
