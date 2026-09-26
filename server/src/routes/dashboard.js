import { Router } from 'express'
import { getDashboardStats, getEmployeeSummaryStats, getPayrollSummaryStats, getPayrollAlerts } from '../controllers/dashboardController.js'
import { requirePermission } from '../middleware/authorize.js'
const router = Router()
router.get('/stats', getDashboardStats)
router.get('/employee-summary', requirePermission('employee:view'), getEmployeeSummaryStats)
router.get('/payroll-summary', requirePermission('payroll:view', 'employee:view_sensitive'), getPayrollSummaryStats)
router.get('/payroll-alerts', requirePermission('payroll:view', 'employee:view_sensitive'), getPayrollAlerts)
export { router as dashboardRouter }
export default router