/** Read-only comparison against the pre-payroll backup. Prints counts, never values. */
import { PrismaClient } from '@prisma/client'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const backup = fileURLToPath(new URL('../prisma/dev.db.backup-before-payroll-20260916-214842', import.meta.url))
const current = fileURLToPath(new URL('../prisma/dev.db', import.meta.url))
const before = new PrismaClient({ datasources: { db: { url: `file:${backup.replaceAll('\\', '/')}` } } })
const after = new PrismaClient({ datasources: { db: { url: `file:${current.replaceAll('\\', '/')}` } } })
const quote = name => `"${name.replaceAll('"', '""')}"`
let failures = 0
try {
  const tables = await before.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%'")
  for (const { name } of tables) {
    const columns = await before.$queryRawUnsafe(`PRAGMA table_info(${quote(name)})`)
    const keys = columns.map(c => c.name)
    const select = keys.map(quote).join(', ')
    const oldRows = await before.$queryRawUnsafe(`SELECT ${select} FROM ${quote(name)}`)
    const newRows = await after.$queryRawUnsafe(`SELECT ${select} FROM ${quote(name)}`)
    const serialize = row => JSON.stringify(row, (_, v) => typeof v === 'bigint' ? String(v) : v)
    const counts = new Map()
    for (const row of newRows) { const key = serialize(row); counts.set(key, (counts.get(key) || 0) + 1) }
    let missing = 0
    for (const row of oldRows) {
      const key = serialize(row)
      if (!counts.get(key)) missing++
      else counts.set(key, counts.get(key) - 1)
    }
    // Audit additions and new permission links are allowed; existing rows must remain.
    console.log(`${missing ? 'REVIEW' : 'PASS'} ${name}: before=${oldRows.length}, current=${newRows.length}, changed-or-missing=${missing}`)
    if (missing) failures++
  }
  assert.equal(failures, 0, 'Some pre-payroll rows differ; review before claiming data preservation')
  console.log('PASS: all pre-payroll records and original column values preserved')
} finally { await before.$disconnect(); await after.$disconnect() }
