/**
 * Intelligence Service (part 1) — sales history + inventory intelligence.
 */
import prisma from '../config/prisma.js'
import { analyzeInventoryItem, buildInventoryAlerts, buildPurchaseRecommendations } from './inventory/index.js'
import { forecastDemand } from './forecasting/index.js'
import { computeRFM, summarizeSegments, detectChurn, buildCustomerAlerts } from './customers/index.js'

const DAY = 86400000

async function getSalesHistoryByProduct(days = 90) {
  const since = new Date(Date.now() - days * DAY)
  const items = await prisma.saleItem.findMany({
    where: { sale: { status: { notIn: ['CANCELLED'] }, soldAt: { gte: since } } },
    select: { productId: true, quantity: true, sale: { select: { soldAt: true, locationId: true, createdBy: true } } }
  })
  const byProduct = new Map()
  for (const it of items) {
    if (!byProduct.has(it.productId)) byProduct.set(it.productId, [])
    byProduct.get(it.productId).push({ date: it.sale.soldAt, quantity: it.quantity, locationId: it.sale.locationId, createdBy: it.sale.createdBy, soldAt: it.sale.soldAt })
  }
  return byProduct
}

export async function getInventoryIntelligence({ locationId, categoryId, brandId, status, page = 1, pageSize = 50 } = {}) {
  page = parseInt(page) || 1
  pageSize = parseInt(pageSize) || 50
  const where = {}
  if (locationId) where.locationId = locationId
  if (categoryId || brandId) where.product = {}
  if (categoryId) where.product.categoryId = categoryId
  if (brandId) where.product.brandId = brandId

  const [inventories, total] = await Promise.all([
    prisma.inventory.findMany({ where, include: { product: { select: { id: true, name: true, sku: true, brandId: true, categoryId: true, minimumStock: true, costPrice: true, price: true, isActive: true } } }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.inventory.count({ where })
  ])

  const salesByProduct = await getSalesHistoryByProduct(90)
  const analyses = inventories.map(inv => analyzeInventoryItem({ inventory: inv, product: inv.product, salesHistory: salesByProduct.get(inv.product.id) || [] }))
  const filtered = status ? analyses.filter(a => a.status === status) : analyses

  return {
    data: filtered,
    pagination: { page, pageSize, total: status ? filtered.length : total, totalPages: Math.ceil((status ? filtered.length : total) / pageSize) },
    summary: {
      totalItems: total,
      statusCounts: analyses.reduce((m, a) => { m[a.status] = (m[a.status] || 0) + 1; return m }, {}),
      totalCostValue: Math.round(analyses.reduce((s, a) => s + a.costValue, 0) * 100) / 100,
      totalRetailValue: Math.round(analyses.reduce((s, a) => s + a.retailValue, 0) * 100) / 100
    },
    isEstimate: true
  }
}

export async function getInventoryAlerts() {
  const inventories = await prisma.inventory.findMany({ include: { product: { select: { id: true, name: true, sku: true, minimumStock: true, costPrice: true, price: true, isActive: true, brandId: true, categoryId: true } } } })
  const salesByProduct = await getSalesHistoryByProduct(90)
  const analyses = inventories.map(inv => analyzeInventoryItem({ inventory: inv, product: inv.product, salesHistory: salesByProduct.get(inv.product.id) || [] }))
  return { alerts: buildInventoryAlerts(analyses), generatedAt: new Date().toISOString() }
}

export async function getInventoryForecast() {
  const inventories = await prisma.inventory.findMany({ include: { product: { select: { id: true, name: true, sku: true, minimumStock: true, isActive: true } } } })
  const salesByProduct = await getSalesHistoryByProduct(90)
  return inventories
    .filter(inv => inv.product.isActive)
    .map(inv => {
      const history = salesByProduct.get(inv.product.id) || []
      const f = forecastDemand(history, 30)
      return {
        productId: inv.product.id, productName: inv.product.name, sku: inv.product.sku,
        locationId: inv.locationId, currentStock: inv.availableQuantity,
        ...f,
        daysRemaining: f.averageDailySales > 0 ? Math.round((inv.availableQuantity / f.averageDailySales) * 10) / 10 : null
      }
    })
}

export async function getPurchaseRecommendations() {
  const inventories = await prisma.inventory.findMany({ include: { product: { select: { id: true, name: true, sku: true, minimumStock: true, costPrice: true, price: true, isActive: true, brandId: true, categoryId: true } } } })
  const salesByProduct = await getSalesHistoryByProduct(90)
  const analyses = inventories.map(inv => analyzeInventoryItem({ inventory: inv, product: inv.product, salesHistory: salesByProduct.get(inv.product.id) || [] }))
  return { recommendations: buildPurchaseRecommendations(analyses), generatedAt: new Date().toISOString() }
}

// ===== PART 2: products, customers, locations, employees, financial, executive =====

export async function getProductIntelligence({ page = 1, pageSize = 50, includeCosts = true } = {}) {
  page = parseInt(page) || 1
  pageSize = parseInt(pageSize) || 50
  const [products, total] = await Promise.all([
    prisma.product.findMany({ skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, sku: true, isActive: true, brandId: true, categoryId: true, costPrice: true, price: true, minimumStock: true } }),
    prisma.product.count()
  ])
  const salesByProduct = await getSalesHistoryByProduct(90)

  const results = products.map(p => {
    const history = salesByProduct.get(p.id) || []
    const unitsSold = history.reduce((s, h) => s + h.quantity, 0)
    const revenue = history.reduce((s, h) => s + h.quantity * Number(h.unitPrice || 0), 0)
    const velocity = forecastDemand(history, 30).averageDailySales

    let classification = 'SLOW_MOVING'
    if (unitsSold === 0) classification = 'DEAD_STOCK'
    else if (unitsSold >= 10) classification = 'BEST_SELLER'
    else if (velocity > 0.5) classification = 'GROWING'

    const item = {
      productId: p.id, name: p.name, sku: p.sku, isActive: p.isActive,
      brandId: p.brandId, categoryId: p.categoryId,
      unitsSold, revenue: Math.round(revenue * 100) / 100,
      salesVelocityPerDay: velocity, classification,
      lastSaleAt: history.length > 0 ? history.reduce((m, h) => h.soldAt > m ? h.soldAt : m, history[0].soldAt) : null,
      isEstimate: true
    }
    if (includeCosts) {
      const cogs = history.reduce((s, h) => s + h.quantity * Number(p.costPrice || 0), 0)
      item.costPrice = p.costPrice
      item.grossProfit = Math.round((revenue - cogs) * 100) / 100
      item.grossMargin = revenue > 0 ? Math.round(((revenue - cogs) / revenue) * 1000) / 10 : null
      if (unitsSold > 0 && item.grossMargin !== null && item.grossMargin >= 60 && classification === 'SLOW_MOVING') item.classification = 'HIGH_MARGIN'
    }
    return item
  })

  return { data: results, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } }
}

export async function getCustomerIntelligence() {
  const items = await prisma.saleItem.findMany({
    where: { sale: { status: { notIn: ['CANCELLED'] }, soldAt: { gte: new Date(Date.now() - 365 * DAY) } } },
    select: { quantity: true, unitPrice: true, sale: { select: { customerId: true, soldAt: true } } }
  })
  const byCustomer = new Map()
  for (const it of items) {
    if (!it.sale.customerId) continue
    if (!byCustomer.has(it.sale.customerId)) byCustomer.set(it.sale.customerId, { totalPurchases: 0, totalValue: 0, lastPurchaseAt: null })
    const agg = byCustomer.get(it.sale.customerId)
    agg.totalPurchases += 1
    agg.totalValue += it.quantity * Number(it.unitPrice || 0)
    if (!agg.lastPurchaseAt || it.sale.soldAt > agg.lastPurchaseAt) agg.lastPurchaseAt = it.sale.soldAt
  }

  const customers = await prisma.customer.findMany({ select: { id: true, name: true, email: true, customerType: true, status: true } })
  const enriched = customers.map(c => {
    const agg = byCustomer.get(c.id) || { totalPurchases: 0, totalValue: 0, lastPurchaseAt: null }
    return { ...c, ...agg, totalValue: Math.round(agg.totalValue * 100) / 100 }
  })

  const rfm = computeRFM({ customers: enriched })
  const churn = detectChurn({ customers: enriched })
  const churnMap = new Map(churn.map(x => [x.customerId, x.churnStatus]))
  return {
    customers: rfm.map(c => ({ ...c, churnStatus: churnMap.get(c.customerId) })),
    segments: summarizeSegments(rfm),
    alerts: buildCustomerAlerts(rfm, churn),
    generatedAt: new Date().toISOString(),
    isEstimate: true
  }
}
// ===== Snapshot for automation scheduler =====
export async function generateIntelligenceSnapshot() {
  const [alerts, customers] = await Promise.all([
    getInventoryAlerts(),
    getCustomerIntelligence()
  ])
  const inventoryAlertCount = Array.isArray(alerts.alerts) ? alerts.alerts.length : 0
  const customerAlertCount = Array.isArray(customers.alerts) ? customers.alerts.length : 0
  return {
    inventoryAlerts: inventoryAlertCount,
    customerAlerts: customerAlertCount,
    segments: customers.segments,
    generatedAt: new Date().toISOString()
  }
}
