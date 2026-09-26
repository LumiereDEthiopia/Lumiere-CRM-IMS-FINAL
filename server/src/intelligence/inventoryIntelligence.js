/**
 * Inventory Intelligence Engine (part 1 — core calculations)
 */
import prisma from '../config/prisma.js'
import { toDailySeries, forecast, recommendedReorderQty } from './forecasting.js'

const HISTORY_DAYS = 90

export function classifyStatus({ available, minimumStock, forecastResult, overstockMultiplier = 5 }) {
  if (available <= 0) return 'OUT_OF_STOCK'
  if (forecastResult?.isDeadStock) return 'DEAD_STOCK'
  if (minimumStock > 0 && available <= minimumStock * 0.5) return 'CRITICAL'
  if (minimumStock > 0 && available <= minimumStock) return 'LOW_STOCK'
  if (minimumStock > 0 && available > minimumStock * overstockMultiplier) return 'OVERSTOCK'
  return 'HEALTHY'
}

async function getSetting(key) {
  try {
    const s = await prisma.setting.findUnique({ where: { key } })
    return s?.value
  } catch { return null }
}

function round2(n) { return Math.round(n * 100) / 100 }

function countBy(items, key) {
  const counts = {}
  for (const i of items) counts[i[key]] = (counts[i[key]] || 0) + 1
  return counts
}

export async function buildRows(opts = {}) {
  const page = Math.max(1, parseInt(opts.page) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(opts.pageSize) || 25))
  const now = new Date()
  const historyStart = new Date(now)
  historyStart.setDate(historyStart.getDate() - HISTORY_DAYS)

  const where = {}
  if (opts.locationId) where.locationId = opts.locationId
  if (opts.productId) where.productId = opts.productId
  if (opts.categoryId || opts.brandId) {
    where.product = {}
    if (opts.categoryId) where.product.categoryId = opts.categoryId
    if (opts.brandId) where.product.brandId = opts.brandId
  }

  const [inventories, total] = await Promise.all([
    prisma.inventory.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, sku: true, costPrice: true, price: true, minimumStock: true, isActive: true } },
        location: { select: { id: true, name: true, code: true } }
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.inventory.count({ where })
  ])

  const rawDays = await prisma.$queryRawUnsafe(
    `SELECT si.productId AS productId, si.quantity AS qty, s.soldAt AS soldAt
     FROM SaleItem si JOIN Sale s ON s.id = si.saleId
     WHERE s.status != 'CANCELLED' AND s.soldAt >= ?`,
    historyStart.toISOString()
  ).catch(() => [])

  const byProduct = new Map()
  for (const row of rawDays) {
    if (!byProduct.has(row.productId)) byProduct.set(row.productId, [])
    byProduct.get(row.productId).push({ date: row.soldAt, quantity: row.qty })
  }

  const deadStockDays = parseInt(await getSetting('dead_stock_days')) || 90
  const overstockMultiplier = parseFloat(await getSetting('overstock_multiplier')) || 5

  const items = inventories.map((inv) => {
    const p = inv.product
    const daily = toDailySeries(byProduct.get(p.id) || [], HISTORY_DAYS, now)
    const available = inv.availableQuantity ?? Math.max(0, inv.quantity - (inv.reservedQuantity || 0))
    const fc = forecast(daily, available, { deadStockDays })
    const status = classifyStatus({ available, minimumStock: p.minimumStock, forecastResult: fc, overstockMultiplier })
    const recommendedQty = ['CRITICAL', 'LOW_STOCK', 'OUT_OF_STOCK'].includes(status)
      ? recommendedReorderQty({ avgDailySales: fc.avgDailySales, currentStock: available, minimumStock: p.minimumStock || 0 })
      : 0
    return {
      inventoryId: inv.id, productId: p.id, productName: p.name, sku: p.sku,
      locationId: inv.locationId, locationName: inv.location?.name,
      quantity: inv.quantity, reservedQuantity: inv.reservedQuantity, availableQuantity: available,
      minimumStock: p.minimumStock, costPrice: p.costPrice, price: p.price,
      costValue: round2(available * (p.costPrice || 0)), retailValue: round2(available * (p.price || 0)),
      status, forecast: fc, recommendedReorderQty: recommendedQty
    }
  })

  return { items, total, page, pageSize, now }
}

export async function getInventoryIntelligence(opts = {}) {
  const { items, total, page, pageSize, now } = await buildRows(opts)
  const filtered = opts.status ? items.filter((i) => i.status === opts.status) : items
  return {
    data: filtered,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    summary: {
      counts: countBy(items, 'status'),
      totalCostValue: round2(items.reduce((a, i) => a + i.costValue, 0)),
      totalRetailValue: round2(items.reduce((a, i) => a + i.retailValue, 0))
    },
    meta: { historyDays: HISTORY_DAYS, isEstimate: true, generatedAt: now.toISOString() }
  }
}

export async function getInventoryAlerts() {
  const { items } = await buildRows({ pageSize: 100 })
  const order = { OUT_OF_STOCK: 0, CRITICAL: 1, DEAD_STOCK: 2 }
  const alerts = items
    .filter((i) => order[i.status] !== undefined)
    .sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3))
    .map((i) => ({
      inventoryId: i.inventoryId, productId: i.productId, productName: i.productName, sku: i.sku,
      locationName: i.locationName, status: i.status, availableQuantity: i.availableQuantity,
      minimumStock: i.minimumStock, daysRemaining: i.forecast.daysRemaining, risk: i.forecast.risk,
      recommendedReorderQty: i.recommendedReorderQty
    }))
  return { alerts, count: alerts.length, generatedAt: new Date().toISOString() }
}

export default { getInventoryIntelligence, getInventoryAlerts, classifyStatus }
