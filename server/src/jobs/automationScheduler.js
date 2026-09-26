/**
 * Automation Scheduler — Stage 5
 * DB-backed job registry: prevents overlap, survives restarts, logs runs.
 */
import prisma from '../config/prisma.js'
import { checkAndCreateAlerts } from '../services/notificationService.js'
import { generateIntelligenceSnapshot } from '../intelligence/service.js'

const timers = new Map()
let running = false

async function runCriticalAlerts() { return checkAndCreateAlerts() }
async function runInventoryAlerts() { return checkAndCreateAlerts() }
async function runCrmFollowups() { return checkAndCreateAlerts() }
async function runBusinessIntelligence() { return generateIntelligenceSnapshot() }

export const JOBS = [
  { name: 'critical-alerts', schedule: 'HOURLY', intervalMs: 60 * 60 * 1000, fn: runCriticalAlerts },
  { name: 'inventory-alerts', schedule: 'DAILY', intervalMs: 24 * 60 * 60 * 1000, fn: runInventoryAlerts },
  { name: 'crm-followups', schedule: 'DAILY', intervalMs: 24 * 60 * 60 * 1000, fn: runCrmFollowups },
  { name: 'business-intelligence', schedule: 'DAILY', intervalMs: 24 * 60 * 60 * 1000, fn: runBusinessIntelligence }
]

export async function runJob(jobDef, trigger = 'scheduler') {
  const now = new Date()
  const existing = await prisma.scheduledJob.findUnique({ where: { name: jobDef.name } })
  if (existing && existing.status === 'RUNNING') {
    return { skipped: true, reason: 'already running' }
  }

  await prisma.scheduledJob.upsert({
    where: { name: jobDef.name },
    update: { status: 'RUNNING', lastRunAt: now },
    create: { name: jobDef.name, schedule: jobDef.schedule, status: 'RUNNING', lastRunAt: now }
  })

  const start = Date.now()
  try {
    const result = await jobDef.fn()
    const duration = Date.now() - start
    await prisma.scheduledJob.update({
      where: { name: jobDef.name },
      data: {
        status: 'IDLE', lastStatus: 'SUCCESS', lastError: null,
        lastDurationMs: duration, runCount: { increment: 1 },
        nextRunAt: new Date(Date.now() + jobDef.intervalMs)
      }
    })
    console.log(`[scheduler] OK ${jobDef.name} (${trigger}) ${duration}ms`)
    return { success: true, duration, result }
  } catch (e) {
    const duration = Date.now() - start
    await prisma.scheduledJob.update({
      where: { name: jobDef.name },
      data: {
        status: 'IDLE', lastStatus: 'FAILED', lastError: (e.message || 'unknown').slice(0, 500),
        lastDurationMs: duration, failCount: { increment: 1 },
        nextRunAt: new Date(Date.now() + Math.min(jobDef.intervalMs, 15 * 60 * 1000))
      }
    }).catch(() => {})
    console.error(`[scheduler] FAILED ${jobDef.name}: ${e.message}`)
    return { success: false, error: e.message, duration }
  }
}

export async function startAutomationScheduler() {
  if (running) return { started: false, reason: 'already running' }
  if (String(process.env.AUTOMATION_ENABLED || 'true') !== 'true') {
    console.log('Automation scheduler disabled (AUTOMATION_ENABLED != true)')
    return { started: false, reason: 'disabled' }
  }
  running = true

  JOBS.forEach((job, idx) => {
    const timer = setInterval(async () => {
      try { await runJob(job) } catch (e) { console.error(`[scheduler] ${job.name} error: ${e.message}`) }
    }, job.intervalMs)
    timer.unref?.()
    timers.set(job.name, timer)

    // Stagger first run shortly after boot
    const initialDelay = 30 * 1000 + idx * 10 * 1000
    const t = setTimeout(async () => {
      try { await runJob(job, 'startup') } catch (e) { console.error(`[scheduler] ${job.name} startup error: ${e.message}`) }
    }, initialDelay)
    t.unref?.()
  })

  console.log(`Automation scheduler started (${JOBS.length} jobs)`)
  return { started: true, jobs: JOBS.map((j) => j.name) }
}

export function stopAutomationScheduler() {
  for (const [, timer] of timers.entries()) clearInterval(timer)
  timers.clear()
  running = false
  console.log('Automation scheduler stopped')
}

export function getSchedulerStatus() {
  return { running, jobs: JOBS.map((j) => ({ name: j.name, schedule: j.schedule, intervalMs: j.intervalMs })) }
}

export async function getJobRegistry() {
  const jobs = await prisma.scheduledJob.findMany({ orderBy: { name: 'asc' } })
  return { jobs, scheduler: getSchedulerStatus() }
}
