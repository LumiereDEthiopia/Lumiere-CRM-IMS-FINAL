/**
 * Authentication Routes
 */
import { Router } from 'express'
import { login, logout, me } from '../controllers/authController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import { authRateLimit } from '../middleware/rateLimit.js'

const router = Router()

router.post('/login', authRateLimit, login)
router.post('/logout', requireAuth, logout)
router.get('/me', requireAuth, me)

export { router as authRouter }
export default router
