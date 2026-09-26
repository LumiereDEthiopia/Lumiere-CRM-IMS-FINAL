/**
 * Supplier Controller
 */
import { listSuppliers, createSupplier, updateSupplier, deleteSupplier } from '../services/supplierService.js'

export async function getSuppliers(req, res, next) {
  try { res.json({ success: true, ...(await listSuppliers(req.query)) }) } catch (e) { next(e) }
}
export async function createNewSupplier(req, res, next) {
  try { res.status(201).json({ success: true, data: await createSupplier(req.body) }) } catch (e) { next(e) }
}
export async function updateExistingSupplier(req, res, next) {
  try { res.json({ success: true, data: await updateSupplier(req.params.id, req.body) }) } catch (e) { next(e) }
}
export async function deleteExistingSupplier(req, res, next) {
  try { res.json({ success: true, data: await deleteSupplier(req.params.id) }) } catch (e) { next(e) }
}