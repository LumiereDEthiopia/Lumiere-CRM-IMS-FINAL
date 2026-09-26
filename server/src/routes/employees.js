import { Router } from 'express'
import {
  getEmployees, getEmployeeById, createNewEmployee, updateExistingEmployee,
  deactivateExistingEmployee, uploadEmployeeFile, getEmployeeSalaryHistory,
  addEmployeeSalaryHistory, updateEmployeeSalaryHistory, getEmployeePayrollPayments,
  getEmployeePayrollNext
} from '../controllers/employeeController.js'
import { employeeAnalytics } from '../controllers/reportController.js'
import { requirePermission } from '../middleware/authorize.js'

const router = Router()
router.get('/analytics', requirePermission('employee:view'), employeeAnalytics)
router.route('/').get(requirePermission('employee:view'), getEmployees).post(requirePermission('employee:create'), createNewEmployee)
router.route('/:id').get(requirePermission('employee:view'), getEmployeeById).put(requirePermission('employee:edit'), updateExistingEmployee).delete(requirePermission('employee:delete'), deactivateExistingEmployee)
router.post('/:id/documents', requirePermission('employee:edit'), uploadEmployeeFile)

// Salary history — salary figures always require employee:view_sensitive
router.route('/:id/salary-history')
  .get(requirePermission('employee:view', 'employee:view_sensitive'), getEmployeeSalaryHistory)
  .post(requirePermission('employee:edit', 'employee:view_sensitive'), addEmployeeSalaryHistory)
router.put('/:id/salary-history/:historyId', requirePermission('employee:edit', 'employee:view_sensitive'), updateEmployeeSalaryHistory)

// Employee payroll
router.get('/:id/payroll', requirePermission('payroll:view', 'employee:view_sensitive'), getEmployeePayrollPayments)
router.get('/:id/payroll/next', requirePermission('payroll:view', 'employee:view_sensitive'), getEmployeePayrollNext)

export { router as employeeRouter }
export default router
