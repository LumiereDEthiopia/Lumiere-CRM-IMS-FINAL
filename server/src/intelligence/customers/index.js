/**
 * Customer Intelligence — RFM scoring, segmentation, churn detection, CRM alerts.
 */
const DAY = 86400000

function scoreFrom(value, breakpoints) {
  for (let i = 0; i < breakpoints.length; i++) {
    if (value <= breakpoints[i]) return i + 1
  }
  return 5
}

export function computeRFM({ customers, now = Date.now() }) {
  const scored = customers.map(c => {
    const lastPurchase = c.lastPurchaseAt ? new Date(c.lastPurchaseAt).getTime() : null
    const recencyDays = lastPurchase ? Math.floor((now - lastPurchase) / DAY) : null
    return {
      customerId: c.id, name: c.name, email: c.email,
      customerType: c.customerType, status: c.status,
      totalPurchases: c.totalPurchases || 0,
      totalValue: Math.round((c.totalValue || 0) * 100) / 100,
      averagePurchaseValue: c.totalPurchases > 0 ? Math.round(((c.totalValue || 0) / c.totalPurchases) * 100) / 100 : 0,
      lastPurchaseAt: c.lastPurchaseAt || null,
      recencyDays
    }
  })

  const withPurchases = scored.filter(c => c.totalPurchases > 0)
  if (withPurchases.length === 0) {
    return scored.map(c => ({ ...c, R: 0, F: 0, M: 0, rfmScore: '000', segment: c.status === 'LEAD' ? 'NEW' : 'NO_PURCHASES' }))
  }

  const recencies = withPurchases.map(c => c.recencyDays).sort((a, b) => a - b)
  const frequencies = withPurchases.map(c => c.totalPurchases).sort((a, b) => a - b)
  const monetaries = withPurchases.map(c => c.totalValue).sort((a, b) => a - b)
  const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))]
  const rBp = [0.2, 0.4, 0.6, 0.8].map(p => q(recencies, p))
  const fBp = [0.2, 0.4, 0.6, 0.8].map(p => q(frequencies, p))
  const mBp = [0.2, 0.4, 0.6, 0.8].map(p => q(monetaries, p))

  for (const c of scored) {
    if (c.totalPurchases === 0) {
      c.R = 0; c.F = 0; c.M = 0
      c.rfmScore = '000'
      c.segment = c.status === 'LEAD' ? 'NEW' : 'NO_PURCHASES'
      continue
    }
    c.R = 6 - scoreFrom(c.recencyDays, rBp) // lower days = better
    c.F = scoreFrom(c.totalPurchases, fBp)
    c.M = scoreFrom(c.totalValue, mBp)
    c.rfmScore = `${c.R}${c.F}${c.M}`

    const { R, F, M } = c
    if (R >= 4 && F >= 4 && M >= 4) c.segment = 'VIP'
    else if (R >= 4 && F >= 3 && M >= 3) c.segment = 'HIGH_VALUE'
    else if (R >= 4 && F <= 2) c.segment = 'NEW'
    else if (R >= 3 && F >= 2) c.segment = 'REGULAR'
    else if (R <= 2 && F >= 4 && M >= 4) c.segment = 'AT_RISK'
    else if (R <= 2 && F >= 2) c.segment = 'INACTIVE'
    else if (R === 1 && F <= 1) c.segment = 'LOST'
    else c.segment = 'REGULAR'
  }
  return scored
}

export function summarizeSegments(rfmResults) {
  const counts = {}
  for (const c of rfmResults) counts[c.segment] = (counts[c.segment] || 0) + 1
  return Object.entries(counts).map(([segment, count]) => ({ segment, count })).sort((a, b) => b.count - a.count)
}

/** Churn/inactivity detection. Thresholds configurable via settings. */
export function detectChurn({ customers, inactiveDays = 60, vipInactiveDays = 30, now = Date.now() }) {
  return customers.map(c => {
    const lastPurchase = c.lastPurchaseAt ? new Date(c.lastPurchaseAt).getTime() : null
    const recencyDays = lastPurchase ? Math.floor((now - lastPurchase) / DAY) : null
    const isVip = c.customerType === 'VIP' || c.status === 'VIP'

    let churnStatus = 'ACTIVE'
    let reason = null
    if (recencyDays === null) {
      if (c.status !== 'LEAD') { churnStatus = 'INACTIVE'; reason = 'No purchases on record.' }
    } else if (isVip && recencyDays > vipInactiveDays) {
      churnStatus = 'AT_RISK'; reason = `VIP customer inactive for ${recencyDays} days.`
    } else if ((c.totalValue || 0) > 0 && recencyDays > inactiveDays) {
      churnStatus = 'AT_RISK'; reason = `High-value customer inactive for ${recencyDays} days.`
    } else if (recencyDays > inactiveDays * 2) {
      churnStatus = 'LOST'; reason = `No purchase in ${recencyDays} days.`
    } else if (recencyDays > inactiveDays) {
      churnStatus = 'INACTIVE'; reason = `No purchase in ${recencyDays} days.`
    }
    return {
      customerId: c.id, name: c.name, email: c.email,
      customerType: c.customerType, status: c.status,
      churnStatus, recencyDays,
      totalValue: Math.round((c.totalValue || 0) * 100) / 100,
      totalPurchases: c.totalPurchases || 0, reason
    }
  })
}

/** Intelligent CRM alerts from RFM + churn analysis. */
export function buildCustomerAlerts(rfmResults, churnResults) {
  const churnByCustomer = new Map(churnResults.map(c => [c.customerId, c]))
  const alerts = []
  for (const c of rfmResults) {
    const churn = churnByCustomer.get(c.customerId)
    if (!churn) continue
    if (c.segment === 'VIP' && ['AT_RISK', 'INACTIVE'].includes(churn.churnStatus)) {
      alerts.push({ customerId: c.customerId, name: c.name, type: 'VIP_INACTIVE', priority: 'HIGH', message: churn.reason || 'VIP customer requires attention.', segment: c.segment })
    }
    if (c.segment === 'HIGH_VALUE' && churn.churnStatus === 'AT_RISK') {
      alerts.push({ customerId: c.customerId, name: c.name, type: 'HIGH_VALUE_AT_RISK', priority: 'HIGH', message: churn.reason, segment: c.segment })
    }
    if (c.segment === 'NEW') {
      alerts.push({ customerId: c.customerId, name: c.name, type: 'NEW_CUSTOMER_FOLLOW_UP', priority: 'MEDIUM', message: 'New customer — schedule welcome follow-up.', segment: c.segment })
    }
    if (churn.churnStatus === 'LOST' && c.totalPurchases >= 3) {
      alerts.push({ customerId: c.customerId, name: c.name, type: 'CUSTOMER_LOST', priority: 'MEDIUM', message: churn.reason, segment: c.segment })
    }
    if (churn.churnStatus === 'AT_RISK' && c.segment !== 'HIGH_VALUE') {
      alerts.push({ customerId: c.customerId, name: c.name, type: 'BECOMING_INACTIVE', priority: 'MEDIUM', message: churn.reason, segment: c.segment })
    }
  }
  const prio = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
  return alerts.sort((a, b) => prio[a.priority] - prio[b.priority])
}