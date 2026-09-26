/**
 * Report Controller
 */
import {
  getDashboardSummary, getSalesReport, getInventoryReport,
  getCrmAnalytics, getEmployeeAnalytics, getProductAnalytics
} from '../services/reportService.js'
import { globalSearch } from '../services/searchService.js'

export async function dashboardSummary(req, res, next) {
  try { res.json({ success: true, data: await getDashboardSummary() }) } catch (e) { next(e) }
}

export async function salesReport(req, res, next) {
  try { res.json({ success: true, data: await getSalesReport(req.query) }) } catch (e) { next(e) }
}

export async function inventoryReport(req, res, next) {
  try { res.json({ success: true, data: await getInventoryReport() }) } catch (e) { next(e) }
}

export async function crmAnalytics(req, res, next) {
  try { res.json({ success: true, data: await getCrmAnalytics() }) } catch (e) { next(e) }
}

export async function employeeAnalytics(req, res, next) {
  try {
    const includeSensitive = req.user?.role === 'SUPER_ADMIN' ||
      (req.user?.permissions || []).includes('employee:view_sensitive') ||
      (req.user?.permissions || []).includes('*')
    res.json({ success: true, data: await getEmployeeAnalytics({ includeSensitive }) })
  } catch (e) { next(e) }
}

export async function productAnalytics(req, res, next) {
  try { res.json({ success: true, data: await getProductAnalytics(req.params.id) }) } catch (e) { next(e) }
}

export async function search(req, res, next) {
  try {
    const data = await globalSearch(req.query.q, {
      limit: parseInt(req.query.limit) || 10,
      permissions: req.user?.permissions || [],
      role: req.user?.role
    })
    res.json({ success: true, data })
  } catch (e) { next(e) }
}

export default { dashboardSummary, salesReport, inventoryReport, crmAnalytics, employeeAnalytics, productAnalytics, search }
