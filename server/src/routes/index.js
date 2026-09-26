/**
 * API Routes Index
 */
import { Router } from 'express'
import { healthRouter } from './health.js'
import { authRouter } from './auth.js'
import { productRouter } from './products.js'
import { brandRouter } from './brands.js'
import { categoryRouter } from './categories.js'
import { customerRouter } from './customers.js'
import { saleRouter } from './sales.js'
import { settingRouter } from './settings.js'
import { roleRouter } from './roles.js'
import { dashboardRouter } from './dashboard.js'
import { noteRouter } from './notes.js'
import { accordRouter } from './accords.js'
import { employeeRouter } from './employees.js'
import { inventoryRouter } from './inventory.js'
import { purchaseRouter } from './purchases.js'
import { locationRouter } from './locations.js'
import { departmentRouter } from './departments.js'
import { supplierRouter } from './suppliers.js'
import { backupRouter } from './backups.js'
import { reportRouter } from './reports.js'
import { accountingReportRouter } from './accountingReports.js'
import { exportRouter } from './exports.js'
import { notificationRouter } from './notifications.js'
import { intelligenceRouter } from './intelligence.js'
import { financeRouter } from './finance.js'
import { tinRouter } from './tin.js'
import { payrollRouter } from './payroll.js'
import { itemRouter, itemCategoryRouter, itemInventoryRouter, itemTransferRouter } from './items.js'
import { authenticate } from '../middleware/authMiddleware.js'
import { apiRateLimit } from '../middleware/rateLimit.js'
import { search } from '../controllers/reportController.js'

const router = Router()

router.use(apiRateLimit)

// Public routes
router.use('/health', healthRouter)
router.use('/auth', authRouter)

// Protected routes
router.use(authenticate)

router.get('/search', search)
router.use('/products', productRouter)
router.use('/brands', brandRouter)
router.use('/categories', categoryRouter)
router.use('/customers', customerRouter)
router.use('/sales', saleRouter)
router.use('/settings', settingRouter)
router.use('/roles', roleRouter)
router.use('/dashboard', dashboardRouter)
router.use('/notes', noteRouter)
router.use('/accords', accordRouter)
router.use('/employees', employeeRouter)
router.use('/inventory', inventoryRouter)
router.use('/purchases', purchaseRouter)
router.use('/locations', locationRouter)
router.use('/departments', departmentRouter)
router.use('/suppliers', supplierRouter)
router.use('/backups', backupRouter)
router.use('/reports', reportRouter)
router.use('/reports/accounting', accountingReportRouter)
router.use('/exports', exportRouter)
router.use('/notifications', notificationRouter)
router.use('/intelligence', intelligenceRouter)
router.use('/finance', financeRouter)
router.use('/tin', tinRouter)
router.use('/payroll', payrollRouter)
router.use('/items', itemRouter)
router.use('/item-categories', itemCategoryRouter)
router.use('/item-inventory', itemInventoryRouter)
router.use('/item-transfers', itemTransferRouter)

export { router as apiRouter }
export default router
