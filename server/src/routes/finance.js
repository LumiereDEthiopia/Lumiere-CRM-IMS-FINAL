import { Router } from 'express'
import { accounts, trialBalance } from '../controllers/financeController.js'
import { requirePermission } from '../middleware/authorize.js'

const router = Router()
router.get('/accounts', requirePermission('financial:view'), accounts)
router.get('/trial-balance', requirePermission('financial:view'), trialBalance)

export { router as financeRouter }
export default router
