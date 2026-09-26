/**
 * Authentication Context
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '../services/api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [permissions, setPermissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  console.log(user, permissions, isAuthenticated)

  const loadUser = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth_token')
      if (!token) { setLoading(false); return }
      api.setToken(token)
      const res = await api.get('/api/auth/me')
      const payload = res.data || res
      setUser(payload.user)
      setPermissions(payload.permissions || [])
      setIsAuthenticated(true)
    } catch {
      localStorage.removeItem('auth_token')
      api.setToken(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadUser() }, [loadUser])

  const login = async (email, password) => {
    const res = await api.post('/api/auth/login', { email, password })
    const payload = res.data || res
    const { token, user: userData, permissions: perms } = payload
    localStorage.setItem('auth_token', token)
    api.setToken(token)
    setUser(userData)
    setPermissions(perms || [])
    setIsAuthenticated(true)
    return userData
  }

  const logout = async () => {
    try { await api.post('/api/auth/logout') } catch {}
    localStorage.removeItem('auth_token')
    api.setToken(null)
    setUser(null)
    setPermissions([])
    setIsAuthenticated(false)
  }

  const hasPermission = useCallback((perm) => {
    if (!permissions.length) return false
    if (user?.role === 'SUPER_ADMIN') return true
    return permissions.includes(perm) || permissions.includes('*')
  }, [permissions, user])

  const hasAnyPermission = useCallback((perms) => {
    if (!permissions.length) return false
    if (user?.role === 'SUPER_ADMIN' || permissions.includes('*')) return true
    return perms.some(p => permissions.includes(p))
  }, [permissions, user])

  const hasAllPermissions = useCallback((perms) => {
    if (!permissions.length) return false
    if (user?.role === 'SUPER_ADMIN' || permissions.includes('*')) return true
    return perms.every(p => permissions.includes(p))
  }, [permissions, user])

  return (
    <AuthContext.Provider value={{ user, permissions, loading, isAuthenticated, login, logout, hasPermission, hasAnyPermission, hasAllPermissions }}>
      {children}
    </AuthContext.Provider>
  )
}


export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export default AuthContext
