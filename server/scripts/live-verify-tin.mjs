/**
 * Live smoke test for the eTrade TIN verification integration.
 * Usage: node scripts/live-verify-tin.mjs 0092183201 [--force]
 *
 * Hits the REAL official eTrade business license checker through the
 * application service layer (same code path the API uses).
 */
import { verifyTin, resetCircuitBreaker } from '../src/services/tinVerificationService.js'
import prisma from '../src/config/prisma.js'

const tin = process.argv[2]
const forceRefresh = process.argv.includes('--force')

if (!tin) {
  console.error('Usage: node scripts/live-verify-tin.mjs <tin> [--force]')
  process.exit(1)
}

resetCircuitBreaker()
const startedAt = Date.now()
const result = await verifyTin(tin, { userId: null, forceRefresh })
const elapsed = Date.now() - startedAt

console.log('--- live eTrade verification ---')
console.log(JSON.stringify({ elapsedMs: elapsed, ...result }, null, 2))

const cache = await prisma.tinVerificationCache.findUnique({ where: { tin: String(tin).replace(/\D/g, '') } })
console.log('--- cache row ---')
console.log(JSON.stringify(cache, null, 2))

await prisma.$disconnect()
