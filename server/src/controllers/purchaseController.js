/**
 * Purchase Controller
 */
import { listPurchases, createPurchase, receivePurchase } from '../services/purchaseService.js'

export async function getPurchases(req, res, next) {
  try { res.json({ success: true, ...(await listPurchases(req.query)) }) } catch (e) { next(e) }
}
export async function createNewPurchase(req, res, next) {
  try { res.status(201).json({ success: true, data: await createPurchase({ ...req.body, createdBy: req.user?.id }) }) } catch (e) { next(e) }
}
export async function receive(req, res, next) {
  try { res.json({ success: true, data: await receivePurchase(req.params.id, req.body.items, req.user?.id) }) } catch (e) { next(e) }
}