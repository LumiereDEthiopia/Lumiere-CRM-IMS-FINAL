/**
 * Item Service — bottles, packaging and every other business consumable.
 *
 * Design rules:
 *  - Stock lives ONLY in ItemInventory (per Location). Item itself never holds
 *    branch quantities.
 *  - Every quantity change writes an ItemMovement row (auditable) and runs in
 *    the same transaction as the change itself.
 *  - Consumable items are attached to Products via ProductItem; sales consume
 *    them (required items block the sale, optional items consume what exists).
 *  - SQLite/Turso compatible: no Prisma features outside standard support.
 */
import prisma from '../config/prisma.js'
import { ApiError } from '../middleware/errorHandler.js'
import { createAuditLog } from './auditService.js'

const toNum = (value) => {
  const n = parseFloat(value)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

// ============================ Categories ============================

export async function listItemCategories({ includeInactive = false } = {}) {
  return prisma.itemCategory.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { items: true } } }
  })
}

export async function createItemCategory({ name, description, sortOrder, isActive = true }, userId) {
  const clean = String(name || '').trim()
  if (!clean) throw new ApiError(400, 'Category name is required')
  const exists = await prisma.itemCategory.findFirst({ where: { name: clean }, select: { id: true } })
  if (exists) throw new ApiError(400, 'A category with this name already exists')
  const category = await prisma.itemCategory.create({
    data: { name: clean, description: description || null, sortOrder: parseInt(sortOrder) || 0, isActive: isActive !== false }
  })
  await createAuditLog({ userId, action: 'ITEM_CATEGORY_CREATED', entity: 'ItemCategory', entityId: category.id, details: { name: clean } })
  return category
}

export async function updateItemCategory(id, data, userId) {
  const category = await prisma.itemCategory.findUnique({ where: { id } })
  if (!category) throw new ApiError(404, 'Category not found')
  const payload = {}
  if (data.name !== undefined) {
    const clean = String(data.name).trim()
    if (!clean) throw new ApiError(400, 'Category name is required')
    const dupe = await prisma.itemCategory.findFirst({ where: { name: clean, id: { not: id } }, select: { id: true } })
    if (dupe) throw new ApiError(400, 'A category with this name already exists')
    payload.name = clean
  }
  if (data.description !== undefined) payload.description = data.description || null
  if (data.sortOrder !== undefined) payload.sortOrder = parseInt(data.sortOrder) || 0
  if (data.isActive !== undefined) payload.isActive = data.isActive === true || data.isActive === 'true'
  const updated = await prisma.itemCategory.update({ where: { id }, data: payload })
  await createAuditLog({ userId, action: 'ITEM_CATEGORY_UPDATED', entity: 'ItemCategory', entityId: id, details: payload })
  return updated
}

export async function deleteItemCategory(id, userId) {
  const category = await prisma.itemCategory.findUnique({ where: { id }, include: { _count: { select: { items: true } } } })
  if (!category) throw new ApiError(404, 'Category not found')
  if (category._count.items > 0) {
    throw new ApiError(400, `Category has ${category._count.items} item(s) — deactivate it instead of deleting`)
  }
  await prisma.itemCategory.delete({ where: { id } })
  await createAuditLog({ userId, action: 'ITEM_CATEGORY_DELETED', entity: 'ItemCategory', entityId: id, details: { name: category.name } })
  return { success: true }
}

// ============================== Items ==============================

export async function listItems({ page = 1, limit = 20, search, categoryId, categorySlug, locationId, isActive, stockStatus, sortBy = 'createdAt', sortOrder = 'desc' }) {
  page = parseInt(page) || 1
  limit = Math.min(Math.max(1, parseInt(limit) || 20), 100)
  const where = {}
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { itemCode: { contains: search } },
      { sku: { contains: search } },
      { barcode: { contains: search } }
    ]
  }
  if (categoryId) where.categoryId = categoryId
  else if (categorySlug) where.category = { name: categorySlug }
  if (isActive !== undefined && isActive !== '' && isActive !== null) where.isActive = isActive === true || isActive === 'true'

  // Low-stock / out-of-stock tabs: resolve matching item ids from ItemInventory
  if (stockStatus === 'LOW' || stockStatus === 'OUT') {
    const invWhere = stockStatus === 'OUT'
      ? { quantity: { lte: 0 } }
      : { quantity: { lte: prisma.itemInventory.fields.minimumStock } }
    const rows = await prisma.itemInventory.groupBy({ by: ['itemId'], where: invWhere })
    if (!rows.length) return { data: [], pagination: { page: 1, limit, total: 0, totalPages: 0 } }
    where.id = { in: rows.map((r) => r.itemId) }
  }

  const [items, total] = await Promise.all([
    prisma.item.findMany({
      where,
      orderBy: { [sortBy]: sortOrder === 'asc' ? 'asc' : 'desc' },
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.item.count({ where })
  ])

  const ids = items.map((i) => i.id)
  let stockByItem = {}
  let branchByItem = {}
  if (ids.length) {
    const invWhere = { itemId: { in: ids } }
    if (locationId) invWhere.locationId = locationId
    const [grouped, branchRows] = await Promise.all([
      prisma.itemInventory.groupBy({
        by: ['itemId'],
        where: invWhere,
        _sum: { quantity: true, availableQuantity: true },
        _count: { _all: true }
      }),
      locationId
        ? prisma.itemInventory.findMany({ where: { itemId: { in: ids }, locationId } })
        : Promise.resolve([])
    ])
    stockByItem = Object.fromEntries(grouped.map((g) => [g.itemId, {
      quantity: Number(g._sum.quantity || 0),
      available: Number(g._sum.availableQuantity || 0),
      branches: g._count._all
    }]))
    branchByItem = Object.fromEntries(branchRows.map((r) => [r.itemId, r]))
  }

  const data = items.map((item) => {
    const stock = stockByItem[item.id] || { quantity: 0, available: 0, branches: 0 }
    const branch = branchByItem[item.id]
    const minStock = branch ? Number(branch.minimumStock) : Number(item.minimumStock)
    const qty = branch ? Number(branch.quantity) : stock.quantity
    return {
      ...item,
      totalQuantity: stock.quantity,
      totalAvailable: stock.available,
      branchCount: stock.branches,
      branchQuantity: branch ? Number(branch.quantity) : undefined,
      branchAvailable: branch ? Number(branch.availableQuantity) : undefined,
      stockStatus: qty <= 0 ? 'OUT' : qty <= minStock ? 'LOW' : 'OK'
    }
  })
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
}

export async function getItem(id) {
  const item = await prisma.item.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true } },
      supplier: { select: { id: true, name: true, phone: true, email: true } },
      inventories: { include: { location: { select: { id: true, name: true, code: true } } }, orderBy: { quantity: 'desc' } },
      productItems: { include: { product: { select: { id: true, name: true, sku: true, size: true } } } },
      _count: { select: { movements: true, purchaseItems: true } }
    }
  })
  if (!item) throw new ApiError(404, 'Item not found')
  const totalQuantity = item.inventories.reduce((sum, inv) => sum + Number(inv.quantity), 0)
  return { ...item, totalQuantity }
}

export async function createItem(data, userId) {
  const { name, categoryId, itemCode, initialStock, ...rest } = data
  if (!String(name || '').trim()) throw new ApiError(400, 'Item name is required')
  if (!String(itemCode || '').trim()) throw new ApiError(400, 'Item code is required')
  if (!categoryId) throw new ApiError(400, 'Category is required')
  const category = await prisma.itemCategory.findUnique({ where: { id: categoryId } })
  if (!category) throw new ApiError(400, 'Invalid category')
  const dupe = await prisma.item.findFirst({ where: { itemCode: String(itemCode).trim() }, select: { id: true } })
  if (dupe) throw new ApiError(400, `Item code "${itemCode}" is already used`)

  const locations = Array.isArray(initialStock) ? initialStock.filter((s) => s && s.locationId) : []
  for (const entry of locations) {
    const location = await prisma.location.findUnique({ where: { id: entry.locationId } })
    if (!location) throw new ApiError(400, `Invalid location ${entry.locationId}`)
  }

  const minimumStock = toNum(rest.minimumStock)
  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.item.create({
      data: {
        itemCode: String(itemCode).trim(),
        name: String(name).trim(),
        description: rest.description || null,
        categoryId,
        brandName: rest.brandName || null,
        sku: rest.sku || null,
        barcode: rest.barcode || null,
        size: rest.size || null,
        volume: rest.volume !== undefined && rest.volume !== '' && rest.volume !== null ? parseFloat(rest.volume) : null,
        volumeUnit: rest.volumeUnit || null,
        unit: rest.unit || null,
        color: rest.color || null,
        material: rest.material || null,
        shape: rest.shape || null,
        neckSize: rest.neckSize || null,
        dimensions: rest.dimensions || null,
        packageType: rest.packageType || null,
        supplierId: rest.supplierId || null,
        costPrice: toNum(rest.costPrice),
        minimumStock,
        reorderQuantity: toNum(rest.reorderQuantity),
        imageUrl: rest.imageUrl || null,
        imageKey: rest.imageKey || null,
        notes: rest.notes || null,
        isActive: rest.isActive !== false
      }
    })
    for (const entry of locations) {
      const qty = toNum(entry.quantity)
      if (qty <= 0) continue
      await tx.itemInventory.create({
        data: { itemId: created.id, locationId: entry.locationId, quantity: qty, reservedQuantity: 0, availableQuantity: qty, minimumStock }
      })
      await tx.itemMovement.create({
        data: {
          itemId: created.id, locationId: entry.locationId, type: 'ITEM_INITIAL_STOCK',
          quantity: qty, previousQuantity: 0, resultingQuantity: qty,
          referenceType: 'ITEM_CREATE', referenceId: created.id, userId,
          reason: entry.notes || 'Initial stock'
        }
      })
    }
    await createAuditLog({ db: tx, userId, action: 'ITEM_CREATED', entity: 'Item', entityId: created.id, details: { itemCode: created.itemCode, name: created.name, initialStock: locations.filter((l) => toNum(l.quantity) > 0) } })
    return created
  })
  return getItem(item.id)
}

const EDITABLE_FIELDS = ['name', 'description', 'categoryId', 'brandName', 'sku', 'barcode', 'size', 'volume',
  'volumeUnit', 'unit', 'color', 'material', 'shape', 'neckSize', 'dimensions', 'packageType', 'supplierId',
  'costPrice', 'minimumStock', 'reorderQuantity', 'imageUrl', 'imageKey', 'notes', 'isActive']

export async function updateItem(id, data, userId) {
  const item = await prisma.item.findUnique({ where: { id } })
  if (!item) throw new ApiError(404, 'Item not found')
  const payload = {}
  for (const field of EDITABLE_FIELDS) {
    if (data[field] === undefined) continue
    if (field === 'name' && !String(data.name).trim()) throw new ApiError(400, 'Item name is required')
    if (field === 'categoryId') {
      const category = await prisma.itemCategory.findUnique({ where: { id: data.categoryId } })
      if (!category) throw new ApiError(400, 'Invalid category')
    }
    if (['costPrice', 'minimumStock', 'reorderQuantity'].includes(field)) payload[field] = toNum(data[field])
    else if (field === 'volume') payload[field] = data.volume === '' || data.volume === null ? null : parseFloat(data.volume)
    else if (field === 'isActive') payload[field] = data.isActive === true || data.isActive === 'true'
    else payload[field] = data[field] === '' ? null : data[field]
  }
  if (Object.keys(payload).length === 0) throw new ApiError(400, 'Nothing to update')
  const updated = await prisma.item.update({ where: { id }, data: payload })
  await createAuditLog({
    userId,
    action: payload.isActive === false ? 'ITEM_DEACTIVATED' : 'ITEM_UPDATED',
    entity: 'Item',
    entityId: id,
    details: { itemCode: item.itemCode, changes: payload }
  })
  return getItem(updated.id)
}

export async function deleteItem(id, userId) {
  const item = await prisma.item.findUnique({
    where: { id },
    include: { _count: { select: { movements: true, inventories: true, productItems: true, purchaseItems: true, transferItems: true } } }
  })
  if (!item) throw new ApiError(404, 'Item not found')
  const used = item._count.movements + item._count.inventories + item._count.productItems + item._count.purchaseItems + item._count.transferItems
  if (used > 0) {
    throw new ApiError(400, 'Item has inventory history — deactivate it instead of deleting')
  }
  await prisma.item.delete({ where: { id } })
  await createAuditLog({ userId, action: 'ITEM_DELETED', entity: 'Item', entityId: id, details: { itemCode: item.itemCode, name: item.name } })
  return { success: true }
}

// ==================== Item inventory / movements ====================

/**
 * Core primitive: atomically move an item's stock at a location and record the
 * movement. `tx` must be a transaction client. Delta may be negative;
 * insufficient stock throws and rolls back unless `allowShortfall`.
 */
export async function moveItemStock(tx, { itemId, locationId, delta, type, referenceType, referenceId, reason, notes, userId, allowShortfall = false }) {
  let inv = await tx.itemInventory.findUnique({ where: { itemId_locationId: { itemId, locationId } } })
  if (!inv && delta > 0) {
    inv = await tx.itemInventory.create({ data: { itemId, locationId, quantity: 0, reservedQuantity: 0, availableQuantity: 0 } })
  }
  if (!inv) {
    if (allowShortfall) return null
    throw new ApiError(400, `No inventory record for item ${itemId} at location ${locationId}`)
  }
  const previousQuantity = Number(inv.quantity)
  let newQty = previousQuantity + Number(delta)
  if (newQty < 0) {
    if (!allowShortfall) {
      throw new ApiError(400, `Insufficient item stock at this branch (needs ${Math.abs(delta)}, has ${previousQuantity})`)
    }
    newQty = 0
  }
  await tx.itemInventory.update({
    where: { id: inv.id },
    data: { quantity: newQty, availableQuantity: newQty - Number(inv.reservedQuantity) }
  })
  await tx.itemMovement.create({
    data: {
      itemId, locationId, type, quantity: Math.abs(Number(delta)),
      previousQuantity, resultingQuantity: newQty,
      referenceType: referenceType || null, referenceId: referenceId || null,
      reason: reason || null, notes: notes || null, userId: userId || null
    }
  })
  return { previousQuantity, resultingQuantity: newQty }
}

export async function listItemInventory({ page = 1, limit = 50, itemId, locationId, stockStatus }) {
  page = parseInt(page) || 1
  limit = Math.min(Math.max(1, parseInt(limit) || 50), 200)
  const where = {}
  if (itemId) where.itemId = itemId
  if (locationId) where.locationId = locationId
  if (stockStatus === 'OUT') where.quantity = { lte: 0 }
  else if (stockStatus === 'LOW') where.quantity = { lte: prisma.itemInventory.fields.minimumStock, gt: 0 }
  const [rows, total] = await Promise.all([
    prisma.itemInventory.findMany({
      where,
      include: {
        item: { select: { id: true, itemCode: true, name: true, size: true, color: true, unit: true, costPrice: true, isActive: true, category: { select: { id: true, name: true } } } },
        location: { select: { id: true, name: true, code: true } }
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.itemInventory.count({ where })
  ])
  const data = rows.map((row) => ({
    ...row,
    quantity: Number(row.quantity),
    availableQuantity: Number(row.availableQuantity),
    minimumStock: Number(row.minimumStock),
    stockStatus: Number(row.quantity) <= 0 ? 'OUT' : Number(row.quantity) <= Number(row.minimumStock) ? 'LOW' : 'OK'
  }))
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
}

export async function getItemInventory(id) {
  const row = await prisma.itemInventory.findUnique({
    where: { id },
    include: {
      item: { select: { id: true, itemCode: true, name: true, size: true, color: true, unit: true } },
      location: { select: { id: true, name: true, code: true } }
    }
  })
  if (!row) throw new ApiError(404, 'Inventory record not found')
  return { ...row, quantity: Number(row.quantity), availableQuantity: Number(row.availableQuantity) }
}

export async function listItemMovements({ page = 1, limit = 50, itemId, locationId, type, dateFrom, dateTo }) {
  page = parseInt(page) || 1
  limit = Math.min(Math.max(1, parseInt(limit) || 50), 200)
  const where = {}
  if (itemId) where.itemId = itemId
  if (locationId) where.locationId = locationId
  if (type) where.type = type
  if (dateFrom || dateTo) {
    where.createdAt = {}
    if (dateFrom) where.createdAt.gte = new Date(dateFrom)
    if (dateTo) where.createdAt.lte = new Date(dateTo + 'T23:59:59.999')
  }
  const [movements, total] = await Promise.all([
    prisma.itemMovement.findMany({
      where,
      include: {
        item: { select: { id: true, itemCode: true, name: true, size: true, color: true } },
        location: { select: { id: true, name: true, code: true } }
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.itemMovement.count({ where })
  ])
  return { data: movements, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
}

export async function adjustItemStock({ itemId, locationId, adjustmentType, quantity, reason, notes, userId }) {
  const qty = Math.abs(parseFloat(quantity))
  if (!(qty > 0)) throw new ApiError(400, 'Quantity must be a positive number')
  return prisma.$transaction(async (tx) => {
    const inv = await tx.itemInventory.findUnique({ where: { itemId_locationId: { itemId, locationId } } })
    let result
    if (adjustmentType === 'IN') {
      result = await moveItemStock(tx, { itemId, locationId, delta: qty, type: 'ITEM_ADJUSTMENT_IN', reason, notes, userId, referenceType: 'ADJUSTMENT' })
    } else if (adjustmentType === 'OUT') {
      result = await moveItemStock(tx, { itemId, locationId, delta: -qty, type: 'ITEM_ADJUSTMENT_OUT', reason, notes, userId, referenceType: 'ADJUSTMENT' })
    } else if (adjustmentType === 'SET') {
      const target = parseFloat(quantity)
      if (!Number.isFinite(target) || target < 0) throw new ApiError(400, 'Invalid quantity')
      const delta = target - Number(inv ? inv.quantity : 0)
      result = await moveItemStock(tx, {
        itemId, locationId, delta,
        type: delta >= 0 ? 'ITEM_ADJUSTMENT_IN' : 'ITEM_ADJUSTMENT_OUT',
        reason: reason || 'Stock set', notes, userId, referenceType: 'ADJUSTMENT'
      })
    } else {
      throw new ApiError(400, 'adjustmentType must be IN, OUT or SET')
    }
    await createAuditLog({
      db: tx, userId, action: 'ITEM_STOCK_ADJUSTED', entity: 'ItemInventory',
      entityId: inv ? inv.id : null,
      details: { itemId, locationId, adjustmentType, quantity: qty, from: result.previousQuantity, to: result.resultingQuantity, reason }
    })
    return tx.itemInventory.findUnique({ where: { itemId_locationId: { itemId, locationId } }, include: { item: { select: { id: true, itemCode: true, name: true } }, location: { select: { id: true, name: true } } } })
  })
}

// ==================== Item transfers between branches ====================

export async function createItemTransfer({ fromLocationId, toLocationId, items, notes, createdBy }) {
  if (!fromLocationId || !toLocationId) throw new ApiError(400, 'Source and destination locations are required')
  if (fromLocationId === toLocationId) throw new ApiError(400, 'Source and destination locations must differ')
  if (!Array.isArray(items) || items.length === 0) throw new ApiError(400, 'At least one item line is required')
  const [from, to] = await Promise.all([
    prisma.location.findUnique({ where: { id: fromLocationId } }),
    prisma.location.findUnique({ where: { id: toLocationId } })
  ])
  if (!from) throw new ApiError(400, 'Invalid source location')
  if (!to) throw new ApiError(400, 'Invalid destination location')
  const itemIds = items.map((i) => i.itemId)
  const known = await prisma.item.findMany({ where: { id: { in: itemIds } }, select: { id: true } })
  if (known.length !== new Set(itemIds).size) throw new ApiError(400, 'One or more items do not exist')

  const count = await prisma.itemTransfer.count()
  const transfer = await prisma.itemTransfer.create({
    data: {
      transferNumber: 'ITR-' + String(count + 1).padStart(4, '0'),
      fromLocationId, toLocationId, status: 'PENDING', notes, createdBy,
      items: { create: items.map((i) => ({ itemId: i.itemId, quantity: toNum(i.quantity) })) }
    }
  })
  await createAuditLog({ userId: createdBy, action: 'ITEM_TRANSFER_CREATED', entity: 'ItemTransfer', entityId: transfer.id, details: { transferNumber: transfer.transferNumber, from: from.name, to: to.name, lines: items.length } })
  return getItemTransfer(transfer.id)
}

export async function completeItemTransfer(id, userId) {
  return prisma.$transaction(async (tx) => {
    const transfer = await tx.itemTransfer.findUnique({ where: { id }, include: { items: true, fromLocation: { select: { name: true } }, toLocation: { select: { name: true } } } })
    if (!transfer) throw new ApiError(404, 'Transfer not found')
    if (transfer.status !== 'PENDING') throw new ApiError(400, `Only PENDING transfers can be completed (status: ${transfer.status})`)

    for (const line of transfer.items) {
      await moveItemStock(tx, {
        itemId: line.itemId, locationId: transfer.fromLocationId, delta: -Number(line.quantity),
        type: 'ITEM_TRANSFER_OUT', referenceType: 'ITEM_TRANSFER', referenceId: transfer.id, userId
      })
      await moveItemStock(tx, {
        itemId: line.itemId, locationId: transfer.toLocationId, delta: Number(line.quantity),
        type: 'ITEM_TRANSFER_IN', referenceType: 'ITEM_TRANSFER', referenceId: transfer.id, userId
      })
    }
    await tx.itemTransfer.update({ where: { id }, data: { status: 'COMPLETED', completedAt: new Date() } })
    await createAuditLog({ db: tx, userId, action: 'ITEM_TRANSFER_COMPLETED', entity: 'ItemTransfer', entityId: id, details: { transferNumber: transfer.transferNumber, from: transfer.fromLocation.name, to: transfer.toLocation.name, lines: transfer.items.length } })
    return getItemTransfer(id)
  })
}

export async function cancelItemTransfer(id, userId) {
  return prisma.$transaction(async (tx) => {
    const transfer = await tx.itemTransfer.findUnique({ where: { id } })
    if (!transfer) throw new ApiError(404, 'Transfer not found')
    if (transfer.status !== 'PENDING') throw new ApiError(400, `Only PENDING transfers can be cancelled (status: ${transfer.status})`)
    await tx.itemTransfer.update({ where: { id }, data: { status: 'CANCELLED' } })
    // Cancelled transfers never modify inventory.
    await createAuditLog({ db: tx, userId, action: 'ITEM_TRANSFER_CANCELLED', entity: 'ItemTransfer', entityId: id, details: { transferNumber: transfer.transferNumber } })
    return getItemTransfer(id)
  })
}

export async function listItemTransfers({ page = 1, limit = 20, status, fromLocationId, toLocationId }) {
  page = parseInt(page) || 1
  limit = Math.min(Math.max(1, parseInt(limit) || 20), 100)
  const where = {}
  if (status) where.status = status
  if (fromLocationId) where.fromLocationId = fromLocationId
  if (toLocationId) where.toLocationId = toLocationId
  const [transfers, total] = await Promise.all([
    prisma.itemTransfer.findMany({
      where,
      include: {
        fromLocation: { select: { id: true, name: true, code: true } },
        toLocation: { select: { id: true, name: true, code: true } },
        items: { include: { item: { select: { id: true, itemCode: true, name: true, size: true, color: true } } } }
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.itemTransfer.count({ where })
  ])
  return { data: transfers, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
}

export async function getItemTransfer(id) {
  const transfer = await prisma.itemTransfer.findUnique({
    where: { id },
    include: {
      fromLocation: { select: { id: true, name: true, code: true } },
      toLocation: { select: { id: true, name: true, code: true } },
      items: { include: { item: { select: { id: true, itemCode: true, name: true, size: true, color: true, unit: true } } } }
    }
  })
  if (!transfer) throw new ApiError(404, 'Transfer not found')
  return transfer
}

// ==================== Sale-time item consumption ====================

/**
 * Validate + consume the items configured on sold products. Runs INSIDE the
 * sale transaction (`tx`). Required items with insufficient stock throw —
 * which rolls the whole sale back. Optional items consume whatever is
 * available and note the shortfall.
 *
 * Formula (requirement 33): totalConsumption = Σ (saleLine.quantity × productItem.quantity)
 */
export async function consumeItemsForSale(tx, { saleId, locationId, lines, userId }) {
  const productIds = [...new Set(lines.map((l) => l.productId))]
  if (!productIds.length) return []
  const configs = await tx.productItem.findMany({
    where: { productId: { in: productIds } },
    include: { item: { select: { id: true, name: true, isActive: true } } }
  })
  if (!configs.length) return []

  const needByItem = new Map()
  for (const config of configs) {
    const item = config.item
    if (!item) continue
    if (!item.isActive) {
      if (config.isRequired) throw new ApiError(400, `Required item "${item.name}" is inactive — reactivate it or update the product's item list`)
      continue
    }
    for (const line of lines) {
      if (line.productId !== config.productId) continue
      const add = Number(line.quantity) * Number(config.quantity)
      if (!(add > 0)) continue
      const entry = needByItem.get(config.itemId) || { itemId: config.itemId, name: item.name, required: false, quantity: 0 }
      entry.required = entry.required || config.isRequired
      entry.quantity += add
      needByItem.set(config.itemId, entry)
    }
  }

  const consumed = []
  for (const { itemId, name, required, quantity } of needByItem.values()) {
    const inv = await tx.itemInventory.findUnique({ where: { itemId_locationId: { itemId, locationId } } })
    const available = inv ? Number(inv.availableQuantity) : 0
    if (available < quantity) {
      if (required) {
        throw new ApiError(400, `Insufficient stock for item "${name}" at this branch — need ${quantity}, available ${available}. Sale cancelled.`)
      }
      if (available <= 0) continue
    }
    const use = Math.min(available, quantity)
    const result = await moveItemStock(tx, {
      itemId, locationId, delta: -use, type: 'ITEM_SALE_CONSUMPTION',
      referenceType: 'SALE', referenceId: saleId, userId,
      notes: use < quantity ? `Partial consumption — needed ${quantity}` : null,
      allowShortfall: false
    })
    consumed.push({ itemId, name, consumed: use, resultingQuantity: result.resultingQuantity })
  }
  if (consumed.length) {
    await createAuditLog({ db: tx, userId, action: 'ITEMS_CONSUMED_BY_SALE', entity: 'Sale', entityId: saleId, details: { locationId, items: consumed } })
  }
  return consumed
}

/**
 * Pre-validation for the sale transaction: throws before the sale row is
 * created if any REQUIRED item would run short. Cheap aggregate check —
 * the authoritative per-line validation still happens in consumeItemsForSale.
 */
export async function validateItemsForSale(tx, { lines, locationId }) {
  const productIds = [...new Set(lines.map((l) => l.productId))]
  if (!productIds.length) return
  const configs = await tx.productItem.findMany({
    where: { productId: { in: productIds }, isRequired: true },
    include: { item: { select: { id: true, name: true, isActive: true } } }
  })
  if (!configs.length) return
  const needByItem = new Map()
  for (const config of configs) {
    const item = config.item
    if (!item || !item.isActive) continue
    for (const line of lines) {
      if (line.productId !== config.productId) continue
      const add = Number(line.quantity) * Number(config.quantity)
      needByItem.set(config.itemId, (needByItem.get(config.itemId) || 0) + add)
    }
  }
  for (const [itemId, need] of needByItem) {
    const inv = await tx.itemInventory.findUnique({ where: { itemId_locationId: { itemId, locationId } } })
    const available = inv ? Number(inv.availableQuantity) : 0
    if (available < need) {
      const item = configs.find((c) => c.itemId === itemId)?.item
      throw new ApiError(400, `Insufficient stock for item "${item?.name || itemId}" at this branch — need ${need}, available ${available}. Sale cancelled.`)
    }
  }
}

/**
 * Restore items consumed by a cancelled sale (ITEM_RETURN_IN), inside the
 * sale-cancellation transaction.
 */
export async function restoreItemsForSaleCancel(tx, { saleId, locationId, userId }) {
  const consumedMovements = await tx.itemMovement.findMany({
    where: { type: 'ITEM_SALE_CONSUMPTION', referenceType: 'SALE', referenceId: saleId }
  })
  if (!consumedMovements.length) return []
  const byItem = new Map()
  for (const movement of consumedMovements) {
    byItem.set(movement.itemId, (byItem.get(movement.itemId) || 0) + Number(movement.quantity))
  }
  const restored = []
  for (const [itemId, quantity] of byItem) {
    const result = await moveItemStock(tx, {
      itemId, locationId, delta: quantity, type: 'ITEM_RETURN_IN',
      referenceType: 'SALE_CANCEL', referenceId: saleId, userId,
      reason: 'Sale cancelled — items returned to stock'
    })
    restored.push({ itemId, restored: quantity, resultingQuantity: result.resultingQuantity })
  }
  await createAuditLog({ db: tx, userId, action: 'ITEMS_RETURNED_BY_SALE_CANCEL', entity: 'Sale', entityId: saleId, details: { locationId, items: restored } })
  return restored
}

// ==================== Product → Item relationships ====================

export async function listProductItems(productId) {
  const rows = await prisma.productItem.findMany({
    where: { productId },
    include: {
      item: {
        select: { id: true, itemCode: true, name: true, size: true, color: true, unit: true, isActive: true, category: { select: { id: true, name: true } } }
      }
    },
    orderBy: { createdAt: 'asc' }
  })
  const itemIds = rows.map((r) => r.itemId)
  const grouped = itemIds.length
    ? await prisma.itemInventory.groupBy({ by: ['itemId'], where: { itemId: { in: itemIds } }, _sum: { quantity: true } })
    : []
  const stockByItem = Object.fromEntries(grouped.map((g) => [g.itemId, Number(g._sum.quantity || 0)]))
  return rows.map((row) => ({ ...row, itemTotalStock: stockByItem[row.itemId] ?? 0 }))
}

export async function setProductItems(productId, items, userId) {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, name: true } })
  if (!product) throw new ApiError(404, 'Product not found')
  if (!Array.isArray(items)) throw new ApiError(400, 'items must be an array')
  const itemIds = items.map((i) => i.itemId)
  const uniqueIds = new Set(itemIds)
  if (uniqueIds.size !== itemIds.length) throw new ApiError(400, 'Duplicate items in the list')
  if (itemIds.length) {
    const known = await prisma.item.findMany({ where: { id: { in: [...uniqueIds] } }, select: { id: true } })
    if (known.length !== uniqueIds.size) throw new ApiError(400, 'One or more items do not exist')
  }
  for (const entry of items) {
    const qty = parseFloat(entry.quantity)
    if (!Number.isFinite(qty) || qty <= 0) throw new ApiError(400, 'Item quantity must be a positive number')
  }

  const existing = await prisma.productItem.findMany({ where: { productId } })
  const existingById = Object.fromEntries(existing.map((r) => [r.itemId, r]))
  const incomingById = Object.fromEntries(items.map((i) => [i.itemId, i]))
  const added = items.filter((i) => !existingById[i.itemId]).map((i) => i.itemId)
  const removed = existing.filter((r) => !incomingById[r.itemId]).map((r) => r.itemId)
  const updated = items.filter((i) => {
    const prev = existingById[i.itemId]
    return prev && (Number(prev.quantity) !== parseFloat(i.quantity) || Boolean(prev.isRequired) !== (i.isRequired !== false))
  }).map((i) => i.itemId)

  return prisma.$transaction(async (tx) => {
    await tx.productItem.deleteMany({ where: { productId } })
    if (items.length) {
      await tx.productItem.createMany({
        data: items.map((i) => ({
          productId,
          itemId: i.itemId,
          quantity: parseFloat(i.quantity),
          isRequired: i.isRequired !== false,
          notes: i.notes || null
        }))
      })
    }
    await createAuditLog({
      db: tx, userId, action: 'PRODUCT_ITEMS_UPDATED', entity: 'Product', entityId: productId,
      details: { productName: product.name, added, removed, updated }
    })
    return listProductItems(productId)
  })
}

export async function addProductItem(productId, { itemId, quantity = 1, isRequired = true, notes }, userId) {
  const qty = parseFloat(quantity)
  if (!Number.isFinite(qty) || qty <= 0) throw new ApiError(400, 'Item quantity must be a positive number')
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, name: true } })
  if (!product) throw new ApiError(404, 'Product not found')
  const item = await prisma.item.findUnique({ where: { id: itemId }, select: { id: true, name: true } })
  if (!item) throw new ApiError(400, 'Item not found')
  const dupe = await prisma.productItem.findUnique({ where: { productId_itemId: { productId, itemId } } })
  if (dupe) throw new ApiError(400, 'This item is already attached to the product')
  const created = await prisma.productItem.create({
    data: { productId, itemId, quantity: qty, isRequired: isRequired !== false, notes: notes || null }
  })
  await createAuditLog({ userId, action: 'PRODUCT_ITEM_ADDED', entity: 'Product', entityId: productId, details: { productName: product.name, itemId, itemName: item.name, quantity: qty, isRequired: created.isRequired } })
  return created
}

export async function updateProductItemRow(productId, itemId, data, userId) {
  const row = await prisma.productItem.findUnique({ where: { productId_itemId: { productId, itemId } }, include: { item: { select: { name: true } } } })
  if (!row) throw new ApiError(404, 'Product item relationship not found')
  const payload = {}
  if (data.quantity !== undefined) {
    const qty = parseFloat(data.quantity)
    if (!Number.isFinite(qty) || qty <= 0) throw new ApiError(400, 'Item quantity must be a positive number')
    payload.quantity = qty
  }
  if (data.isRequired !== undefined) payload.isRequired = data.isRequired === true || data.isRequired === 'true'
  if (data.notes !== undefined) payload.notes = data.notes || null
  const updated = await prisma.productItem.update({ where: { productId_itemId: { productId, itemId } }, data: payload })
  await createAuditLog({ userId, action: 'PRODUCT_ITEM_UPDATED', entity: 'Product', entityId: productId, details: { itemId, itemName: row.item.name, changes: payload } })
  return updated
}

export async function removeProductItemRow(productId, itemId, userId) {
  const row = await prisma.productItem.findUnique({ where: { productId_itemId: { productId, itemId } }, include: { item: { select: { name: true } } } })
  if (!row) throw new ApiError(404, 'Product item relationship not found')
  await prisma.productItem.delete({ where: { productId_itemId: { productId, itemId } } })
  await createAuditLog({ userId, action: 'PRODUCT_ITEM_REMOVED', entity: 'Product', entityId: productId, details: { itemId, itemName: row.item.name, quantity: Number(row.quantity) } })
  return { success: true }
}

// ==================== Reports & dashboard ====================

export async function getItemStats() {
  const [totalItems, categories, lowRows, outRows, units] = await Promise.all([
    prisma.item.count({ where: { isActive: true } }),
    prisma.itemCategory.findMany({
      where: { isActive: true },
      include: { _count: { select: { items: { where: { isActive: true } } } } },
      orderBy: { sortOrder: 'asc' }
    }),
    prisma.itemInventory.groupBy({ by: ['itemId'], where: { quantity: { lte: prisma.itemInventory.fields.minimumStock, gt: 0 } } }),
    prisma.itemInventory.groupBy({ by: ['itemId'], where: { quantity: { lte: 0 } } }),
    prisma.itemInventory.aggregate({ _sum: { quantity: true } })
  ])
  return {
    totalItemTypes: totalItems,
    totalCategories: categories.length,
    byCategory: categories.map((c) => ({ id: c.id, name: c.name, count: c._count.items })),
    lowStockItems: lowRows.length,
    outOfStockItems: outRows.length,
    totalItemUnits: Number(units._sum.quantity || 0)
  }
}

export async function getItemConsumptionReport({ dateFrom, dateTo, locationId, itemId, categoryId } = {}) {
  const where = { type: 'ITEM_SALE_CONSUMPTION' }
  if (dateFrom || dateTo) {
    where.createdAt = {}
    if (dateFrom) where.createdAt.gte = new Date(dateFrom)
    if (dateTo) where.createdAt.lte = new Date(dateTo + 'T23:59:59.999')
  }
  if (locationId) where.locationId = locationId
  if (itemId) where.itemId = itemId
  if (categoryId) where.item = { categoryId }

  const [grouped, items] = await Promise.all([
    prisma.itemMovement.groupBy({ by: ['itemId'], where, _sum: { quantity: true }, _count: { _all: true } }),
    prisma.item.findMany({
      where: grouped.length ? { id: { in: grouped.map((g) => g.itemId) } } : { id: { in: ['-'] } },
      select: { id: true, itemCode: true, name: true, size: true, color: true, unit: true, category: { select: { name: true } } }
    })
  ])
  const byItem = Object.fromEntries(items.map((i) => [i.id, i]))
  return grouped
    .map((g) => ({
      item: byItem[g.itemId] || { id: g.itemId, name: 'Unknown item' },
      consumed: Number(g._sum.quantity || 0),
      movements: g._count._all
    }))
    .sort((a, b) => b.consumed - a.consumed)
}

export async function getBranchItemReport({ categoryId, isActive = true } = {}) {
  const locations = await prisma.location.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } })
  const items = await prisma.item.findMany({
    where: {
      ...(isActive === true || isActive === 'true' ? { isActive: true } : {}),
      ...(categoryId ? { categoryId } : {})
    },
    select: { id: true, itemCode: true, name: true, size: true, color: true, unit: true, category: { select: { name: true } } },
    orderBy: { name: 'asc' }
  })
  const inventories = items.length
    ? await prisma.itemInventory.findMany({ where: { itemId: { in: items.map((i) => i.id) } }, select: { itemId: true, locationId: true, quantity: true } })
    : []
  const stock = new Map()
  for (const inv of inventories) {
    const row = stock.get(inv.itemId) || {}
    row[inv.locationId] = (row[inv.locationId] || 0) + Number(inv.quantity)
    stock.set(inv.itemId, row)
  }
  return {
    locations,
    rows: items.map((item) => {
      const perLocation = stock.get(item.id) || {}
      const values = locations.map((l) => perLocation[l.id] || 0)
      return { item, quantities: values, total: values.reduce((s, v) => s + v, 0) }
    })
  }
}

export default {
  listItemCategories, createItemCategory, updateItemCategory, deleteItemCategory,
  listItems, getItem, createItem, updateItem, deleteItem,
  moveItemStock, listItemInventory, getItemInventory, listItemMovements, adjustItemStock,
  createItemTransfer, completeItemTransfer, cancelItemTransfer, listItemTransfers, getItemTransfer,
  consumeItemsForSale, validateItemsForSale, restoreItemsForSaleCancel,
  listProductItems, setProductItems, addProductItem, updateProductItemRow, removeProductItemRow,
  getItemStats, getItemConsumptionReport, getBranchItemReport
}
