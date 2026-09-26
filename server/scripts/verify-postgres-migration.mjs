/**
 * Read-only verification of the SQLite -> PostgreSQL migration (Phases 9-10).
 * Compares row counts for every model, runs orphan-FK checks on every
 * PostgreSQL foreign key, spot-checks remapped Midnight Oud rows, and asserts
 * the SQLite source file was not modified. Writes a JSON report.
 */
import 'dotenv/config'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { PrismaClient, Prisma } from '@prisma/client'

const here = path.dirname(fileURLToPath(import.meta.url))
const SQLITE_PATH = path.resolve(here, '../prisma/dev.db')
const OLD_PRODUCT_ID = 'cmtujgbu8001c1oa0tw5lk5rq'
const NEW_PRODUCT_ID = 'cmu02u5g0001enyqmgwzrlch2'
const EXCLUDED_IMAGE_ID = 'cmty463gk001sv36ugppilj8v'
const SQLITE_SHA256_EXPECTED = '3e17d051325ced8c0c14eaf091e1bebb8afb738834c5363890c8a7b5072cc4d0'

const q = (s) => '"' + String(s).replaceAll('"', '""') + '"'
const sqlite = new DatabaseSync(SQLITE_PATH, { readOnly: true })
const prisma = new PrismaClient({ log: ['error'] })
const sqlStr = (s) => "'" + String(s).replaceAll("'", "''") + "'"

const report = { startedAt: new Date().toISOString(), tables: [], fkChecks: [], remapChecks: {}, spotChecks: {}, sqliteSource: {}, status: 'PENDING' }


try {
  // 1. Row counts for every model ------------------------------------------------
  const models = Prisma.dmmf.datamodel.models.map((m) => ({ name: m.name, table: m.dbName || m.name }))
  for (const { name, table } of models) {
    let sqliteRows = null
    try { sqliteRows = sqlite.prepare(`SELECT COUNT(*) AS n FROM ${q(table)}`).get().n } catch { /* table absent in source */ }
    const pgRows = (await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM ${q(table)}`))[0].n
    const diff = sqliteRows === null ? null : pgRows - sqliteRows
    const expectedDiff = name === 'ProductImage' ? -1 : 0
    report.tables.push({ model: name, table, sqliteRows, pgRows, diff, ok: diff === null ? true : diff === expectedDiff })
  }
  for (const jt of ['_PermissionToRole', '_CustomerToCustomerTag']) {
    const s = sqlite.prepare(`SELECT COUNT(*) AS n FROM ${q(jt)}`).get().n
    const p = (await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM ${q(jt)}`))[0].n
    report.tables.push({ table: jt, sqliteRows: s, pgRows: p, diff: p - s, ok: p === s })
  }

  // 2. Orphan check for every PostgreSQL FK ----------------------------------------
  const fks = await prisma.$queryRawUnsafe(`SELECT c.conname AS name, c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent, (SELECT quote_ident(a.attname) FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attnum = c.conkey[1]) AS child_col, (SELECT quote_ident(a.attname) FROM pg_attribute a WHERE a.attrelid = c.confrelid AND a.attnum = c.confkey[1]) AS parent_col FROM pg_constraint c WHERE c.contype = 'f'`)
  for (const fk of fks) {
    const n = (await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM ${fk.child} t LEFT JOIN ${fk.parent} p ON t.${fk.child_col} = p.${fk.parent_col} WHERE t.${fk.child_col} IS NOT NULL AND p.${fk.parent_col} IS NULL`))[0].n
    report.fkChecks.push({ name: fk.name, child: fk.child, orphans: n, ok: n === 0 })
  }


  // 3. Remap verification ----------------------------------------------------------
  for (const t of ['SaleItem', 'StockMovement', 'PurchaseItem', 'SupplierProduct', 'ProductImage']) {
    report.remapChecks[t] = {
      oldIdRefs: (await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM ${q(t)} WHERE "productId" = ${sqlStr(OLD_PRODUCT_ID)}`))[0].n,
      newIdRefs: (await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM ${q(t)} WHERE "productId" = ${sqlStr(NEW_PRODUCT_ID)}`))[0].n
    }
  }
  report.remapChecks.excludedImageAbsentInPg = ((await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "ProductImage" WHERE "id" = ${sqlStr(EXCLUDED_IMAGE_ID)}`))[0].n === 0)

  // 4. Spot checks -------------------------------------------------------------------
  report.spotChecks.midnightOud = await prisma.product.findUnique({ where: { id: NEW_PRODUCT_ID }, select: { id: true, name: true, slug: true, sku: true, price: true, _count: { select: { saleItems: true, stockMovements: true, images: true, purchaseItems: true } } } })
  report.spotChecks.firstSale = await prisma.sale.findFirst({ orderBy: { saleNumber: 'asc' }, select: { saleNumber: true, total: true, status: true } })
  report.spotChecks.lastSale = await prisma.sale.findFirst({ orderBy: { saleNumber: 'desc' }, select: { saleNumber: true, total: true, status: true } })
  report.spotChecks.adminUser = await prisma.user.findFirst({ where: { email: 'admin@lumiere.com' }, select: { id: true, email: true, isActive: true, role: { select: { name: true } } } })

  // 5. SQLite source untouched ---------------------------------------------------------
  const buf = createHash('sha256').update(await (await import('node:fs/promises')).readFile(SQLITE_PATH)).digest('hex')
  report.sqliteSource = { sha256: buf, sha256MatchesBackup: buf === SQLITE_SHA256_EXPECTED, integrity: sqlite.prepare('PRAGMA integrity_check').get().integrity_check }

  const badCounts = report.tables.filter((t) => t.ok === false)
  const fkFail = report.fkChecks.filter((f) => f.ok === false)
  report.status = (badCounts.length === 0 && fkFail.length === 0 && report.sqliteSource.sha256MatchesBackup && report.sqliteSource.integrity === 'ok' && report.remapChecks.excludedImageAbsentInPg)
    ? 'VERIFIED'
    : 'FAILED: ' + JSON.stringify({ badCounts, fkFail: fkFail.map((f) => f.name), sha256MatchesBackup: report.sqliteSource.sha256MatchesBackup, integrity: report.sqliteSource.integrity, excludedImageAbsentInPg: report.remapChecks.excludedImageAbsentInPg })
} catch (error) {
  report.status = 'ERROR: ' + error.message
  process.exitCode = 1
} finally {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const out = path.resolve(here, '../prisma/backups/postgres-verification-' + stamp + '.json')
  try { writeFileSync(out, JSON.stringify(report, null, 2)) } catch { /* console only */ }
  console.log(JSON.stringify(report, null, 2))
  console.log('Report saved: ' + out)
  await prisma.$disconnect()
  sqlite.close()
}

