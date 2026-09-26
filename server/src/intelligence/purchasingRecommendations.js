/**
 * Smart Purchasing Recommendation Engine
 * Generates REORDER_NOW / REORDER_SOON / OVERSTOCK / DEAD_STOCK / FAST_MOVING
 * recommendations from inventory intelligence. Never auto-creates real purchases.
 */
import { buildRows } from './inventoryIntelligence.js'

function countByType(recs) {
  const counts = {}
  for (const r of recs) counts[r.recommendationType] = (counts[r.recommendationType] || 0) + 1
  return counts
}

function makeRec(type, priority, item, reason, qty) {
  return {
    productId: item.productId,
    productName: item.productName,
    sku: item.sku,
    locationId: item.locationId,
    locationName: item.locationName,
    recommendationType: type,
    priority,
    currentStock: item.availableQuantity,
    minimumStock: item.minimumStock,
    averageDailySales: item.forecast.avgDailySales,
    estimatedDaysRemaining: item.forecast.daysRemaining,
    recommendedQuantity: qty,
    reason,
    status: 'OPEN',
    createdAt: new Date().toISOString()
  }
}

export async function getPurchasingRecommendations(opts = {}) {
  const { items } = await buildRows({ pageSize: 100, ...opts })
  const recommendations = []

  for (const item of items) {
    const fc = item.forecast
    if (item.status === 'OUT_OF_STOCK' || item.status === 'CRITICAL') {
      recommendations.push(makeRec('REORDER_NOW', 'CRITICAL', item,
        item.status === 'OUT_OF_STOCK'
          ? 'Out of stock'
          : `Critically low stock — ${fc.daysRemaining !== null ? `${fc.daysRemaining} days remaining` : 'urgent'}`,
        item.recommendedReorderQty))
    } else if (item.status === 'LOW_STOCK') {
      recommendations.push(makeRec('REORDER_SOON', 'HIGH', item,
        `Below minimum stock — ${fc.daysRemaining !== null ? `${fc.daysRemaining} days remaining at current velocity` : 'low stock'}`,
        item.recommendedReorderQty))
    } else if (item.status === 'OVERSTOCK') {
      recommendations.push(makeRec('OVERSTOCK', 'MEDIUM', item,
        'Stock level significantly exceeds demand', 0))
    } else if (item.status === 'DEAD_STOCK') {
      recommendations.push(makeRec('DEAD_STOCK', 'LOW', item,
        `No sales in the last ${90} days — consider promotion or discontinuation`, 0))
    } else if (fc.trendDirection === 'GROWING' && fc.forecast30 > item.availableQuantity) {
      recommendations.push(makeRec('FAST_MOVING', 'MEDIUM', item,
        `Growing demand — 30-day forecast (${fc.forecast30} units) exceeds available stock (${item.availableQuantity})`,
        Math.max(0, fc.forecast30 - item.availableQuantity)))
    }
  }

  const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
  recommendations.sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9))

  return {
    recommendations,
    counts: countByType(recommendations),
    isEstimate: true,
    generatedAt: new Date().toISOString()
  }
}

/**
 * Persist recommendation snapshot to IntelligenceRecommendation (idempotent per day/type/product).
 */
export async function saveRecommendationSnapshot(recs) {
  const prisma = (await import('../config/prisma.js')).default
  let saved = 0
  for (const r of recs) {
    const existing = await prisma.intelligenceRecommendation.findFirst({
      where: {
        type: r.recommendationType,
        entityId: r.productId,
        status: 'OPEN',
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }
    })
    if (existing) continue
    await prisma.intelligenceRecommendation.create({
      data: {
        type: r.recommendationType,
        entityType: 'Product',
        entityId: r.productId,
        priority: r.priority,
        title: `${r.recommendationType}: ${r.productName}`,
        description: r.reason,
        payload: JSON.stringify(r)
      }
    })
    saved++
  }
  return saved
}

export default { getPurchasingRecommendations, saveRecommendationSnapshot }
