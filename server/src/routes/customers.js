import { Router } from 'express'
import { getCustomers, getCustomerById, createNewCustomer, updateExistingCustomer, deleteExistingCustomer, addCustomerInteraction, createCustomerTask, getTags, createNewTag, deleteExistingTag } from '../controllers/customerController.js'
const router = Router()
router.route('/').get(getCustomers).post(createNewCustomer)
router.route('/:id').get(getCustomerById).put(updateExistingCustomer).delete(deleteExistingCustomer)
router.post('/:id/interactions', addCustomerInteraction)
router.post('/:id/tasks', createCustomerTask)
router.route('/tags').get(getTags).post(createNewTag)
router.route('/tags/:id').delete(deleteExistingTag)
export { router as customerRouter }
export default router