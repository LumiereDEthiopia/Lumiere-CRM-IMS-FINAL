/**
 * TIN Verification Routes
 * Protected by the global `authenticate` middleware (mounted in routes/index.js)
 * and a dedicated rate limit — so a cashier cannot flood the government service.
 * Any signed-in role may verify a TIN; the permission matrix does not gate it.
 */
import { Router } from 'express'
import { verifyCustomerTin } from '../controllers/tinController.js'
import { rateLimit } from '../middleware/rateLimit.js'

// eTrade is a public government service — keep the per-client volume low.
const maxPerMinute = parseInt(process.env.TIN_VERIFY_RATE_LIMIT_MAX, 10) || 12
const tinRateLimit = rateLimit({ windowMs: 60 * 1000, max: maxPerMinute, keyPrefix: 'tin' })

const router = Router()
router.use(tinRateLimit)
// Available to every authenticated role — only login and the rate limit apply.
router.post('/verify', verifyCustomerTin)

export { router as tinRouter }
export default router
