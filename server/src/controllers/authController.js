/**
 * Authentication Controller
 */
import { login as authLogin, logout as authLogout, getCurrentUser } from '../services/authService.js'

export async function login(req, res, next) {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' })
    }
    const result = await authLogin(email, password, req.ip)
    res.json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
}

export async function logout(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
    await authLogout(token, req.ip)
    res.json({ success: true, message: 'Logged out successfully' })
  } catch (error) {
    next(error)
  }
}

export async function me(req, res, next) {
  try {
    const result = await getCurrentUser(req.token)
    res.json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
}

export default { login, logout, me }
