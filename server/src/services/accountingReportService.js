/**
 * Accounting Report Service — all four standard accounting reports.
 * Every number is computed server-side from the ledger (JournalLine ×
 * Account); the frontend only renders. Opening / cumulative balances are
 * handled by aggregating entries BEFORE the period start.
 *
 * All math uses integer-cent rounding to avoid floating point drift.
 */
import prisma from '../config/prisma.js'

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

function periodWhere({ dateFrom, dateTo }) {
  const entryDate = {}
  if (dateFrom) entryDate.gte = new Date(`${dateFrom}T00:00:00.000`)
  if (dateTo) entryDate.lte = new Date(`${dateTo}T23:59:59.999`)
  return { status: 'POSTED', ...(Object.keys(entryDate).length ? { entryDate } : {}) }
}

/**
 * Aggregate ledger balances grouped by account.
 * Returns { byAccount: Map(accountId -> {code,name,type,debit,credit}) }.
 */
export async function ledgerBalances(filters = {}) {
  const lines = await prisma.journalLine.findMany({
    where: { journalEntry: periodWhere(filters) },
    select: { accountId: true, debit: true, credit: true, account: { select: { code: true, name: true, type: true } } }
  })
  const byAccount = new Map()
  for (const l of lines) {
    let row = byAccount.get(l.accountId)
    if (!row) {
      row = { id: l.accountId, code: l.account.code, name: l.account.name, type: l.account.type, debit: 0, credit: 0 }
      byAccount.set(l.accountId, row)
    }
    row.debit = r2(row.debit + Number(l.debit))
    row.credit = r2(row.credit + Number(l.credit))
  }
  return byAccount
}

/** Opening (cumulative before dateFrom) balances per account. */
export async function openingBalances(dateFrom) {
  if (!dateFrom) return new Map()
  const lines = await prisma.journalLine.findMany({
    where: { journalEntry: { status: 'POSTED', entryDate: { lt: new Date(`${dateFrom}T00:00:00.000`) } } },
    select: { accountId: true, debit: true, credit: true, account: { select: { code: true, name: true, type: true } } }
  })
  const byAccount = new Map()
  for (const l of lines) {
    let row = byAccount.get(l.accountId)
    if (!row) {
      row = { id: l.accountId, code: l.account.code, name: l.account.name, type: l.account.type, debit: 0, credit: 0 }
      byAccount.set(l.accountId, row)
    }
    row.debit = r2(row.debit + Number(l.debit))
    row.credit = r2(row.credit + Number(l.credit))
  }
  return byAccount
}

/** Natural balance direction for an account type (asset/expense = debit). */
function isDebitNature(type) {
  return type === 'ASSET' || type === 'EXPENSE'
}

/** Trial Balance — with opening, period movement and closing columns.
 *  Optional filters: accountType (ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE), accountId. */
export async function getTrialBalance(filters = {}) {
  const [period, opening] = await Promise.all([ledgerBalances(filters), openingBalances(filters.dateFrom)])
  const accountWhere = { isActive: true }
  if (filters.accountType) accountWhere.type = String(filters.accountType).toUpperCase()
  if (filters.accountId) accountWhere.id = filters.accountId
  const allAccounts = await prisma.account.findMany({ where: accountWhere, orderBy: { code: 'asc' } })

  const rows = []
  for (const account of allAccounts) {
    const open = opening.get(account.id)
    const per = period.get(account.id)
    if (!open && !per) continue
    const openingNet = open ? r2((isDebitNature(account.type) ? open.debit - open.credit : open.credit - open.debit)) : 0
    const periodDebit = per?.debit || 0
    const periodCredit = per?.credit || 0
    const closing = r2(openingNet + (isDebitNature(account.type) ? periodDebit - periodCredit : periodCredit - periodDebit))
    rows.push({
      id: account.id,
      code: account.code,
      name: account.name,
      type: account.type,
      opening: openingNet,
      openingDebit: Math.max(0, openingNet),
      openingCredit: Math.max(0, -openingNet),
      debit: periodDebit,
      credit: periodCredit,
      // Presentation: for a debit-nature account with a credit closing balance
      // the amount is shown in the credit column and vice versa.
      closingDebit: isDebitNature(account.type) ? Math.max(0, closing) : Math.max(0, -closing),
      closingCredit: isDebitNature(account.type) ? Math.max(0, -closing) : Math.max(0, closing)
    })
  }

  const total = (key) => r2(rows.reduce((s, row) => s + row[key], 0))
  const totals = {
    openingDebit: total('openingDebit'),
    openingCredit: total('openingCredit'),
    debit: total('debit'),
    credit: total('credit'),
    closingDebit: total('closingDebit'),
    closingCredit: total('closingCredit'),
    difference: 0,
    closingDifference: 0
  }
  totals.difference = r2(totals.debit - totals.credit)
  totals.closingDifference = r2(totals.closingDebit - totals.closingCredit)
  return { rows, totals, generatedAt: new Date().toISOString() }
}

/** Income Statement — Revenue → COGS → Gross Profit → OpEx → PBT → Net. */
export async function getIncomeStatement(filters = {}) {
  const byAccount = await ledgerBalances(filters)
  const amountOf = (row) => r2(row.type === 'REVENUE' ? row.credit - row.debit : row.debit - row.credit)
  const collect = (match) => {
    const list = []
    for (const [, row] of byAccount) {
      if (match(row)) list.push({ code: row.code, name: row.name, amount: amountOf(row) })
    }
    list.sort((a, b) => a.code.localeCompare(b.code))
    return list
  }

  const otherIncome = collect((row) => row.type === 'REVENUE' && row.code === '4020')
  const revenue = collect((row) => row.type === 'REVENUE' && row.code !== '4020')
  const cogs = collect((row) => row.type === 'EXPENSE' && (row.code === '5000' || /cost of goods|cost of sales/i.test(row.name)))
  const taxRows = collect((row) => row.type === 'EXPENSE' && (row.code === '9900' || /income tax/i.test(row.name)))
  const otherExpenses = collect((row) => row.type === 'EXPENSE' && (row.code === '6010' || row.code === '6020' || /interest|finance charge|other expense/i.test(row.name)) && !taxRows.some((tax) => tax.code === row.code))
  const excluded = new Set([...cogs, ...taxRows, ...otherExpenses].map((row) => row.code))
  const opex = collect((row) => row.type === 'EXPENSE' && !excluded.has(row.code))

  const sum = (list) => r2(list.reduce((s, x) => s + x.amount, 0))
  const totalRevenue = sum(revenue)
  const totalOtherIncome = sum(otherIncome)
  const totalCogs = sum(cogs)
  const grossProfit = r2(totalRevenue - totalCogs)
  const totalOpex = sum(opex)
  const operatingProfit = r2(grossProfit - totalOpex)
  const totalOtherExpenses = sum(otherExpenses)
  const profitBeforeTax = r2(operatingProfit + totalOtherIncome - totalOtherExpenses)
  const tax = sum(taxRows)
  const netProfit = r2(profitBeforeTax - tax)

  return {
    revenue, otherIncome, cogs, opex, otherExpenses,
    totals: { totalRevenue, totalOtherIncome, totalCogs, grossProfit, totalOpex, operatingProfit, totalOtherExpenses, profitBeforeTax, tax, netProfit },
    generatedAt: new Date().toISOString()
  }
}

/**
 * Statement of Financial Position — cumulative ledger position at dateTo.
 * All accounts of each balance-sheet type are included so new accounts do not
 * disappear simply because they were not in a hard-coded code list.
 */
export async function getBalanceSheet(filters = {}) {
  const asOf = filters.dateTo || new Date().toISOString().slice(0, 10)
  const [byAccount, income] = await Promise.all([
    ledgerBalances({ dateTo: asOf }),
    getIncomeStatement({ dateTo: asOf })
  ])

  const closing = (row) => r2(isDebitNature(row.type) ? row.debit - row.credit : row.credit - row.debit)
  const accountRows = (type) => {
    const list = []
    for (const [, row] of byAccount) {
      if (row.type === type) {
        const amount = closing(row)
        if (amount !== 0) list.push({ code: row.code, name: row.name, amount })
      }
    }
    list.sort((a, b) => a.code.localeCompare(b.code))
    return list
  }

  const assets = accountRows('ASSET')
  const liabilities = accountRows('LIABILITY')
  const equityAccounts = accountRows('EQUITY')

  const sum = (list) => r2(list.reduce((s, x) => s + x.amount, 0))
  const currentYearProfit = income.totals.netProfit
  const totalAssets = sum(assets)
  const totalLiabilities = sum(liabilities)
  const totalEquity = r2(sum(equityAccounts) + currentYearProfit)
  const totalLiabilitiesEquity = r2(totalLiabilities + totalEquity)

  return {
    asOf,
    assets: { accounts: assets },
    liabilities: { accounts: liabilities },
    equity: { accounts: equityAccounts, unclosedProfitLoss: currentYearProfit },
    totals: {
      totalAssets, totalLiabilities,
      totalEquity, totalLiabilitiesEquity,
      balanceDifference: r2(totalAssets - totalLiabilitiesEquity)
    },
    generatedAt: new Date().toISOString()
  }
}

/** Equity movement schedule for the selected period. */
export async function getChangesInEquity(filters = {}) {
  const [period, opening] = await Promise.all([ledgerBalances(filters), openingBalances(filters.dateFrom)])
  const accounts = await prisma.account.findMany({ where: { isActive: true, type: 'EQUITY' }, orderBy: { code: 'asc' } })
  const rows = accounts.map((account) => {
    const open = opening.get(account.id)
    const movement = period.get(account.id)
    const openingBalance = open ? r2(open.credit - open.debit) : 0
    const debit = movement?.debit || 0
    const credit = movement?.credit || 0
    return { code: account.code, name: account.name, opening: openingBalance, debit, credit, movement: r2(credit - debit), closing: r2(openingBalance + credit - debit) }
  }).filter((row) => row.opening || row.debit || row.credit)
  const income = await getIncomeStatement(filters)
  const sum = (key) => r2(rows.reduce((total, row) => total + row[key], 0))
  const openingEquity = sum('opening')
  const equityMovements = sum('movement')
  const closingEquity = r2(openingEquity + equityMovements + income.totals.netProfit)
  return {
    rows,
    totals: { openingEquity, equityMovements, profitOrLoss: income.totals.netProfit, closingEquity },
    generatedAt: new Date().toISOString()
  }
}

/**
 * Cash Flow Statement — allocates each journal entry's cash movement across
 * every non-cash account line. Activity classification remains a reviewable
 * chart-of-accounts convention and is flagged as such in the report UI.
 */
export async function getCashFlowStatement(filters = {}) {
  const cashIds = (await prisma.account.findMany({ where: { code: { in: ['1010', '1020'] } }, select: { id: true } })).map((a) => a.id)

  const openingLines = filters.dateFrom ? await prisma.journalLine.findMany({
    where: { accountId: { in: cashIds }, journalEntry: filters.dateFrom ? { status: 'POSTED', entryDate: { lt: new Date(`${filters.dateFrom}T00:00:00.000`) } } : { status: 'POSTED' } },
    select: { debit: true, credit: true }
  }) : []
  const openingCash = r2(openingLines.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0))

  const entries = await prisma.journalEntry.findMany({
    where: periodWhere(filters),
    include: { lines: { include: { account: { select: { id: true, code: true, type: true, name: true } } } } }
  })

  const buckets = { operating: new Map(), investing: new Map(), financing: new Map() }
  const addMovement = (bucket, name, delta) => buckets[bucket].set(name, r2((buckets[bucket].get(name) || 0) + delta))
  for (const entry of entries) {
    const hasCashMovement = entry.lines.some((line) => ['1010', '1020'].includes(line.account.code) && Number(line.debit) !== Number(line.credit))
    if (!hasCashMovement) continue
    for (const counter of entry.lines.filter((line) => !['1010', '1020'].includes(line.account.code))) {
      const effect = r2(Number(counter.credit) - Number(counter.debit))
      if (!effect) continue
      const code = counter.account.code
      const name = counter.account.name
      const isInvesting = /^14/.test(code) || /property|equipment|fixed asset|investment/i.test(name)
      const isFinancing = counter.account.type === 'EQUITY' || /^25/.test(code) || /loan|borrow/i.test(name)
      addMovement(isInvesting ? 'investing' : isFinancing ? 'financing' : 'operating', name, effect)
    }
  }

  const toList = (map) => [...map.entries()].map(([name, amount]) => ({ name, amount })).filter((x) => x.amount !== 0)
  const operating = toList(buckets.operating)
  const investing = toList(buckets.investing)
  const financing = toList(buckets.financing)
  const sum = (list) => r2(list.reduce((s, x) => s + x.amount, 0))
  const netOperating = sum(operating)
  const netInvesting = sum(investing)
  const netFinancing = sum(financing)
  const netChange = r2(netOperating + netInvesting + netFinancing)

  return {
    operating, investing, financing,
    totals: { netOperating, netInvesting, netFinancing, netChange, openingCash, closingCash: r2(openingCash + netChange) },
    classificationNotice: 'Cash-flow activity is inferred from account types, codes and names; review account mapping before statutory use.',
    generatedAt: new Date().toISOString()
  }
}

/** Company header from stored settings (never hard-coded). */
export async function getCompanyHeader() {
  const settings = await prisma.setting.findMany({
    where: { key: { in: ['business_name', 'business_phone', 'business_email', 'ethiopia_taxpayer_tin', 'finance_currency', 'finance_reporting_framework', 'finance_fiscal_year_start', 'finance_accounting_basis'] } },
    select: { key: true, value: true }
  })
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]))
  return {
    name: map.business_name || 'LUMIERE D ETHIOPIA TRADING ONE MEMBER PLC',
    phone: map.business_phone || null,
    email: map.business_email || null,
    tin: map.ethiopia_taxpayer_tin || null,
    currency: map.finance_currency || 'ETB',
    reportingFramework: map.finance_reporting_framework || 'UNCONFIRMED',
    accountingBasis: map.finance_accounting_basis || 'ACCRUAL',
    fiscalYearStart: map.finance_fiscal_year_start || '07-08'
  }
}

/** Chart of accounts for report filters (dropdowns). */
export async function listChartOfAccounts() {
  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true, type: true }
  })
  return accounts
}

export default {
  ledgerBalances, openingBalances,
  getTrialBalance, getIncomeStatement, getBalanceSheet, getCashFlowStatement,
  getChangesInEquity,
  getCompanyHeader, listChartOfAccounts
}

