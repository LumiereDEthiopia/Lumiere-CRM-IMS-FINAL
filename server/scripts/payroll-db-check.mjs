/**
 * Read-only inspection for the Employee / Salary / Payroll work.
 * Lists tables, Employee columns and payroll-related tables so we can prove that
 * schema changes are additive and that no existing data is lost.
 */
import { readFileSync } from 'node:fs'

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && process.env[m[1]] === undefined) {
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

const { default: prisma } = await import('../src/config/prisma.js')

const tables = await prisma.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
console.log('TABLES: ' + tables.map((t) => t.name).join(', '))

for (const table of ['Employee', 'EmployeeSalaryHistory', 'EmployeeSalaryPayment', 'PayrollRule', 'Department', 'Location', 'EmployeeDocument']) {
  try {
    const cols = await prisma.$queryRawUnsafe(`PRAGMA table_info(${table})`)
    console.log(`\n${table.toUpperCase()}_COLUMNS: ` + cols.map((c) => c.name).join(', '))
    const count = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM "${table}"`)
    console.log(`${table.toUpperCase()}_COUNT: ` + count[0].c)
  } catch (e) {
    console.log(`\n${table.toUpperCase()}: MISSING (${e.message.split('\n')[0]})`)
  }
}

const applied = await prisma.$queryRawUnsafe('SELECT migration_name FROM _prisma_migrations ORDER BY started_at')
console.log('\nAPPLIED_MIGRATIONS: ' + applied.map((m) => m.migration_name).join(', '))

for (const table of ['Product', 'SaleItem']) {
  const cols = await prisma.$queryRawUnsafe(`PRAGMA table_info(${table})`)
  console.log(`\n${table.toUpperCase()}_COLUMNS: ` + cols.map((c) => c.name).join(', '))
}

for (const table of ['Employee', 'Department', 'Location', 'EmployeeDocument']) {
  const idx = await prisma.$queryRawUnsafe(`PRAGMA index_list(${table})`)
  const detail = []
  for (const i of idx) {
    const info = await prisma.$queryRawUnsafe(`PRAGMA index_info(${i.name})`)
    detail.push(`${i.name}${i.unique ? ' (unique)' : ''}[${info.map((c) => c.name).join('+')}]`)
  }
  console.log(`\n${table.toUpperCase()}_INDEXES: ` + detail.join(', '))
}

await prisma.$disconnect()
