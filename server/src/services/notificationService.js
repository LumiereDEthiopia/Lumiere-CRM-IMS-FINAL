/**
 * Notification Service
 */
import prisma from '../config/prisma.js'
import { ApiError } from '../middleware/errorHandler.js'

export async function createNotification({ userId, type, title, message, severity = 'INFO', link, entityType, entityId }) {
  // Settings → Notifications → "notifications enabled" is a global switch for
  // creating NEW in-app notifications. Existing rows stay readable either way.
  const enabled = await prisma.setting.findUnique({ where: { key: 'notifications_enabled' } })
  if (enabled && enabled.value === 'false') return null
  return prisma.notification.create({
    data: { userId: userId || null, type, title, message, severity, link, entityType, entityId }
  })
}

export async function listNotifications({ userId, page = 1, limit = 20, unreadOnly = false }) {
  const safeLimit = Math.min(Math.max(1, limit), 100)
  const where = {
    OR: [{ userId: null }, ...(userId ? [{ userId }] : [])]
  }
  if (unreadOnly) where.isRead = false

  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * safeLimit,
      take: safeLimit
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({
      where: { isRead: false, OR: [{ userId: null }, ...(userId ? [{ userId }] : [])] }
    })
  ])

  return {
    data: items,
    unreadCount,
    pagination: { page, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) }
  }
}

export async function markAsRead(id, userId) {
  const n = await prisma.notification.findUnique({ where: { id } })
  if (!n) throw new ApiError(404, 'Notification not found')
  if (n.userId && userId && n.userId !== userId) throw new ApiError(403, 'Not authorized')
  return prisma.notification.update({ where: { id }, data: { isRead: true } })
}

export async function markAllAsRead(userId) {
  await prisma.notification.updateMany({
    where: { isRead: false, OR: [{ userId: null }, { userId }] },
    data: { isRead: true }
  })
  return { success: true }
}

export async function checkAndCreateAlerts() {
  const created = []

  // Low stock / out of stock
  const lowStock = await prisma.inventory.findMany({
    where: { availableQuantity: { gt: 0 } },
    include: { product: { select: { id: true, name: true, minimumStock: true, sku: true } } },
    take: 200
  })

  for (const inv of lowStock) {
    const min = inv.product?.minimumStock ?? 0
    if (inv.availableQuantity <= min && min > 0) {
      const recent = await prisma.notification.findFirst({
        where: {
          type: 'LOW_STOCK',
          entityId: inv.id,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }
      })
      if (!recent) {
        created.push(await createNotification({
          type: 'LOW_STOCK',
          title: `Low stock: ${inv.product.name}`,
          message: `${inv.product.sku || inv.product.name} has ${inv.availableQuantity} units (min ${min})`,
          severity: 'WARNING',
          link: '/admin/inventory',
          entityType: 'Inventory',
          entityId: inv.id
        }))
      }
    }
  }

  const outOfStock = await prisma.inventory.findMany({
    where: { availableQuantity: { lte: 0 } },
    include: { product: { select: { id: true, name: true, sku: true } } },
    take: 100
  })

  for (const inv of outOfStock) {
    const recent = await prisma.notification.findFirst({
      where: {
        type: 'OUT_OF_STOCK',
        entityId: inv.id,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }
    })
    if (!recent) {
      created.push(await createNotification({
        type: 'OUT_OF_STOCK',
        title: `Out of stock: ${inv.product.name}`,
        message: `${inv.product.sku || inv.product.name} is out of stock`,
        severity: 'CRITICAL',
        link: '/admin/inventory',
        entityType: 'Inventory',
        entityId: inv.id
      }))
    }
  }

  // Overdue CRM tasks
  const overdueTasks = await prisma.customerTask.findMany({
    where: {
      status: { notIn: ['DONE', 'CANCELLED', 'COMPLETED'] },
      dueDate: { lt: new Date() }
    },
    include: { customer: { select: { name: true } } },
    take: 50
  })

  for (const task of overdueTasks) {
    const recent = await prisma.notification.findFirst({
      where: {
        type: 'TASK_OVERDUE',
        entityId: task.id,
        createdAt: { gte: new Date(Date.now() - 12 * 60 * 60 * 1000) }
      }
    })
    if (!recent) {
      created.push(await createNotification({
        type: 'TASK_OVERDUE',
        title: `Overdue task: ${task.title}`,
        message: `Customer: ${task.customer?.name || 'Unknown'}`,
        severity: 'WARNING',
        link: '/admin/customers',
        entityType: 'CustomerTask',
        entityId: task.id
      }))
    }
  }

  // Backup overdue
  const backupEnabled = process.env.BACKUP_ENABLED === 'true'
  if (backupEnabled) {
    const intervalHours = parseInt(process.env.BACKUP_INTERVAL_HOURS || '6')
    const lastSuccess = await prisma.backupMetadata.findFirst({
      where: { status: 'SUCCESS' },
      orderBy: { timestamp: 'desc' }
    })
    const overdue = !lastSuccess || (Date.now() - new Date(lastSuccess.timestamp).getTime() > intervalHours * 60 * 60 * 1000 * 1.5)
    if (overdue) {
      const recent = await prisma.notification.findFirst({
        where: {
          type: 'BACKUP_OVERDUE',
          createdAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) }
        }
      })
      if (!recent) {
        created.push(await createNotification({
          type: 'BACKUP_OVERDUE',
          title: 'Backup overdue',
          message: lastSuccess ? `Last successful backup: ${lastSuccess.timestamp}` : 'No successful backups found',
          severity: 'CRITICAL',
          link: '/admin/backups'
        }))
      }
    }
  }

  return { created: created.filter(Boolean).length }
}

export default {
  createNotification,
  listNotifications,
  markAsRead,
  markAllAsRead,
  checkAndCreateAlerts
}
