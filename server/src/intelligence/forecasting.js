/**
 * Forecasting Engine — statistical demand forecasting
 * Methods: moving average, weighted moving average, exponential smoothing, trend detection
 * All results are ESTIMATES based on historical sales data.
 */

/**
 * Simple moving average of daily sales over `window` days.
 */
export function movingAverage(dailySales, window = 14) {
  const recent = dailySales.slice(-window)
  if (recent.length === 0) return 0
  return recent.reduce((a, b) => a + b, 0) / recent.length
}

/**
 * Weighted moving average — recent days weighted higher (linear weights).
 */
export function weightedMovingAverage(dailySales, window = 14) {
  const recent = dailySales.slice(-window)
  if (recent.length === 0) return 0
  let weightSum = 0
  let valueSum = 0
  recent.forEach((v, i) => {
    const w = i + 1
    weightSum += w
    valueSum += v * w
  })
  return valueSum / weightSum
}

/**
 * Exponential smoothing (single parameter Holt simple exponential smoothing).
 */
export function exponentialSmoothing(dailySales, alpha = 0.3) {
  if (dailySales.length === 0) return 0
  let level = dailySales[0]
  for (let i = 1; i < dailySales.length; i++) {
    level = alpha * dailySales[i] + (1 - alpha) * level
  }
  return level
}

/**
 * Linear trend slope over the series (units per day, + = growing).
 */
export function trendSlope(dailySales) {
  const n = dailySales.length
  if (n < 2) return 0
  const meanX = (n - 1) / 2
  const meanY = dailySales.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (dailySales[i] - meanY)
    den += (i - meanX) ** 2
  }
  return den === 0 ? 0 : num / den
}

/**
 * Detect abnormal sales spikes (single day > mean + 3 * std dev).
 */
export function detectSpikes(dailySales) {
  if (dailySales.length < 7) return { hasSpike: false, spikeDays: 0 }
  const mean = dailySales.reduce((a, b) => a + b, 0) / dailySales.length
  const variance = dailySales.reduce((a, b) => a + (b - mean) ** 2, 0) / dailySales.length
  const std = Math.sqrt(variance)
  const threshold = mean + 3 * std
  const spikeDays = dailySales.filter((v) => v > threshold).length
  return { hasSpike: spikeDays > 0, spikeDays, threshold }
}

/**
 * Aggregate sales records (grouped by day with quantity) into a dense daily
 * series covering the last `days` days (zeros for no-sale days).
 * @param {Array<{date: Date, quantity: number}>} saleDays
 */
export function toDailySeries(saleDays, days = 90, now = new Date()) {
  const map = new Map()
  for (const s of saleDays) {
    const key = new Date(s.date).toISOString().slice(0, 10)
    map.set(key, (map.get(key) || 0) + s.quantity)
  }
  const series = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    series.push(map.get(key) || 0)
  }
  return series
}

/**
 * Full forecast for a product based on its daily sales series.
 * Combines WMA (primary) with EMA and trend, clamped to >= 0.
 */
export function forecast(dailySales, currentStock, { deadStockDays = 90 } = {}) {
  const wma = weightedMovingAverage(dailySales, 30)
  const ema = exponentialSmoothing(dailySales, 0.2)
  const ma = movingAverage(dailySales, 30)
  const trend = trendSlope(dailySales)
  const spikes = detectSpikes(dailySales)

  // Blend: weight WMA highest, adjust slightly by trend
  const base = wma * 0.5 + ema * 0.3 + ma * 0.2
  const avgDailySales = Math.max(0, base + trend * 0.25)

  const hasHistory = dailySales.some((v) => v > 0)
  const daysRemaining = avgDailySales > 0 ? currentStock / avgDailySales : null

  // Confidence degrades with little history
  const nonZeroDays = dailySales.filter((v) => v > 0).length
  let confidence = 'LOW'
  if (nonZeroDays >= 10) confidence = 'MEDIUM'
  if (nonZeroDays >= 20) confidence = 'HIGH'

  let risk = 'NONE'
  if (!hasHistory) {
    risk = 'UNKNOWN'
  } else if (currentStock <= 0) {
    risk = 'STOCKOUT'
  } else if (daysRemaining !== null && daysRemaining <= 7) {
    risk = 'HIGH'
  } else if (daysRemaining !== null && daysRemaining <= 21) {
    risk = 'MEDIUM'
  }

  // Dead stock: no sales in the whole observed window
  const lastSaleIndex = (() => {
    for (let i = dailySales.length - 1; i >= 0; i--) if (dailySales[i] > 0) return i
    return -1
  })()
  const daysSinceLastSale = lastSaleIndex === -1 ? null : dailySales.length - 1 - lastSaleIndex
  const isDeadStock = daysSinceLastSale !== null && daysSinceLastSale >= deadStockDays

  return {
    avgDailySales: round2(avgDailySales),
    weightedMovingAverage: round2(wma),
    exponentialSmoothing: round2(ema),
    movingAverage: round2(ma),
    trendPerDay: round2(trend),
    trendDirection: trend > 0.05 ? 'GROWING' : trend < -0.05 ? 'DECLINING' : 'STABLE',
    spikes,
    hasHistory,
    nonZeroSaleDays: nonZeroDays,
    confidence,
    daysRemaining: daysRemaining === null ? null : round1(daysRemaining),
    forecast7: Math.ceil(avgDailySales * 7),
    forecast30: Math.ceil(avgDailySales * 30),
    forecast90: Math.ceil(avgDailySales * 90),
    risk,
    daysSinceLastSale,
    isDeadStock,
    isEstimate: true
  }
}

/**
 * Compute recommended reorder quantity using min/max policy:
 * target = (avgDailySales * leadTimeDays) + safetyStock - currentStock
 */
export function recommendedReorderQty({ avgDailySales, currentStock, minimumStock, leadTimeDays = 14, safetyDays = 7 }) {
  const safetyStock = Math.max(minimumStock, Math.ceil(avgDailySales * safetyDays))
  const target = Math.ceil(avgDailySales * leadTimeDays) + safetyStock
  const qty = target - currentStock
  return qty > 0 ? qty : 0
}

function round2(n) { return Math.round(n * 100) / 100 }
function round1(n) { return Math.round(n * 10) / 10 }

export default {
  movingAverage, weightedMovingAverage, exponentialSmoothing,
  trendSlope, detectSpikes, toDailySeries, forecast, recommendedReorderQty
}
