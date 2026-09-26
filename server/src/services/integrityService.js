/**
 * Inventory Integrity Checker
 * Reports problems without destroying data
 */
import prisma from '../config/prisma.js'
import { ApiError } from '../middleware/errorHandler.js'
import { createAuditLog } from './auditService.js'

export async function checkInventoryIntegrity() {
  const issues = []

  const inventories = await prisma.inventory.findMany({
    include: { product: { select: { id: true, name: true, sku: true } }, location: { select: { id: true, name: true } } }
  })

  // Duplicate product/location pairs (should be impossible with unique constraint, still check)
  const seen = new Map()
  for (const inv of inventories) {
    const key = `${inv.productId}:${inv.locationId}`
    if (seen.has(key)) {
      issues.push({
        code: 'DUPLICATE_INVENTORY',
        severity: 'CRITICAL',
        message: `Duplicate inventory for product ${inv.product?.name} at ${inv.location?.name}`,
        inventoryId: inv.id,
        otherId: seen.get(key)
      })
    } else {
      seen.set(key, inv.id)
    }

    if (inv.availableQuantity < 0) {
      issues.push({
        code: 'NEGATIVE_AVAILABLE',
        severity: 'CRITICAL',
        message: `Negative available quantity for ${inv.product?.name}`,
        inventoryId: inv.id,
        value: inv.availableQuantity
      })
    }

    if (inv.quantity < 0) {
      issues.push({
        code: 'NEGATIVE_QUANTITY',
        severity: 'CRITICAL',
        message: `Negative quantity for ${inv.product?.name}`,
        inventoryId: inv.id,
        value: inv.quantity
      })
    }

    if (inv.reservedQuantity > inv.quantity) {
      issues.push({
        code: 'RESERVED_EXCEEDS_QUANTITY',
        severity: 'WARNING',
        message: `Reserved (${inv.reservedQuantity}) > quantity (${inv.quantity}) for ${inv.product?.name}`,
        inventoryId: inv.id
      })
    }

    const expectedAvailable = inv.quantity - inv.reservedQuantity
    if (inv.availableQuantity !== expectedAvailable) {
      issues.push({
        code: 'INCORRECT_AVAILABLE',
        severity: 'WARNING',
        message: `Available quantity mismatch for ${inv.product?.name}: stored ${inv.availableQuantity}, expected ${expectedAvailable}`,
        inventoryId: inv.id,
        stored: inv.availableQuantity,
        expected: expectedAvailable
      })
    }
  }

  // Orphaned stock movements (invalid product)
  const movements = await prisma.stockMovement.findMany({ select: { id: true, productId: true, locationId: true }, take: 5000 })
  const productIds = new Set((await prisma.product.findMany({ select: { id: true } })).map((p) => p.id))
  const locationIds = new Set((await prisma.location.findMany({ select: { id: true } })).map((l) => l.id))

  for (const m of movements) {
    if (!productIds.has(m.productId)) {
      issues.push({ code: 'ORPHAN_MOVEMENT_PRODUCT', severity: 'WARNING', message: `Stock movement ${m.id} references missing product`, movementId: m.id })
    }
    if (!locationIds.has(m.locationId)) {
      issues.push({ code: 'ORPHAN_MOVEMENT_LOCATION', severity: 'WARNING', message: `Stock movement ${m.id} references missing location`, movementId: m.id })
    }
  }

  // Invalid inventory product/location refs
  for (const inv of inventories) {
    if (!productIds.has(inv.productId)) {
      issues.push({ code: 'INVALID_PRODUCT_REF', severity: 'CRITICAL', message: `Inventory ${inv.id} has invalid product`, inventoryId: inv.id })
    }
    if (!locationIds.has(inv.locationId)) {
      issues.push({ code: 'INVALID_LOCATION_REF', severity: 'CRITICAL', message: `Inventory ${inv.id} has invalid location`, inventoryId: inv.id })
    }
  }

  const summary = {
    totalChecked: inventories.length,
    issueCount: issues.length,
    critical: issues.filter((i) => i.severity === 'CRITICAL').length,
    warnings: issues.filter((i) => i.severity === 'WARNING').length,
    healthy: issues.length === 0
  }

  return { summary, issues }
}

export async function repairAvailableQuantities({ userId, ipAddress }) {
  const inventories = await prisma.inventory.findMany()
  let repaired = 0

  await prisma.$transaction(async (tx) => {
    for (const inv of inventories) {
      const expected = inv.quantity - inv.reservedQuantity
      if (inv.availableQuantity !== expected) {
        await tx.inventory.update({
          where: { id: inv.id },
          data: { availableQuantity: expected }
        })
        repaired++
      }
    }
  })

  await createAuditLog({
    userId,
    action: 'INVENTORY_REPAIR',
    entity: 'Inventory',
    details: { repaired, repairType: 'availableQuantity' },
    ipAddress
  })

  return { repaired }
}

export async function getInventoryAlerts({ overstockMultiplier } = {}) {
  let multiplier = overstockMultiplier
  if (!multiplier) {
    const setting = await prisma.setting.findUnique({ where: { key: 'overstock_multiplier' } })
    multiplier = Number(setting?.value || 5)
  }

  const inventory = await prisma.inventory.findMany({
    include: {
      product: { select: { id: true, name: true, sku: true, minimumStock: true } },
      location: { select: { id: true, name: true } }
    }
  })

  const outOfStock = []
  const lowStock = []
  const overstock = []

  for (const inv of inventory) {
    const min = inv.product?.minimumStock ?? 0
    if (inv.availableQuantity <= 0) outOfStock.push(inv)
    else if (min > 0 && inv.availableQuantity <= min) lowStock.push(inv)
    if (min > 0 && inv.quantity > min * multiplier) overstock.push(inv)
  }

  const validProductIds = (await prisma.product.findMany({ select: { id: true } })).map((product) => product.id)
  const [recentAdjustments, recentTransfers, recentReceived] = await Promise.all([
    prisma.stockMovement.findMany({
      where: { type: { in: ['ADJUSTMENT_IN', 'ADJUSTMENT_OUT'] }, productId: { in: validProductIds } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { product: { select: { name: true, sku: true } } }
    }),
    prisma.stockTransfer.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { fromLocation: { select: { name: true } }, toLocation: { select: { name: true } } }
    }),
    prisma.stockMovement.findMany({
      where: { type: { in: ['PURCHASE_IN', 'RECEIVE'] }, productId: { in: validProductIds } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { product: { select: { name: true, sku: true } } }
    })
  ])

  return {
    outOfStock,
    lowStock,
    overstock,
    recentlyAdjusted: recentAdjustments,
    recentlyTransferred: recentTransfers,
    recentlyReceived: recentReceived
  }
}

export default { checkInventoryIntegrity, repairAvailableQuantities, getInventoryAlerts }
