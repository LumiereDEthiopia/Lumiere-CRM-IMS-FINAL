/**
 * Accounting Report Controller — the 4 standard accounting reports.
 */
import {
  getTrialBalance, getIncomeStatement, getBalanceSheet, getCashFlowStatement, getCompanyHeader, listChartOfAccounts
} from '../services/accountingReportService.js'
import { postManualEntry, MANUAL_KINDS } from '../services/accountingService.js'
import { ApiError } from '../middleware/errorHandler.js'

function filters(req) {
  return {
    dateFrom: req.query.dateFrom || undefined,
    dateTo: req.query.dateTo || undefined,
    locationId: req.query.locationId || undefined,
    accountType: req.query.accountType || undefined,
    accountId: req.query.accountId || undefined
  }
}

export async function trialBalance(req, res, next) {
  try { res.json({ success: true, data: await getTrialBalance(filters(req)) }) } catch (e) { next(e) }
}

export async function incomeStatement(req, res, next) {
  try { res.json({ success: true, data: await getIncomeStatement(filters(req)) }) } catch (e) { next(e) }
}

export async function balanceSheet(req, res, next) {
  try { res.json({ success: true, data: await getBalanceSheet(filters(req)) }) } catch (e) { next(e) }
}

export async function cashFlowStatement(req, res, next) {
  try { res.json({ success: true, data: await getCashFlowStatement(filters(req)) }) } catch (e) { next(e) }
}

export async function companyHeader(req, res, next) {
  try { res.json({ success: true, data: await getCompanyHeader() }) } catch (e) { next(e) }
}

export async function accounts(req, res, next) {
  try { res.json({ success: true, data: await listChartOfAccounts() }) } catch (e) { next(e) }
}

/** Manual entries (owner capital / withdrawal / expense / payments). */
export async function createManualEntry(req, res, next) {
  try {
    const { kind, amount, accountCode, date, reference, description, paymentMethod } = req.body || {}
    if (!MANUAL_KINDS.includes(kind)) throw new ApiError(400, `kind must be one of: ${MANUAL_KINDS.join(', ')}`)
    const entry = await postManualEntry({ kind, amount, accountCode, date, reference, description, paymentMethod, createdBy: req.userId })
    res.status(201).json({ success: true, data: entry })
  } catch (e) { next(e) }
}

export default { trialBalance, incomeStatement, balanceSheet, cashFlowStatement, companyHeader, accounts, createManualEntry }
