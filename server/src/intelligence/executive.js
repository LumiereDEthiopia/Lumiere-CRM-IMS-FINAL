/**
 * Executive / Management Intelligence Layer — Stage 6
 * Management forecast, executive dashboard, unified recommendations,
 * churn risk, product/location drill-downs and a rule-based assistant.
 * All outputs are clearly labeled ESTIMATES derived from stored data.
 */
import prisma from '../config/prisma.js'
import { getProfitIntelligence, getEmployeeIntelligence, getLocationIntelligence } from './businessAnalytics.js'
import { getInventoryAlerts } from './inventoryIntelligence.js'
import { getPurchasingRecommendations, saveRecommendationSnapshot } from './purchasingRecommendations.js'
import { getCustomerAlerts, getCustomerSegments } from './customerIntelligence.js'
import { detectTrend, exponentialSmoothing, weightedMovingAverage } from './forecasting/index.js'

const DAY = 86400000
function r2(n) { return Math.round((n || 0) * 100) / 100 }
function estimate() { return { isEstimate: true, note: 'Derived from stored business data. Estimates only — not a guarantee.' } }

// ===== Product drill-down =====
export async function getProductIntelligenceDetail({ productId, days = 90 } = {}) {
  if (!productId) throw Object.assign(new Error('productId is required'), { statusCode: 400 })
  const start = new Date(Date.now() - days * DAY)

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true, name: true, sku: true, price: true, costPrice: true, minimumStock: true,
      isActive: true, isFeatured: true, brand: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } }
    }
  })
  if (!product) throw Object.assign(new Error('Product not found'), { statusCode: 404 })

  const [items, inventories, recentSales, stockAgg] = await Promise.all([
    prisma.saleItem.findMany({
      where: { productId, sale: { status: { not: 'CANCELLED' }, soldAt: { gte: start } } },
      select: { quantity: true, unitPrice: true, unitCost: true, sale: { select: { soldAt: true } } },
      orderBy: { sale: { soldAt: 'asc' } }
    }).catch(() => []),
    prisma.inventory.findMany({
      where: { productId },
      include: { location: { select: { id: true, name: true, code: true } } }
    }).catch(() => []),
    prisma.saleItem.findMany({
      where: { productId, sale: { status: { not: 'CANCELLED' }, soldAt: { gte: start } } },
      select: { quantity: true, sale: { select: { soldAt: true, customer: { select: { id: true, name: true } } } } },
      orderBy: { sale: { soldAt: 'desc' } },
      take: 200
    }).catch(() => []),
    prisma.inventory.aggregate({ where: { productId }, _sum: { quantity: true, availableQuantity: true } }).catch(() => ({ _sum: {} }))
  ])

  const unitsSold = items.reduce((s, i) => s + i.quantity, 0)
  const revenue = items.reduce((s, i) => s + Number(i.unitPrice || 0) * i.quantity, 0)
  const cogs = items.reduce((s, i) => s + Number(i.unitCost || product.costPrice || 0) * i.quantity, 0)
  const byDay = new Map()
  for (const i of items) {
    const key = new Date(i.sale.soldAt).toISOString().slice(0, 10)
    byDay.set(key, (byDay.get(key) || 0) + i.quantity)
  }
  const daily = []
  for (let d = days - 1; d >= 0; d--) {
    const key = new Date(Date.now() - d * DAY).toISOString().slice(0, 10)
    daily.push({ day: key, units: byDay.get(key) || 0 })
  }
  const velocity = daily.slice(-30).reduce((s, d) => s + d.units, 0) / 30
  const stock = stockAgg._sum.availableQuantity ?? stockAgg._sum.quantity ?? 0

  const customerCount = new Map()
  for (const i of recentSales) {
    const c = i.sale.customer
    if (!c) continue
    customerCount.set(c.id, customerCount.get(c.id) || { customerId: c.id, name: c.name, units: 0 })
    customerCount.get(c.id).units += i.quantity
  }

  return {
    product,
    kpis: {
      unitsSold, revenue: r2(revenue), cogs: r2(cogs),
      grossProfit: r2(revenue - cogs),
      grossMargin: revenue > 0 ? r2(((revenue - cogs) / revenue) * 100) : null,
      salesVelocityPerDay: r2(velocity),
      stockOnHand: stock,
      estimatedDaysOfCover: velocity > 0 ? r2(stock / velocity) : null
    },
    dailySales: daily,
    inventoryByLocation: inventories.map((inv) => ({
      locationId: inv.location?.id, locationName: inv.location?.name,
      quantity: inv.quantity, availableQuantity: inv.availableQuantity, reservedQuantity: inv.reservedQuantity
    })),
    topCustomers: [...customerCount.values()].sort((a, b) => b.units - a.units).slice(0, 10),
    period: { days },
    ...estimate()
  }
}

// ===== Location drill-down =====
export async function getLocationIntelligenceDetail({ locationId, days = 90 } = {}) {
  if (!locationId) throw Object.assign(new Error('locationId is required'), { statusCode: 400 })
  const start = new Date(Date.now() - days * DAY)

  const location = await prisma.location.findUnique({ where: { id: locationId } })
  if (!location) throw Object.assign(new Error('Location not found'), { statusCode: 404 })

  const [salesAgg, topItems, inventoryAgg, employees] = await Promise.all([
    prisma.saleItem.aggregate({
      where: { sale: { status: { not: 'CANCELLED' }, locationId, soldAt: { gte: start } } },
      _sum: { totalPrice: true, quantity: true, unitCost: true },
      _count: { id: true }
    }).catch(() => ({ _sum: {}, _count: {} })),
    prisma.saleItem.groupBy({
      by: ['productId'],
      where: { sale: { status: { not: 'CANCELLED' }, locationId, soldAt: { gte: start } } },
      _sum: { quantity: true, totalPrice: true }
    }).catch(() => []),
    prisma.inventory.aggregate({ where: { locationId }, _sum: { quantity: true, availableQuantity: true } }).catch(() => ({ _sum: {} })),
    prisma.employee.count({ where: { locationId, employmentStatus: 'ACTIVE' } }).catch(() => 0)
  ])

  const productIds = topItems.map((t) => t.productId).filter(Boolean)
  const products = productIds.length
    ? await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, sku: true } }).catch(() => [])
    : []
  const pMap = new Map(products.map((p) => [p.id, p]))

  return {
    location: { id: location.id, name: location.name, code: location.code, isActive: location.isActive },
    kpis: {
      revenue: r2(salesAgg._sum.totalPrice || 0),
      unitsSold: salesAgg._sum.quantity || 0,
      transactions: salesAgg._count.id || 0,
      cogs: r2((salesAgg._sum.unitCost || 0) * (salesAgg._sum.quantity || 0)),
      grossProfit: r2((salesAgg._sum.totalPrice || 0) - (salesAgg._sum.unitCost || 0) * (salesAgg._sum.quantity || 0)),
      inventoryUnits: inventoryAgg._sum.quantity || 0,
      availableUnits: inventoryAgg._sum.availableQuantity ?? inventoryAgg._sum.quantity ?? 0,
      activeEmployees: employees
    },
    topProducts: topItems
      .map((t) => ({ productId: t.productId, name: pMap.get(t.productId)?.name, sku: pMap.get(t.productId)?.sku, units: t._sum.quantity || 0, revenue: r2(t._sum.totalPrice || 0) }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10),
    period: { days },
    ...estimate()
  }
}

// ===== Churn risk (executive view) =====
export async function getChurnRisk(opts = {}) {
  const limit = Math.min(200, Math.max(1, parseInt(opts.limit) || 50))
  const segments = await getCustomerSegments({})
  const risky = (segments.customers || [])
    .filter((c) => ['AT_RISK', 'INACTIVE', 'LOST'].includes(c.automatedSegment))
    .map((c) => ({
      customerId: c.customerId, customerCode: c.customerCode, name: c.name,
      customerType: c.customerType,
      automatedSegment: c.automatedSegment,
      daysSincePurchase: c.daysSincePurchase,
      purchaseCount: c.purchaseCount,
      valueAtRisk: c.totalValue,
      avgPurchaseValue: c.avgPurchaseValue,
      reason: c.daysSincePurchase != null
        ? `No purchase in ${c.daysSincePurchase} days`
        : 'No purchase history'
    }))
    .sort((a, b) => b.valueAtRisk - a.valueAtRisk)
    .slice(0, limit)

  const totalValueAtRisk = r2(risky.reduce((s, c) => s + (c.valueAtRisk || 0), 0))
  const counts = {}
  for (const c of risky) counts[c.automatedSegment] = (counts[c.automatedSegment] || 0) + 1

  return {
    customers: risky, count: risky.length, counts,
    totalValueAtRisk,
    thresholds: segments.thresholds,
    ...estimate()
  }
}

// ===== Management forecast (revenue / demand) =====
export async function getManagementForecast(opts = {}) {
  const historyDays = Math.min(365, Math.max(30, parseInt(opts.days) || 90))
  const horizonDays = Math.min(90, Math.max(7, parseInt(opts.horizonDays) || 30))
  const start = new Date(Date.now() - historyDays * DAY)

  const rows = await prisma.$queryRawUnsafe(
    `SELECT date(soldAt) AS day, COUNT(id) AS orderCount, COALESCE(SUM(total), 0) AS revenue
     FROM Sale WHERE status != 'CANCELLED' AND soldAt >= ?
     GROUP BY date(soldAt) ORDER BY day ASC`,
    start.toISOString()
  ).catch(() => [])

  const series = rows.map((r) => ({
    day: String(r.day), orderCount: Number(r.orderCount || 0), revenue: r2(Number(r.revenue || 0))
  }))
  const revValues = series.map((s) => s.revenue)
  const recent = revValues.slice(-30)
  const trend = detectTrend(recent)
  const maBase = recent.reduce((s, v) => s + v, 0) / (recent.length || 1)
  const blended = recent.length > 0
    ? (trend.direction === 'RISING'
        ? weightedMovingAverage(recent, 14) * 0.5 + exponentialSmoothing(recent, 0.3) * 0.3 + maBase * 0.2
        : maBase * 0.4 + weightedMovingAverage(recent, 14) * 0.3 + exponentialSmoothing(recent, 0.3) * 0.3)
    : 0
  const hasHistory = series.length > 0

  const dailySeries = []
  for (let d = 1; d <= horizonDays; d++) {
    dailySeries.push({
      day: new Date(Date.now() + d * DAY).toISOString().slice(0, 10),
      projectedRevenue: r2(blended)
    })
  }

  const revenue30 = r2(series.slice(-30).reduce((s, x) => s + x.revenue, 0))
  const revenue90 = r2(series.slice(-90).reduce((s, x) => s + x.revenue, 0))
  const orders30 = series.slice(-30).reduce((s, x) => s + x.orderCount, 0)

  return {
    history: { days: historyDays, series },
    kpis: { revenue30, revenue90, orders30, avgDailyRevenue: r2(maBase) },
    forecast: {
      horizonDays,
      trend,
      projectedTotalRevenue: r2(blended * horizonDays),
      projectedDailyRevenue: r2(blended),
      dailySeries,
      confidence: hasHistory && series.length >= 30 ? 'MEDIUM' : hasHistory ? 'LOW' : 'NONE'
    },
    ...estimate()
  }
}

// ===== Executive dashboard =====
export async function getExecutiveDashboard(opts = {}) {
  const days = Math.min(365, Math.max(7, parseInt(opts.days) || 30))
  const [profit, invAlerts, purch, custAlerts, churn, locations, openRecs, forecast] = await Promise.all([
    getProfitIntelligence({ days }).catch(() => null),
    getInventoryAlerts().catch(() => ({ alerts: [], count: 0 })),
    getPurchasingRecommendations({ pageSize: 100 }).catch(() => ({ recommendations: [], counts: {} })),
    getCustomerAlerts().catch(() => ({ alerts: [], count: 0 })),
    getChurnRisk({ limit: 10 }).catch(() => ({ customers: [], totalValueAtRisk: 0, count: 0 })),
    getLocationIntelligence({ days }).catch(() => ({ locations: [] })),
    countOpenRecommendations(),
    getManagementForecast({ days: 90, horizonDays: 30 }).catch(() => null)
  ])

  const profile = (profit && (profit.totals || profit.profit || profit)) || {}
  const totals = profit?.totals || null

  return {
    period: { days },
    kpis: {
      revenue: totals ? totals.revenue : null,
      unitsSold: totals ? totals.units : null,
      grossProfit: totals ? totals.grossProfit : null,
      grossMargin: totals ? totals.grossMargin : null,
      projectedRevenueNext30d: forecast?.forecast?.projectedTotalRevenue ?? null,
      trend: forecast?.forecast?.trend?.direction || 'UNKNOWN'
    },
    alerts: {
      inventoryCritical: invAlerts.count || (invAlerts.alerts || []).length,
      criticalInventory: (invAlerts.alerts || []).slice(0, 5),
      purchaseRecommendations: (purch.recommendations || []).slice(0, 5),
      purchaseCounts: purch.counts || {},
      customerAlerts: (custAlerts.alerts || []).slice(0, 5),
      customerAlertCount: custAlerts.count || 0,
      churnRiskValue: churn.totalValueAtRisk || 0
    },
    topLocations: (locations.locations || []).slice(0, 5),
    openRecommendations: openRecs,
    generatedAt: new Date().toISOString(),
    ...estimate()
  }
}

// ===== Unified recommendations =====
export async function getUnifiedRecommendations(opts = {}) {
  const page = Math.max(1, parseInt(opts.page) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(opts.pageSize) || 25))
  const where = {}
  if (opts.status) where.status = opts.status
  if (opts.type) where.type = opts.type
  if (opts.priority) where.priority = opts.priority

  const [total, items] = await Promise.all([
    prisma.intelligenceRecommendation.count({ where }),
    prisma.intelligenceRecommendation.findMany({
      where,
      orderBy: [{ status: 'desc' }, { priority: 'asc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ])

  const parsed = items.map((r) => ({ ...r, payload: safeParse(r.payload) }))
  return { items: parsed, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } }
}

function safeParse(str) {
  if (!str) return null
  try { return JSON.parse(str) } catch { return null }
}

const REC_STATUSES = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'DISMISSED']
const REC_PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

export async function resolveUnifiedRecommendation(id, { status, priority } = {}, user) {
  if (!id) throw Object.assign(new Error('id is required'), { statusCode: 400 })
  if (status && !REC_STATUSES.includes(status)) {
    throw Object.assign(new Error(`status must be one of ${REC_STATUSES.join(', ')}`), { statusCode: 400 })
  }
  if (priority && !REC_PRIORITIES.includes(priority)) {
    throw Object.assign(new Error(`priority must be one of ${REC_PRIORITIES.join(', ')}`), { statusCode: 400 })
  }
  const existing = await prisma.intelligenceRecommendation.findUnique({ where: { id } })
  if (!existing) throw Object.assign(new Error('Recommendation not found'), { statusCode: 404 })

  const rec = await prisma.intelligenceRecommendation.update({
    where: { id },
    data: {
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      resolvedBy: status && status !== 'OPEN' ? (user?.userId || user?.id || null) : null,
      resolvedAt: status && status !== 'OPEN' ? new Date() : null
    }
  })
  return { ...rec, payload: safeParse(rec.payload) }
}

// ===== Generate recommendations from intelligence =====
export async function generateRecommendationsFromIntelligence() {
  const purch = await getPurchasingRecommendations({ pageSize: 100 })
  const savedPurchasing = await saveRecommendationSnapshot(purch.recommendations || [])

  const custAlerts = await getCustomerAlerts()
  let savedCustomers = 0
  for (const a of (custAlerts.alerts || []).slice(0, 50)) {
    if (!a.customerId) continue
    const existing = await prisma.intelligenceRecommendation.findFirst({
      where: {
        type: a.type, entityId: a.customerId, status: 'OPEN',
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }
    })
    if (existing) continue
    await prisma.intelligenceRecommendation.create({
      data: {
        type: a.type, entityType: 'Customer', entityId: a.customerId,
        priority: a.priority === 'URGENT' ? 'CRITICAL' : (a.priority || 'MEDIUM'),
        title: a.message || a.type,
        description: `Customer: ${a.name || a.customerId}`,
        payload: JSON.stringify(a)
      }
    })
    savedCustomers++
  }

  return {
    savedPurchasing,
    savedCustomers,
    total: savedPurchasing + savedCustomers,
    sourceCounts: purch.counts || {},
    generatedAt: new Date().toISOString()
  }
}

// ===== Rule-based business assistant (deterministic, no external AI) =====
const TOPIC_RULES = [
  { keys: ['stock', 'inventory', 'out of stock', 'low stock', 'reorder'], topic: 'inventory' },
  { keys: ['revenue', 'profit', 'margin', 'sales', 'money', 'financial'], topic: 'financial' },
  { keys: ['customer', 'churn', 'at risk', 'vip', 'segment'], topic: 'customers' },
  { keys: ['purchase', 'purchasing', 'buy', 'supplier', 'order'], topic: 'purchasing' },
  { keys: ['employee', 'staff', 'team'], topic: 'employees' },
  { keys: ['location', 'branch', 'store'], topic: 'locations' },
  { keys: ['forecast', 'projection', 'next month', 'next week', 'trend'], topic: 'forecast' },
  { keys: ['backup', 'system', 'health'], topic: 'system' },
  { keys: ['recommendation', 'action', 'todo'], topic: 'recommendations' }
]

function detectTopic(question) {
  const q = String(question || '').toLowerCase()
  for (const rule of TOPIC_RULES) {
    if (rule.keys.some((k) => q.includes(k))) return rule.topic
  }
  return 'summary'
}

function fmtMoney(n) {
  return n == null ? 'n/a' : Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })
}

async function buildTopicAnswer(topic, user) {
  const canViewCost = user?.role === 'SUPER_ADMIN' ||
    (user?.permissions || []).some((p) => p === '*' || p === 'financial:view')

  switch (topic) {
    case 'inventory': {
      const inv = await getInventoryAlerts()
      const count = inv.count ?? (inv.alerts || []).length
      const top = (inv.alerts || []).slice(0, 5)
        .map((a) => `${a.productName}${a.sku ? ` (${a.sku})` : ''}: ${a.status.toLowerCase().replace(/_/g, ' ')}${a.estimatedDaysRemaining != null ? `, ~${a.estimatedDaysRemaining} days left` : ''}`)
      return {
        answer: count > 0
          ? `There are ${count} inventory alert(s). Most urgent: ${top[0] || 'n/a'}.`
          : 'No inventory alerts — stock levels look healthy.',
        data: { alertCount: count, top }
      }
    }
    case 'financial': {
      const p = await getProfitIntelligence({ days: 30 })
      const t = p?.totals || {}
      if (!canViewCost) {
        return { answer: `Revenue in the last 30 days is ${fmtMoney(t.revenue)} across ${t.units ?? 'n/a'} units. Gross margin details require the financial:view permission.`, data: { revenue: t.revenue, units: t.units }, restricted: true }
      }
      return {
        answer: `Last 30 days: revenue ${fmtMoney(t.revenue)}, gross profit ${fmtMoney(t.grossProfit)}, gross margin ${t.grossMargin != null ? t.grossMargin + '%' : 'n/a'}.`,
        data: t
      }
    }
    case 'customers': {
      const churn = await getChurnRisk({ limit: 5 })
      return {
        answer: `${churn.count} customer(s) show churn/inactivity risk with ${fmtMoney(churn.totalValueAtRisk)} of lifetime value at risk. Top concern: ${churn.customers[0]?.name || 'none'}.`,
        data: { count: churn.count, totalValueAtRisk: churn.totalValueAtRisk, top: churn.customers.slice(0, 5).map((c) => ({ name: c.name, segment: c.automatedSegment, valueAtRisk: c.valueAtRisk })) }
      }
    }
    case 'purchasing': {
      const purch = await getPurchasingRecommendations({ pageSize: 100 })
      const critical = (purch.recommendations || []).filter((r) => r.priority === 'CRITICAL')
      return {
        answer: `${(purch.recommendations || []).length} purchasing recommendation(s); ${critical.length} are critical. Most urgent: ${critical[0] ? `${critical[0].productName} — ${critical[0].reason}` : 'none'}.`,
        data: { counts: purch.counts, top: (purch.recommendations || []).slice(0, 5).map((r) => ({ product: r.productName, type: r.recommendationType, qty: r.recommendedQuantity })) }
      }
    }
    default: {
      const [inv, purch, cust, f] = await Promise.all([
        getInventoryAlerts().catch(() => ({ count: 0, alerts: [] })),
        getPurchasingRecommendations({ pageSize: 100 }).catch(() => ({ recommendations: [], counts: {} })),
        getCustomerAlerts().catch(() => ({ count: 0, alerts: [] })),
        getManagementForecast({ days: 90, horizonDays: 30 }).catch(() => null)
      ])
      return {
        answer: `Executive summary: ${(inv.alerts || []).length} inventory alert(s), ${(purch.recommendations || []).length} purchasing recommendation(s), ${cust.count || 0} customer alert(s), and a ${f?.forecast?.trend?.direction?.toLowerCase() || 'unknown'} revenue trend with ${fmtMoney(f?.forecast?.projectedTotalRevenue)} projected over the next 30 days. Ask about stock, revenue, customers, purchasing, staff, locations, forecast, backups or recommendations for details.`,
        data: {
          inventoryAlerts: (inv.alerts || []).length,
          purchaseRecommendations: (purch.recommendations || []).length,
          customerAlerts: cust.count || 0,
          projectedRevenueNext30d: f?.forecast?.projectedTotalRevenue ?? null
        }
      }
    }
  }
}

// __STAGE6_APPEND__




