import { Router } from 'express'
import {
  handleExport, handleImportPreview, handleImportConfirm, handleImportTemplate, handleImportTemplateXlsx
} from '../controllers/exportController.js'
import { requirePermission, requireAnyPermission } from '../middleware/authorize.js'
import { sensitiveRateLimit } from '../middleware/rateLimit.js'

const router = Router()

router.get('/templates/:type', requireAnyPermission('data:import', 'data:export'), handleImportTemplate)
router.get('/templates/:type/xlsx', requireAnyPermission('data:import', 'data:export'), handleImportTemplateXlsx)
router.post('/import/preview', sensitiveRateLimit, requireAnyPermission('data:import', 'setting:manage'), handleImportPreview)
router.post('/import/confirm', sensitiveRateLimit, requireAnyPermission('data:import', 'setting:manage'), handleImportConfirm)
router.get('/:type', sensitiveRateLimit, requireAnyPermission('data:export', 'report:view'), handleExport)

export { router as exportRouter }
export default router
