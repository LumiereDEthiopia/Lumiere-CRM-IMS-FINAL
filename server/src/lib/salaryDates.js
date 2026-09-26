/**
 * Salary payment-date helpers.
 *
 * These run on the BACKEND so payroll dates never depend on the browser clock
 * or on frontend JavaScript. Every date is a real calendar date taken at
 * UTC midnight, so month-end payment days (30/31) are safe even for February.
 */

export const PAYMENT_FREQUENCIES = ['MONTHLY', 'WEEKLY', 'BIWEEKLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL']

/** Normalise an unknown/empty frequency to a supported one. */
export function normalizeFrequency(value) {
  const f = String(value || 'MONTHLY').trim().toUpperCase().replace(/[-\s]+/g, '_')
  return PAYMENT_FREQUENCIES.includes(f) ? f : 'MONTHLY'
}

/** Number of days in a month. `month` is 1-based (1 = January). */
export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * Clamp a requested payment day into a valid day for that month.
 * Payment day 31 in February becomes 28 (or 29 in a leap year) — never an
 * invalid date such as 2026-02-31.
 */
export function clampPaymentDay(day, year, month) {
  const last = daysInMonth(year, month)
  const requested = Number.parseInt(day, 10)
  if (!Number.isFinite(requested) || requested <= 0) return last
  return Math.min(Math.max(1, requested), last)
}

/** Real calendar date (UTC midnight) for a 1-based year/month/day, clamped. */
export function calendarDate(year, month, day) {
  return new Date(Date.UTC(year, month - 1, clampPaymentDay(day, year, month)))
}

/** UTC midnight of the given date (date-only comparisons). */
export function startOfUtcDay(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/** Add (or subtract) whole months, clamping the day to the target month. */
export function addMonths(date, count, day = null) {
  const base = startOfUtcDay(date)
  const targetMonth = base.getUTCMonth() + count
  const year = base.getUTCFullYear() + Math.floor(targetMonth / 12)
  const month = ((targetMonth % 12) + 12) % 12 + 1
  return calendarDate(year, month, day == null ? base.getUTCDate() : day)
}

export function addDays(date, count) {
  const base = startOfUtcDay(date)
  return new Date(base.getTime() + count * 86400000)
}

/** 'YYYY-MM' period key used to store payroll periods. */
export function payrollPeriodKey(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** '2026-09' -> 'Sep 2026' (display only). */
export function payrollPeriodLabel(period) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(period || ''))
  if (!m) return String(period || '')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[Number(m[2]) - 1] || m[2]} ${m[1]}`
}

/**
 * Payment day for an employee. `null` means "no day configured" — the last day
 * of the month is then used so a date can still be calculated.
 */
export function resolvePaymentDay(employee) {
  const day = employee?.salaryPaymentDay
  if (day == null || day === '') return null
  const n = Number.parseInt(day, 10)
  return Number.isFinite(n) ? n : null
}

function monthDayCandidate(year, month, paymentDay) {
  return calendarDate(year, month, paymentDay == null ? daysInMonth(year, month) : paymentDay)
}

/** Anchor month (and step) for frequencies that advance in whole months. */
function anchoredMonths(frequency, employee) {
  const start = employee?.salaryStartDate ? new Date(employee.salaryStartDate) : null
  const anchorMonth = start && !Number.isNaN(start.getTime()) ? start.getUTCMonth() + 1 : 1
  if (frequency === 'QUARTERLY') return [anchorMonth, 3]
  if (frequency === 'SEMI_ANNUAL') return [anchorMonth, 6]
  return [anchorMonth, 12]
}

/**
 * Next salary payment date for an employee.
 *
 * MONTHLY   — `salaryPaymentDay` each month (last day of month when unset).
 * WEEKLY    — next occurrence of `salaryPaymentDay` as weekday (1 = Mon .. 7 = Sun).
 * BIWEEKLY  — every 14 days from `salaryStartDate`, otherwise the next weekday.
 * QUARTERLY / SEMI_ANNUAL / ANNUAL — every 3 / 6 / 12 months from the salary
 *                                     start month (January when unknown).
 *
 * A payment due today is returned as today (it is due, not yet paid): payroll
 * status always comes from the payment record, never from this date alone.
 *
 * @param {object} employee employee row (salaryPaymentDay / salaryPaymentFrequency / salaryStartDate)
 * @param {Date} [currentDate] date to calculate from (defaults to now)
 * @returns {Date|null} real calendar date, or null when no schedule can be resolved
 */
export function calculateNextSalaryPaymentDate(employee, currentDate = new Date()) {
  const today = startOfUtcDay(currentDate)
  const frequency = normalizeFrequency(employee?.salaryPaymentFrequency)
  const paymentDay = resolvePaymentDay(employee)

  if (frequency === 'MONTHLY') {
    const candidate = monthDayCandidate(today.getUTCFullYear(), today.getUTCMonth() + 1, paymentDay)
    if (candidate.getTime() >= today.getTime()) return candidate
    return monthDayCandidate(today.getUTCFullYear(), today.getUTCMonth() + 2, paymentDay)
  }

  if (frequency === 'WEEKLY') {
    const weekday = paymentDay == null ? (today.getUTCDay() || 7) : Math.min(7, Math.max(1, paymentDay))
    const current = today.getUTCDay() || 7
    return addDays(today, (weekday - current + 7) % 7)
  }

  if (frequency === 'BIWEEKLY') {
    const start = employee?.salaryStartDate ? startOfUtcDay(new Date(employee.salaryStartDate)) : null
    if (start && !Number.isNaN(start.getTime())) {
      if (start.getTime() >= today.getTime()) return start
      const elapsed = Math.floor((today.getTime() - start.getTime()) / 86400000)
      return addDays(start, Math.ceil(elapsed / 14) * 14)
    }
    const weekday = paymentDay == null ? (today.getUTCDay() || 7) : Math.min(7, Math.max(1, paymentDay))
    const current = today.getUTCDay() || 7
    return addDays(today, (weekday - current + 7) % 7)
  }

  // QUARTERLY / SEMI_ANNUAL / ANNUAL — walk forward from the anchor month.
  const [anchorMonth, stepMonths] = anchoredMonths(frequency, employee)
  const baseYear = today.getUTCFullYear()
  for (let i = 0; i < 8; i += 1) {
    const totalMonths = anchorMonth - 1 + i * stepMonths
    const year = baseYear + Math.floor(totalMonths / 12)
    const month = (totalMonths % 12) + 1
    const candidate = monthDayCandidate(year, month, paymentDay)
    if (candidate.getTime() >= today.getTime()) return candidate
  }
  return null
}

/**
 * Upcoming scheduled payment dates inside a window — used to plan reminders
 * without creating duplicate payment records.
 */
export function upcomingSalaryPaymentDates(employee, { from = new Date(), days = 31, limit = 4 } = {}) {
  const end = addDays(from, days)
  const dates = []
  let cursor = new Date(from)
  for (let i = 0; i < limit; i += 1) {
    const next = calculateNextSalaryPaymentDate(employee, cursor)
    if (!next || next.getTime() > end.getTime()) break
    dates.push(next)
    cursor = addDays(next, 1)
  }
  return dates
}

export default {
  PAYMENT_FREQUENCIES,
  normalizeFrequency,
  daysInMonth,
  clampPaymentDay,
  calendarDate,
  startOfUtcDay,
  addMonths,
  addDays,
  payrollPeriodKey,
  payrollPeriodLabel,
  resolvePaymentDay,
  calculateNextSalaryPaymentDate,
  upcomingSalaryPaymentDates
}