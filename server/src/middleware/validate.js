/**
 * Request Validation Middleware using Zod
 */
import { ApiError } from './errorHandler.js'

export function validate(schema, source = 'body') {
  return (req, res, next) => {
    try {
      const parsed = schema.safeParse(req[source])
      if (!parsed.success) {
        const message = parsed.error.issues?.map((i) => i.message).join('; ') || 'Validation failed'
        return next(new ApiError(400, message))
      }
      req[source] = parsed.data
      next()
    } catch (e) {
      next(e)
    }
  }
}

export function clampPagination(req, res, next) {
  const page = Math.max(1, parseInt(req.query.page) || 1)
  let limit = parseInt(req.query.limit) || 20
  if (limit > 100) limit = 100
  if (limit < 1) limit = 20
  req.pagination = { page, limit }
  req.query.page = page
  req.query.limit = limit
  next()
}

export default { validate, clampPagination }
