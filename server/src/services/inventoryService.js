/**
 * Inventory Service
 */
import prisma from '../config/prisma.js'
import { ApiError } from '../middleware/errorHandler.js'
import { createAuditLog } from './auditService.js'

export async function getInventory({ page = 1, limit = 20, productId, locationId }) {
  page = parseInt(page) || 1
  limit = parseInt(limit) || 20
  const where = {}
  if (productId) where.productId = productId
  if (locationId) where.locationId = locationId

  const [items, total] = await Promise.all([
    prisma.inventory.findMany({
      where,
      include: { product: { select: { id: true, name: true, sku: true } }, location: { select: { id: true, name: true } } },
      skip: (page - 1) * limit, take: limit
    }),
    prisma.inventory.count({ where })
  ])
  return { data: items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
}

export async function getStockMovements({ page = 1, limit = 50, productId, locationId, type }) {
  const safeLimit = Math.min(Math.max(1, limit), 100)
  const where = {}
  if (productId) where.productId = productId
  if (locationId) where.locationId = locationId
  if (type) where.type = type
  if (!productId) {
    const products = await prisma.product.findMany({ select: { id: true } })
    where.productId = { in: products.map((product) => product.id) }
  }

  const [movements, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      include: { product: { select: { id: true, name: true, sku: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * safeLimit,
      take: safeLimit
    }),
    prisma.stockMovement.count({ where })
  ])
  return { data: movements, pagination: { page, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) } }
}

export async function adjustStock({ productId, locationId, adjustmentType, quantity, reason, notes, userId }) {
  return prisma.$transaction(async (tx) => {
    let inv = await tx.inventory.findUnique({ where: { productId_locationId: { productId, locationId } } })
    if (!inv) { inv = await tx.inventory.create({ data: { productId, locationId, quantity: 0, reservedQuantity: 0, availableQuantity: 0 } }) }
    const previousQuantity = Number(inv.quantity)
    let newQty = Number(inv.quantity)
    let mType
    if (adjustmentType === 'IN') { newQty += quantity; mType = 'ADJUSTMENT_IN' }
    else if (adjustmentType === 'OUT') { if (inv.availableQuantity < quantity) throw new ApiError(400, 'Insufficient stock'); newQty -= quantity; mType = 'ADJUSTMENT_OUT' }
    else if (adjustmentType === 'SET') { newQty = quantity; mType = 'ADJUSTMENT_IN' }
    else throw new ApiError(400, 'Invalid type')
    await tx.inventory.update({ where: { id: inv.id }, data: { quantity: newQty, availableQuantity: newQty - inv.reservedQuantity } })
    // Keep product-level stock in sync with location inventory adjustments
    const delta = newQty - previousQuantity
    if (delta !== 0) {
      await tx.product.update({ where: { id: productId }, data: { stockQuantity: delta > 0 ? { increment: delta } : { decrement: -delta } } })
    }
    await tx.stockMovement.create({
      data: {
        productId, locationId, type: mType, quantity,
        previousQuantity, resultingQuantity: newQty,
        referenceType: 'ADJUSTMENT', reason, notes, userId
      }
    })
    await createAuditLog({ db: tx, userId, action: 'STOCK_ADJUSTED', entity: 'Inventory', entityId: inv.id, details: { productId, from: previousQuantity, to: newQty, reason } })
    return tx.inventory.findUnique({ where: { id: inv.id }, include: { product: true, location: true } })
  })
}

export async function transferStock({ fromLocationId, toLocationId, items, notes, createdBy }) {
  if (fromLocationId === toLocationId) throw new ApiError(400, 'Locations must differ')
  return prisma.$transaction(async (tx) => {
    const count = await tx.stockTransfer.count()
    const trf = await tx.stockTransfer.create({ data: { transferNumber: 'TRF-' + String(count + 1).padStart(4, '0'), fromLocationId, toLocationId, status: 'PENDING', notes, createdBy } })
    for (const item of items) {
      const src = await tx.inventory.findUnique({ where: { productId_locationId: { productId: item.productId, locationId: fromLocationId } } })
      if (!src || src.quantity < item.quantity) throw new ApiError(400, 'Insufficient stock')
      await tx.inventory.update({ where: { id: src.id }, data: { quantity: src.quantity - item.quantity, availableQuantity: src.quantity - item.quantity - src.reservedQuantity } })
      let dst = await tx.inventory.findUnique({ where: { productId_locationId: { productId: item.productId, locationId: toLocationId } } })
      if (dst) { await tx.inventory.update({ where: { id: dst.id }, data: { quantity: Number(dst.quantity) + item.quantity, availableQuantity: Number(dst.quantity) + item.quantity - dst.reservedQuantity } }) }
      else { await tx.inventory.create({ data: { productId: item.productId, locationId: toLocationId, quantity: item.quantity, availableQuantity: item.quantity } }) }
      await tx.stockTransferItem.create({ data: { transferId: trf.id, productId: item.productId, quantity: item.quantity } })
      await tx.stockMovement.create({ data: { productId: item.productId, locationId: fromLocationId, type: 'TRANSFER_OUT', quantity: item.quantity, referenceType: 'TRANSFER', referenceId: trf.id } })
      await tx.stockMovement.create({ data: { productId: item.productId, locationId: toLocationId, type: 'TRANSFER_IN', quantity: item.quantity, referenceType: 'TRANSFER', referenceId: trf.id } })
    }
    await tx.stockTransfer.update({ where: { id: trf.id }, data: { status: 'COMPLETED' } })
    await createAuditLog({ db: tx, userId: createdBy, action: 'STOCK_TRANSFERRED', entity: 'StockTransfer', entityId: trf.id, details: { transferNumber: trf.transferNumber } })
    return tx.stockTransfer.findUnique({ where: { id: trf.id }, include: { items: true, fromLocation: true, toLocation: true } })
  })
}

export default { getInventory, adjustStock, transferStock, getStockMovements }