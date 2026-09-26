/**
 * Intelligence Controller — Stage 5
 */
import {
  getProductIntelligence, getProfitIntelligence,
  getLocationIntelligence, getEmployeeIntelligence
} from '../intelligence/businessAnalytics.js'
import { getInventoryIntelligence, getInventoryAlerts } from '../intelligence/inventoryIntelligence.js'
import { getPurchasingRecommendations, saveRecommendationSnapshot } from '../intelligence/purchasingRecommendations.js'
import { getRfmAnalysis, getCustomerSegments, getCustomerAlerts } from '../intelligence/customerIntelligence.js'
import prisma from '../config/prisma.js'

export async function inventory(req, res, next) {
  try { res.json({ success: true, data: await getInventoryIntelligence(req.query) }) } catch (e) { next(e) }
}

export async function inventoryAlerts(req, res, next) {
  try { res.json({ success: true, data: await getInventoryAlerts() }) } catch (e) { next(e) }
}

export async function inventoryForecast(req, res, next) {
  try {
    const data = await getInventoryIntelligence(req.query)
    res.json({
      success: true,
      data: {
        items: data.data.map((i) => ({
          productId: i.productId, productName: i.productName, sku: i.sku,
          locationName: i.locationName, availableQuantity: i.availableQuantity,
          forecast: i.forecast, recommendedReorderQty: i.recommendedReorderQty, status: i.status
        })),
        pagination: data.pagination, meta: data.meta
      }
    })
  } catch (e) { next(e) }
}

export async function purchasingRecommendations(req, res, next) {
  try {
    const data = await getPurchasingRecommendations(req.query)
    if (req.query.persist === 'true') {
      data.persistedCount = await saveRecommendationSnapshot(data.recommendations)
    }
    res.json({ success: true, data })
  } catch (e) { next(e) }
}

export async function products(req, res, next) {
  try { res.json({ success: true, data: await getProductIntelligence(req.query) }) } catch (e) { next(e) }
}

export async function product(req, res, next) {
  try { res.json({ success: true, data: await getProductIntelligence({ productId: req.params.id }) }) } catch (e) { next(e) }
}

export async function customersRfm(req, res, next) {
  try { res.json({ success: true, data: await getRfmAnalysis(req.query) }) } catch (e) { next(e) }
}

export async function customersSegments(req, res, next) {
  try { res.json({ success: true, data: await getCustomerSegments(req.query) }) } catch (e) { next(e) }
}

export async function customersAlerts(req, res, next) {
  try { res.json({ success: true, data: await getCustomerAlerts() }) } catch (e) { next(e) }
}

export default { inventory, inventoryAlerts, inventoryForecast, purchasingRecommendations, products, product, customersRfm, customersSegments, customersAlerts, profit, locations, employees, recommendationsList, updateRecommendation, dashboard }

// ===== Part 2: profit, locations, employees, unified recommendations, dashboard =====

function canViewCost(user) {
  return user?.role === 'SUPER_ADMIN' ||
    (user?.permissions || []).some((p) => p === '*' || p === 'financial:view')
}

export async function profit(req, res, next) {
  try {
    const data = await getProfitIntelligence(req.query)
    if (!canViewCost(req.user)) {
      delete data.totals.cogs
      data.totals.grossProfit = null
      data.totals.grossMargin = null
      data.byProduct = data.byProduct.map((p) => ({ productId: p.productId, revenue: p.revenue, units: p.units }))
      data.byBrand = data.byBrand.map((b) => ({ brandId: b.brandId, brandName: b.brandName, revenue: b.revenue, units: b.units }))
      data.byCategory = data.byCategory.map((c) => ({ categoryId: c.categoryId, categoryName: c.categoryName, revenue: c.revenue, units: c.units }))
      data.note = 'Cost/margin data requires financial_reports:view permission'
    }
    res.json({ success: true, data })
  } catch (e) { next(e) }
}

export async function locations(req, res, next) {
  try {
    const data = await getLocationIntelligence(req.query)
    if (!canViewCost(req.user)) {
      data.locations = data.locations.map((l) => ({
        locationId: l.locationId, name: l.name, code: l.code,
        revenue: l.revenue, unitsSold: l.unitsSold, inventoryUnits: l.inventoryUnits, activeEmployees: l.activeEmployees
      }))
      data.note = 'Cost/margin data requires financial_reports:view permission'
    }
    res.json({ success: true, data })
  } catch (e) { next(e) }
}

export async function employees(req, res, next) {
  try { res.json({ success: true, data: await getEmployeeIntelligence(req.query) }) } catch (e) { next(e) }
}

export async function recommendationsList(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 25))
    const where = {}
    if (req.query.status) where.status = req.query.status
    if (req.query.type) where.type = req.query.type
    const [total, items] = await Promise.all([
      prisma.intelligenceRecommendation.count({ where }),
      prisma.intelligenceRecommendation.findMany({
        where, orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize, take: pageSize
      })
    ])
    res.json({ success: true, data: { items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } } })
  } catch (e) { next(e) }
}

export async function updateRecommendation(req, res, next) {
  try {
    const { status } = req.body || {}
    const allowed = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'DISMISSED']
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: `status must be one of ${allowed.join(', ')}` })
    }
    const rec = await prisma.intelligenceRecommendation.update({
      where: { id: req.params.id },
      data: { status, resolvedBy: req.user?.userId, resolvedAt: status !== 'OPEN' ? new Date() : null }
    })
    res.json({ success: true, data: rec })
  } catch (e) { next(e) }
}

export async function dashboard(req, res, next) {
  try {
    const [inv, purch, custAlerts, prof] = await Promise.all([
      getInventoryAlerts(),
      getPurchasingRecommendations({ pageSize: 100 }),
      getCustomerAlerts(),
      getProfitIntelligence({ days: 30 })
    ])
    const viewCost = canViewCost(req.user)
    res.json({
      success: true,
      data: {
        criticalInventory: inv.alerts.slice(0, 10),
        purchaseRecommendations: purch.recommendations.slice(0, 10),
        customerAlerts: custAlerts.alerts.slice(0, 10),
        profit: viewCost ? prof.totals : { revenue: prof.totals.revenue, units: prof.totals.units },
        counts: {
          criticalInventory: inv.count,
          purchaseRecommendations: Object.values(purch.count || {}).reduce((a, b) => a + b, 0),
          customerAlerts: custAlerts.count
        },
        generatedAt: new Date().toISOString(),
        isEstimate: true
      }
    })
  } catch (e) { next(e) }
}
