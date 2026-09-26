/**
 * Order Routes
 * /api/orders
 */
import { Router } from 'express'
import {
  listOrders, getOrder, createOrder, updateOrder, deleteOrder
} from '../controllers/orderController.js'

const router = Router()

router.route('/')
  .get(listOrders)
  .post(createOrder)

router.route('/:id')
  .get(getOrder)
  .put(updateOrder)
  .delete(deleteOrder)

export { router as orderRouter }
export default router