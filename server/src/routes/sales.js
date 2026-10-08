import { Router } from 'express'
import { getSales, getSaleById, createNewSale, cancelExistingSale, getDailyActivity } from '../controllers/saleController.js'
import { requirePermission, requireAnyPermission } from '../middleware/authorize.js'
const router = Router()
router.get('/daily-activity', requireAnyPermission('sale:view', 'report:view'), getDailyActivity)
router.route('/')
  .get(requireAnyPermission('sale:view', 'report:view'), getSales)
  .post(requirePermission('sale:create'), createNewSale)
router.route('/:id')
  .get(requireAnyPermission('sale:view', 'report:view'), getSaleById)
router.post('/:id/cancel', requirePermission('sale:cancel'), cancelExistingSale)
export { router as saleRouter }
export default router