/**
 * Product Routes
 */
import { Router } from 'express'
import {
  listProducts, getProduct, createProduct,
  updateProduct, deleteProduct, bulkDeleteProducts
} from '../controllers/productController.js'
import { productAnalytics } from '../controllers/reportController.js'
import {
  getProductItems, replaceProductItems,
  addProductItemToProduct, updateProductItemRowHandler, removeProductItemRowHandler
} from '../controllers/itemController.js'
import { requireAnyPermission, requirePermission } from '../middleware/authorize.js'

const router = Router()

router.get('/:id/analytics', requireAnyPermission('product:view', 'report:view'), productAnalytics)

// Product → item consumption configuration (requirement 9/11/23)
router.get('/:id/items', requireAnyPermission('product:view', 'items:view'), getProductItems)
router.put('/:id/items', requirePermission('products:manage_items'), replaceProductItems)
router.post('/:id/items', requirePermission('products:manage_items'), addProductItemToProduct)
router.put('/:id/items/:itemId', requirePermission('products:manage_items'), updateProductItemRowHandler)
router.delete('/:id/items/:itemId', requirePermission('products:manage_items'), removeProductItemRowHandler)

router.route('/')
  .get(listProducts)
  .post(createProduct)
  .delete(bulkDeleteProducts)

router.route('/:id')
  .get(getProduct)
  .put(updateProduct)
  .delete(deleteProduct)

export { router as productRouter }
export default router
