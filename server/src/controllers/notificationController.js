/**
 * Notification Controller
 */
import {
  listNotifications, markAsRead, markAllAsRead, checkAndCreateAlerts
} from '../services/notificationService.js'

export async function getNotifications(req, res, next) {
  try {
    const data = await listNotifications({
      userId: req.userId || req.user?.userId,
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
      unreadOnly: req.query.unreadOnly === 'true'
    })
    res.json({ success: true, data })
  } catch (e) { next(e) }
}

export async function readNotification(req, res, next) {
  try {
    const data = await markAsRead(req.params.id, req.userId || req.user?.userId)
    res.json({ success: true, data })
  } catch (e) { next(e) }
}

export async function readAllNotifications(req, res, next) {
  try {
    const data = await markAllAsRead(req.userId || req.user?.userId)
    res.json({ success: true, data })
  } catch (e) { next(e) }
}

export async function refreshAlerts(req, res, next) {
  try {
    const data = await checkAndCreateAlerts()
    res.json({ success: true, data })
  } catch (e) { next(e) }
}

export default { getNotifications, readNotification, readAllNotifications, refreshAlerts }
