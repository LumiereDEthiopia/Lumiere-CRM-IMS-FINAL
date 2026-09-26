/**
 * Purchase Service
 */
import prisma from '../config/prisma.js'
import { ApiError } from '../middleware/errorHandler.js'
import { createAuditLog } from './auditService.js'
import { moveItemStock } from './itemService.js'
import { postPurchaseEntry } from './accountingService.js'

export async function listPurchases({ page = 1, limit = 20, status, supplierId }) {
  page = parseInt(page) || 1
  limit = parseInt(limit) || 20
  const where = {}
  if (status) where.status = status
  if (supplierId) where.supplierId = supplierId
  const [purchases, total] = await Promise.all([
    prisma.purchase.findMany({ where, include: { supplier: { select: { id: true, name: true } }, location: { select: { id: true, name: true } }, _count: { select: { items: true } }, items: { include: { product: { select: { id: true, name: true } }, item: { select: { id: true, itemCode: true, name: true } } } } }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.purchase.count({ where })
  ])
  return { data: purchases, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
}

export async function createPurchase({ supplierId, locationId, items, notes, createdBy }) {
  if (!Array.isArray(items) || items.length === 0) throw new ApiError(400, 'At least one line is required')
  for (const item of items) {
    if (!item.productId && !item.itemId) throw new ApiError(400, 'Each purchase line needs a product or an inventory item')
    if (item.productId && item.itemId) throw new ApiError(400, 'A purchase line cannot reference both a product and an item')
    if (!(parseFloat(item.quantity) > 0)) throw new ApiError(400, 'Line quantity must be a positive number')
  }
  const count = await prisma.purchase.count()
  const purchaseNumber = 'PO-' + String(count + 1).padStart(4, '0')
  let subtotal = 0

  const purchase = await prisma.purchase.create({
    data: {
      purchaseNumber, supplierId, locationId, status: 'DRAFT', notes, createdBy,
      items: {
        create: items.map(item => {
          const lineTotal = parseFloat(item.unitCost) * item.quantity
          subtotal += lineTotal
          return {
            productId: item.productId || null,
            itemId: item.itemId || null,
            quantity: item.quantity,
            unitCost: parseFloat(item.unitCost),
            totalCost: lineTotal,
            supplierBatchNo: item.supplierBatchNo,
            notes: item.notes
          }
        })
      }
    }
  })

  await prisma.purchase.update({ where: { id: purchase.id }, data: { subtotal, total: subtotal } })
  return prisma.purchase.findUnique({ where: { id: purchase.id }, include: { items: true, supplier: true } })
}

export async function receivePurchase(id, receivedItems, userId) {
  return prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.findUnique({ where: { id }, include: { items: true } })
    if (!purchase) throw new ApiError(404, 'Purchase not found')

    for (const received of receivedItems) {
      const item = purchase.items.find(i => i.id === received.itemId)
      if (!item) continue

      const newReceived = item.receivedQuantity + received.quantity
      await tx.purchaseItem.update({ where: { id: item.id }, data: { receivedQuantity: newReceived } })

      if (item.itemId) {
        // Inventory item line — stock goes to ItemInventory with an
        // ITEM_PURCHASE movement (requirement 19).
        await moveItemStock(tx, {
          itemId: item.itemId,
          locationId: purchase.locationId,
          delta: received.quantity,
          type: 'ITEM_PURCHASE',
          referenceType: 'PURCHASE',
          referenceId: id,
          notes: received.notes || item.notes || item.supplierBatchNo || null,
          userId
        })
        continue
      }

      // Increase inventory
      let inv = await tx.inventory.findUnique({ where: { productId_locationId: { productId: item.productId, locationId: purchase.locationId } } })
      if (inv) {
        await tx.inventory.update({ where: { id: inv.id }, data: { quantity: Number(inv.quantity) + received.quantity, availableQuantity: Number(inv.quantity) + received.quantity - inv.reservedQuantity } })
      } else {
        await tx.inventory.create({ data: { productId: item.productId, locationId: purchase.locationId, quantity: received.quantity, availableQuantity: received.quantity } })
      }

      // Keep product-level stock in sync (gram products included)
      await tx.product.update({ where: { id: item.productId }, data: { stockQuantity: { increment: received.quantity } } })

      await tx.stockMovement.create({ data: { productId: item.productId, locationId: purchase.locationId, type: 'PURCHASE', quantity: received.quantity, referenceType: 'PURCHASE', referenceId: id, notes: received.notes || item.notes || item.supplierBatchNo || null } })
    }

    // Update purchase status
    const updatedItems = await tx.purchaseItem.findMany({ where: { purchaseId: id } })
    const allReceived = updatedItems.every(i => i.receivedQuantity >= i.quantity)
    const someReceived = updatedItems.some(i => i.receivedQuantity > 0)

    await tx.purchase.update({ where: { id }, data: { status: allReceived ? 'RECEIVED' : someReceived ? 'PARTIALLY_RECEIVED' : 'ORDERED' } })
    await createAuditLog({ db: tx, userId, action: 'PURCHASE_RECEIVED', entity: 'Purchase', entityId: id, details: { purchaseNumber: purchase.purchaseNumber } })

    return tx.purchase.findUnique({ where: { id }, include: { items: true } })
  }).then(async (updated) => {
    // Journal: Dr Inventory, Cr AP — posted once the purchase is fully received
    if (updated?.status === 'RECEIVED') {
      try { await postPurchaseEntry(updated) } catch (ledgerError) { console.error('Journal posting failed for purchase:', ledgerError.message) }
    }
    return updated
  })
}

export default { listPurchases, createPurchase, receivePurchase }