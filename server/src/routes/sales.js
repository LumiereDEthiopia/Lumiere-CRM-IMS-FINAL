import { Router } from 'express'
import { getSales, getSaleById, createNewSale, cancelExistingSale, getDailyActivity } from '../controllers/saleController.js'
const router = Router()
router.get('/daily-activity', getDailyActivity)
router.route('/').get(getSales).post(createNewSale)
router.route('/:id').get(getSaleById)
router.post('/:id/cancel', cancelExistingSale)
export { router as saleRouter }
export default router