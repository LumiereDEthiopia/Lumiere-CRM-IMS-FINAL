/**
 * Admin Layout with global search + notifications
 */
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import api from '../services/api.js'

const navItems = [
  { path: '/admin', label: 'Dashboard', end: true },
  { path: '/admin/reports', label: 'Reports' },
  { path: '/admin/products', label: 'Products' },
  { path: '/admin/brands', label: 'Brands' },
  { path: '/admin/categories', label: 'Categories' },
  { path: '/admin/inventory', label: 'Inventory' },
  { path: '/admin/items', label: 'Items' },
  { path: '/admin/sales', label: 'Sales' },
  { path: '/admin/purchases', label: 'Purchases' },
  { path: '/admin/customers', label: 'Customers' },
  { path: '/admin/employees', label: 'Employees', permission: 'employee:view' },
  { path: '/admin/suppliers', label: 'Suppliers' },
  { path: '/admin/locations', label: 'Locations' },
  { path: '/admin/departments', label: 'Departments' },
  { path: '/admin/notes', label: 'Fragrance Notes' },
  { path: '/admin/accords', label: 'Accords' },
  { path: '/admin/data-tools', label: 'Import / Export' },
  { path: '/admin/backups', label: 'Backups' },
  { path: '/admin/settings', label: 'Settings' }
]

function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const navigate = useNavigate()
  const { user, logout, hasPermission } = useAuth()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unread, setUnread] = useState(0)
  const [notifOpen, setNotifOpen] = useState(false)
  const hasErrors = notifications.some((n) => n.severity === 'error')
  const searchTimer = useRef(null)
  const searchRef = useRef(null)

  useEffect(() => {
    loadNotifications()
    const id = setInterval(loadNotifications, 60000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    function onDocClick(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  async function loadNotifications() {
    try {
      const r = await api.get('/api/notifications?limit=10')
      setNotifications(r.data?.data || [])
      setUnread(r.data?.unreadCount || 0)
    } catch {}
  }

  function onSearchChange(value) {
    setQuery(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (value.trim().length < 2) {
      setResults(null)
      setSearchOpen(false)
      return
    }
    searchTimer.current = setTimeout(async () => {
      try {
        const r = await api.get(`/api/search?q=${encodeURIComponent(value.trim())}&limit=8`)
        setResults(r.data)
        setSearchOpen(true)
      } catch {
        setResults(null)
      }
    }, 300)
  }

  async function markAllRead() {
    try {
      await api.patch('/api/notifications/read-all')
      loadNotifications()
    } catch {}
  }

  async function markRead(id) {
    try {
      await api.patch(`/api/notifications/${id}/read`)
      loadNotifications()
    } catch {}
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const filteredNavItems = navItems.filter((item) => {
    if (item.permission) return hasPermission(item.permission)
    return true
  })

  const groups = results
    ? Object.entries(results).filter(([, items]) => Array.isArray(items) && items.length > 0)
    : []

  return (
    <div style={styles.container}>
      <aside style={{ ...styles.sidebar, ...(sidebarOpen ? {} : styles.sidebarCollapsed) }} aria-label="Main navigation">
        <div style={styles.sidebarHeader}>
          <img src="/logo-removebg-preview.png" alt="LUMIER" style={{ width: '28px', height: '28px', objectFit: 'contain', display: 'block' }} />
          {sidebarOpen && <span style={styles.logoText}>Lumière</span>}
          <button type="button" style={styles.toggleBtn} onClick={() => setSidebarOpen(!sidebarOpen)} aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}>
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>

        <nav style={styles.nav}>
          {filteredNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              style={({ isActive }) => ({ ...styles.navLink, ...(isActive ? styles.navLinkActive : {}) })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div style={styles.main}>
        <header style={styles.header}>
          <div style={styles.searchBox}>
            <input
              ref={searchRef}
              type="text"
              placeholder="Search..."
              value={query}
              onChange={(e) => onSearchChange(e.target.value)}
              onFocus={() => { if (query.trim().length >= 2) setSearchOpen(true) }}
              style={styles.searchInput}
            />
            {searchOpen && results && (
              <div style={styles.searchResults}>
                {groups.map(([category, items]) => (
                  <div key={category} style={styles.searchGroup}>
                    <div style={styles.searchGroupTitle}>{category}</div>
                    {items.slice(0, 5).map((item) => (
                      <div key={item.id || item.name} style={styles.searchResult} onClick={() => { navigate(item.link); setSearchOpen(false); setQuery('') }}}>
                        <span style={styles.searchResultIcon}>{item.type === 'product' ? '🧴' : item.type === 'sale' ? '🧾' : item.type === 'customer' ? '👤' : '📁'}</span>
                        <span style={styles.searchResultName}>{item.name}</span>
                        {item.total !== undefined && <span style={styles.searchResultMeta}>{item.total}</span>}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )
          </div>
          <div style={styles.headerRight}>
            <button style={styles.notifBtn} onClick={() => setNotifOpen(!notifOpen)} aria-label="Notifications">
              🔔 {unread > 0 && <span style={styles.notifBadge}>{unread}</span>}
              {hasErrors && <span style={styles.headerErrorDot} title="Notifications with errors"></span>}
            </button>
            {notifOpen && (
              <div style={styles.notifPanel}>
                <div style={styles.notifHeader}>
                  <span>Notifications</span>
                  {unread > 0 && <button style={styles.notifMarkAll} onClick={markAllRead}>Mark all read</button>}
                </div>
                {notifications.length === 0 ? (
                  <div style={styles.notifEmpty}>No notifications</div>
                ) : (
                  notifications.map((n) => (
                    <div key={n.id} style={{ ...styles.notifItem, ...(n.read ? {} : styles.notifItemUnread), ...(n.severity === 'error' ? styles.notifError : {}) }} onClick={() => markRead(n.id)}>
                      <div style={styles.notifMessage}>{n.severity === 'error' && <span style={styles.notifErrorDot}></span>}{n.message}</div>
                      <div style={styles.notifTime}>{new Date(n.createdAt).toLocaleString()}</div>
                    </div>
                  ))
                )}
              </div>
            )
            <div style={styles.userInfo}>
              <span style={styles.userName}>{user?.name || 'Admin'}</span>
              <button style={styles.logoutBtn} onClick={handleLogout}>Logout</button>
            </div>
          </div>
        </header>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>

        <main style={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    minHeight: '100vh',
    background: '#f5f5f7'
  },
  sidebar: {
    width: '220px',
    background: '#1a1a2e',
    color: '#e0e0e0',
    display: 'flex',
    flexDirection: 'column',
    position: 'fixed',
    top: 0,
    bottom: 0,
    left: 0,
    zIndex: 100,
    transition: 'width 0.2s ease'
  },
  sidebarCollapsed: {
    width: '60px'
  },
  sidebarHeader: {
    padding: '1rem 0.75rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    borderBottom: '1px solid #2a2a3e',
    minHeight: '56px'
  },
  logoText: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontSize: '1.1rem',
    color: '#c9a96e',
    whiteSpace: 'nowrap'
  },
  toggleBtn: {
    background: 'none',
    border: 'none',
    color: '#6b6b6b',
    cursor: 'pointer',
    fontSize: '0.8rem',
    padding: '0.2rem',
    marginLeft: 'auto'
  },
  nav: {
    flex: 1,
    padding: '0.75rem 0',
    overflowY: 'auto'
  },
  navLink: {
    display: 'block',
    padding: '0.5rem 0.75rem',
    color: '#9a9a9a',
    textDecoration: 'none',
    fontSize: '0.85rem',
    borderLeft: '3px solid transparent',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
    background: 'transparent'
  },
  navLinkActive: {
    color: '#c9a96e',
    background: 'rgba(201, 169, 110, 0.08)',
    borderLeftColor: '#c9a96e',
    fontWeight: 500
  },
  main: {
    flex: 1,
    marginLeft: '220px',
    transition: 'margin-left 0.2s ease',
    minWidth: 0
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.75rem 1.5rem',
    background: '#fff',
    borderBottom: '1px solid #e8e8e8',
    position: 'sticky',
    top: 0,
    zIndex: 50
  },
  searchBox: {
    position: 'relative',
    width: '320px'
  },
  searchInput: {
    width: '100%',
    padding: '0.5rem 0.75rem',
    border: '1px solid #e0e0e0',
    borderRadius: '6px',
    fontSize: '0.85rem',
    outline: 'none',
    background: '#fafafa'
  },
  searchResults: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: '6px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    maxHeight: '300px',
    overflowY: 'auto',
    zIndex: 60
  },
  searchGroup: {
    padding: '0.4rem 0.5rem'
  },
  searchGroupTitle: {
    fontSize: '0.65rem',
    color: '#9a9a9a',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: '0.2rem'
  },
  searchResult: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0.3rem 0.4rem',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.8rem'
  },
  searchResultIcon: {
    fontSize: '0.9rem'
  },
  searchResultName: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  searchResultMeta: {
    color: '#9a9a9a',
    fontSize: '0.75rem'
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem'
  },
  notifBtn: {
    position: 'relative',
    background: 'none',
    border: 'none',
    fontSize: '1.1rem',
    cursor: 'pointer',
    padding: '0.25rem'
  },
  notifBadge: {
    position: 'absolute',
    top: '-2px',
    right: '-4px',
    width: '16px',
    height: '16px',
    background: '#c62828',
    color: '#fff',
    borderRadius: '50%',
    fontSize: '0.6rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  notifPanel: {
    position: 'absolute',
    top: '100%',
    right: 0,
    width: '300px',
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
    zIndex: 70
  },
  notifHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.6rem 0.75rem',
    borderBottom: '1px solid #e8e8e8',
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#1a1a2e'
  },
  notifMarkAll: {
    background: 'none',
    border: 'none',
    color: '#c9a96e',
    cursor: 'pointer',
    fontSize: '0.75rem',
    textDecoration: 'underline'
  },
  notifEmpty: {
    padding: '1rem',
    textAlign: 'center',
    color: '#9a9a9a',
    fontSize: '0.8rem'
  },
  notifItem: {
    padding: '0.5rem 0.75rem',
    borderBottom: '1px solid #f5f5f5',
    cursor: 'pointer',
    fontSize: '0.8rem',
    color: '#333'
  },
  notifItemUnread: {
    background: '#fff8E1'
  },
  notifError: {
    background: '#fdf0f0',
    borderLeft: '3px solid #c0392b'
  },
  notifErrorDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#c0392b',
    display: 'inline-block',
    marginRight: 4
  },
  headerErrorDot: {
    position: 'absolute',
    top: '-2px',
    right: '-2px',
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: '#c0392b',
    border: '1px solid #fff',
    animation: 'pulse 2s infinite'
  },
  notifMessage: {
    marginBottom: '0.15rem'
  },
  notifTime: {
    fontSize: '0.7rem',
    color: '#9a9a9a'
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },
  userName: {
    fontSize: '0.85rem',
    color: '#1a1a2e',
    fontWeight: 500
  },
  logoutBtn: {
    background: 'none',
    border: '1px solid #e0e0e0',
    borderRadius: '4px',
    padding: '0.3rem 0.6rem',
    fontSize: '0.75rem',
    color: '#6b6b6b',
    cursor: 'pointer'
  },
  content: {
    padding: '1.5rem'
  }
}

export default AdminLayout
