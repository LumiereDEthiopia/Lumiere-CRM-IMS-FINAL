/**
 * Customer Intelligence (part 1) — RFM analysis
 * Recency/Frequency/Monetary quintile scoring with segment mapping.
 */
import prisma from '../config/prisma.js'

function quintile(value, breaks, reverse = false) {
  if (value === null || value === undefined) return 1
  let score = 1
  for (let i = 0; i < breaks.length; i++) {
    if (value >= breaks[i]) score = i + 2
  }
  return reverse ? 6 - score : score
}

function computeBreaks(values) {
  const sorted = [...values].filter((v) => v !== null && v !== undefined).sort((a, b) => a - b)
  if (sorted.length === 0) return [1, 2, 3, 4]
  const breaks = []
  for (let i = 1; i <= 4; i++) {
    const idx = Math.max(0, Math.floor((sorted.length * i) / 5) - 1)
    breaks.push(sorted[idx])
  }
  return breaks
}

export function rfmSegment(r, f, m) {
  if (r >= 4 && f >= 4 && m >= 4) return 'VIP'
  if (m >= 4 && f >= 3) return 'HIGH_VALUE'
  if (r >= 4 && f <= 2) return 'NEW'
  if (r >= 3 && f >= 3) return 'REGULAR'
  if (r <= 2 && f >= 3) return 'AT_RISK'
  if (r <= 2 && m >= 3) return 'AT_RISK'
  if (r <= 1 && f <= 2) return 'LOST'
  return 'REGULAR'
}

export async function getRfmAnalysis(opts = {}) {
  const now = new Date()
  const periodDays = parseInt(opts.periodDays) || 365
  const start = new Date(now)
  start.setDate(start.getDate() - periodDays)

  const sales = await prisma.sale.groupBy({
    by: ['customerId'],
    where: { customerId: { not: null }, status: { not: 'CANCELLED' }, soldAt: { gte: start } },
    _count: { id: true },
    _sum: { total: true },
    _max: { soldAt: true }
  }).catch(() => [])

  const active = sales.filter((s) => s.customerId && (s._count.id || 0) > 0)
  if (active.length === 0) {
    return { customers: [], segmentCounts: {}, generatedAt: now.toISOString(), isEstimate: true }
  }

  const recencies = active.map((s) => Math.floor((now - new Date(s._max.soldAt)) / 86400000))
  const frequencies = active.map((s) => s._count.id)
  const monetaries = active.map((s) => s._sum.total || 0)
  const rBreaks = computeBreaks(recencies)
  const fBreaks = computeBreaks(frequencies)
  const mBreaks = computeBreaks(monetaries)

  const customers = await prisma.customer.findMany({
    where: { id: { in: active.map((s) => s.customerId) } },
    select: { id: true, name: true, customerCode: true, status: true, customerType: true }
  })
  const custMap = new Map(customers.map((c) => [c.id, c]))

  const rows = active.map((s) => {
    const recencyDays = Math.floor((now - new Date(s._max.soldAt)) / 86400000)
    const frequency = s._count.id
    const monetary = Math.round((s._sum.total || 0) * 100) / 100
    const r = quintile(recencyDays, rBreaks, true)
    const f = quintile(frequency, fBreaks)
    const m = quintile(monetary, mBreaks)
    const c = custMap.get(s.customerId)
    return {
      customerId: s.customerId, customerName: c?.name, customerCode: c?.customerCode,
      manualStatus: c?.status, customerType: c?.customerType,
      recencyDays, frequency, monetary,
      r, f, m, rfmScore: `${r}${f}${m}`, segment: rfmSegment(r, f, m)
    }
  })

  rows.sort((a, b) => b.rfmScore.localeCompare(a.rfmScore))
  const segmentCounts = {}
  for (const row of rows) segmentCounts[row.segment] = (segmentCounts[row.segment] || 0) + 1

  return {
    customers: rows, segmentCounts,
    parameters: { periodDays },
    generatedAt: now.toISOString(), isEstimate: true
  }
}

/**
 * Customer Intelligence (part 2) — segmentation, churn, alerts
 */
async function getSettingVal(key) {
  try {
    const s = await prisma.setting.findUnique({ where: { key } })
    return s?.value
  } catch { return null }
}

export async function getCustomerSegments() {
  const now = new Date()
  const inactivityDays = parseInt(await getSettingVal('customer_inactivity_days')) || 60
  const lostDays = parseInt(await getSettingVal('customer_lost_days')) || 180
  const vipInactivityDays = parseInt(await getSettingVal('vip_inactivity_days')) || 30

  const customers = await prisma.customer.findMany({
    include: {
      sales: { where: { status: { not: 'CANCELLED' } }, select: { total: true, soldAt: true } },
      interactions: { orderBy: { interactionDate: 'desc' }, take: 1, select: { interactionDate: true } }
    }
  })

  const segments = { ACTIVE: 0, AT_RISK: 0, INACTIVE: 0, LOST: 0, NEW: 0, VIP: 0, WHOLESALE: 0, NO_PURCHASES: 0 }
  const details = []

  for (const c of customers) {
    const sales = c.sales || []
    const totalValue = sales.reduce((a, s) => a + (s.total || 0), 0)
    const lastPurchase = sales.length ? sales.map((s) => s.soldAt).sort().pop() : null
    const lastInteraction = c.interactions[0]?.interactionDate || null
    const daysSincePurchase = lastPurchase ? Math.floor((now - new Date(lastPurchase)) / 86400000) : null
    const accountAgeDays = Math.floor((now - new Date(c.createdAt)) / 86400000)

    let automatedSegment
    if (sales.length === 0) {
      automatedSegment = accountAgeDays <= 30 ? 'NEW' : 'NO_PURCHASES'
    } else if (daysSincePurchase <= inactivityDays) {
      automatedSegment = c.customerType === 'VIP' ? 'VIP' : c.customerType === 'WHOLESALE' ? 'WHOLESALE' : 'ACTIVE'
    } else if (daysSincePurchase <= lostDays) {
      automatedSegment = 'AT_RISK'
    } else if (daysSincePurchase <= lostDays * 1.5) {
      automatedSegment = 'INACTIVE'
    } else {
      automatedSegment = 'LOST'
    }
    segments[automatedSegment] = (segments[automatedSegment] || 0) + 1

    details.push({
      customerId: c.id, customerCode: c.customerCode, name: c.name,
      manualStatus: c.status, customerType: c.customerType,
      purchaseCount: sales.length,
      totalValue: Math.round(totalValue * 100) / 100,
      avgPurchaseValue: sales.length ? Math.round((totalValue / sales.length) * 100) / 100 : 0,
      lastPurchase, lastInteraction, daysSincePurchase,
      automatedSegment
    })
  }

  return {
    segments, customers: details,
    thresholds: { inactivityDays, lostDays, vipInactivityDays },
    generatedAt: now.toISOString(),
    note: 'automatedSegment is derived analytics and does not modify manualStatus'
  }
}

export async function getCustomerAlerts() {
  const now = new Date()
  const { customers, thresholds } = await getCustomerSegments()
  const alerts = []

  for (const c of customers) {
    if (c.customerType === 'VIP' && c.daysSincePurchase !== null && c.daysSincePurchase >= thresholds.vipInactivityDays) {
      alerts.push({ type: 'VIP_INACTIVE', priority: 'HIGH', customerId: c.customerId, name: c.name, message: `VIP customer inactive for ${c.daysSincePurchase} days` })
    }
    if (c.automatedSegment === 'AT_RISK' && c.totalValue > 0) {
      alerts.push({ type: 'AT_RISK', priority: 'HIGH', customerId: c.customerId, name: c.name, message: `At-risk customer — no purchase in ${c.daysSincePurchase} days (lifetime value ${c.totalValue})` })
    }
    if (c.automatedSegment === 'NEW') {
      alerts.push({ type: 'NEW_FOLLOWUP', priority: 'MEDIUM', customerId: c.customerId, name: c.name, message: 'New customer — schedule welcome follow-up' })
    }
  }

  const overdueTasks = await prisma.customerTask.findMany({
    where: { status: { in: ['TODO', 'IN_PROGRESS'] }, dueDate: { lt: now } },
    include: { customer: { select: { id: true, name: true } } },
    take: 50,
    orderBy: { dueDate: 'asc' }
  }).catch(() => [])
  for (const t of overdueTasks) {
    alerts.push({ type: 'TASK_OVERDUE', priority: 'URGENT', customerId: t.customerId, name: t.customer?.name, message: `Task overdue: ${t.title}`, taskId: t.id })
  }

  const dueToday = await prisma.customerTask.count({
    where: {
      status: { in: ['TODO', 'IN_PROGRESS'] },
      dueDate: { gte: new Date(now.toISOString().slice(0, 10) + 'T00:00:00.000Z'), lt: new Date(now.getTime() + 86400000) }
    }
  }).catch(() => 0)
  if (dueToday > 0) {
    alerts.push({ type: 'FOLLOWUPS_DUE_TODAY', priority: 'MEDIUM', message: `${dueToday} follow-up task(s) due today` })
  }

  const priorityOrder = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
  alerts.sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9))
  return { alerts, count: alerts.length, generatedAt: now.toISOString() }
}

export default { getRfmAnalysis, rfmSegment, getCustomerSegments, getCustomerAlerts }

