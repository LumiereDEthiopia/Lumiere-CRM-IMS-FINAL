/**
 * Data-integrity snapshot for sales-feature schema changes.
 * Prints row counts + checksum-ish aggregates for every business table the
 * Direct Sale / Discount / Free Gift feature must not disturb.
 *
 * Usage (from server/):  node scripts/verify-sales-data.mjs
 * Run BEFORE and AFTER `prisma migrate deploy` and diff the output.
 * Read-only — never writes to the database.
 */
import prisma from '../src/config/prisma.js'

const COUNTS = [
  ['Customer', 'customer'],
  ['Product', 'product'],
  ['Inventory', 'inventory'],
  ['StockMovement', 'stockMovement'],
  ['Sale', 'sale'],
  ['SaleItem', 'saleItem'],
  ['User', 'user'],
  ['Role', 'role'],
  ['Permission', 'permission'],
  ['Location', 'location'],
  ['Setting', 'setting'],
  ['AuditLog', 'auditLog'],
  ['Purchase', 'purchase'],
  ['Employee', 'employee']
]

const out = { timestamp: new Date().toISOString(), counts: {}, sales: null, items: null }

for (const [label, delegate] of COUNTS) {
  try { out.counts[label] = await prisma[delegate].count() } catch (e) { out.counts[label] = `ERROR: ${e.message}` }
}

try {
  const agg = await prisma.sale.aggregate({ _sum: { subtotal: true, discount: true, total: true, vatAmount: true }, _count: true })
  const last = await prisma.sale.findFirst({ orderBy: { createdAt: 'desc' }, select: { saleNumber: true, total: true, createdAt: true } })
  out.sales = { sumSubtotal: String(agg._sum.subtotal ?? 0), sumDiscount: String(agg._sum.discount ?? 0), sumTotal: String(agg._sum.total ?? 0), sumVat: String(agg._sum.vatAmount ?? 0), count: agg._count, latest: last ? { saleNumber: last.saleNumber, total: String(last.total), createdAt: last.createdAt } : null }
} catch (e) { out.sales = `ERROR: ${e.message}` }

try {
  const agg = await prisma.saleItem.aggregate({ _sum: { totalPrice: true, quantity: true }, _count: true })
  out.items = { sumTotalPrice: String(agg._sum.totalPrice ?? 0), sumQuantity: String(agg._sum.quantity ?? 0), count: agg._count }
} catch (e) { out.items = `ERROR: ${e.message}` }

console.log(JSON.stringify(out, null, 2))
await prisma.$disconnect()
