/**
 * Customer Controller
 */
import { listCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer, addInteraction, createTask, listTags, createTag, deleteTag } from '../services/customerService.js'

export async function getCustomers(req, res, next) {
  try { res.json({ success: true, ...(await listCustomers(req.query)) }) } catch (e) { next(e) }
}
export async function getCustomerById(req, res, next) {
  try { res.json({ success: true, data: await getCustomer(req.params.id) }) } catch (e) { next(e) }
}
export async function createNewCustomer(req, res, next) {
  try { res.status(201).json({ success: true, data: await createCustomer(req.body) }) } catch (e) { next(e) }
}
export async function updateExistingCustomer(req, res, next) {
  try { res.json({ success: true, data: await updateCustomer(req.params.id, req.body) }) } catch (e) { next(e) }
}
export async function deleteExistingCustomer(req, res, next) {
  try { res.json({ success: true, data: await deleteCustomer(req.params.id) }) } catch (e) { next(e) }
}
export async function addCustomerInteraction(req, res, next) {
  try { res.status(201).json({ success: true, data: await addInteraction({ ...req.body, customerId: req.params.id, userId: req.user?.id }) }) } catch (e) { next(e) }
}
export async function createCustomerTask(req, res, next) {
  try { res.status(201).json({ success: true, data: await createTask({ ...req.body, customerId: req.params.id }) }) } catch (e) { next(e) }
}
export async function getTags(req, res, next) {
  try { res.json({ success: true, data: await listTags() }) } catch (e) { next(e) }
}
export async function createNewTag(req, res, next) {
  try { res.status(201).json({ success: true, data: await createTag(req.body) }) } catch (e) { next(e) }
}
export async function deleteExistingTag(req, res, next) {
  try { res.json({ success: true, data: await deleteTag(req.params.id) }) } catch (e) { next(e) }
}