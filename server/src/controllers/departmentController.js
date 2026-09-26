/**
 * Department Controller
 */
import { listDepartments, createDepartment, updateDepartment, deleteDepartment } from '../services/departmentService.js'

export async function getDepartments(req, res, next) {
  try { res.json({ success: true, data: await listDepartments() }) } catch (e) { next(e) }
}
export async function createNewDepartment(req, res, next) {
  try { res.status(201).json({ success: true, data: await createDepartment(req.body) }) } catch (e) { next(e) }
}
export async function updateExistingDepartment(req, res, next) {
  try { res.json({ success: true, data: await updateDepartment(req.params.id, req.body) }) } catch (e) { next(e) }
}
export async function deleteExistingDepartment(req, res, next) {
  try { res.json({ success: true, data: await deleteDepartment(req.params.id) }) } catch (e) { next(e) }
}