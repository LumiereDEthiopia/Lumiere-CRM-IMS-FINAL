import { Router } from 'express'
import {
  getPayrollPayments, getPayrollPaymentById, createPayrollPayment, updatePayrollPayment,
  payPayrollPayment, cancelPayrollPayment, getUpcoming, getOverdue, calculatePayroll,
  getPayrollRules, getPayrollConfig, createRule, updateRule, disableRule
} from '../controllers/payrollController.js'
import { requirePermission } from '../middleware/authorize.js'

const router = Router()
router.use(requirePermission('employee:view_sensitive'))
router.get('/', requirePermission('payroll:view'), getPayrollPayments)

// Payroll rules & configuration (rates are configured, never hard-coded)
router.get('/config', requirePermission('payroll:view'), getPayrollConfig)
router.get('/rules', requirePermission('payroll:view'), getPayrollRules)
router.post('/rules', requirePermission('payroll:process'), createRule)
router.put('/rules/:id', requirePermission('payroll:process'), updateRule)
router.delete('/rules/:id', requirePermission('payroll:process'), disableRule)

router.get('/upcoming', requirePermission('payroll:view'), getUpcoming)
router.get('/overdue', requirePermission('payroll:view'), getOverdue)

router.post('/calculate', requirePermission('payroll:view'), calculatePayroll)
router.post('/', requirePermission('payroll:create'), createPayrollPayment)

router.route('/:id')
  .get(requirePermission('payroll:view'), getPayrollPaymentById)
  .put(requirePermission('payroll:edit'), updatePayrollPayment)

// Only an authorised user confirms a payment — the system never auto-marks PAID
router.put('/:id/pay', requirePermission('payroll:process'), payPayrollPayment)
router.put('/:id/cancel', requirePermission('payroll:process'), cancelPayrollPayment)

export { router as payrollRouter }
export default router
