/** Row counts of key tables — used to prove no data was lost around schema changes. */
import { readFileSync } from 'node:fs'

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && process.env[m[1]] === undefined) {
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

const { default: prisma } = await import('../src/config/prisma.js')

const TABLES = ['Product', 'Category', 'Brand', 'Customer', 'Sale', 'SaleItem', 'Inventory', 'StockMovement',
  'Purchase', 'PurchaseItem', 'StockTransfer', 'Supplier', 'User', 'AuditLog', 'Item', 'ItemCategory',
  'ItemInventory', 'ItemMovement', 'ProductItem', 'ItemTransfer', 'ItemTransferItem']

const counts = {}
for (const t of TABLES) {
  try { counts[t] = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as c FROM "${t}"`) } catch { counts[t] = [{ c: 'N/A' }] }
}
console.log(counts)
await prisma.$disconnect()
