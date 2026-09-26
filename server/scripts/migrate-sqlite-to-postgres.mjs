/**
 * One-way data migration: SQLite (immutable source) -> PostgreSQL (destination).
 *
 * Safety properties:
 *  - Opens the SQLite source READ-ONLY. Never updates/deletes source rows.
 *  - All destination writes happen in ONE transaction; on any failure everything
 *    rolls back and PostgreSQL keeps its (schema-only) state.
 *  - Approved orphan mapping (approved by business owner):
 *      productId cmtujgbu8001c1oa0tw5lk5rq  ->  cmu02u5g0001enyqmgwzrlch2
 *    applied ONLY on SaleItem, StockMovement, PurchaseItem, SupplierProduct.
 *  - Approved exclusion:
 *      ProductImage cmty463gk001sv36ugppilj8v (duplicate seed image of the
 *      historical deleted product; the current Midnight Oud already has its
 *      valid replacement image). Row stays in SQLite, is NOT copied to PG.
 *  - All other rows, IDs, timestamps, prices are copied verbatim.
 */
import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { PrismaClient, Prisma } from '@prisma/client'

const here = path.dirname(fileURLToPath(import.meta.url))
const SQLITE_PATH = path.resolve(here, '../prisma/dev.db')

const OLD_PRODUCT_ID = 'cmtujgbu8001c1oa0tw5lk5rq'
const NEW_PRODUCT_ID = 'cmu02u5g0001enyqmgwzrlch2'
const REMAP_TABLES = new Set(['SaleItem', 'StockMovement', 'PurchaseItem', 'SupplierProduct'])
const EXCLUDED_ROWS = { ProductImage: new Set(['cmty463gk001sv36ugppilj8v']) }

if (!/^postgres(ql)?:/.test(process.env.DATABASE_URL || '')) {
  throw new Error('DATABASE_URL is not a PostgreSQL URL. Point server/.env at PostgreSQL first. Refusing to run.')
}

const q = (s) => '"' + String(s).replaceAll('"', '""') + '"'
const sqlite = new DatabaseSync(SQLITE_PATH, { readOnly: true })
const prisma = new PrismaClient({ log: ['error', 'warn'] })

/** Convert a raw SQLite value to the Prisma input value for the given DMMF scalar field. */
function convert(field, value) {
  if (value === null || value === undefined) return null
  switch (field.type) {
    case 'DateTime': {
      const d = typeof value === 'number' ? new Date(value) : new Date(String(value))
      if (Number.isNaN(d.getTime())) throw new Error(`Invalid DateTime at ${field.name}=${JSON.stringify(value)}`)
      return d
    }
    case 'Decimal':
      return String(value)
    case 'Boolean':
      return typeof value === 'number' ? value !== 0 : value !== '0' && Boolean(value)
    case 'BigInt':
      return typeof value === 'bigint' ? value : BigInt(Math.trunc(Number(value)))
    case 'Json':
      return typeof value === 'string' ? JSON.parse(value) : value
    case 'Int':
    case 'Float': {
      const n = typeof value === 'number' ? value : Number(value)
      if (Number.isNaN(n)) throw new Error(`Invalid ${field.type} at ${field.name}=${JSON.stringify(value)}`)
      return n
    }
    default:
      return typeof value === 'number' ? String(value) : value
  }
}

const models = Prisma.dmmf.datamodel.models.map((m) => ({
  name: m.name,
  table: m.dbName || m.name,
  scalars: m.fields.filter((f) => f.kind === 'scalar')
}))

const report = {
  startedAt: new Date().toISOString(),
  source: SQLITE_PATH,
  destination: 'PostgreSQL via DATABASE_URL (credentials masked)',
  tables: [],
  remappedRows: {},
  excludedRows: [],
  implicitJoinTables: [],
  preflightViolations: [],
  status: 'PENDING'
}

try {
  // ---- Preflight: approved target must exist; no unapproved orphans anywhere ---
  if (!sqlite.prepare('SELECT 1 FROM "Product" WHERE id = ?').get(NEW_PRODUCT_ID)) {
    throw new Error('Approved target product id not found in source - refusing to remap')
  }
  for (const name of ['SaleItem', 'StockMovement', 'PurchaseItem', 'SupplierProduct', 'ProductImage']) {
    const bad = sqlite
      .prepare(`SELECT COUNT(*) AS n FROM ${q(name)} WHERE productId NOT IN (SELECT id FROM "Product") AND productId <> ?`)
      .get(OLD_PRODUCT_ID).n
    if (bad > 0) report.preflightViolations.push({ table: name, unapprovedOrphans: bad })
  }
  if (report.preflightViolations.length > 0) {
    throw new Error('Unapproved orphan FK values found - STOP: ' + JSON.stringify(report.preflightViolations))
  }

  // ---- Copy every DMMF model in one transaction --------------------------------
  await prisma.$transaction(async (tx) => {
    // FK triggers disabled for the load (restored automatically at commit).
    // NOT NULL and UNIQUE constraints remain fully enforced.
    await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica')

    for (const model of models) {
      const cols = sqlite.prepare(`PRAGMA table_info(${q(model.table)})`).all()
      if (cols.length === 0) {
        report.tables.push({ model: model.name, table: model.table, sqliteRows: 0, copied: 0, note: 'no such table in SQLite source (skipped)' })
        continue
      }
      const colNames = new Set(cols.map((c) => c.name))

      // A required schema scalar missing in SQLite with no default would make a
      // faithful copy impossible.
      for (const f of model.scalars) {
        if (!colNames.has(f.name) && f.isRequired && !f.hasDefaultValue && !f.isId) {
          throw new Error(`STOP: ${model.table}.${f.name} is required by the schema but missing in the SQLite source (no default).`)
        }
      }

      const used = model.scalars.filter((f) => colNames.has(f.name))
      const rows = sqlite.prepare(`SELECT ${used.map((f) => q(f.name)).join(', ')} FROM ${q(model.table)}`).all()

      let excluded = 0
      let remapped = 0
      const data = rows.map((row) => {
        if (EXCLUDED_ROWS[model.name]?.has(String(row.id))) {
          excluded += 1
          report.excludedRows.push({ model: model.name, id: row.id, reason: 'approved exclusion (duplicate seed image of historical product)' })
          return null
        }
        const item = {}
        for (const f of used) {
          const v = convert(f, row[f.name])
          if (f.name === 'productId' && REMAP_TABLES.has(model.name) && v === OLD_PRODUCT_ID) {
            item[f.name] = NEW_PRODUCT_ID
            remapped += 1
            continue
          }
          item[f.name] = v
        }
        return item
      }).filter(Boolean)

      for (let i = 0; i < data.length; i += 400) {
        await tx[model.name.charAt(0).toLowerCase() + model.name.slice(1)].createMany({ data: data.slice(i, i + 400) })
      }

      if (remapped > 0) report.remappedRows[model.name] = remapped
      report.tables.push({ model: model.name, table: model.table, sqliteRows: rows.length, copied: data.length, excluded, remapped })
    }

    // ---- Implicit join table(s) not exposed as models -------------------------
    const m2m = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%'").all()
    for (const { name } of m2m) {
      const rows = sqlite.prepare(`SELECT * FROM ${q(name)}`).all()
      for (const row of rows) {
        const keys = Object.keys(row)
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ')
        await tx.$executeRawUnsafe(
          `INSERT INTO ${q(name)} (${keys.map(q).join(', ')}) VALUES (${placeholders})`,
          ...keys.map((k) => row[k])
        )
      }
      report.implicitJoinTables.push({ table: name, copied: rows.length })
    }
  })

  // ---- Post-copy row counts -----------------------------------------------------
  for (const entry of report.tables) {
    if (entry.note) continue
    const pg = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM ${q(entry.table)}`)
    entry.pgRows = pg[0].n
    entry.expectedDiff = -(entry.excluded || 0)
    entry.actualDiff = entry.pgRows - entry.sqliteRows
    entry.ok = entry.actualDiff === entry.expectedDiff
  }
  for (const j of report.implicitJoinTables) {
    const pg = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM ${q(j.table)}`)
    j.pgRows = pg[0].n
    j.ok = j.pgRows === j.copied
  }

  const failed = [...report.tables, ...report.implicitJoinTables].filter((t) => t.ok === false)
  report.status = failed.length === 0 ? 'ROW_COUNTS_MATCH' : 'ROW_COUNT_MISMATCH: ' + JSON.stringify(failed)
} catch (error) {
  report.status = 'FAILED (transaction rolled back): ' + error.message
  console.error(report.status)
  process.exitCode = 1
} finally {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const out = path.resolve(here, '../prisma/backups/migration-report-' + stamp + '.json')
  try { writeFileSync(out, JSON.stringify(report, null, 2)) } catch { /* console only */ }
  console.log(JSON.stringify(report, null, 2))
  console.log('Report saved: ' + out)
  await prisma.$disconnect()
  sqlite.close()
}

if (report.status !== 'ROW_COUNTS_MATCH' && process.exitCode !== 1) process.exitCode = 1

