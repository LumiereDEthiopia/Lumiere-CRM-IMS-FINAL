/**
 * Customer Homepage
 * Premium Lumière-style landing page (placeholder for Stage 1)
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api.js'

function HomePage() {
  const [healthStatus, setHealthStatus] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get('/api/health')
      .then((data) => {
        setHealthStatus(data)
        setLoading(false)
      })
      .catch(() => {
        setHealthStatus({ success: false })
        setLoading(false)
      })
  }, [])

  return (
    <div className="placeholder-page" style={{
      background: 'linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 100%)',
      color: '#ffffff'
    }}>
      <span className="badge" style={{ background: '#c9a96e' }}>Lumière</span>
      <h1 style={{
        fontFamily: "'Cormorant Garamond', serif",
        fontSize: 'clamp(2.5rem, 6vw, 4.5rem)',
        fontWeight: 300,
        color: '#ffffff',
        letterSpacing: '-0.02em'
      }}>
        Premium Perfume
      </h1>
      <p style={{
        color: 'rgba(255,255,255,0.6)',
        fontSize: '1.1rem',
        maxWidth: '480px',
        lineHeight: 1.8
      }}>
        An elegant collection of fine fragrances crafted for the discerning individual.
        Experience luxury in every note.
      </p>

      <div style={{
        marginTop: '2.5rem',
        padding: '1rem 2rem',
        borderRadius: '8px',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        fontSize: '0.9rem'
      }}>
        {loading ? (
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>Connecting to API...</span>
        ) : healthStatus?.success ? (
          <span style={{ color: '#a8e6cf' }}>✓ API Connected — {healthStatus.message}</span>
        ) : (
          <span style={{ color: '#ff6f61' }}>✗ API Unavailable — Ensure backend is running on port 3001</span>
        )}
      </div>

      <Link
        to="/login"
        style={{
          display: 'inline-block',
          marginTop: '2rem',
          padding: '0.85rem 2.5rem',
          borderRadius: '8px',
          background: 'linear-gradient(135deg, #c9a96e 0%, #a8873f 100%)',
          color: '#1a1a1a',
          fontWeight: 600,
          fontSize: '0.95rem',
          textDecoration: 'none',
          letterSpacing: '0.08em',
          border: 'none',
          boxShadow: '0 4px 18px rgba(201,169,110,0.25)'
        }}
      >
        Staff Login →
      </Link>
    </div>
  )
}

export default HomePage
