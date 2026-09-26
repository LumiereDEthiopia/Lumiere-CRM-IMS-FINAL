/**
 * Roles & Permissions Routes — professional ERP role management
 */
import { Router } from 'express'
import {
  listRoles, listRolePermissions, createRole, updateRole, deleteRole
} from '../controllers/roleController.js'
import { requirePermission } from '../middleware/authorize.js'

const router = Router()

router.route('/')
  .get(listRoles)
  .post(requirePermission('setting:manage'), createRole)

router.get('/permissions', listRolePermissions)

router.route('/:id')
  .put(requirePermission('setting:manage'), updateRole)
  .delete(requirePermission('setting:manage'), deleteRole)

export { router as roleRouter }
export default router