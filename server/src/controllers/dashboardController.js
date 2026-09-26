/**
 * Dashboard Controller
 */
import { getStats } from '../services/dashboardService.js'
import {
  getEmployeeSummary, getPayrollSummary, getPaymentAnnouncements, getEmployeeAlerts
} from '../services/payrollService.js'

export async function getDashboardStats(req, res, next) {
  try { res.json({ success: true, data: await getStats() }) } catch (e) { next(e) }
}

/** Employee summary counters (total / active / inactive / new this month). */
export async function getEmployeeSummaryStats(req, res, next) {
  try {
    const includeSensitive = req.user?.role === 'SUPER_ADMIN'
      || (req.user?.permissions || []).includes('employee:view_sensitive')
      || (req.user?.permissions || []).includes('*')
    const summary = await getEmployeeSummary()
    res.json({ success: true, data: includeSensitive ? summary : { ...summary, withSalary: undefined, withoutSalary: undefined } })
  } catch (e) { next(e) }
}

/** Payroll summary — requires payroll:view (salary amounts are sensitive). */
export async function getPayrollSummaryStats(req, res, next) {
  try { res.json({ success: true, data: await getPayrollSummary() }) } catch (e) { next(e) }
}

/** Salary payment announcements (today / tomorrow / this week / overdue / paid). */
export async function getPayrollAlerts(req, res, next) {
  try {
    const days = Math.min(120, Math.max(1, parseInt(req.query.days) || 7))
    const [announcements, alerts] = await Promise.all([
      getPaymentAnnouncements({ days }),
      getEmployeeAlerts()
    ])
    res.json({ success: true, data: { ...announcements, employeeAlerts: alerts } })
  } catch (e) { next(e) }
}

export default { getDashboardStats, getEmployeeSummaryStats, getPayrollSummaryStats, getPayrollAlerts }