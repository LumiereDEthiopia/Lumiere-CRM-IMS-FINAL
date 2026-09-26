/**
 * Dashboard Service — uses BI summary + alerts
 */
import { getDashboardSummary } from './reportService.js'
import { getInventoryAlerts } from './integrityService.js'
import { getBackupHealth } from './backupService.js'
import { getItemStats } from './itemService.js'
import prisma from '../config/prisma.js'

export async function getStats() {
  const [summary, alerts, backupHealth, recentEmployees, itemStats] = await Promise.all([
    getDashboardSummary(),
    getInventoryAlerts(),
    getBackupHealth().catch(() => null),
    prisma.employee.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: { department: { select: { name: true } }, location: { select: { name: true } } }
    }),
    getItemStats().catch(() => null)
  ])

  return {
    ...summary,
    itemStats,
    inventoryAlerts: {
      outOfStock: alerts.outOfStock.slice(0, 10),
      lowStock: alerts.lowStock.slice(0, 10),
      overstock: alerts.overstock.slice(0, 10),
      recentlyAdjusted: alerts.recentlyAdjusted,
      recentlyTransferred: alerts.recentlyTransferred,
      recentlyReceived: alerts.recentlyReceived
    },
    backup: backupHealth,
    recentEmployees,
    recentSales: summary.sales?.recent || []
  }
}

export default { getStats }
