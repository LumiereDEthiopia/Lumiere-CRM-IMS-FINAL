/**
 * Inventory Intelligence — velocity, days-remaining, status classification,
 * reorder recommendations per product per location.
 */
import { buildStockForecast } from '../forecasting/index.js'

const DEAD_STOCK_DAYS = 90
const OVERSTOCK_MULTIPLIER = 5

export function classifyStock({ quantity, available, minStock, velocity, lastSaleDaysAgo }) {
  if (quantity <= 0 || available <= 0) return 'OUT_OF_STOCK'
  const min = Number(minStock) || 0
  if (available <= min) return 'CRITICAL'
  if (available <= min * 2) return 'LOW_STOCK'
  if (velocity === 0 && lastSaleDaysAgo !== null && lastSaleDaysAgo > DEAD_STOCK_DAYS) return 'DEAD_STOCK'
  if (min > 0 && available > min * OVERSTOCK_MULTIPLIER) return 'OVERSTOCK'
  return 'HEALTHY'
}

/** history: [{ date, quantity }] sales for this product (optionally per location). */
export function analyzeInventoryItem({ inventory, product, salesHistory }) {
  const now = Date.now()
  const lastSale = salesHistory && salesHistory.length > 0
    ? salesHistory.reduce((m, s) => Math.max(m, new Date(s.date).getTime()), 0)
    : null
  const lastSaleDaysAgo = lastSale ? Math.floor((now - lastSale) / 86400000) : null

  const stockForecast = buildStockForecast({
    currentStock: inventory.availableQuantity,
    minStock: product.minimumStock,
    history: salesHistory || []
  })

  const status = classifyStock({
    quantity: inventory.quantity,
    available: inventory.availableQuantity,
    minStock: product.minimumStock,
    velocity: stockForecast.averageDailySales,
    lastSaleDaysAgo
  })

  const costValue = inventory.quantity * Number(product.costPrice || 0)
  const retailValue = inventory.quantity * Number(product.price || 0)

  return {
    inventoryId: inventory.id,
    productId: product.id,
    productName: product.name,
    sku: product.sku,
    brandId: product.brandId,
    categoryId: product.categoryId,
    isActive: product.isActive,
    locationId: inventory.locationId,
    quantity: inventory.quantity,
    reservedQuantity: inventory.reservedQuantity,
    availableQuantity: inventory.availableQuantity,
    minimumStock: product.minimumStock,
    costValue: Math.round(costValue * 100) / 100,
    retailValue: Math.round(retailValue * 100) / 100,
    averageDailySales: stockForecast.averageDailySales,
    estimatedDaysRemaining: stockForecast.estimatedDaysRemaining,
    stockOutRisk: stockForecast.stockOutRisk,
    reorderPoint: stockForecast.reorderPoint,
    recommendedQuantity: stockForecast.recommendedQuantity,
    status,
    lastSaleDaysAgo,
    isEstimate: true
  }
}

export function buildInventoryAlerts(analyses) {
  return analyses
    .filter(a => ['OUT_OF_STOCK', 'CRITICAL', 'LOW_STOCK', 'DEAD_STOCK'].includes(a.status))
    .sort((a, b) => {
      const order = { OUT_OF_STOCK: 0, CRITICAL: 1, LOW_STOCK: 2, DEAD_STOCK: 3 }
      return order[a.status] - order[b.status] || (a.estimatedDaysRemaining ?? 9999) - (b.estimatedDaysRemaining ?? 9999)
    })
    .map(a => ({
      inventoryId: a.inventoryId, productId: a.productId, productName: a.productName,
      sku: a.sku, locationId: a.locationId, status: a.status,
      availableQuantity: a.availableQuantity, minimumStock: a.minimumStock,
      averageDailySales: a.averageDailySales, estimatedDaysRemaining: a.estimatedDaysRemaining,
      recommendedQuantity: a.recommendedQuantity, stockOutRisk: a.stockOutRisk
    }))
}

/** Purchasing recommendations from inventory analyses. */
export function buildPurchaseRecommendations(analyses) {
  const recs = []
  for (const a of analyses) {
    if (!a.isActive) continue
    if (a.status === 'OUT_OF_STOCK' || a.status === 'CRITICAL') {
      recs.push({
        productId: a.productId, locationId: a.locationId,
        recommendationType: 'REORDER_NOW', priority: 'CRITICAL',
        currentStock: a.availableQuantity, averageDailySales: a.averageDailySales,
        estimatedDaysRemaining: a.estimatedDaysRemaining,
        recommendedQuantity: Math.max(a.recommendedQuantity, a.minimumStock || 10),
        reason: a.status === 'OUT_OF_STOCK'
          ? `Product is out of stock${a.averageDailySales > 0 ? ` with ${a.averageDailySales}/day demand` : ''}.`
          : `Only ${a.availableQuantity} left (minimum ${a.minimumStock}), ~${a.estimatedDaysRemaining} days remaining.`
      })
    } else if (a.status === 'LOW_STOCK' || (a.estimatedDaysRemaining !== null && a.estimatedDaysRemaining <= 21 && a.averageDailySales > 0)) {
      recs.push({
        productId: a.productId, locationId: a.locationId,
        recommendationType: 'REORDER_SOON', priority: 'HIGH',
        currentStock: a.availableQuantity, averageDailySales: a.averageDailySales,
        estimatedDaysRemaining: a.estimatedDaysRemaining,
        recommendedQuantity: a.recommendedQuantity,
        reason: `Approaching reorder point (~${a.estimatedDaysRemaining} days of stock left).`
      })
    } else if (a.status === 'OVERSTOCK') {
      recs.push({
        productId: a.productId, locationId: a.locationId,
        recommendationType: 'OVERSTOCK', priority: 'LOW',
        currentStock: a.availableQuantity, averageDailySales: a.averageDailySales,
        estimatedDaysRemaining: a.estimatedDaysRemaining, recommendedQuantity: 0,
        reason: `Stock (${a.availableQuantity}) far exceeds minimum (${a.minimumStock}) relative to demand.`
      })
    } else if (a.status === 'DEAD_STOCK') {
      recs.push({
        productId: a.productId, locationId: a.locationId,
        recommendationType: 'DEAD_STOCK', priority: 'LOW',
        currentStock: a.availableQuantity, averageDailySales: 0,
        estimatedDaysRemaining: null, recommendedQuantity: 0,
        reason: `No sales in ${a.lastSaleDaysAgo} days — consider promotion or redistribution.`
      })
    } else if (a.averageDailySales > 0 && a.estimatedDaysRemaining !== null && a.estimatedDaysRemaining <= 45 && a.estimatedDaysRemaining > 21) {
      recs.push({
        productId: a.productId, locationId: a.locationId,
        recommendationType: 'FAST_MOVING', priority: 'MEDIUM',
        currentStock: a.availableQuantity, averageDailySales: a.averageDailySales,
        estimatedDaysRemaining: a.estimatedDaysRemaining,
        recommendedQuantity: a.recommendedQuantity,
        reason: `Healthy but fast-moving (~${a.averageDailySales}/day) — plan replenishment.`
      })
    }
  }
  const prio = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
  return recs.sort((a, b) => prio[a.priority] - prio[b.priority])
}