/**
 * Payroll Service
 *
 * Responsibilities
 *  - Salary history (previous salaries are never overwritten)
 *  - Salary payment scheduling (next / upcoming / overdue)
 *  - Payroll calculation from CONFIGURED PayrollRule rows
 *  - Salary payment records (never auto-marked PAID)
 *  - Employee / payroll dashboard summaries and payment announcements
 *  - Audit logging for every salary / payroll change
 *
 * Rates are never hard-coded as law: when no active PayrollRule exists the
 * engine falls back to the clearly-labelled reference schedule in ethiopianTax.js.
 */
import prisma from '../config/prisma.js'
import { ApiError } from '../middleware/errorHandler.js'
import { createAuditLog } from './auditService.js'
import {
  calculatePayslip, REFERENCE_TAX_BRACKETS, REFERENCE_PENSION_EMPLOYEE_RATE,
  REFERENCE_PENSION_EMPLOYER_RATE, REFERENCE_LEGAL_REFERENCE
} from './ethiopianTax.js'
import {
  calculateNextSalaryPaymentDate, upcomingSalaryPaymentDates, payrollPeriodKey,
  normalizeFrequency, startOfUtcDay, addDays
} from '../lib/salaryDates.js'
import { postSalaryPaymentEntry } from './accountingService.js'

export const RULE_TYPES = ['INCOME_TAX_BRACKET', 'INCOME_TAX_DEDUCTION', 'PENSION_EMPLOYEE', 'PENSION_EMPLOYER', 'OTHER_DEDUCTION']
export const PAYMENT_STATUSES = ['SCHEDULED', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'CANCELLED']
export const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'OTHER']

const num = (v) => Math.max(0, Number(v) || 0)
const round2 = (n) => Math.round(n * 100) / 100
const today = () => startOfUtcDay(new Date())

/** Rules that are active on a given date (effective-date aware). */
function activeRuleWhere(at) {
  return {
    isActive: true,
    effectiveFrom: { lte: at },
    OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }]
  }
}

/**
 * Resolve the payroll configuration that applies on a date.
 * CONFIGURED when authorised PayrollRule rows exist, otherwise the clearly
 * labelled REFERENCE_DEFAULT schedule.
 */
export async function resolvePayrollConfig(at = new Date()) {
  const rules = await prisma.payrollRule.findMany({
    where: activeRuleWhere(at),
    orderBy: [{ ruleType: 'asc' }, { threshold: 'asc' }]
  })

  const bracketRules = rules.filter((r) => r.ruleType === 'INCOME_TAX_BRACKET')
  const deductionRules = rules.filter((r) => r.ruleType === 'INCOME_TAX_DEDUCTION')
  const employeePensionRule = rules.find((r) => r.ruleType === 'PENSION_EMPLOYEE')
  const employerPensionRule = rules.find((r) => r.ruleType === 'PENSION_EMPLOYER')

  let brackets = null
  if (bracketRules.length) {
    const deductionsByBound = new Map(deductionRules.map((r) => [Number(r.threshold || Infinity), num(r.rate)]))
    brackets = bracketRules.map((r) => {
      const upTo = r.threshold == null ? Infinity : Number(r.threshold)
      return { upTo, rate: num(r.rate), deduction: num(deductionsByBound.get(upTo) ?? 0), name: r.name, legalReference: r.legalReference || null }
    })
  }
  if (!brackets?.length) brackets = REFERENCE_TAX_BRACKETS.map((b) => ({ ...b, legalReference: REFERENCE_LEGAL_REFERENCE }))

  const configured = Boolean(bracketRules.length || employeePensionRule || employerPensionRule)
  return {
    asOf: at,
    source: configured ? 'CONFIGURED' : 'UNCONFIGURED',
    legalReferences: [...new Set(rules.map((r) => r.legalReference).filter(Boolean))],
    rules,
    tax: { brackets },
    pensionEmployeeRate: employeePensionRule ? num(employeePensionRule.rate) : REFERENCE_PENSION_EMPLOYEE_RATE,
    pensionEmployerRate: employerPensionRule ? num(employerPensionRule.rate) : REFERENCE_PENSION_EMPLOYER_RATE
  }
}

export function serializeRule(rule) {
  if (!rule) return null
  return {
    ...rule,
    rate: rule.rate == null ? null : Number(rule.rate),
    threshold: rule.threshold == null ? null : Number(rule.threshold)
  }
}

/** All payroll rules, optionally filtered by type. */
export async function listPayrollRules({ ruleType, includeInactive = false } = {}) {
  const where = {}
  if (ruleType) where.ruleType = ruleType
  if (!includeInactive) where.isActive = true
  const rules = await prisma.payrollRule.findMany({ where, orderBy: [{ ruleType: 'asc' }, { effectiveFrom: 'desc' }] })
  return rules.map(serializeRule)
}

export async function createPayrollRule(data, userId) {
  const name = String(data?.name || '').trim()
  const ruleType = String(data?.ruleType || '').trim().toUpperCase()
  if (!name) throw new ApiError(400, 'Rule name is required')
  if (!RULE_TYPES.includes(ruleType)) throw new ApiError(400, `Rule type must be one of: ${RULE_TYPES.join(', ')}`)
  if (data?.rate == null || data.rate === '' || Number.isNaN(Number(data.rate))) throw new ApiError(400, 'Rule rate is required')

  const rule = await prisma.payrollRule.create({
    data: {
      name,
      ruleType,
      rate: Number(data.rate),
      threshold: data.threshold == null || data.threshold === '' ? null : Number(data.threshold),
      effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : new Date(),
      effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null,
      legalReference: data.legalReference ? String(data.legalReference) : null,
      isActive: data.isActive === undefined ? true : Boolean(data.isActive)
    }
  })
  await createAuditLog({
    userId, action: 'PAYROLL_RULE_CREATED', entity: 'PayrollRule', entityId: rule.id,
    details: { name, ruleType, rate: rule.rate }
  })
  return serializeRule(rule)
}

export async function updatePayrollRule(id, data, userId) {
  const existing = await prisma.payrollRule.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'Payroll rule not found')
  const rule = await prisma.payrollRule.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: String(data.name).trim() }),
      ...(data.ruleType !== undefined && { ruleType: String(data.ruleType).toUpperCase() }),
      ...(data.rate !== undefined && { rate: Number(data.rate) }),
      ...(data.threshold !== undefined && { threshold: data.threshold === '' || data.threshold == null ? null : Number(data.threshold) }),
      ...(data.effectiveFrom !== undefined && { effectiveFrom: new Date(data.effectiveFrom) }),
      ...(data.effectiveTo !== undefined && { effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null }),
      ...(data.legalReference !== undefined && { legalReference: data.legalReference ? String(data.legalReference) : null }),
      ...(data.isActive !== undefined && { isActive: Boolean(data.isActive) })
    }
  })
  await createAuditLog({
    userId, action: 'PAYROLL_RULE_UPDATED', entity: 'PayrollRule', entityId: rule.id,
    details: { name: rule.name, ruleType: rule.ruleType, rate: rule.rate }
  })
  return serializeRule(rule)
}

/**
 * Payroll rules are never hard-deleted: historical payroll must keep the rule
 * that applied when it was processed, so the rule is only deactivated.
 */
export async function deactivatePayrollRule(id, userId) {
  const existing = await prisma.payrollRule.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'Payroll rule not found')
  const rule = await prisma.payrollRule.update({ where: { id }, data: { isActive: false } })
  await createAuditLog({
    userId, action: 'PAYROLL_RULE_DISABLED', entity: 'PayrollRule', entityId: rule.id,
    details: { name: rule.name, ruleType: rule.ruleType }
  })
  return serializeRule(rule)
}

/* ------------------------------------------------------------------ */
/* Salary history                                                      */
/* ------------------------------------------------------------------ */

/**
 * Close the open salary-history row and insert a new one whenever the salary
 * changes so previous salaries are never overwritten.
 */
export async function recordSalaryChange({ employeeId, salary, currency = 'ETB', effectiveFrom = new Date(), reason, createdById, db = prisma }) {
  const from = startOfUtcDay(effectiveFrom)
  await db.employeeSalaryHistory.updateMany({
    where: { employeeId, OR: [{ effectiveTo: null }, { effectiveTo: { gt: from } }] },
    data: { effectiveTo: from }
  })
  return db.employeeSalaryHistory.create({
    data: { employeeId, salary: Number(salary), currency, effectiveFrom: from, reason: reason || null, createdById: createdById || null }
  })
}

/** Salary history list for an employee, newest first. */
export async function listSalaryHistory(employeeId) {
  const rows = await prisma.employeeSalaryHistory.findMany({
    where: { employeeId },
    orderBy: { effectiveFrom: 'desc' },
    include: { createdBy: { select: { id: true, name: true, email: true } } }
  })
  return rows.map((r) => ({ ...r, salary: Number(r.salary) }))
}

/** The salary that applied on a given date (historical payroll lookup). */
export async function salaryApplicableAt(employeeId, at = new Date()) {
  const date = at instanceof Date ? at : new Date(at)
  const row = await prisma.employeeSalaryHistory.findFirst({
    where: { employeeId, effectiveFrom: { lte: date }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: date } }] },
    orderBy: { effectiveFrom: 'desc' }
  })
  return row ? Number(row.salary) : null
}

/* ------------------------------------------------------------------ */
/* Payroll calculation                                                 */
/* ------------------------------------------------------------------ */

/**
 * Full payroll calculation for one employee.
 * Uses the salary that applied on the payroll date, the configured payroll
 * rules and the employee's own earnings/deductions — and never returns a
 * negative net salary.
 */
export async function calculateEmployeePayroll(employee, {
  at = new Date(),
  baseSalary,
  overtime = 0,
  bonus = 0,
  allowances = 0,
  otherEarnings = 0,
  otherDeductions = 0,
  includePension = true,
  config
} = {}) {
  if (!employee) throw new ApiError(400, 'Employee is required')
  const resolved = config || await resolvePayrollConfig(at)

  let base = baseSalary
  if (base == null) {
    base = await salaryApplicableAt(employee.id, at)
    if (base == null) base = employee.salary == null ? 0 : Number(employee.salary)
  }

  const pensionEmployeeRate = resolved.pensionEmployeeRate
  const pensionEmployerRate = resolved.pensionEmployerRate

  const slip = calculatePayslip({
    baseSalary: base, overtime, bonus, allowances, otherEarnings, otherDeductions,
    includePension, pensionEmployeeRate, pensionEmployerRate, tax: resolved.tax
  })

  return {
    ...slip,
    currency: employee.salaryCurrency || 'ETB',
    frequency: normalizeFrequency(employee.salaryPaymentFrequency),
    payrollPeriod: payrollPeriodKey(at),
    at,
    ruleSource: resolved.source,
    rules: resolved.rules,
    legalReferences: resolved.legalReferences,
    pensionEmployeeRate,
    pensionEmployerRate
  }
}

/* ------------------------------------------------------------------ */
/* Salary payment records                                              */
/* ------------------------------------------------------------------ */

function validatePaymentMethod(method) {
  if (method && !PAYMENT_METHODS.includes(method)) throw new ApiError(400, 'Invalid payment method')
}

/** Derived totals cannot be overridden by the caller. All inputs are money amounts. */
export function paymentAmounts(data = {}, defaults = {}) {
  const result = {}
  for (const key of ['baseSalary', 'overtime', 'bonus', 'allowances', 'otherEarnings', 'incomeTax', 'employeePension', 'employerPension', 'otherDeductions']) {
    const value = Number(data[key] == null || data[key] === '' ? (defaults[key] ?? 0) : data[key])
    if (!Number.isFinite(value) || value < 0) throw new ApiError(400, `${key} must be a finite non-negative amount`)
    result[key] = round2(value)
  }
  result.grossSalary = round2(result.baseSalary + result.overtime + result.bonus + result.allowances + result.otherEarnings)
  result.netSalary = round2(Math.max(0, result.grossSalary - result.incomeTax - result.employeePension - result.otherDeductions))
  for (const key of ['grossSalary', 'netSalary']) {
    if (data[key] != null && data[key] !== '' && Number(data[key]) !== result[key]) throw new ApiError(400, `${key} must equal the calculated total`)
  }
  return result
}

function dateKey(value) {
  const d = value instanceof Date ? value : new Date(value)
  return d.toISOString().slice(0, 10)
}

/**
 * Payment status exposed to clients. OVERDUE is derived (never written
 * automatically) so a due date arriving never turns a payment into PAID.
 */
export function paymentStatus(payment) {
  if (!payment) return null
  const stored = String(payment.status || 'SCHEDULED').toUpperCase()
  if (['PAID', 'CANCELLED', 'PARTIALLY_PAID'].includes(stored)) return stored
  const scheduled = payment.scheduledDate ? startOfUtcDay(new Date(payment.scheduledDate)) : null
  if (scheduled && scheduled.getTime() < today().getTime()) return 'OVERDUE'
  return stored || 'SCHEDULED'
}

export function serializePayment(payment) {
  if (!payment) return null
  const numberFields = ['baseSalary', 'grossSalary', 'incomeTax', 'employeePension', 'employerPension', 'otherDeductions', 'netSalary']
  const out = { ...payment }
  for (const f of numberFields) out[f] = payment[f] == null ? null : Number(payment[f])
  out.status = paymentStatus(payment)
  out.storedStatus = payment.status
  out.periodLabel = payment.payrollPeriod
  return out
}

export async function listPayments({ page = 1, limit = 20, employeeId, status, from, to, search, period } = {}) {
  const pageNum = Math.max(1, parseInt(page) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(limit) || 20))
  const where = {}
  if (employeeId) where.employeeId = employeeId
  if (period) where.payrollPeriod = period
  if (status) where.status = String(status).toUpperCase()
  if (from || to) {
    where.scheduledDate = {}
    if (from) where.scheduledDate.gte = startOfUtcDay(new Date(from))
    if (to) where.scheduledDate.lte = new Date(new Date(to).getTime() + 86399999)
  }
  if (search) {
    where.employee = {
      OR: [
        { employeeCode: { contains: search } }, { firstName: { contains: search } },
        { lastName: { contains: search } }
      ]
    }
  }

  const [rows, total] = await Promise.all([
    prisma.employeeSalaryPayment.findMany({
      where,
      include: {
        employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true, jobTitle: true, department: { select: { name: true } } } },
        processedBy: { select: { id: true, name: true, email: true } }
      },
      orderBy: [{ scheduledDate: 'desc' }, { createdAt: 'desc' }],
      skip: (pageNum - 1) * pageSize,
      take: pageSize
    }),
    prisma.employeeSalaryPayment.count({ where })
  ])

  return {
    data: rows.map(serializePayment),
    pagination: { page: pageNum, limit: pageSize, total, totalPages: Math.ceil(total / pageSize) || 1 }
  }
}

export async function getPayment(id) {
  const payment = await prisma.employeeSalaryPayment.findUnique({
    where: { id },
    include: {
      employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true, jobTitle: true, salaryCurrency: true, department: { select: { name: true } } } },
      processedBy: { select: { id: true, name: true, email: true } }
    }
  })
  if (!payment) throw new ApiError(404, 'Salary payment not found')
  return serializePayment(payment)
}

/**
 * Create a salary payment record. Amounts are calculated from the applicable
 * salary/configured rules when not supplied. The record is created as
 * SCHEDULED — a payment only becomes PAID when an authorised user confirms it.
 */
export async function createPayment(data, userId) {
  const employee = await prisma.employee.findUnique({ where: { id: data?.employeeId } })
  if (!employee) throw new ApiError(400, 'A valid employee is required')

  const scheduledDate = data?.scheduledDate
    ? startOfUtcDay(new Date(data.scheduledDate))
    : calculateNextSalaryPaymentDate(employee)
  if (!scheduledDate || !Number.isFinite(scheduledDate.getTime())) throw new ApiError(400, 'Could not resolve a scheduled payment date — set the employee payment day or supply a date')
  const payrollPeriod = data?.payrollPeriod || payrollPeriodKey(scheduledDate)

  const slip = await calculateEmployeePayroll(employee, {
    at: scheduledDate,
    baseSalary: data?.baseSalary,
    overtime: data?.overtime,
    bonus: data?.bonus,
    allowances: data?.allowances,
    otherEarnings: data?.otherEarnings,
    otherDeductions: data?.otherDeductions,
    includePension: data?.includePension !== false
  })

  const amounts = paymentAmounts(data, {
    baseSalary: slip.baseSalary, overtime: slip.overtime, bonus: slip.bonus,
    allowances: slip.allowances, otherEarnings: slip.otherEarnings,
    incomeTax: slip.incomeTax, employeePension: slip.pensionEmployee,
    employerPension: slip.pensionEmployer, otherDeductions: slip.otherDeductions
  })
  validatePaymentMethod(data.paymentMethod)

  const payment = await prisma.employeeSalaryPayment.create({
    data: {
      employeeId: employee.id,
      payrollPeriod,
      scheduledDate,
      paidDate: null,
      ...amounts,
      currency: slip.currency,
      calculationSnapshot: JSON.stringify({ at: scheduledDate, source: slip.ruleSource, rules: slip.rules, legalReferences: slip.legalReferences, calculated: slip, recorded: amounts }),
      paymentMethod: data?.paymentMethod || null,
      paymentReference: data?.paymentReference || null,
      status: 'SCHEDULED',
      notes: data?.notes || null,
      processedById: null
    }
  })

  await createAuditLog({
    userId, action: 'PAYROLL_CREATED', entity: 'EmployeeSalaryPayment', entityId: payment.id,
    details: { employeeCode: employee.employeeCode, payrollPeriod, scheduledDate: dateKey(scheduledDate), netSalary: amounts.netSalary, ruleSource: slip.ruleSource }
  })
  return getPayment(payment.id)
}

/** Edit a payment record. Amounts and the paid/reference fields are audited. */
export async function updatePayment(id, data, userId) {
  const existing = await prisma.employeeSalaryPayment.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'Salary payment not found')

  if (['PAID', 'CANCELLED', 'PARTIALLY_PAID'].includes(existing.status)) throw new ApiError(400, 'Confirmed or cancelled payments cannot be edited')
  if (data?.status !== undefined) throw new ApiError(400, 'Use the pay or cancel endpoint to change payment status')
  const payload = paymentAmounts(data, existing)
  validatePaymentMethod(data?.paymentMethod)
  payload.calculationSnapshot = JSON.stringify({ original: existing.calculationSnapshot, adjustedBy: userId, adjustedAt: new Date(), recorded: payload })
  if (data?.payrollPeriod !== undefined) payload.payrollPeriod = String(data.payrollPeriod)
  if (data?.scheduledDate !== undefined) payload.scheduledDate = startOfUtcDay(new Date(data.scheduledDate))
  if (data?.paymentMethod !== undefined) payload.paymentMethod = data.paymentMethod || null
  if (data?.paymentReference !== undefined) payload.paymentReference = data.paymentReference || null
  if (data?.notes !== undefined) payload.notes = data.notes || null

  // Net salary may never be negative, and status changes only through pay/cancel.
  if (payload.netSalary != null && payload.netSalary < 0) throw new ApiError(400, 'Net salary can never be negative')
  if (data?.status !== undefined) {
    const status = String(data.status).toUpperCase()
    if (status === 'PAID') throw new ApiError(400, 'Use the pay endpoint to confirm a salary payment')
    if (!PAYMENT_STATUSES.includes(status)) throw new ApiError(400, `Status must be one of: ${PAYMENT_STATUSES.join(', ')}`)
    payload.status = status
  }

  const payment = await prisma.employeeSalaryPayment.update({ where: { id }, data: payload })
  await createAuditLog({
    userId, action: 'PAYROLL_UPDATED', entity: 'EmployeeSalaryPayment', entityId: payment.id,
    details: { payrollPeriod: payment.payrollPeriod, changed: Object.keys(payload) }
  })
  return getPayment(payment.id)
}

/**
 * Confirm a salary payment as PAID. Only an authorised user can do this — the
 * system never marks a payment paid just because the due date arrived.
 */
export async function markPaymentPaid(id, { paidDate, paymentMethod, paymentReference, notes, status = 'PAID' } = {}, userId) {
  const existing = await prisma.employeeSalaryPayment.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'Salary payment not found')
  validatePaymentMethod(paymentMethod)
  if (paidDate && !Number.isFinite(new Date(paidDate).getTime())) throw new ApiError(400, 'Invalid paid date')
  if (existing.status === 'PAID') throw new ApiError(400, 'Payment is already confirmed')
  const confirmed = String(status || 'PAID').toUpperCase()
  if (!['PAID', 'PARTIALLY_PAID'].includes(confirmed)) throw new ApiError(400, 'Payments can only be confirmed as PAID or PARTIALLY_PAID')
  if (existing.status === 'CANCELLED') throw new ApiError(400, 'A cancelled payment cannot be marked as paid')

  const payment = await prisma.employeeSalaryPayment.update({
    where: { id },
    data: {
      status: confirmed,
      paidDate: paidDate ? startOfUtcDay(new Date(paidDate)) : startOfUtcDay(new Date()),
      paymentMethod: paymentMethod || existing.paymentMethod || 'CASH',
      paymentReference: paymentReference !== undefined ? (paymentReference || null) : existing.paymentReference,
      notes: notes !== undefined ? (notes || null) : existing.notes,
      processedById: userId || existing.processedById
    }
  })
  await createAuditLog({
    userId, action: 'PAYROLL_MARKED_PAID', entity: 'EmployeeSalaryPayment', entityId: payment.id,
    details: {
      payrollPeriod: payment.payrollPeriod, status: payment.status,
      paidDate: payment.paidDate ? dateKey(payment.paidDate) : null,
      paymentMethod: payment.paymentMethod, paymentReference: payment.paymentReference,
      netSalary: payment.netSalary == null ? null : Number(payment.netSalary)
    }
  })
  // Journal: Dr Salaries Expense, Cr Cash/Bank
  try { await postSalaryPaymentEntry(payment) } catch (ledgerError) { console.error('Journal posting failed for salary payment:', ledgerError.message) }
  return getPayment(payment.id)
}

export async function cancelPayment(id, { notes } = {}, userId) {
  const existing = await prisma.employeeSalaryPayment.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'Salary payment not found')
  if (existing.status === 'PAID') throw new ApiError(400, 'A paid salary payment cannot be cancelled')
  const payment = await prisma.employeeSalaryPayment.update({
    where: { id },
    data: { status: 'CANCELLED', notes: notes !== undefined ? (notes || null) : existing.notes }
  })
  await createAuditLog({
    userId, action: 'PAYROLL_CANCELLED', entity: 'EmployeeSalaryPayment', entityId: payment.id,
    details: { payrollPeriod: payment.payrollPeriod, notes: payment.notes }
  })
  return getPayment(payment.id)
}

/* ------------------------------------------------------------------ */
/* Employee payroll views                                              */
/* ------------------------------------------------------------------ */

/** Salary / payment schedule summary shown on the employee details page. */
export async function getEmployeeSalaryInfo(employee, { at = new Date() } = {}) {
  const [history, payments] = await Promise.all([
    listSalaryHistory(employee.id),
    prisma.employeeSalaryPayment.findMany({
      where: { employeeId: employee.id },
      orderBy: [{ scheduledDate: 'desc' }],
      take: 50
    })
  ])
  const serialized = payments.map(serializePayment)
  const t = today()
  const openPayments = serialized.filter((p) => ['SCHEDULED', 'PARTIALLY_PAID', 'OVERDUE'].includes(p.status))
  const nextPayment = openPayments.filter((p) => startOfUtcDay(new Date(p.scheduledDate)).getTime() >= t.getTime())
    .sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate))[0]
    || null
  const lastPayment = serialized.filter((p) => p.status === 'PAID')
    .sort((a, b) => new Date(b.paidDate || b.scheduledDate) - new Date(a.paidDate || a.scheduledDate))[0] || null
  const calculatedNext = calculateNextSalaryPaymentDate(employee, at)

  return {
    salary: employee.salary == null ? null : Number(employee.salary),
    currency: employee.salaryCurrency || 'ETB',
    paymentFrequency: normalizeFrequency(employee.salaryPaymentFrequency),
    paymentDay: employee.salaryPaymentDay ?? null,
    salaryStartDate: employee.salaryStartDate || null,
    salaryNotes: employee.salaryNotes || null,
    nextPaymentDate: nextPayment ? nextPayment.scheduledDate : calculatedNext,
    nextPaymentDateSource: nextPayment ? 'PAYMENT_RECORD' : 'CALCULATED',
    nextPayment: nextPayment || null,
    lastPayment: lastPayment || null,
    paymentStatus: lastPayment ? lastPayment.status : (openPayments[0]?.status || null),
    upcoming: upcomingSalaryPaymentDates(employee, { from: at, days: 120, limit: 4 }),
    history,
    payments: serialized
  }
}

/** Payroll payment history for one employee (paginated). */
export async function getEmployeePayroll(employeeId, options = {}) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } })
  if (!employee) throw new ApiError(404, 'Employee not found')
  const [info, page] = await Promise.all([
    getEmployeeSalaryInfo(employee),
    listPayments({ ...options, employeeId })
  ])
  return { employee: { id: employee.id, employeeCode: employee.employeeCode, firstName: employee.firstName, lastName: employee.lastName }, salary: info, ...page }
}

/** The next salary payment (from a record when available, otherwise calculated). */
export async function getEmployeeNextPayment(employeeId) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } })
  if (!employee) throw new ApiError(404, 'Employee not found')
  const t = today()
  const pending = await prisma.employeeSalaryPayment.findMany({
    where: { employeeId, status: { in: ['SCHEDULED', 'PARTIALLY_PAID'] }, scheduledDate: { gte: t } },
    orderBy: { scheduledDate: 'asc' },
    take: 1
  })
  const info = await getEmployeeSalaryInfo(employee)
  const record = pending[0] ? serializePayment(pending[0]) : null
  return {
    employeeId,
    employeeCode: employee.employeeCode,
    scheduledDate: record ? record.scheduledDate : info.nextPaymentDate,
    source: record ? 'PAYMENT_RECORD' : 'CALCULATED',
    payment: record,
    salary: info.salary,
    currency: info.currency,
    frequency: info.paymentFrequency,
    paymentDay: info.paymentDay
  }
}

/* ------------------------------------------------------------------ */
/* Payment announcements & dashboard summaries                         */
/* ------------------------------------------------------------------ */

const SCHEDULE_SELECT = {
  id: true, employeeCode: true, firstName: true, lastName: true, jobTitle: true,
  salary: true, salaryCurrency: true, salaryPaymentDay: true, salaryPaymentFrequency: true,
  salaryStartDate: true, department: { select: { name: true } }
}

const emptyBucket = () => ({ count: 0, total: 0, employees: [] })

function startOfUtcMonth(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

/**
 * Salary payment announcements: TODAY / TOMORROW / UPCOMING / OVERDUE / PAID.
 *
 * A payment is only reported as PAID when its record says so — the arrival of
 * the due date alone never marks anything as paid.
 */
export async function getPaymentAnnouncements({ days = 7, at = new Date() } = {}) {
  const t = startOfUtcDay(at)
  const [employees, records] = await Promise.all([
    prisma.employee.findMany({
      where: { salary: { not: null }, employmentStatus: 'ACTIVE' },
      select: SCHEDULE_SELECT,
      orderBy: { employeeCode: 'asc' }
    }),
    prisma.employeeSalaryPayment.findMany({
      where: { scheduledDate: { gte: addDays(t, -400), lte: addDays(t, 120) } },
      select: { id: true, employeeId: true, scheduledDate: true, status: true, netSalary: true, payrollPeriod: true }
    })
  ])

  const byEmployeeDate = new Map(records.map((r) => [`${r.employeeId}|${dateKey(r.scheduledDate)}`, r]))
  const employeeById = new Map(employees.map((e) => [e.id, e]))
  const buckets = { TODAY: emptyBucket(), TOMORROW: emptyBucket(), UPCOMING: emptyBucket(), OVERDUE: emptyBucket(), PAID: emptyBucket() }
  const push = (key, entry) => {
    const bucket = buckets[key]
    bucket.count += 1
    bucket.total = round2(bucket.total + entry.amount)
    if (bucket.employees.length < 200) bucket.employees.push(entry)
  }
  const entryFor = (employee, date, record) => ({
    employeeId: employee.id,
    employeeCode: employee.employeeCode,
    name: `${employee.firstName} ${employee.lastName}`,
    jobTitle: employee.jobTitle || null,
    department: employee.department?.name || null,
    scheduledDate: date,
    currency: employee.salaryCurrency || 'ETB',
    amount: record?.netSalary != null ? round2(Number(record.netSalary)) : round2(Number(employee.salary || 0)),
    paymentId: record?.id || null,
    status: record ? paymentStatus(record) : 'SCHEDULED'
  })

  for (const employee of employees) {
    const nextDate = calculateNextSalaryPaymentDate(employee, t)
    if (!nextDate) continue
    const record = byEmployeeDate.get(`${employee.id}|${dateKey(nextDate)}`)
    if (record && String(record.status).toUpperCase() === 'CANCELLED') continue
    const entry = entryFor(employee, nextDate, record)
    if (record && paymentStatus(record) === 'PAID') { push('PAID', entry); continue }
    const diff = Math.round((startOfUtcDay(nextDate).getTime() - t.getTime()) / 86400000)
    if (diff === 0) push('TODAY', entry)
    else if (diff === 1) push('TOMORROW', entry)
    else if (diff <= days) push('UPCOMING', entry)
  }

  for (const record of records) {
    const status = paymentStatus(record)
    if (!['SCHEDULED', 'PARTIALLY_PAID', 'OVERDUE'].includes(status)) continue
    if (startOfUtcDay(record.scheduledDate).getTime() >= t.getTime()) continue
    const employee = employeeById.get(record.employeeId)
    if (!employee) continue
    const entry = entryFor(employee, record.scheduledDate, record)
    push('OVERDUE', { ...entry, daysOverdue: Math.round((t.getTime() - startOfUtcDay(record.scheduledDate).getTime()) / 86400000) })
  }

  return {
    asOf: t,
    currency: employees[0]?.salaryCurrency || 'ETB',
    windowDays: days,
    alerts: buckets,
    counts: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.count])),
    note: 'PAID is only reported from a confirmed payment record — a due date arriving never marks a payment as paid.'
  }
}

/** Upcoming salary payments inside a window (flat list). */
export async function getUpcomingPayments({ days = 7, at = new Date() } = {}) {
  const announcements = await getPaymentAnnouncements({ days, at })
  const { TODAY, TOMORROW, UPCOMING } = announcements.alerts
  const data = [...TODAY.employees, ...TOMORROW.employees, ...UPCOMING.employees]
    .sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate))
  return { asOf: announcements.asOf, windowDays: days, count: data.length, total: round2(data.reduce((s, p) => s + p.amount, 0)), data }
}

/** Overdue salary payments (unpaid and past the scheduled date). */
export async function getOverduePayments() {
  const announcements = await getPaymentAnnouncements()
  const { OVERDUE } = announcements.alerts
  return { asOf: announcements.asOf, count: OVERDUE.count, total: OVERDUE.total, data: OVERDUE.employees }
}

/** Employees missing payroll information — used for dashboard alerts. */
export async function getEmployeeAlerts({ limit = 50 } = {}) {
  const missing = (field) => ({
    where: { employmentStatus: 'ACTIVE', [field]: null },
    select: { id: true, employeeCode: true, firstName: true, lastName: true, jobTitle: true },
    take: limit,
    orderBy: { employeeCode: 'asc' }
  })
  const [noSalary, noTin, noPension, announcements] = await Promise.all([
    prisma.employee.findMany(missing('salary')),
    prisma.employee.findMany(missing('tinNumber')),
    prisma.employee.findMany(missing('pensionIdNumber')),
    getPaymentAnnouncements()
  ])
  const name = (e) => `${e.firstName} ${e.lastName}`
  const upcoming = [announcements.alerts.TODAY, announcements.alerts.TOMORROW, announcements.alerts.UPCOMING]
  return {
    employeesWithoutSalary: { count: noSalary.length, employees: noSalary.map((e) => ({ id: e.id, employeeCode: e.employeeCode, name: name(e), jobTitle: e.jobTitle })) },
    employeesWithoutTin: { count: noTin.length, employees: noTin.map((e) => ({ id: e.id, employeeCode: e.employeeCode, name: name(e) })) },
    employeesWithoutPensionId: { count: noPension.length, employees: noPension.map((e) => ({ id: e.id, employeeCode: e.employeeCode, name: name(e) })) },
    upcomingPayments: { count: upcoming.reduce((s, b) => s + b.count, 0), total: round2(upcoming.reduce((s, b) => s + b.total, 0)) },
    overduePayments: { count: announcements.alerts.OVERDUE.count, total: announcements.alerts.OVERDUE.total }
  }
}

/** Employee summary counters (database aggregates — not loaded into the UI). */
export async function getEmployeeSummary() {
  const monthStart = startOfUtcMonth()
  const nextMonth = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1))
  const [total, active, inactive, newThisMonth, withSalary] = await Promise.all([
    prisma.employee.count(),
    prisma.employee.count({ where: { employmentStatus: 'ACTIVE' } }),
    prisma.employee.count({ where: { NOT: { employmentStatus: 'ACTIVE' } } }),
    prisma.employee.count({ where: { hireDate: { gte: monthStart, lt: nextMonth } } }),
    prisma.employee.count({ where: { salary: { not: null } } })
  ])
  return { total, active, inactive, newThisMonth, withSalary, withoutSalary: total - withSalary }
}

/** Payroll summary (aggregate queries + announcement buckets). */
export async function getPayrollSummary() {
  const monthStart = startOfUtcMonth()
  const nextMonth = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1))
  const [salaryAgg, paidAgg, pending, announcements, config] = await Promise.all([
    prisma.employee.aggregate({ where: { salary: { not: null }, employmentStatus: 'ACTIVE' }, _sum: { salary: true }, _count: true }),
    prisma.employeeSalaryPayment.aggregate({ where: { status: 'PAID', paidDate: { gte: monthStart, lt: nextMonth } }, _sum: { netSalary: true }, _count: true }),
    prisma.employeeSalaryPayment.count({ where: { status: { in: ['SCHEDULED', 'PARTIALLY_PAID'] } } }),
    getPaymentAnnouncements(),
    resolvePayrollConfig()
  ])
  const { TODAY, TOMORROW, UPCOMING, OVERDUE } = announcements.alerts
  return {
    currency: 'ETB',
    monthlyPayroll: round2(Number(salaryAgg._sum.salary || 0)),
    employeesWithSalary: salaryAgg._count,
    dueToday: TODAY.total,
    dueTodayCount: TODAY.count,
    dueTomorrow: TOMORROW.total,
    dueTomorrowCount: TOMORROW.count,
    dueThisWeek: round2(TODAY.total + TOMORROW.total + UPCOMING.total),
    dueThisWeekCount: TODAY.count + TOMORROW.count + UPCOMING.count,
    overdue: OVERDUE.total,
    overdueCount: OVERDUE.count,
    paidThisMonth: round2(Number(paidAgg._sum.netSalary || 0)),
    paidThisMonthCount: paidAgg._count,
    pendingPayments: pending,
    ruleSource: config.source,
    legalReferences: config.legalReferences,
    pensionEmployeeRate: config.pensionEmployeeRate,
    pensionEmployerRate: config.pensionEmployerRate
  }
}

export default {
  RULE_TYPES,
  PAYMENT_STATUSES,
  PAYMENT_METHODS,
  resolvePayrollConfig,
  listPayrollRules,
  createPayrollRule,
  updatePayrollRule,
  deactivatePayrollRule,
  recordSalaryChange,
  listSalaryHistory,
  salaryApplicableAt,
  calculateEmployeePayroll,
  listPayments,
  getPayment,
  createPayment,
  updatePayment,
  markPaymentPaid,
  cancelPayment,
  getEmployeeSalaryInfo,
  getEmployeePayroll,
  getEmployeeNextPayment,
  getPaymentAnnouncements,
  getUpcomingPayments,
  getOverduePayments,
  getEmployeeAlerts,
  getEmployeeSummary,
  getPayrollSummary
}
