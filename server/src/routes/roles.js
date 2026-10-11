/**
 * Roles & Permissions Routes — professional ERP role management
 */
import { Router } from 'express'
import {
  listRoles, listRolePermissions, createRole, updateRole, deleteRole
} from '../controllers/roleController.js'
import { requirePermission } from '../middleware/authorize.js'
import { requireAuth } from '../middleware/authMiddleware.js'

function requireSession(req, res, next) {
  if (req.authMethod !== 'session') return next(Object.assign(new Error('Session authentication required'), { statusCode: 403 }))
  next()
}

const router = Router()

router.route('/')
  .get(requireAuth, requireSession, listRoles)
  .post(requireSession, requirePermission('setting:manage'), createRole)

router.get('/permissions', requireAuth, requireSession, listRolePermissions)

router.route('/:id')
  .put(requireSession, requirePermission('setting:manage'), updateRole)
  .delete(requireSession, requirePermission('setting:manage'), deleteRole)

export { router as roleRouter }
export default router
