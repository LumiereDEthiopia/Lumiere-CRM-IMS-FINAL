import { Router } from 'express'
import { getSuppliers, createNewSupplier, updateExistingSupplier, deleteExistingSupplier } from '../controllers/supplierController.js'
const router = Router()
router.route('/').get(getSuppliers).post(createNewSupplier)
router.route('/:id').put(updateExistingSupplier).delete(deleteExistingSupplier)
export { router as supplierRouter }
export default router