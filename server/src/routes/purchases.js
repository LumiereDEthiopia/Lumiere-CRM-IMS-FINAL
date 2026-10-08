import { Router } from 'express'
import { getPurchases, createNewPurchase, receive } from '../controllers/purchaseController.js'
import { requirePermission } from '../middleware/authorize.js'
const router = Router()
router.route('/')
  .get(requirePermission('purchase:view'), getPurchases)
  .post(requirePermission('purchase:create'), createNewPurchase)
router.post('/:id/receive', requirePermission('purchase:receive'), receive)
export { router as purchaseRouter }
export default router