import { Router } from 'express'
import { getCustomers, getCustomerById, createNewCustomer, updateExistingCustomer, deleteExistingCustomer, addCustomerInteraction, createCustomerTask, getTags, createNewTag, deleteExistingTag } from '../controllers/customerController.js'
import { requirePermission } from '../middleware/authorize.js'
const router = Router()
router.route('/')
  .get(requirePermission('customer:view'), getCustomers)
  .post(requirePermission('customer:create'), createNewCustomer)
router.route('/:id')
  .get(requirePermission('customer:view'), getCustomerById)
  .put(requirePermission('customer:edit'), updateExistingCustomer)
  .delete(requirePermission('customer:edit'), deleteExistingCustomer)
router.post('/:id/interactions', requirePermission('customer:edit'), addCustomerInteraction)
router.post('/:id/tasks', requirePermission('customer:edit'), createCustomerTask)
router.route('/tags')
  .get(requirePermission('customer:view'), getTags)
  .post(requirePermission('customer:edit'), createNewTag)
router.route('/tags/:id').delete(requirePermission('customer:edit'), deleteExistingTag)
export { router as customerRouter }
export default router