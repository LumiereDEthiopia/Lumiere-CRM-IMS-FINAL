/**
 * Item Controller — items, categories, item inventory, transfers,
 * product→item relationships and item reports.
 */
import * as itemService from '../services/itemService.js'

/** Hide cost figures from users without items:view_cost (requirement 22). */
function canViewCost(req) {
  const perms = req.user?.permissions || []
  return req.user?.role === 'SUPER_ADMIN' || perms.includes('*') || perms.includes('items:view_cost')
}

function stripCost(item) {
  if (!item) return item
  const { costPrice, ...rest } = item
  return rest
}

function sanitizeItemsPayload(payload, req) {
  if (canViewCost(req)) return payload
  if (Array.isArray(payload?.data)) return { ...payload, data: payload.data.map((i) => stripCost(i)) }
  return stripCost(payload)
}

// ============================ Items ============================

export async function getItems(req, res, next) {
  try { res.json({ success: true, ...sanitizeItemsPayload(await itemService.listItems(req.query), req) }) } catch (e) { next(e) }
}

export async function getItemById(req, res, next) {
  try { res.json({ success: true, data: sanitizeItemsPayload(await itemService.getItem(req.params.id), req) }) } catch (e) { next(e) }
}

export async function createNewItem(req, res, next) {
  try { res.status(201).json({ success: true, data: await itemService.createItem(req.body, req.user?.id) }) } catch (e) { next(e) }
}

export async function updateExistingItem(req, res, next) {
  try { res.json({ success: true, data: await itemService.updateItem(req.params.id, req.body, req.user?.id) }) } catch (e) { next(e) }
}

export async function deleteExistingItem(req, res, next) {
  try { res.json({ success: true, ...(await itemService.deleteItem(req.params.id, req.user?.id)) }) } catch (e) { next(e) }
}

// ========================== Categories ==========================

export async function getItemCategories(req, res, next) {
  try { res.json({ success: true, data: await itemService.listItemCategories({ includeInactive: req.query.includeInactive === 'true' }) }) } catch (e) { next(e) }
}

export async function createNewItemCategory(req, res, next) {
  try { res.status(201).json({ success: true, data: await itemService.createItemCategory(req.body, req.user?.id) }) } catch (e) { next(e) }
}

export async function updateExistingItemCategory(req, res, next) {
  try { res.json({ success: true, data: await itemService.updateItemCategory(req.params.id, req.body, req.user?.id) }) } catch (e) { next(e) }
}

export async function deleteExistingItemCategory(req, res, next) {
  try { res.json({ success: true, ...(await itemService.deleteItemCategory(req.params.id, req.user?.id)) }) } catch (e) { next(e) }
}

// ===================== Item inventory =====================

export async function getItemInventoryList(req, res, next) {
  try { res.json({ success: true, ...sanitizeItemsPayload(await itemService.listItemInventory(req.query), req) }) } catch (e) { next(e) }
}

export async function getItemInventoryById(req, res, next) {
  try { res.json({ success: true, data: sanitizeItemsPayload(await itemService.getItemInventory(req.params.id), req) }) } catch (e) { next(e) }
}

export async function getItemInventoryForItem(req, res, next) {
  try { res.json({ success: true, ...(await itemService.listItemInventory({ ...req.query, itemId: req.params.id })) }) } catch (e) { next(e) }
}

export async function adjustItemInventory(req, res, next) {
  try { res.json({ success: true, data: await itemService.adjustItemStock({ ...req.body, userId: req.user?.id }) }) } catch (e) { next(e) }
}

export async function getItemMovementsList(req, res, next) {
  try { res.json({ success: true, ...(await itemService.listItemMovements({ ...req.query, itemId: req.params.id })) }) } catch (e) { next(e) }
}

export async function getAllItemMovements(req, res, next) {
  try { res.json({ success: true, ...(await itemService.listItemMovements(req.query)) }) } catch (e) { next(e) }
}

// ========================= Transfers =========================

export async function getItemTransfersList(req, res, next) {
  try { res.json({ success: true, ...(await itemService.listItemTransfers(req.query)) }) } catch (e) { next(e) }
}

export async function getItemTransferById(req, res, next) {
  try { res.json({ success: true, data: await itemService.getItemTransfer(req.params.id) }) } catch (e) { next(e) }
}

export async function createNewItemTransfer(req, res, next) {
  try { res.status(201).json({ success: true, data: await itemService.createItemTransfer({ ...req.body, createdBy: req.user?.id }) }) } catch (e) { next(e) }
}

export async function completeExistingItemTransfer(req, res, next) {
  try { res.json({ success: true, data: await itemService.completeItemTransfer(req.params.id, req.user?.id) }) } catch (e) { next(e) }
}

export async function cancelExistingItemTransfer(req, res, next) {
  try { res.json({ success: true, data: await itemService.cancelItemTransfer(req.params.id, req.user?.id) }) } catch (e) { next(e) }
}

// ==================== Product → items ====================

export async function getProductItems(req, res, next) {
  try { res.json({ success: true, data: await itemService.listProductItems(req.params.id) }) } catch (e) { next(e) }
}

export async function replaceProductItems(req, res, next) {
  try { res.json({ success: true, data: await itemService.setProductItems(req.params.id, req.body.items, req.user?.id) }) } catch (e) { next(e) }
}

export async function addProductItemToProduct(req, res, next) {
  try { res.status(201).json({ success: true, data: await itemService.addProductItem(req.params.id, req.body, req.user?.id) }) } catch (e) { next(e) }
}

export async function updateProductItemRowHandler(req, res, next) {
  try { res.json({ success: true, data: await itemService.updateProductItemRow(req.params.id, req.params.itemId, req.body, req.user?.id) }) } catch (e) { next(e) }
}

export async function removeProductItemRowHandler(req, res, next) {
  try { res.json({ success: true, ...(await itemService.removeProductItemRow(req.params.id, req.params.itemId, req.user?.id)) }) } catch (e) { next(e) }
}

// ========================== Reports ==========================

export async function itemStats(req, res, next) {
  try { res.json({ success: true, data: await itemService.getItemStats() }) } catch (e) { next(e) }
}

export async function itemConsumptionReport(req, res, next) {
  try { res.json({ success: true, data: await itemService.getItemConsumptionReport(req.query) }) } catch (e) { next(e) }
}

export async function branchItemReport(req, res, next) {
  try { res.json({ success: true, data: await itemService.getBranchItemReport(req.query) }) } catch (e) { next(e) }
}

export default {
  getItems, getItemById, createNewItem, updateExistingItem, deleteExistingItem,
  getItemCategories, createNewItemCategory, updateExistingItemCategory, deleteExistingItemCategory,
  getItemInventoryList, getItemInventoryById, getItemInventoryForItem, adjustItemInventory, getItemMovementsList, getAllItemMovements,
  getItemTransfersList, getItemTransferById, createNewItemTransfer, completeExistingItemTransfer, cancelExistingItemTransfer,
  getProductItems, replaceProductItems, addProductItemToProduct, updateProductItemRowHandler, removeProductItemRowHandler,
  itemStats, itemConsumptionReport, branchItemReport
}
