import { startBackupScheduler } from '../jobs/backupScheduler.js'
import { runAutomationCycle, schedulerState } from '../jobs/automationScheduler.js'

async function runIntegrityCheck() {
  const { prisma } = await import('../config/prisma.js')
  const issues = []
  const add = (category, severity, message, entityId) => issues.push({ category, severity, message, entityId })

  const sqliteRows = await prisma.$queryRawUnsafe('PRAGMA integrity_check')
  if (String(sqliteRows?.[0]?.integrity_check) !== 'ok') add('DATABASE', 'CRITICAL', 'SQLite integrity_check failed')

  const [negInv, dupInv, orphanInv] = await Promise.all([
    prisma.inventory.findMany({ where: { availableQuantity: { lt: 0 } }, select: { id: true, productId: true } }),
    prisma.$queryRawUnsafe(`SELECT productId, locationId, COUNT(*) as c FROM Inventory GROUP BY productId, locationId HAVING c > 1`).catch(() => []),
    prisma.inventory.findMany({ where: { OR: [{ product: null }, { location: null }] }, select: { id: true } })
  ])
  negInv.forEach(i => add('INVENTORY', 'HIGH', `Negative available stock for product ${i.productId}`, i.id))
  dupInv.forEach(d => add('INVENTORY', 'HIGH', `Duplicate inventory: product ${d.productId} at location ${d.locationId} (${d.c} records)`))
  orphanInv.forEach(i => add('INVENTORY', 'CRITICAL', `Orphaned inventory record ${i.id}`, i.id))

  const [orphanSaleItems, orphanPurchaseItems] = await Promise.all([
    prisma.saleItem.findMany({ where: { OR: [{ sale: null }, { product: null }] }, select: { id: true } }),
    prisma.purchaseItem.findMany({ where: { OR: [{ purchase: null }, { product: null }] }, select: { id: true } })
  ])
  orphanSaleItems.forEach(i => add('SALES', 'CRITICAL', `Orphaned sale item ${i.id}`, i.id))
  orphanPurchaseItems.forEach(i => add('PURCHASING', 'CRITICAL', `Orphaned purchase item ${i.id}`, i.id))

  const employeesBadRef = await prisma.employee.findMany({
    where: { OR: [{ departmentId: { not: null }, department: null }, { locationId: { not: null }, location: null }] },
    select: { id: true }
  })
  employeesBadRef.forEach(e => add('EMPLOYEES', 'HIGH', `Employee ${e.id} has invalid department/location reference`, e.id))

  const productsBadRef = await prisma.product.findMany({
    where: { OR: [{ brandId: { not: null }, brand: null }, { categoryId: { not: null }, category: null }] },
    select: { id: true, name: true }
  })
  productsBadRef.forEach(p => add('PRODUCTS', 'HIGH', `Product "${p.name}" has invalid brand/category reference`, p.id))

  const critical = issues.filter(i => i.severity === 'CRITICAL').length
  return {
    status: critical > 0 ? 'CRITICAL' : issues.length > 0 ? 'WARNINGS' : 'HEALTHY',
    checkedAt: new Date().toISOString(),
    totalIssues: issues.length,
    issues
  }
}

export { runIntegrityCheck }

export async function getSystemStatus(req, res, next) {
  try {
    const { prisma } = await import('../config/prisma.js')
    const dbOk = await prisma.$queryRawUnsafe('SELECT 1 as ok').then(() => true).catch(() => false)
    const dbSize = await prisma.$queryRawUnsafe('SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()').catch(() => [{ size: 0 }])
    const lastBackup = await prisma.backupMetadata.findFirst({ orderBy: { createdAt: 'desc' } }).catch(() => null)
    const integrity = await runIntegrityCheck().catch(e => ({ status: 'ERROR', totalIssues: -1, issues: [{ category: 'SYSTEM', severity: 'CRITICAL', message: e.message }] }))

    res.json({
      success: true,
      data: {
        application: {
          status: 'HEALTHY',
          environment: process.env.NODE_ENV || 'development',
          version: process.env.APP_VERSION || '1.0.0',
          uptimeSeconds: Math.floor(process.uptime()),
          nodeVersion: process.version,
          memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
        },
        database: {
          status: dbOk ? 'HEALTHY' : 'UNAVAILABLE',
          sizeBytes: Number(dbSize?.[0]?.size || 0),
          integrity: integrity.status
        },
        r2: { configured: Boolean(process.env.R2_ACCESS_KEY_ID && process.env.R2_BUCKET_NAME) },
        backups: {
          enabled: process.env.BACKUP_ENABLED === 'true',
          lastBackupAt: lastBackup?.createdAt || null
        },
        scheduler: {
          running: schedulerState.running,
          lastRunAt: schedulerState.lastRunAt,
          nextRunAt: schedulerState.nextRunAt
        },
        integrity
      }
    })
  } catch (err) { next(err) }
}

export async function getIntegrityCheck(req, res, next) {
  try {
    res.json({ success: true, data: await runIntegrityCheck() })
  } catch (err) { next(err) }
}

export async function getMaintenanceMode(req, res, next) {
  try {
    const { prisma } = await import('../config/prisma.js')
    const setting = await prisma.setting.findUnique({ where: { key: 'maintenance_mode' } }).catch(() => null)
    res.json({ success: true, data: { enabled: setting?.value === 'true' } })
  } catch (err) { next(err) }
}

export async function setMaintenanceMode(req, res, next) {
  try {
    const { prisma } = await import('../config/prisma.js')
    const value = req.body?.enabled === true || req.body?.enabled === 'true'
    await prisma.setting.upsert({
      where: { key: 'maintenance_mode' },
      update: { value: String(value) },
      create: { key: 'maintenance_mode', value: String(value) }
    })
    await import('../services/auditService.js').then(m => m.audit({
      userId: req.user?.id, action: 'MAINTENANCE_MODE_CHANGE',
      entity: 'Setting', entityId: 'maintenance_mode', details: { enabled: value }
    })).catch(() => {})
    res.json({ success: true, data: { enabled: value } })
  } catch (err) { next(err) }
}