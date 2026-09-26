/** Read-only: show applied Prisma migrations + rough drift signal. */
import { readFileSync } from 'node:fs'

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && process.env[m[1]] === undefined) {
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

const { default: prisma } = await import('../src/config/prisma.js')

const rows = await prisma.$queryRawUnsafe(
  'SELECT migration_name, finished_at, applied_steps_count, rolled_back_at FROM _prisma_migrations ORDER BY started_at'
)
console.log('APPLIED_MIGRATIONS:')
for (const r of rows) {
  console.log(`  ${r.migration_name} | finished=${r.finished_at ? 'YES' : 'NO'} | steps=${r.applied_steps_count} | rolledBack=${r.rolled_back_at ? 'YES' : 'NO'}`)
}
console.log('TOTAL_RECORDED=' + rows.length)

const itemTables = await prisma.$queryRawUnsafe(
  "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'Item%' OR name = 'ProductItem') ORDER BY name"
)
console.log('EXISTING_ITEM_TABLES: ' + (itemTables.length ? itemTables.map((t) => t.name).join(', ') : 'NONE'))

await prisma.$disconnect()
