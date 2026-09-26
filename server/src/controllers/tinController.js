/**
 * TIN Verification Controller
 * Wraps the official Ethiopian eTrade business license checker.
 * The cashier's browser never talks to eTrade directly — only to this API.
 */
import prisma from '../config/prisma.js'
import { verifyTin, markCustomerVerified } from '../services/tinVerificationService.js'
import { ApiError } from '../middleware/errorHandler.js'

async function findCustomer(id) {
  if (!id) return null
  return prisma.customer.findUnique({
    where: { id },
    select: { id: true, customerCode: true, name: true, tinNumber: true, tinVerified: true }
  })
}

/**
 * POST /api/tin/verify
 * Body: { tin: "0092183201", customerId?: "<existing customer id>", forceRefresh?: false }
 *
 * Responses:
 *  - 200 { success: true, verified: true,  tin, name, license, source, cached, existingCustomer }
 *  - 200 { success: true, verified: false, tin, name: null, message: "TIN not found", existingCustomer: null }
 *  - 200 { success: false, verified: false, tin, name: null, retryable: true, message: "Unable to verify TIN right now..." }
 *  - 400 { success: false, message: "Invalid TIN format..." }
 */
export async function verifyCustomerTin(req, res, next) {
  try {
    const { tin, customerId, forceRefresh } = req.body || {}

    // Optionally attach the verification to an existing customer record
    let linkedCustomer = null
    if (customerId) {
      linkedCustomer = await findCustomer(customerId)
      if (!linkedCustomer) throw new ApiError(404, 'Customer not found')
    }

    const result = await verifyTin(tin, { userId: req.user?.id, forceRefresh: forceRefresh === true })

    // Bad TIN format (or missing) — validation error, nothing was checked
    if (result.status === 'invalid') {
      throw new ApiError(400, result.message || 'Invalid TIN format')
    }

    // Successful verification against an explicit customer record →
    // store the government-verified name data on the customer.
    if (result.verified && linkedCustomer) {
      linkedCustomer = await markCustomerVerified(linkedCustomer.id, result.tin, result.name)
    }

    // Upstream unavailable — friendly, retryable, no technical details
    if (!result.ok) {
      return res.json({
        success: false,
        verified: false,
        tin: result.tin ?? null,
        name: null,
        retryable: true,
        message: result.message || 'Unable to verify TIN right now. Please try again.'
      })
    }

    return res.json({
      success: true,
      verified: result.verified,
      tin: result.tin,
      name: result.name || null,
      license: result.license || null,
      source: result.verified ? 'ETRADE' : null,
      cached: !!result.cached,
      message: result.message || (result.verified ? null : 'TIN not found'),
      existingCustomer: result.existingCustomer || null,
      linkedCustomer: linkedCustomer || null
    })
  } catch (e) {
    next(e)
  }
}

export default { verifyCustomerTin }
