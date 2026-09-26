import { Router } from 'express'
import {
  dashboardSummary, salesReport, inventoryReport,
  crmAnalytics, employeeAnalytics, productAnalytics, search
} from '../controllers/reportController.js'
import { requirePermission, requireAnyPermission } from '../middleware/authorize.js'

const router = Router()
router.get('/summary', requireAnyPermission('report:view'), dashboardSummary)
router.get('/sales', requireAnyPermission('report:view', 'sale:view'), salesReport)
router.get('/inventory', requireAnyPermission('report:view', 'inventory:view'), inventoryReport)
router.get('/crm', requireAnyPermission('report:view', 'customer:view'), crmAnalytics)
router.get('/employees', requirePermission('employee:view'), employeeAnalytics)
router.get('/products/:id', requireAnyPermission('report:view', 'product:view'), productAnalytics)
router.get('/search', search)

export { router as reportRouter }
export default router
