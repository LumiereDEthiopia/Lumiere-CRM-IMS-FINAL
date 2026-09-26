/* E2E validation of POS gram sales + Products-section stock fallback — runs on a COPY of dev.db */
import { copyFileSync, existsSync, rmSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const here = dirname(fileURLToPath(import.meta.url))
const prismaDir = join(here, 'prisma')
const testDb = join(prismaDir, 'test-e2e.db')
const srcDb = join(prismaDir, 'dev.db')

// fresh copy each run
if (existsSync(testDb)) rmSync(testDb)
if (existsSync(testDb + '-journal')) rmSync(testDb + '-journal')
copyFileSync(srcDb, testDb)

// Prisma resolves relative SQLite paths against the prisma/ (schema) dir
process.env.DATABASE_URL = 'file:./test-e2e.db'
const { createSale, cancelSale } = await import('./src/services/saleService.js')
const prisma = (await import('./src/config/prisma.js')).default

const results = []
const check = (name, cond, detail = '') => { results.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${detail ? ' [' + detail + ']' : ''}`) }

const lavender = await prisma.product.findFirst({ where: { name: 'Lavender Pure Oil' } })
const perfume = await prisma.product.findFirst({ where: { name: 'Aventus' } })
const main = await prisma.location.findFirst({ where: { name: 'Main Store' } })
const boutique = await prisma.location.findFirst({ where: { name: 'Lumiere Boutique' } })

const stockOf = async (id) => Number((await prisma.product.findUnique({ where: { id } })).stockQuantity)
const invOf = (id, loc) => prisma.inventory.findUnique({ where: { productId_locationId: { productId: id, locationId: loc } } })

const lavBefore = await stockOf(lavender.id)
const avBefore = await stockOf(perfume.id)

// 1. Sell Lavender Pure Oil 5.5g at Main Store (no Inventory row before — falls back to product stock)
const sale1 = await createSale({ locationId: main.id, items: [{ productId: lavender.id, quantity: 5.5, unitPrice: 100 }], paymentMethod: 'CASH' })
const lavAfterSale = await stockOf(lavender.id)
const lavInvMain = await invOf(lavender.id, main.id)
check('Lavender sale by 5.5g succeeds', !!sale1?.id, 'sale ' + sale1?.saleNumber)
check('SaleItem stores fractional grams', Number(sale1.items[0].quantity) === 5.5, 'quantity=' + sale1.items[0].quantity)
check('Product stock decremented 350→344.5', lavAfterSale === lavBefore - 5.5, `${lavBefore}→${lavAfterSale}`)
check('Location Inventory row seeded (344.5)', Number(lavInvMain?.availableQuantity) === lavBefore - 5.5, 'avail=' + lavInvMain?.availableQuantity)

// 2. Insufficient stock is still blocked
let blocked = false
try { await createSale({ locationId: main.id, items: [{ productId: lavender.id, quantity: 99999, unitPrice: 100 }] }) } catch (e) { blocked = /Insufficient stock/i.test(e.message) }
check('Over-selling blocked with clear error', blocked)

// 3. Perfume WITHOUT inventory at Lumiere Boutique — falls back to Products-section stock
const sale2 = await createSale({ locationId: boutique.id, items: [{ productId: perfume.id, quantity: 2, unitPrice: 5000 }], paymentMethod: 'CASH' })
const avAfterBoutique = await stockOf(perfume.id)
const avInvBoutique = await invOf(perfume.id, boutique.id)
check('Perfume sale at location without Inventory row succeeds', !!sale2?.id, 'sale ' + sale2?.saleNumber)
check('Perfume product stock 100→98', avAfterBoutique === avBefore - 2, `${avBefore}→${avAfterBoutique}`)
check('Boutique Inventory row seeded (98)', Number(avInvBoutique?.availableQuantity) === avBefore - 2, 'avail=' + avInvBoutique?.availableQuantity)

// 4. Cancel restores both product stock and location inventory
await cancelSale(sale1.id, null)
const lavAfterCancel = await stockOf(lavender.id)
const lavInvAfterCancel = await invOf(lavender.id, main.id)
check('Cancel restores product stock to ' + lavBefore, lavAfterCancel === lavBefore, 'now=' + lavAfterCancel)
check('Cancel restores location inventory', Number(lavInvAfterCancel?.availableQuantity) === lavBefore, 'avail=' + lavInvAfterCancel?.availableQuantity)

console.log(results.join('\n'))
console.log(results.every(r => r.startsWith('PASS')) ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED')

await prisma.$disconnect()
rmSync(testDb); if (existsSync(testDb + '-journal')) rmSync(testDb + '-journal')
process.exit(results.every(r => r.startsWith('PASS')) ? 0 : 1)