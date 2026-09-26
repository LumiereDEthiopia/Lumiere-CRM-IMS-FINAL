/** One-off: clear cached eTrade verification rows (dev utility). Usage: node scripts/clear-tin-cache.mjs [tin...] */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const tins = process.argv.slice(2)
const where = tins.length ? { tin: { in: tins } } : {}
const res = await prisma.tinVerificationCache.deleteMany({ where })
console.log('deleted cache rows:', res.count)
await prisma.$disconnect()
