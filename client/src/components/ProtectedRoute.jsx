/**
 * Protected Route Component
 * Guards routes requiring authentication and optional permissions
 */
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'

function ProtectedRoute({ children, permissions = [], requireAll = false }) {
  const { isAuthenticated, loading, hasPermission, hasAnyPermission } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ width: 40, height: 40, borderWidth: 4, margin: '0 auto 1rem' }}></div>
          <p style={{ color: '#6b6b6b' }}>Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (permissions.length > 0) {
    const hasAccess = requireAll
      ? permissions.every(p => hasPermission(p))
      : hasAnyPermission(permissions)
    if (!hasAccess) {
      return <Navigate to="/access-denied" replace />
    }
  }

  return children
}

export default ProtectedRoute