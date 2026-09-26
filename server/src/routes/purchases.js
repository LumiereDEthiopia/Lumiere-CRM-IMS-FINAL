import { Router } from 'express'
import { getPurchases, createNewPurchase, receive } from '../controllers/purchaseController.js'
const router = Router()
router.route('/').get(getPurchases).post(createNewPurchase)
router.post('/:id/receive', receive)
export { router as purchaseRouter }
export default router