import { Router } from 'express'
import { getDepartments, createNewDepartment, updateExistingDepartment, deleteExistingDepartment } from '../controllers/departmentController.js'
const router = Router()
router.route('/').get(getDepartments).post(createNewDepartment)
router.route('/:id').put(updateExistingDepartment).delete(deleteExistingDepartment)
export { router as departmentRouter }
export default router