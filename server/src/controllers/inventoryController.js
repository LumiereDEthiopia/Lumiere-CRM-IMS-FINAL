/**
 * Inventory Controller
 */
import {
  getInventory, adjustStock, transferStock, getStockMovements
} from '../services/inventoryService.js'
import { checkInventoryIntegrity, repairAvailableQuantities, getInventoryAlerts } from '../services/integrityService.js'

export async function getInventoryItems(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = Math.min(parseInt(req.query.limit) || 20, 100)
    res.json({ success: true, ...(await getInventory({ ...req.query, page, limit })) })
  } catch (e) { next(e) }
}

export async function getMovements(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = Math.min(parseInt(req.query.limit) || 50, 100)
    res.json({ success: true, ...(await getStockMovements({ ...req.query, page, limit })) })
  } catch (e) { next(e) }
}

export async function adjust(req, res, next) {
  try {
    const data = await adjustStock({ ...req.body, userId: req.userId || req.user?.userId })
    res.json({ success: true, data })
  } catch (e) { next(e) }
}

export async function transfer(req, res, next) {
  try {
    const data = await transferStock({ ...req.body, createdBy: req.userId || req.user?.userId })
    res.json({ success: true, data })
  } catch (e) { next(e) }
}

export async function integrity(req, res, next) {
  try {
    res.json({ success: true, data: await checkInventoryIntegrity() })
  } catch (e) { next(e) }
}

export async function repair(req, res, next) {
  try {
    const data = await repairAvailableQuantities({
      userId: req.userId || req.user?.userId,
      ipAddress: req.ip
    })
    res.json({ success: true, data })
  } catch (e) { next(e) }
}

export async function alerts(req, res, next) {
  try {
    res.json({ success: true, data: await getInventoryAlerts() })
  } catch (e) { next(e) }
}

export default { getInventoryItems, getMovements, adjust, transfer, integrity, repair, alerts }
