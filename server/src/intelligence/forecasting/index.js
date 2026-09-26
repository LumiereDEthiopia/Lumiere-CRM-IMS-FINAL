/**
 * Statistical Forecasting Engine — Stage 5/6
 * Moving average, weighted moving average, exponential smoothing, trend detection.
 * All results are clearly labeled estimates.
 */

export function movingAverage(values, window = 7) {
  if (!values || values.length === 0) return 0
  const slice = values.slice(-window)
  return slice.reduce((s, v) => s + v, 0) / slice.length
}

export function weightedMovingAverage(values, window = 7) {
  if (!values || values.length === 0) return 0
  const slice = values.slice(-window)
  let weight = 1, weightSum = 0, acc = 0
  for (const v of slice) { acc += v * weight; weightSum += weight; weight++ }
  return weightSum === 0 ? 0 : acc / weightSum
}

export function exponentialSmoothing(values, alpha = 0.3) {
  if (!values || values.length === 0) return 0
  let forecast = values[0]
  for (let i = 1; i < values.length; i++) {
    forecast = alpha * values[i] + (1 - alpha) * forecast
  }
  return forecast
}

export function detectTrend(values) {
  if (!values || values.length < 4) return { direction: 'UNKNOWN', slope: 0 }
  const n = values.length
  const meanX = (n - 1) / 2
  const meanY = values.reduce((s, v) => s + v, 0) / n
  let num = 0, den = 0
  for (let i = 0; i < n; i++) { num += (i - meanX) * (values[i] - meanY); den += (i - meanX) ** 2 }
  const slope = den === 0 ? 0 : num / den
  const threshold = meanY * 0.05 || 0.1
  return { direction: slope > threshold ? 'RISING' : slope < -threshold ? 'FALLING' : 'STABLE', slope: Math.round(slope * 1000) / 1000 }
}

/**
 * Forecast daily demand for horizonDays.
 * history: array of { date, quantity } sorted ascending.
 */
export function forecastDemand(history, horizonDays = 30) {
  const daily = buildDailySeries(history, horizonDays)
  const recent = daily.slice(-30)
  const hasHistory = history && history.length > 0

  const ma7 = movingAverage(recent, 7)
  const wma7 = weightedMovingAverage(recent, 7)
  const ets = exponentialSmoothing(recent, 0.3)
  const trend = detectTrend(recent)

  // Blend: weight recent velocity higher when trend rising
  let base = trend.direction === 'RISING' ? (wma7 * 0.5 + ets * 0.3 + ma7 * 0.2) : (ma7 * 0.4 + wma7 * 0.3 + ets * 0.3)
  if (!hasHistory || recent.every(v => v === 0)) base = 0

  const total = Math.round(base * horizonDays * 10) / 10
  return {
    averageDailySales: Math.round(base * 100) / 100,
    horizonDays,
    forecastDemand: total,
    trend,
    confidence: hasHistory && history.length >= 14 ? 'MEDIUM' : hasHistory ? 'LOW' : 'NONE',
    isEstimate: true,
    note: hasHistory
      ? 'Statistical estimate from recent sales history — not a guarantee.'
      : 'No sales history available — forecast unavailable.'
  }
}

/** Build a zero-filled daily series of sold quantities for the last maxDays. */
function buildDailySeries(history, maxDays = 30) {
  const series = new Array(maxDays).fill(0)
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - maxDays)
  for (const h of history || []) {
    const d = new Date(h.date)
    if (d < cutoff) continue
    const idx = maxDays - 1 - Math.floor((now - d) / 86400000)
    if (idx >= 0 && idx < maxDays) series[idx] += Number(h.quantity) || 0
  }
  return series
}

/** Aggregate product-level forecast with stock risk classification. */
export function buildStockForecast({ currentStock, minStock, history }) {
  const daily = buildDailySeries(history, 90)
  const active = daily.slice(-30)
  const velocity = movingAverage(active, 30)

  const f7 = forecastDemand(history, 7)
  const f30 = forecastDemand(history, 30)
  const f90 = forecastDemand(history, 90)

  const daysRemaining = velocity > 0 ? Math.round((currentStock / velocity) * 10) / 10 : null

  let risk = 'NONE'
  if (currentStock <= 0) risk = 'OUT_OF_STOCK'
  else if (daysRemaining !== null && daysRemaining <= 7) risk = 'CRITICAL'
  else if (daysRemaining !== null && daysRemaining <= 14) risk = 'HIGH'
  else if (daysRemaining !== null && daysRemaining <= 30) risk = 'MEDIUM'

  const reorderPoint = Math.max(Math.ceil((minStock || 5) + velocity * 14), minStock ? minStock + 1 : 0)
  const recommendedQuantity = velocity > 0 && daysRemaining !== null && daysRemaining < 30
    ? Math.max(Math.ceil(velocity * 60 - currentStock), 0)
    : 0

  return {
    averageDailySales: Math.round(velocity * 100) / 100,
    estimatedDaysRemaining: daysRemaining,
    forecast: { 7: f7, 30: f30, 90: f90 },
    stockOutRisk: risk,
    reorderPoint,
    recommendedQuantity,
    isEstimate: true
  }
}