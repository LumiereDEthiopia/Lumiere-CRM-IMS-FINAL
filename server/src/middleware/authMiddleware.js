/**
 * Authentication Middleware
 * Supports both session tokens and API keys
 */
import { verifyToken as checkToken, getSession } from '../services/authService.js'
import { ApiError } from './errorHandler.js'

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader) {
    return next(new ApiError(401, 'Authentication required'))
  }
  
  // Check for Bearer token (session or API key)
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '')
    
    // Try API key first (longer, starts with sk_lumiere_)
    if (token.startsWith('sk_lumiere_')) {
      const apiKeyData = validateApiKey(token)
      if (!apiKeyData) {
        return next(new ApiError(401, 'Invalid API key'))
      }
      
      req.apiKey = apiKeyData
      req.authMethod = 'api_key'
      req.apiKeyId = apiKeyData.apiKeyId
      req.scopes = apiKeyData.scopes
      req.user = apiKeyData.user
      req.userId = apiKeyData.userId
      req.organizationId = apiKeyData.organizationId
      req.organization = apiKeyData.organization
      return next()
    }
    
    // Try session token
    const session = getSession(token)
    if (!session || !checkToken(token)) {
      return next(new ApiError(401, 'Invalid or expired session'))
    }
    
    req.token = token
    req.user = session
    req.userId = session.userId
    req.authMethod = 'session'
    return next()
  }
  
  // Check for API key in custom header (alternative)
  if (authHeader.startsWith('X-API-Key ')) {
    const apiKey = authHeader.replace('X-API-Key ', '')
    const apiKeyData = validateApiKey(apiKey)
    if (!apiKeyData) {
      return next(new ApiError(401, 'Invalid API key'))
    }
    
    req.apiKey = apiKeyData
    req.authMethod = 'api_key'
    req.apiKeyId = apiKeyData.apiKeyId
    req.scopes = apiKeyData.scopes
    req.user = apiKeyData.user
    req.userId = apiKeyData.userId
    req.organizationId = apiKeyData.organizationId
    req.organization = apiKeyData.organization
    return next()
  }
  
  return next(new ApiError(401, 'Invalid authorization format'))
}

export function requireAuth(req, res, next) {
  return authenticate(req, res, next)
}

// Scope checking middleware
export function requireScope(requiredScope) {
  return (req, res, next) => {
    if (req.authMethod !== 'api_key') {
      // For session auth, check user permissions
      return next()
    }
    
    if (!req.scopes || !req.scopes.includes(requiredScope) && !req.scopes.includes('admin:all')) {
      return next(new ApiError(403, `Required scope: ${requiredScope}`))
    }
    
    next()
  }
}

// Organization scope middleware (for multi-tenant access)
export function requireOrganizationAccess(options = {}) {
  return (req, res, next) => {
    if (req.authMethod === 'api_key' && req.organizationId) {
      // API key is scoped to specific organization
      if (options.allowAnyOrganization) {
        return next()
      }
      if (options.requiredOrganizationId && req.organizationId !== options.requiredOrganizationId) {
        return next(new ApiError(403, 'Access denied to this organization'))
      }
    }
    
    // For session auth, check organization membership
    if (req.authMethod === 'session') {
      // Add organization check logic here if needed
    }
    
    next()
  }
}

export default { authenticate, requireAuth, requireScope, requireOrganizationAccess }

