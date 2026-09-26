/**
 * Payroll Controller
 * Salary payment records, payment announcements and configurable payroll rules.
 */
import {
  listPayments, getPayment, createPayment, updatePayment, markPaymentPaid, cancelPayment,
  getUpcomingPayments, getOverduePayments, listPayrollRules, createPayrollRule,
  updatePayrollRule, deactivatePayrollRule, resolvePayrollConfig, calculateEmployeePayroll
} from '../services/payrollService.js'
import prisma from '../config/prisma.js'
import { ApiError } from '../middleware/errorHandler.js'

export async function getPayrollPayments(req, res, next) {
  try { res.json({ success: true, ...(await listPayments(req.query)) }) } catch (e) { next(e) }
}

export async function getPayrollPaymentById(req, res, next) {
  try { res.json({ success: true, data: await getPayment(req.params.id) }) } catch (e) { next(e) }
}

export async function createPayrollPayment(req, res, next) {
  try { res.status(201).json({ success: true, data: await createPayment(req.body, (req.userId || req.user?.userId || req.user?.id)) }) } catch (e) { next(e) }
}

export async function updatePayrollPayment(req, res, next) {
  try { res.json({ success: true, data: await updatePayment(req.params.id, req.body, (req.userId || req.user?.userId || req.user?.id)) }) } catch (e) { next(e) }
}

/** Confirm a payment as PAID — an authorised user must do this explicitly. */
export async function payPayrollPayment(req, res, next) {
  try { res.json({ success: true, data: await markPaymentPaid(req.params.id, req.body, (req.userId || req.user?.userId || req.user?.id)) }) } catch (e) { next(e) }
}

export async function cancelPayrollPayment(req, res, next) {
  try { res.json({ success: true, data: await cancelPayment(req.params.id, req.body, (req.userId || req.user?.userId || req.user?.id)) }) } catch (e) { next(e) }
}

export async function getUpcoming(req, res, next) {
  try {
    const days = Math.min(120, Math.max(1, parseInt(req.query.days) || 7))
    res.json({ success: true, data: await getUpcomingPayments({ days }) })
  } catch (e) { next(e) }
}

export async function getOverdue(req, res, next) {
  try { res.json({ success: true, data: await getOverduePayments() }) } catch (e) { next(e) }
}

/** Preview a payroll calculation (gross, tax, pension, net) without saving. */
export async function calculatePayroll(req, res, next) {
  try {
    const employee = await prisma.employee.findUnique({ where: { id: req.body?.employeeId } })
    if (!employee) throw new ApiError(400, 'A valid employee is required')
    res.json({ success: true, data: await calculateEmployeePayroll(employee, req.body || {}) })
  } catch (e) { next(e) }
}

export async function getPayrollRules(req, res, next) {
  try { res.json({ success: true, data: await listPayrollRules({ ruleType: req.query.ruleType, includeInactive: req.query.includeInactive === 'true' }) }) } catch (e) { next(e) }
}

export async function getPayrollConfig(req, res, next) {
  try {
    const config = await resolvePayrollConfig()
    res.json({
      success: true,
      data: {
        source: config.source,
        asOf: config.asOf,
        legalReferences: config.legalReferences,
        pensionEmployeeRate: config.pensionEmployeeRate,
        pensionEmployerRate: config.pensionEmployerRate,
        brackets: config.tax.brackets,
        note: config.source === 'UNCONFIGURED'
          ? 'No payroll rules are configured. No automatic tax or pension is applied. Enter approved deductions or configure verified rules before payment.'
          : 'Only configured rules effective on the payroll date apply. Missing rule types require manual review.'
      }
    })
  } catch (e) { next(e) }
}

export async function createRule(req, res, next) {
  try { res.status(201).json({ success: true, data: await createPayrollRule(req.body, (req.userId || req.user?.userId || req.user?.id)) }) } catch (e) { next(e) }
}

export async function updateRule(req, res, next) {
  try { res.json({ success: true, data: await updatePayrollRule(req.params.id, req.body, (req.userId || req.user?.userId || req.user?.id)) }) } catch (e) { next(e) }
}

export async function disableRule(req, res, next) {
  try { res.json({ success: true, data: await deactivatePayrollRule(req.params.id, (req.userId || req.user?.userId || req.user?.id)) }) } catch (e) { next(e) }
}

export default {
  getPayrollPayments, getPayrollPaymentById, createPayrollPayment, updatePayrollPayment,
  payPayrollPayment, cancelPayrollPayment, getUpcoming, getOverdue, calculatePayroll,
  getPayrollRules, getPayrollConfig, createRule, updateRule, disableRule
}
