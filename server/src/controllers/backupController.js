/**
 * Backup Controller
 */
import { createBackup, listBackups, getBackupHealth } from '../services/backupService.js'

export async function createNewBackup(req, res, next) {
  try { res.json({ success: true, data: await createBackup() }) } catch (e) { next(e) }
}
export async function getBackups(req, res, next) {
  try { res.json({ success: true, data: await listBackups() }) } catch (e) { next(e) }
}
export async function getBackupStatus(req, res, next) {
  try { res.json({ success: true, data: await getBackupHealth() }) } catch (e) { next(e) }
}
export async function preRestoreBackup(req, res, next) {
  try {
    const result = await createPreRestoreBackup()
    res.json({ success: result.success, data: result })
  } catch (e) { next(e) }
}
export async function restoreFromBackup(req, res, next) {
  try {
    const result = await restoreBackup(req.params.backupId, req.user?.userId, req.ip)
    res.json({ success: true, data: result })
  } catch (e) { next(e) }
}
export async function getMaintenanceMode(req, res, next) {
  try { res.json({ success: true, data: await getMaintenanceMode() }) } catch (e) { next(e) }
}
export async function setMaintenanceModeEndpoint(req, res, next) {
  try {
    const { enabled } = req.body || {}
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, message: 'enabled must be a boolean' })
    }
    const result = await setMaintenanceMode(enabled, req.user?.userId, req.ip)
    res.json({ success: true, data: result })
  } catch (e) { next(e) }
}