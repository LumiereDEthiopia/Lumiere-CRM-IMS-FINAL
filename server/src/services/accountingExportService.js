/**
 * Accounting Export Service — professional XLSX exports of the 4 reports.
 * Uses the same server-side report services, so the file always matches
 * what is displayed on screen. Company info comes from stored settings.
 */
import * as XLSX from 'xlsx'
import {
  getTrialBalance, getIncomeStatement, getBalanceSheet, getCashFlowStatement, getChangesInEquity, getCompanyHeader
} from './accountingReportService.js'

const REPORTS = {
  'trial-balance': 'Trial Balance',
  'income-statement': 'Income Statement',
  'balance-sheet': 'Balance Sheet',
  'cash-flow': 'Statement of Cash Flows',
  'changes-in-equity': 'Statement of Changes in Equity'
}

const num = (v) => Math.round((Number(v) || 0) * 100) / 100

function headerRows(company, title, filters) {
  const period = `${filters.dateFrom || 'Beginning'} — ${filters.dateTo || 'Today'}`
  return [
    [company.name],
    ['Accounting Report'],
    [title],
    [`Period: ${period}`],
    [`AABE reporting framework: ${company.reportingFramework || 'UNCONFIRMED'}`],
    ['Management report only — not verified as a complete statutory financial statement set'],
    [`Generated: ${new Date().toLocaleString()}`],
    [`Configured currency: ${company.currency || 'ETB'}`],
    []
  ]
}

function autoWidth(rows) {
  const widths = []
  for (const row of rows) {
    row.forEach((cell, i) => {
      const len = String(cell ?? '').length + 2
      widths[i] = Math.max(widths[i] || 10, Math.min(len, 46))
    })
  }
  return widths.map((w) => ({ wch: w }))
}

function sheetFrom(rows) {
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = autoWidth(rows)
  return ws
}

export async function buildExcelWorkbook(report, filters) {
  const title = REPORTS[report]
  if (!title) throw new Error(`Unknown accounting report: ${report}`)
  const company = await getCompanyHeader()
  const head = headerRows(company, title, filters)
  const rows = [...head]
  const boldTotal = (label, value) => rows.push([label, '', num(value)])

  if (report === 'trial-balance') {
    const data = await getTrialBalance(filters)
    rows.push(['Code', 'Account Name', 'Type', 'Opening Debit', 'Opening Credit', 'Period Debit', 'Period Credit', 'Closing Debit', 'Closing Credit'])
    for (const row of data.rows) rows.push([row.code, row.name, row.type, num(row.openingDebit), num(row.openingCredit), num(row.debit), num(row.credit), num(row.closingDebit), num(row.closingCredit)])
    rows.push([])
    rows.push(['Totals', '', '', num(data.totals.openingDebit), num(data.totals.openingCredit), num(data.totals.debit), num(data.totals.credit), num(data.totals.closingDebit), num(data.totals.closingCredit)])
    boldTotal('Period Movement Difference (Debit − Credit)', data.totals.difference)
    boldTotal('Closing Balance Difference (Debit − Credit)', data.totals.closingDifference)
  } else if (report === 'income-statement') {
    const data = await getIncomeStatement(filters)
    rows.push(['Section', 'Account', 'Code', 'Amount'])
    for (const x of data.revenue) rows.push(['Revenue', x.name, x.code, num(x.amount)])
    boldTotal('Total Revenue', data.totals.totalRevenue)
    for (const x of data.cogs) rows.push(['Cost of Goods Sold', x.name, x.code, num(x.amount)])
    boldTotal('Total COGS', data.totals.totalCogs)
    boldTotal('Gross Profit', data.totals.grossProfit)
    for (const x of data.opex) rows.push(['Operating Expense', x.name, x.code, num(x.amount)])
    boldTotal('Total Operating Expenses', data.totals.totalOpex)
    boldTotal('Operating Profit', data.totals.operatingProfit)
    for (const x of data.otherIncome) rows.push(['Other Income', x.name, x.code, num(x.amount)])
    for (const x of data.otherExpenses) rows.push(['Other Expense', x.name, x.code, num(x.amount)])
    boldTotal('Profit Before Tax', data.totals.profitBeforeTax)
    boldTotal('Tax', data.totals.tax)
    boldTotal('Net Profit / (Loss)', data.totals.netProfit)
  } else if (report === 'balance-sheet') {
    const data = await getBalanceSheet(filters)
    rows.push(['Section', 'Account', 'Code', 'Amount'])
    const sections = [
      ['Assets', data.assets.accounts],
      ['Liabilities', data.liabilities.accounts],
      ['Equity', data.equity.accounts]
    ]
    for (const [section, list] of sections) for (const x of list) rows.push([section, x.name, x.code, num(x.amount)])
    rows.push(['Equity', 'Unclosed Profit / (Loss) Since Ledger Start', '', num(data.equity.unclosedProfitLoss)])
    rows.push([])
    boldTotal('Total Assets', data.totals.totalAssets)
    boldTotal('Total Liabilities', data.totals.totalLiabilities)
    boldTotal('Total Equity', data.totals.totalEquity)
    boldTotal('Liabilities + Equity', data.totals.totalLiabilitiesEquity)
    boldTotal('Balance Difference', data.totals.balanceDifference)
  } else if (report === 'cash-flow') {
    const data = await getCashFlowStatement(filters)
    rows.push(['Category', 'Detail', 'Amount'])
    for (const x of data.operating) rows.push(['Operating', x.name, num(x.amount)])
    boldTotal('Net Operating', data.totals.netOperating)
    for (const x of data.investing) rows.push(['Investing', x.name, num(x.amount)])
    boldTotal('Net Investing', data.totals.netInvesting)
    for (const x of data.financing) rows.push(['Financing', x.name, num(x.amount)])
    boldTotal('Net Financing', data.totals.netFinancing)
    rows.push([])
    boldTotal('Net Change in Cash', data.totals.netChange)
    boldTotal('Opening Cash', data.totals.openingCash)
    boldTotal('Closing Cash', data.totals.closingCash)
  } else {
    const data = await getChangesInEquity(filters)
    rows.push(['Account', 'Code', 'Opening Equity', 'Debits', 'Credits', 'Closing Equity'])
    for (const x of data.rows) rows.push([x.name, x.code, num(x.opening), num(x.debit), num(x.credit), num(x.closing)])
    rows.push([])
    boldTotal('Opening Equity', data.totals.openingEquity)
    boldTotal('Equity Movements', data.totals.equityMovements)
    boldTotal('Profit / (Loss) for Period', data.totals.profitOrLoss)
    boldTotal('Closing Equity', data.totals.closingEquity)
  }

  rows.push([])
  rows.push([`Company TIN: ${company.tin || '—'}`, company.phone || '', company.email || ''])

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheetFrom(rows), title.slice(0, 31))
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const period = `${filters.dateFrom || 'all'}_to_${filters.dateTo || 'today'}`
  return { buffer, filename: `${report}-${period}.xlsx` }
}

export default { buildExcelWorkbook }
