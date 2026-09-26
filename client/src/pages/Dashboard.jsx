/**
 * Admin Dashboard Page
 * Active, responsive dashboard with real-time metrics
 */
import { useEffect, useState, useCallback } from 'react'
import api from '../services/api.js'

function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState({
    products: 0, brands: 0, categories: 0, customers: 0,
    sales: 0, inventory: 0, employees: 0, suppliers: 0
  })
  const [systemStatus, setSystemStatus] = useState('checking...')
  const [lastUpdated, setLastUpdated] = useState(null)

  const fetchData = useCallback(async () => {
    try {
      const health = await api.get('/api/health')
      setSystemStatus(health.success ? '🟢 Online' : '🔴 Offline')
      const results = await Promise.allSettled([
        api.get('/api/products?limit=1'),
        api.get('/api/brands?limit=1'),
        api.get('/api/categories?limit=1'),
        api.get('/api/customers?limit=1'),
        api.get('/api/sales?limit=1'),
        api.get('/api/inventory?limit=1'),
        api.get('/api/employees?limit=1'),
        api.get('/api/suppliers?limit=1')
      ])
      const safeNum = (r) => (r.status === 'fulfilled' ? (r.value?.pagination?.total ?? r.value?.total ?? 0) : 0)
      setMetrics({
        products: safeNum(results[0]), brands: safeNum(results[1]),
        categories: safeNum(results[2]), customers: safeNum(results[3]),
        sales: safeNum(results[4]), inventory: safeNum(results[5]),
        employees: safeNum(results[6]), suppliers: safeNum(results[7])
      })
      setLastUpdated(new Date().toLocaleTimeString())
    } catch (err) {
      setSystemStatus('🔴 Connection Error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  const statCards = [
    { label: 'Products', value: metrics.products, icon: '📦', color: '#6366f1' },
    { label: 'Brands', value: metrics.brands, icon: '🏷️', color: '#8b5cf6' },
    { label: 'Categories', value: metrics.categories, icon: '📁', color: '#a855f7' },
    { label: 'Customers', value: metrics.customers, icon: '👥', color: '#ec4899' },
    { label: 'Sales', value: metrics.sales, icon: '💰', color: '#f59e0b' },
    { label: 'Inventory', value: metrics.inventory, icon: '📋', color: '#10b981' },
    { label: 'Employees', value: metrics.employees, icon: '👤', color: '#3b82f6' },
    { label: 'Suppliers', value: metrics.suppliers, icon: '🏭', color: '#14b8a6' }
  ]

  return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%)',
      padding: '1.5rem', boxSizing: 'border-box'
    }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
        <div>
          <span className="badge" style={{ background: '#1a1a2e', marginRight: '0.75rem' }}>Admin</span>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(1.75rem, 3vw, 2.5rem)',
            fontWeight: 400, color: '#1a1a1a', margin: 0 }}>Dashboard</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem',
          padding: '0.5rem 1rem', background: '#ffffff', borderRadius: '8px',
          border: '1px solid #e8e8e8', fontSize: '0.875rem' }}>
          <span style={{ color: '#6b6b6b' }}>System:</span>
          <span style={{ fontWeight: 500 }}>{systemStatus}</span>
          <span style={{ color: '#9a9a9a' }}>|</span>
          <span style={{ color: '#6b6b6b' }}>Updated: {lastUpdated || '—'}</span>
        </div>
      </header>

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <div style={{ width: '48px', height: '48px', border: '4px solid #e8e8e8',
              borderTopColor: '#6366f1', borderRadius: '50%',
              animation: 'spin 1s linear infinite' }} />
            <span style={{ color: '#6b6b6b', fontSize: '0.9rem' }}>Loading dashboard data...</span>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        </div>
      )}

      {!loading && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '1rem', marginBottom: '2rem' }}>
            {statCards.map((stat) => (
              <div key={stat.label} style={{
                padding: '1.25rem', background: '#ffffff', borderRadius: '12px',
                border: '1px solid #e8e8e8', boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                transition: 'transform 0.2s, box-shadow 0.2s'
              }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{stat.icon}</div>
                <div style={{ fontSize: '2rem', fontWeight: 600, color: stat.color,
                  fontFamily: "'Cormorant Garamond', serif" }}>{stat.value}</div>
                <div style={{ fontSize: '0.8rem', color: '#6b6b6b',
                  textTransform: 'uppercase', letterSpacing: '0.5px' }}>{stat.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
            gap: '1.5rem', marginBottom: '2rem' }}>
            <div style={{ padding: '1.25rem', background: '#ffffff', borderRadius: '12px',
              border: '1px solid #e8e8e8' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a1a', margin: '0 0 1rem 0' }}>
                📊 Quick Overview
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {Object.entries(metrics).map(([key, val]) => (
                  <div key={key} style={{ padding: '0.75rem', background: '#f8fafc',
                    borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a1a' }}>{val}</div>
                    <div style={{ fontSize: '0.75rem', color: '#6b6b6b',
                      textTransform: 'capitalize' }}>{key}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ padding: '1.25rem', background: '#ffffff', borderRadius: '12px',
              border: '1px solid #e8e8e8' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a1a', margin: '0 0 1rem 0' }}>
                🔄 System Activity
              </h2>
              <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%',
                    background: '#22c55e', animation: 'pulse 2s infinite' }} />
                  <span style={{ fontSize: '0.85rem', color: '#6b6b6b' }}>Dashboard auto-refreshes every 30s</span>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#9a9a9a' }}>
                  Backend: {systemStatus.includes('Online') ? 'Connected' : 'Disconnected'}
                </div>
                <style>{`@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>
              </div>
            </div>
          </div>

          <div style={{ padding: '1.25rem', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
            borderRadius: '12px', color: '#ffffff' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', opacity: 0.9 }}>
              Quick Actions
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
              {['Add Product', 'New Sale', 'Manage Stock', 'Add Customer', 'Reports'].map((action) => (
                <button key={action} style={{
                  padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.15)',
                  border: '1px solid rgba(255,255,255,0.25)', borderRadius: '6px',
                  color: '#ffffff', fontSize: '0.85rem', cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
                onMouseOver={(e) => e.target.style.background = 'rgba(255,255,255,0.25)'}
                onMouseOut={(e) => e.target.style.background = 'rgba(255,255,255,0.15)'}
                >
                  {action}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <footer style={{ marginTop: '3rem', paddingTop: '1.5rem', borderTop: '1px solid #e8e8e8',
        display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem',
        fontSize: '0.8rem', color: '#9a9a9a' }}>
        <span>Lumière CRM • Dashboard</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%',
            background: systemStatus.includes('Online') ? '#22c55e' : '#ef4444',
            animation: systemStatus.includes('Online') ? 'pulse 2s infinite' : 'none' }} />
          Auto-refreshes every 30s
          <style>{`@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>
        </span>
      </footer>
    </div>
  )
}

export default DashboardPage
