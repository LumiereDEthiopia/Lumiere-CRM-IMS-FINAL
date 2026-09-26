/**
 * Accounting Reports Routes — /api/reports/accounting/*
 * All restricted to financial / report viewers (backend-enforced).
 */
import { Router } from 'express'
import {
  trialBalance, incomeStatement, balanceSheet, cashFlowStatement, companyHeader, accounts, createManualEntry
} from '../controllers/accountingReportController.js'
import { buildExcelWorkbook } from '../services/accountingExportService.js'
import { requireAnyPermission } from '../middleware/authorize.js'
import { createAuditLog } from '../services/auditService.js'

const router = Router()
router.use(requireAnyPermission('financial:view', 'report:view'))

router.get('/trial-balance', trialBalance)
router.get('/income-statement', incomeStatement)
router.get('/balance-sheet', balanceSheet)
router.get('/cash-flow', cashFlowStatement)
router.get('/company', companyHeader)
router.get('/accounts', accounts)
router.post('/transactions', createManualEntry)

// Excel export per report type — same data as on screen
router.get('/:report/export', async (req, res, next) => {
  try {
    const { report } = req.params
    const filters = {
      dateFrom: req.query.dateFrom || undefined,
      dateTo: req.query.dateTo || undefined,
      locationId: req.query.locationId || undefined,
      accountType: req.query.accountType || undefined,
      accountId: req.query.accountId || undefined
    }
    const workbook = await buildExcelWorkbook(report, filters)
    await createAuditLog({ userId: req.userId, action: 'ACCOUNTING_REPORT_EXPORTED', entity: 'AccountingReport', entityId: report, details: { report, dateFrom: filters.dateFrom, dateTo: filters.dateTo } })
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${workbook.filename}"`)
    res.send(workbook.buffer)
  } catch (e) { next(e) }
})

export { router as accountingReportRouter }
export default router
