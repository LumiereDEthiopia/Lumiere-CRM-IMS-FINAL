/**
 * Backup Scheduler
 * Automatic encrypted SQLite backups at a configurable interval.
 *
 * Requirements:
 * - Configurable interval (BACKUP_INTERVAL_HOURS)
 * - No overlapping backups (in-flight guard)
 * - Survives application restart (interval re-registered on boot)
 * - Logs failures without crashing the server
 * - Verifies uploads before recording success
 * - Applies retention policy
 * - Never deletes the newest valid backup
 */
import { createBackup } from '../services/backupService.js'
import { createNotification } from '../services/notificationService.js'
import prisma from '../config/prisma.js'

let timer = null
let running = false
let lastRunAt = null
let lastResult = null

export function getLastBackupRun() {
  return lastRunAt ? new Date(lastRunAt) : null
}

export function isBackupRunning() {
  return running
}

/**
 * Perform a single backup cycle (safe: catches all errors, never throws).
 */
export async function runBackupCycle() {
  if (running) {
    return { success: false, skipped: 'already running' }
  }

  running = true
  const startedAt = new Date()
  lastRunAt = startedAt

  try {
    const result = await createBackup()
    lastResult = { ...result, at: startedAt }
    return result
  } catch (error) {
    lastResult = { success: false, message: error.message, at: startedAt }
    try {
      await createNotification({
        type: 'BACKUP_FAILED',
        title: 'Backup failed',
        message: error.message || 'Unknown backup error',
        severity: 'CRITICAL',
        link: '/admin/backups'
      })
    } catch {
      // notification is best-effort; never let it crash the scheduler
    }
    return { success: false, message: error.message, backupId: null }
  } finally {
    running = false
  }
}

/**
 * Start the scheduler. Only runs if BACKUP_ENABLED=true.
 * Registers a non-overlapping interval that survives restarts.
 * Interval priority: Settings table (backup_interval_hours, editable in
 * Settings → Backups) → BACKUP_INTERVAL_HOURS env → 6 hours. Applied when the
 * server starts.
 */
export async function startBackupScheduler() {
  if (timer) return timer

  if (process.env.BACKUP_ENABLED !== 'true') {
    console.log('⏰ Backup scheduler disabled (BACKUP_ENABLED != true)')
    return null
  }

  let intervalHours = Math.max(1, parseInt(process.env.BACKUP_INTERVAL_HOURS || '6', 10))
  try {
    // The Backups settings tab persists backup_interval_hours in the Setting
    // table — prefer it over the env default when it is a valid number ≥ 1.
    const setting = await prisma.setting.findUnique({ where: { key: 'backup_interval_hours' } })
    const fromSetting = parseInt(setting?.value, 10)
    if (Number.isFinite(fromSetting) && fromSetting >= 1) intervalHours = fromSetting
  } catch {
    // Settings table unavailable — keep the env/default interval.
  }
  const intervalMs = intervalHours * 60 * 60 * 1000

  timer = setInterval(() => {
    try {
      runBackupCycle().then((result) => {
        if (result && result.success) {
          console.log(`☁️  Automatic backup completed: ${result.backupId}`)
        } else if (result && result.message) {
          console.warn(`⚠️  Automatic backup failed: ${result.message}`)
        }
      })
    } catch (error) {
      console.warn('⚠️  Backup scheduler error: ' + error.message)
    }
  }, intervalMs)

  timer.isBackupTimer = true

  console.log(`⏰ Backup scheduler started — every ${intervalHours} hour(s)`)

  // Optionally run an initial cycle shortly after boot
  setTimeout(() => {
    try {
      runBackupCycle()
    } catch (error) {
      console.warn('⚠️  Initial backup failed: ' + error.message)
    }
  }, 60 * 1000) // 1 minute after boot

  return timer
}

export function stopBackupScheduler() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

export default { startBackupScheduler, stopBackupScheduler, runBackupCycle, getLastBackupRun, isBackupRunning }