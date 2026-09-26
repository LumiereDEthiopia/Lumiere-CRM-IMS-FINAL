/**
 * 404 Not Found Page
 */
import { Link } from 'react-router-dom'

function NotFound() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f5f5f7' }}>
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🔍</div>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '2rem', fontWeight: 400, color: '#1a1a1a', marginBottom: '0.5rem' }}>Page Not Found</h1>
        <p style={{ color: '#6b6b6b', maxWidth: '400px', margin: '0 auto 1.5rem' }}>The page you're looking for doesn't exist or has been moved.</p>
        <Link to="/admin" style={{ padding: '0.6rem 1.5rem', background: '#1a1a2e', color: '#ffffff', borderRadius: '6px', textDecoration: 'none', fontSize: '0.875rem' }}>Back to Dashboard</Link>
      </div>
    </div>
  )
}

export default NotFound