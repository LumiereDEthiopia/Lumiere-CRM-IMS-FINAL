/**
 * Centralized Error Handling Middleware
 * Provides consistent API response format.
 *
 * Success: { success: true, data: {} }
 * Error:   { success: false, message: "..." }
 */

/**
 * Custom API Error class
 */
export class ApiError extends Error {
  constructor(statusCode, message, code = 'API_ERROR') {
    super(message)
    this.statusCode = statusCode
    this.name = 'ApiError'
    this.code = code
  }
}

export function prismaErrorHandler(error) {
  if (!error || !error.meta) return error
  const { modelName, action, arguments: args } = error.meta
  const fieldErrors = []
  if (args && typeof args[1] === 'object') {
    const data = args[1]
    for (const [key, value] of Object.entries(data)) {
      if (value === '' || value === null) {
        if (key === 'categoryId' || key === 'gender' || key === 'size' || key === 'concentration' || key === 'country') {
          fieldErrors.push(`${key} is empty`)
        }
      }
    }
  }
  if (fieldErrors.length) {
    return new ApiError(400, `Invalid product payload: ${fieldErrors.join(', ')}`, 'INVALID_PRODUCT_PAYLOAD')
  }
  return error
}

/**
 * Handle requests to undefined API routes
 */
export function notFoundHandler(req, res, next) {
  const error = new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`)
  next(error)
}

/**
 * Global error handler middleware
 * Must have 4 parameters for Express to recognize it as error handler
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // Default error values
  const statusCode = err.statusCode || 500
  const message = err.message || 'Internal Server Error'

  // Log error details (in production, use proper logging service)
  if (process.env.NODE_ENV !== 'production') {
    console.error(`[Error ${statusCode}]: ${message}`)
    if (err.stack && statusCode === 500) {
      console.error(err.stack)
    }
  }

  // Normalize Prisma errors into clean API errors so the client never sees
  // internal invocation logs or raw Prisma error shapes.
  if (err.name === 'PrismaClientKnownRequestError' || err.name === 'PrismaClientUnknownRequestError') {
    const normalized = prismaErrorHandler(err)
    if (normalized instanceof ApiError) err = normalized
  }

  // Send consistent error response
  // Never expose stack traces or sensitive details to clients
  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV !== 'development' && statusCode === 500
      ? {}
      : { status: statusCode })
  })
}
