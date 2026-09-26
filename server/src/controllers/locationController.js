/**
 * Location Controller
 */
import { listLocations, createLocation, updateLocation, deleteLocation } from '../services/locationService.js'

export async function getLocations(req, res, next) {
  try { res.json({ success: true, data: await listLocations() }) } catch (e) { next(e) }
}
export async function createNewLocation(req, res, next) {
  try { res.status(201).json({ success: true, data: await createLocation(req.body) }) } catch (e) { next(e) }
}
export async function updateExistingLocation(req, res, next) {
  try { res.json({ success: true, data: await updateLocation(req.params.id, req.body) }) } catch (e) { next(e) }
}
export async function deleteExistingLocation(req, res, next) {
  try { res.json({ success: true, data: await deleteLocation(req.params.id) }) } catch (e) { next(e) }
}