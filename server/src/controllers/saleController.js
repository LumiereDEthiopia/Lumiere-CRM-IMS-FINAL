/**
 * Sale Controller
 */
import { listSales, getSale, createSale, cancelSale, getDailySalesActivity } from '../services/saleService.js'

export async function getSales(req, res, next) {
  try { res.json({ success: true, ...(await listSales(req.query)) }) } catch (e) { next(e) }
}
export async function getSaleById(req, res, next) {
  try { res.json({ success: true, data: await getSale(req.params.id) }) } catch (e) { next(e) }
}
export async function createNewSale(req, res, next) {
  try {
    // The session (set by the global authenticate middleware) is passed along so
    // the service can enforce sale:free_gift / sale:discount checks server-side.
    // Spread body FIRST so a client can never override createdBy/user.
    res.status(201).json({ success: true, data: await createSale({
      ...req.body,
      createdBy: req.user?.userId || req.user?.id || null,
      user: req.user || null
    }) })
  } catch (e) { next(e) }
}
export async function cancelExistingSale(req, res, next) {
  try { res.json({ success: true, ...(await cancelSale(req.params.id, req.user?.id)) }) } catch (e) { next(e) }
}
export async function getDailyActivity(req, res, next) {
  try { res.json({ success: true, data: await getDailySalesActivity(req.query.date) }) } catch (e) { next(e) }
}