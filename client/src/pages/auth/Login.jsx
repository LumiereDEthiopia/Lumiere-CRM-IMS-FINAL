/**
 * Login Page
 */
import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname || '/admin'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!email || !password) { setError('Email and password are required'); return }
    setLoading(true)
    try {
      await login(email, password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.message || 'Invalid email or password')
    }
    setLoading(false)
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <img src="/logo-removebg-preview.png" alt="LUMIER" style={{ width: '56px', height: '56px', objectFit: 'contain', display: 'block' }} />
          <h1 style={styles.title}>Lumière</h1>
          <p style={styles.subtitle}>Business Management System</p>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
              placeholder="admin@lumiere.com"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <div style={styles.passwordWrap}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styles.input}
                placeholder="Enter your password"
              />
              <button type="button" style={styles.togglePwd} onClick={() => setShowPassword(!showPassword)} aria-label="Toggle password visibility">
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          <button type="submit" style={styles.submitBtn} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div style={styles.footer}>
          <Link to="/" style={styles.link}>← Back to Home</Link>
        </div>
      </div>
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0a0a0f 0%, #1a0a00 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
  },
  card: {
    width: '100%',
    maxWidth: '380px',
    background: '#1a1a2e',
    borderRadius: '16px',
    padding: '2rem',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
  },
  header: {
    textAlign: 'center',
    marginBottom: '1.5rem'
  },
  title: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontSize: '1.75rem',
    color: '#c9a96e',
    margin: '0.4rem 0 0.2rem',
    letterSpacing: '0.04em'
  },
  subtitle: {
    fontSize: '0.75rem',
    color: '#6b6b6b',
    margin: 0,
    letterSpacing: '0.06em',
    textTransform: 'uppercase'
  },
  field: {
    marginBottom: '1rem'
  },
  label: {
    display: 'block',
    fontSize: '0.75rem',
    color: '#9a9a9a',
    marginBottom: '0.35rem',
    textTransform: 'uppercase',
    letterSpacing: '0.06em'
  },
  input: {
    width: '100%',
    padding: '0.6rem 0.75rem',
    background: '#0a0a0f',
    border: '1px solid #2a2a3e',
    borderRadius: '8px',
    color: '#e0e0e0',
    fontSize: '0.9rem',
    outline: 'none',
    transition: 'border-color 0.2s'
  },
  passwordWrap: {
    position: 'relative'
  },
  togglePwd: {
    position: 'absolute',
    right: '8px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '1rem',
    padding: '0'
  },
  submitBtn: {
    width: '100%',
    padding: '0.7rem',
    background: '#c9a96e',
    color: '#0a0a0f',
    border: 'none',
    borderRadius: '8px',
    fontWeight: 600,
    fontSize: '0.9rem',
    cursor: 'pointer',
    marginTop: '0.5rem',
    transition: 'background 0.2s'
  },
  footer: {
    textAlign: 'center',
    marginTop: '1.25rem',
    paddingTop: '1rem',
    borderTop: '1px solid #2a2a3e'
  },
  link: {
    color: '#9a9a9a',
    fontSize: '0.8rem',
    textDecoration: 'none'
  },
  error: {
    background: 'rgba(200, 30, 30, 0.15)',
    border: '1px solid rgba(200, 30, 30, 0.3)',
    borderRadius: '6px',
    padding: '0.5rem 0.75rem',
    fontSize: '0.8rem',
    color: '#ff8a80',
    marginBottom: '1rem',
    textAlign: 'center'
  }
}

export default LoginPage
