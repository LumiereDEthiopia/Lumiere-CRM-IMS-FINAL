import { Router } from 'express'
import {
  getNotifications, readNotification, readAllNotifications, refreshAlerts
} from '../controllers/notificationController.js'

const router = Router()
router.get('/', getNotifications)
router.post('/refresh', refreshAlerts)
router.patch('/read-all', readAllNotifications)
router.patch('/:id/read', readNotification)

export { router as notificationRouter }
export default router
