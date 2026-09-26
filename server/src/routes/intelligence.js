/**
 * Intelligence Routes — Stage 5
 * All endpoints require authentication + backend permission enforcement.
 */
import { Router } from 'express'
import { authenticate } from '../middleware/authMiddleware.js'
import { requireAnyPermission, requirePermission } from '../middleware/authorize.js'
import ctrl from '../controllers/intelligenceController.js'

const router = Router()

router.use(authenticate)
router.use(requireAnyPermission('intelligence:view', 'report:view'))

router.get('/dashboard', ctrl.dashboard)
router.get('/inventory', ctrl.inventory)
router.get('/inventory/alerts', ctrl.inventoryAlerts)
router.get('/inventory/forecast', ctrl.inventoryForecast)
router.get('/purchasing/recommendations', ctrl.purchasingRecommendations)
router.get('/products', ctrl.products)
router.get('/products/:id', ctrl.product)
router.get('/customers/rfm', ctrl.customersRfm)
router.get('/customers/segments', ctrl.customersSegments)
router.get('/customers/alerts', ctrl.customersAlerts)
router.get('/profit', requirePermission('financial:view'), ctrl.profit)
router.get('/locations', ctrl.locations)
router.get('/employees', ctrl.employees)
router.get('/recommendations', ctrl.recommendationsList)
router.patch('/recommendations/:id', requirePermission('recommendations:manage'), ctrl.updateRecommendation)

export { router as intelligenceRouter }
export default router
