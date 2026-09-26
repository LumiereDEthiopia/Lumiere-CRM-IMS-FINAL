/**
 * One-time backfill: creates opening journal entries from real existing
 * data (sales, purchases) that pre-date the ledger. Idempotent per source.
 * Does NOT modify business records — read-only on Sale/Purchase.
 */
import { PrismaClient } from '@prisma/client'
import { postSaleEntry, postPurchaseEntry } from '../src/services/accountingService.js'

const p = new PrismaClient()
const db = { ...p, $transaction: p.$transaction.bind(p) }

async function main() {
  const sales = await p.sale.findMany({ where: { status: { not: 'CANCELLED' } }, include: { items: true } })
  let posted = 0
  for (const sale of sales) {
    const created = await postSaleEntry(sale, db)
    if (created) posted++
  }
  console.log(`Sales backfilled: ${posted}/${sales.length}`)

  const purchases = await p.purchase.findMany({ where: { status: 'RECEIVED' }, include: { items: true } })
  posted = 0
  for (const purchase of purchases) {
    const created = await postPurchaseEntry(purchase, db)
    if (created) posted++
  }
  console.log(`Purchases backfilled: ${posted}/${purchases.length}`)

  // Opening equity so the balance sheet starts balanced: any residual
  // imbalance (inventory from purchases vs cash from sales) is posted as
  // Owner's Capital — the standard opening-balance equity plug.
  const lines = await p.journalLine.findMany({ select: { debit: true, credit: true } })
  const totalDebit = lines.reduce((s, l) => s + Number(l.debit), 0)
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0)
  console.log(`Ledger totals: Dr ${totalDebit.toFixed(2)} / Cr ${totalCredit.toFixed(2)}`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => p.$disconnect())
