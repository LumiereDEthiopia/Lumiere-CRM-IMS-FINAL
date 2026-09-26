/**
 * Accounting Service — central double-entry posting engine.
 *
 * All business flows post through `postJournalEntry`, which enforces
 * total debit = total credit and is idempotent per (sourceType, sourceId),
 * so re-runs never duplicate records.
 */
import prisma from '../config/prisma.js'

// Canonical account codes used by automatic posting.
export const ACC = {
  CASH: '1010',
  BANK: '1020',
  AR: '1100',
  INVENTORY: '1200',
  AP: '2000',
  VAT_PAYABLE: '2100',
  WITHHOLDING_PAYABLE: '2200',
  OWNER_CAPITAL: '3100',
  OWNER_DRAWINGS: '3200',
  OTHER_OPEX: '5190',
  SALES_REVENUE: '4000',
  OIL_REVENUE: '4010',
  OTHER_INCOME: '4020',
  COGS: '5000',
  SALARIES: '5110',
  INCOME_TAX: '9900'
}

/** Resolve an account id by code (cached per process). */
const accountCache = new Map()
export async function accountId(code, tx = prisma) {
  if (accountCache.has(code)) return accountCache.get(code)
  const account = await tx.account.findUnique({ where: { code }, select: { id: true } })
  if (!account) throw new Error(`Account ${code} not found — run "npm run seed:finance" first`)
  accountCache.set(code, account.id)
  return account.id
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

/**
 * Post a balanced journal entry.
 * lines: [{ debit?, credit?, code | accountId }] — debit/credit as numbers/strings.
 * Throws when debits !== credits, or a line is both/neither.
 */
export async function postJournalEntry({ date, reference, description, sourceType, sourceId, lines, postedBy }, client = prisma) {
  const prepared = []
  for (const line of lines) {
    const debit = round2(line.debit)
    const credit = round2(line.credit)
    if (debit === 0 && credit === 0) continue
    if (debit > 0 && credit > 0) throw new Error(`Journal line cannot have both debit and credit: ${line.code || line.accountId}`)
    prepared.push({ ...line, debit, credit })
  }
  if (!prepared.length) return null

  const totalDebit = round2(prepared.reduce((s, l) => s + l.debit, 0))
  const totalCredit = round2(prepared.reduce((s, l) => s + l.credit, 0))
  if (Math.abs(totalDebit - totalCredit) > 0.005) {
    throw new Error(`Unbalanced journal entry (${description}): Dr ${totalDebit} ≠ Cr ${totalCredit}`)
  }

  return client.$transaction(async (tx) => {
    // Idempotency: skip if an entry already exists for this source
    if (sourceType && sourceId) {
      const existing = await tx.journalEntry.findFirst({ where: { sourceType, sourceId }, select: { id: true } })
      if (existing) return existing
    }
    const seq = (await tx.journalEntry.count()) + 1
    let entryNumber = 'JE-' + String(seq).padStart(8, '0')
    let suffix = 0
    while (await tx.journalEntry.findUnique({ where: { entryNumber }, select: { id: true } })) {
      suffix += 1
      entryNumber = `JE-${String(seq).padStart(8, '0')}-${suffix}`
    }

    const created = await tx.journalEntry.create({
      data: {
        entryNumber,
        entryDate: date || new Date(),
        description: description || reference || 'Journal entry',
        sourceType: sourceType || null,
        sourceId: sourceId || null,
        status: 'POSTED',
        postedBy: postedBy || null,
        lines: {
          create: await Promise.all(prepared.map(async (l) => ({
            accountId: l.accountId || (await accountId(l.code, tx)),
            debit: l.debit,
            credit: l.credit,
            memo: l.memo || null
          })))
        }
      }
    })
    return created
  })
}

/** Delete journal entries posted for a source (used when a document is cancelled). */
export async function deleteJournalEntriesForSource(sourceType, sourceId, client = prisma) {
  const entries = await client.journalEntry.findMany({ where: { sourceType, sourceId }, select: { id: true } })
  for (const e of entries) {
    await client.journalLine.deleteMany({ where: { journalEntryId: e.id } })
    await client.journalEntry.delete({ where: { id: e.id } })
  }
  return entries.length
}

// ---------------------------------------------------------------------------
// Automatic posting hooks for existing business flows
// ---------------------------------------------------------------------------

/**
 * Sale → Dr Cash (or AR when unpaid), Cr Sales Revenue (+ VAT payable),
 * Dr COGS, Cr Inventory. paymentMethod containing BANK → bank, else cash.
 * Sales without a payment method are treated as credit sales (Dr AR).
 */
export async function postSaleEntry(sale, client = prisma) {
  if (!sale || sale.status === 'CANCELLED') return null
  const method = String(sale.paymentMethod || '').toUpperCase()
  const paidNow = method.includes('CASH') || method.includes('BANK') || method.includes('MOBILE')
  const cashCode = method.includes('BANK') ? ACC.BANK : ACC.CASH
  const revenueCode = (sale.items || []).some((it) => String(it.productName || '').toLowerCase().includes('oil')) ? ACC.OIL_REVENUE : ACC.SALES_REVENUE
  const total = round2(sale.total)
  const vat = round2(sale.vatAmount)
  const withholding = round2(sale.withholdingAmount)
  const netSale = round2(total - vat - withholding)
  const cogs = round2((sale.items || []).reduce((s, it) => s + (Number(it.unitCost) || 0) * (Number(it.quantity) || 0), 0))

  const lines = [
    { code: paidNow ? cashCode : ACC.AR, debit: total, memo: `Sale ${sale.saleNumber}` },
    { code: revenueCode, credit: netSale }
  ]
  if (vat > 0) lines.push({ code: ACC.VAT_PAYABLE, credit: vat })
  if (withholding > 0) lines.push({ code: ACC.WITHHOLDING_PAYABLE, credit: withholding })
  if (cogs > 0) {
    lines.push({ code: ACC.COGS, debit: cogs })
    lines.push({ code: ACC.INVENTORY, credit: cogs })
  }
  return postJournalEntry({
    date: sale.soldAt || new Date(),
    reference: sale.saleNumber,
    description: `Sale ${sale.saleNumber}`,
    sourceType: 'SALE',
    sourceId: sale.id,
    lines,
    postedBy: sale.createdBy
  }, client)
}

/**
 * Purchase → Dr Inventory, Cr AP (supplier credit; the current app does not
 * record supplier payments separately).
 */
export async function postPurchaseEntry(purchase, client = prisma) {
  if (!purchase || purchase.status === 'CANCELLED') return null
  const total = round2(purchase.total)
  if (total <= 0) return null
  return postJournalEntry({
    date: purchase.createdAt,
    reference: purchase.purchaseNumber,
    description: `Purchase ${purchase.purchaseNumber}`,
    sourceType: 'PURCHASE',
    sourceId: purchase.id,
    lines: [
      { code: ACC.INVENTORY, debit: total, memo: `PO ${purchase.purchaseNumber}` },
      { code: ACC.AP, credit: total }
    ],
    postedBy: purchase.createdBy
  }, client)
}

/**
 * Salary payment → Dr Salaries Expense, Cr Cash/Bank.
 */
export async function postSalaryPaymentEntry(payment, client = prisma) {
  if (!payment || payment.status !== 'PAID') return null
  const amount = round2(payment.netSalary)
  if (amount <= 0) return null
  const cashCode = String(payment.paymentMethod || '').includes('BANK') ? ACC.BANK : ACC.CASH
  return postJournalEntry({
    date: payment.paidDate || new Date(),
    reference: payment.id,
    description: `Salary payment ${payment.id}`,
    sourceType: 'SALARY_PAYMENT',
    sourceId: payment.id,
    lines: [
      { code: ACC.SALARIES, debit: amount },
      { code: cashCode, credit: amount }
    ],
    postedBy: payment.processedById
  }, client)
}

/**
 * Manual / owner entries (capital, withdrawal, expense, customer & supplier payments).
 * kind: CAPITAL | WITHDRAWAL | EXPENSE | CUSTOMER_PAYMENT | SUPPLIER_PAYMENT
 */
export const MANUAL_KINDS = ['CAPITAL', 'WITHDRAWAL', 'EXPENSE', 'CUSTOMER_PAYMENT', 'SUPPLIER_PAYMENT']

export async function postManualEntry({ kind, amount, accountCode, date, reference, description, paymentMethod, createdBy }, client = prisma) {
  const cashCode = String(paymentMethod || '').includes('BANK') ? ACC.BANK : ACC.CASH
  const amt = round2(amount)
  if (amt <= 0) throw new Error('Amount must be positive')
  if (!MANUAL_KINDS.includes(kind)) throw new Error(`Unknown entry kind: ${kind}`)
  const linesByKind = {
    CAPITAL: [{ code: cashCode, debit: amt }, { code: ACC.OWNER_CAPITAL, credit: amt }],
    WITHDRAWAL: [{ code: ACC.OWNER_DRAWINGS, debit: amt }, { code: cashCode, credit: amt }],
    EXPENSE: [{ code: accountCode || ACC.OTHER_OPEX, debit: amt }, { code: cashCode, credit: amt }],
    CUSTOMER_PAYMENT: [{ code: cashCode, debit: amt }, { code: ACC.AR, credit: amt }],
    SUPPLIER_PAYMENT: [{ code: ACC.AP, debit: amt }, { code: cashCode, credit: amt }]
  }
  return postJournalEntry({ date, reference, description, sourceType: 'MANUAL', sourceId: reference, lines: linesByKind[kind], postedBy: createdBy }, client)
}

export default {
  ACC, accountId, postJournalEntry, deleteJournalEntriesForSource,
  postSaleEntry, postPurchaseEntry, postSalaryPaymentEntry, postManualEntry, MANUAL_KINDS
}
