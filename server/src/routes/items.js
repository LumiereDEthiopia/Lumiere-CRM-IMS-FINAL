/**
 * Item Routes — items, item categories, item inventory and item transfers.
 * Exported as four routers so the API keeps the documented prefixes:
 *   /api/items  /api/item-categories  /api/item-inventory  /api/item-transfers
 */
import { Router } from 'express'
import { requirePermission, requireAnyPermission } from '../middleware/authorize.js'
import * as itemController from '../controllers/itemController.js'

const itemRouter = Router()

itemRouter.get('/', requirePermission('items:view'), itemController.getItems)
itemRouter.get('/stats', requireAnyPermission('items:view', 'report:view'), itemController.itemStats)
itemRouter.get('/reports/consumption', requireAnyPermission('items:view_movements', 'report:view'), itemController.itemConsumptionReport)
itemRouter.get('/reports/branch', requireAnyPermission('items:view', 'report:view'), itemController.branchItemReport)
itemRouter.post('/', requirePermission('items:create'), itemController.createNewItem)

// NOTE: '/:id' routes stay LAST so literal segments (stats/reports) match first.
itemRouter.get('/:id', requirePermission('items:view'), itemController.getItemById)
itemRouter.put('/:id', requirePermission('items:edit'), itemController.updateExistingItem)
itemRouter.delete('/:id', requirePermission('items:delete'), itemController.deleteExistingItem)
itemRouter.get('/:id/inventory', requireAnyPermission('items:view', 'inventory:view'), itemController.getItemInventoryForItem)
itemRouter.get('/:id/movements', requireAnyPermission('items:view_movements', 'inventory:view'), itemController.getItemMovementsList)

const itemCategoryRouter = Router()

itemCategoryRouter.route('/')
  .get(requireAnyPermission('items:view', 'product:view'), itemController.getItemCategories)
  .post(requirePermission('items:create'), itemController.createNewItemCategory)

itemCategoryRouter.route('/:id')
  .put(requirePermission('items:edit'), itemController.updateExistingItemCategory)
  .delete(requirePermission('items:delete'), itemController.deleteExistingItemCategory)

const itemInventoryRouter = Router()

itemInventoryRouter.get('/', requireAnyPermission('items:view', 'inventory:view'), itemController.getItemInventoryList)
// Global movement log must be matched before '/:id'
itemInventoryRouter.get('/movements', requireAnyPermission('items:view_movements', 'inventory:view'), itemController.getAllItemMovements)
itemInventoryRouter.get('/:id', requireAnyPermission('items:view', 'inventory:view'), itemController.getItemInventoryById)
itemInventoryRouter.post('/adjust', requirePermission('items:adjust'), itemController.adjustItemInventory)

const itemTransferRouter = Router()

itemTransferRouter.route('/')
  .get(requireAnyPermission('items:view', 'inventory:view'), itemController.getItemTransfersList)
  .post(requirePermission('items:transfer'), itemController.createNewItemTransfer)

itemTransferRouter.put('/:id/complete', requirePermission('items:transfer'), itemController.completeExistingItemTransfer)
itemTransferRouter.put('/:id/cancel', requirePermission('items:transfer'), itemController.cancelExistingItemTransfer)
itemTransferRouter.get('/:id', requireAnyPermission('items:view', 'inventory:view'), itemController.getItemTransferById)

export { itemRouter, itemCategoryRouter, itemInventoryRouter, itemTransferRouter }
export default itemRouter
