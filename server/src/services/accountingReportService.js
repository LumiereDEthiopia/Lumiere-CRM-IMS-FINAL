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
    openingDebit: total('opening'),
    openingCredit: 0,
    debit: total('debit'),
    credit: total('credit'),
    closingDebit: total('closingDebit'),
    closingCredit: total('closingCredit'),
    difference: 0
  }
  totals.difference = r2(totals.debit - totals.credit)
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

  const revenue = collect((row) => ['4000', '4010'].includes(row.code))
  const otherIncome = collect((row) => row.code === '4020')
  const cogs = collect((row) => row.code === '5000')
  const opex = collect((row) => ['5110', '5120', '5130', '5140', '5150', '5160', '5190'].includes(row.code))
  const otherExpenses = collect((row) => ['6010', '6020'].includes(row.code))
  const taxRows = collect((row) => row.code === '9900')

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
 * Balance Sheet — cumulative since inception (position at dateTo).
 * Current-year profit comes from the income statement up to dateTo.
 */
export async function getBalanceSheet(filters = {}) {
  const asOf = filters.dateTo || new Date().toISOString().slice(0, 10)
  const [byAccount, income] = await Promise.all([
    ledgerBalances({ dateTo: asOf }),
    getIncomeStatement({ dateFrom: '1970-01-01', dateTo: asOf })
  ])

  const closing = (row) => r2(isDebitNature(row.type) ? row.debit - row.credit : row.credit - row.debit)
  const accountRows = (codes) => {
    const list = []
    for (const [, row] of byAccount) {
      if (codes.includes(row.code)) {
        const amount = closing(row)
        if (amount !== 0) list.push({ code: row.code, name: row.name, amount })
      }
    }
    list.sort((a, b) => a.code.localeCompare(b.code))
    return list
  }

  const cashAndBank = accountRows(['1010', '1020', '1000'])
  const accountsReceivable = accountRows(['1100'])
  const inventory = accountRows(['1200'])
  const otherCurrent = accountRows(['1300'])
  const fixedAssets = accountRows(['1400', '1410', '1490'])

  const accountsPayable = accountRows(['2000', '2100', '2200'])
  const taxesPayable = accountRows(['2300'])
  const otherCurrentLiab = accountRows(['2400'])
  const loans = accountRows(['2500'])

  const baseEquity = accountRows(['3000'])
  const ownerCapital = accountRows(['3100'])
  const ownerDrawings = accountRows(['3200'])
  const retained = accountRows(['3300'])

  const sum = (list) => r2(list.reduce((s, x) => s + x.amount, 0))
  const currentYearProfit = income.totals.netProfit

  const totalCurrentAssets = r2(sum(cashAndBank) + sum(accountsReceivable) + sum(inventory) + sum(otherCurrent))
  const totalNonCurrentAssets = r2(sum(fixedAssets))
  const totalAssets = r2(totalCurrentAssets + totalNonCurrentAssets)

  const totalCurrentLiabilities = r2(sum(accountsPayable) + sum(taxesPayable) + sum(otherCurrentLiab))
  const totalNonCurrentLiabilities = r2(sum(loans))
  const totalLiabilities = r2(totalCurrentLiabilities + totalNonCurrentLiabilities)

  const totalEquity = r2(sum(baseEquity) + sum(ownerCapital) - sum(ownerDrawings) + sum(retained) + currentYearProfit)
  const totalLiabilitiesEquity = r2(totalLiabilities + totalEquity)

  return {
    asOf,
    assets: { cashAndBank, accountsReceivable, inventory, otherCurrent, fixedAssets },
    liabilities: { accountsPayable, taxesPayable, otherCurrent: otherCurrentLiab, loans },
    equity: { baseEquity, ownerCapital, ownerDrawings, retainedEarnings: retained, currentYearProfit },
    totals: {
      totalCurrentAssets, totalNonCurrentAssets, totalAssets,
      totalCurrentLiabilities, totalNonCurrentLiabilities, totalLiabilities,
      totalEquity, totalLiabilitiesEquity,
      balanceDifference: r2(totalAssets - totalLiabilitiesEquity)
    },
    generatedAt: new Date().toISOString()
  }
}

/**
 * Cash Flow Statement — classifies ledger movements that touch cash/bank
 * accounts (1010, 1020) into Operating / Investing / Financing using the
 * counter account of each entry. Opening + Net Change = Closing.
 */
export async function getCashFlowStatement(filters = {}) {
  const cashIds = (await prisma.account.findMany({ where: { code: { in: ['1010', '1020'] } }, select: { id: true } })).map((a) => a.id)

  const openingLines = await prisma.journalLine.findMany({
    where: { accountId: { in: cashIds }, journalEntry: filters.dateFrom ? { status: 'POSTED', entryDate: { lt: new Date(`${filters.dateFrom}T00:00:00.000`) } } : { status: 'POSTED' } },
    select: { debit: true, credit: true }
  })
  const openingCash = r2(openingLines.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0))

  const periodLines = await prisma.journalLine.findMany({
    where: { accountId: { in: cashIds }, journalEntry: periodWhere(filters) },
    select: { debit: true, credit: true, journalEntry: { select: { id: true } } }
  })

  // Counter-account per entry (first non-cash line) drives the classification
  const entryIds = [...new Set(periodLines.map((l) => l.journalEntry.id))]
  const counterLines = entryIds.length
    ? await prisma.journalLine.findMany({
        where: { journalEntryId: { in: entryIds }, accountId: { notIn: cashIds } },
        select: { journalEntryId: true, account: { select: { code: true, type: true, name: true } } }
      })
    : []
  const counterByEntry = new Map()
  for (const l of counterLines) if (!counterByEntry.has(l.journalEntryId)) counterByEntry.set(l.journalEntryId, l)

  const buckets = { operating: new Map(), investing: new Map(), financing: new Map() }
  const addMovement = (bucket, name, delta) => buckets[bucket].set(name, r2((buckets[bucket].get(name) || 0) + delta))
  for (const l of periodLines) {
    const inflow = r2(Number(l.debit) - Number(l.credit))
    const counter = counterByEntry.get(l.journalEntry.id)
    const cName = counter?.account?.name || 'Other'
    const cType = counter?.account?.type || ''
    const cCode = counter?.account?.code || ''
    if (['1400', '1410', '1490'].includes(cCode)) addMovement('investing', cName, inflow)
    else if (cType === 'EQUITY' || cCode === '2500') addMovement('financing', cName, inflow)
    else addMovement('operating', cName, inflow)
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
    generatedAt: new Date().toISOString()
  }
}

/** Company header from stored settings (never hard-coded). */
export async function getCompanyHeader() {
  const settings = await prisma.setting.findMany({
    where: { key: { in: ['business_name', 'business_phone', 'business_email', 'ethiopia_taxpayer_tin', 'finance_currency'] } },
    select: { key: true, value: true }
  })
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]))
  return {
    name: map.business_name || 'LUMIERE D ETHIOPIA TRADING ONE MEMBER PLC',
    phone: map.business_phone || null,
    email: map.business_email || null,
    tin: map.ethiopia_taxpayer_tin || null,
    currency: map.finance_currency || 'ETB'
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
  getCompanyHeader, listChartOfAccounts
}

