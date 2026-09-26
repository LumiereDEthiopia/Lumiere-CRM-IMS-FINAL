import { Router } from 'express'
import {
  getInventoryItems, adjust, transfer, getMovements, integrity, repair, alerts
} from '../controllers/inventoryController.js'
import { requirePermission, requireAnyPermission } from '../middleware/authorize.js'
import { sensitiveRateLimit } from '../middleware/rateLimit.js'

const router = Router()
router.get('/', requireAnyPermission('inventory:view'), getInventoryItems)
router.get('/movements', requireAnyPermission('inventory:view'), getMovements)
router.get('/alerts', requireAnyPermission('inventory:view'), alerts)
router.get('/integrity', requirePermission('inventory:view'), integrity)
router.post('/integrity/repair', sensitiveRateLimit, requirePermission('setting:manage'), repair)
router.post('/adjust', requirePermission('inventory:adjust'), adjust)
router.post('/transfer', requirePermission('inventory:transfer'), transfer)

export { router as inventoryRouter }
export default router
