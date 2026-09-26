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
  { path: '/admin/payroll', label: 'Payroll', permission: 'payroll:view' },
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
              {sidebarOpen ? item.label : item.label.charAt(0)}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main style={{ ...styles.main, marginLeft: sidebarOpen ? 240 : 60 }}>
        <header style={styles.header}>
          <div ref={searchRef} style={styles.searchWrap}>
            <label htmlFor="global-search" className="sr-only" style={styles.srOnly}>Global search</label>
            <input
              id="global-search"
              type="search"
              placeholder="Search products, customers, suppliers..."
              value={query}
              onChange={(e) => onSearchChange(e.target.value)}
              style={styles.searchInput}
              aria-autocomplete="list"
              aria-expanded={searchOpen}
            />
            {searchOpen && (
              <div style={styles.searchDropdown} role="listbox">
                {!groups.length ? (
                  <div style={styles.searchEmpty}>No results found.</div>
                ) : groups.map(([group, items]) => (
                  <div key={group}>
                    <div style={styles.searchGroup}>{group}</div>
                    {items.map((item) => (
                      <Link
                        key={`${group}-${item.id}`}
                        to={item.link || '/admin'}
                        style={styles.searchItem}
                        onClick={() => { setSearchOpen(false); setQuery('') }}
                      >
                        <strong>{item.name}</strong>
                        <span style={styles.searchMeta}>
                          {item.sku || item.code || item.email || item.brand || item.customer || item.supplier || ''}
                        </span>
                      </Link>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={styles.headerRight}>
            <div style={{ position: 'relative' }}>
              <button type="button" style={styles.iconBtn} onClick={() => setNotifOpen(!notifOpen)} aria-label={`Notifications, ${unread} unread`}>
                🔔 {unread > 0 && <span style={styles.badge}>{unread}</span>}
                {hasErrors && <span style={styles.headerErrorDot} title="Notifications with errors"></span>}
              </button>
              {notifOpen && (
                <div style={styles.notifDropdown}>
                  <div style={styles.notifHeader}>
                    <strong>Notifications</strong>
                    <button type="button" style={styles.linkish} onClick={markAllRead}>Mark all read</button>
                  </div>
                  {!notifications.length ? (
                    <div style={styles.searchEmpty}>No notifications.</div>
                  ) : notifications.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      style={{ ...styles.notifItem, ...(n.isRead ? {} : styles.notifUnread), ...(n.severity === 'error' ? styles.notifError : {}) }}
                      onClick={() => { markRead(n.id); if (n.link) navigate(n.link); setNotifOpen(false) }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><strong>{n.title}</strong>{n.severity === "error" ? <span style={styles.errorDot}></span> : null}</div>
                      <div style={styles.searchMeta}>{n.message}</div>
                      <div style={styles.searchMeta}>{n.severity} · {new Date(n.createdAt).toLocaleString()}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span style={styles.userBadge}>{user?.name || 'User'} · {user?.role || 'STAFF'}</span>
            <button type="button" style={styles.logoutBtn} onClick={handleLogout}>Logout</button>
          </div>
        </header>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>
        <div style={styles.content}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}

const styles = {
  container: { display: 'flex', minHeight: '100vh', background: '#f5f5f7' },
  sidebar: {
    width: 240, background: '#1a1a2e', color: '#fff', display: 'flex', flexDirection: 'column',
    transition: 'width 0.2s ease', position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 100
  },
  sidebarCollapsed: { width: 60 },
  sidebarHeader: {
    padding: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.1)',
    display: 'flex', alignItems: 'center', gap: '0.5rem'
  },
  logo: { fontSize: '1.5rem', color: '#c9a96e' },
  logoText: { fontFamily: "'Cormorant Garamond', serif", fontSize: '1.25rem', fontWeight: 300, letterSpacing: '0.05em' },
  toggleBtn: { marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' },
  nav: { flex: 1, padding: '0.75rem 0', overflowY: 'auto' },
  navLink: {
    display: 'block', padding: '0.7rem 1.25rem', color: 'rgba(255,255,255,0.7)', textDecoration: 'none',
    fontSize: '0.85rem', borderLeft: '3px solid transparent'
  },
  navLinkActive: { color: '#fff', background: 'rgba(201, 169, 110, 0.15)', borderLeftColor: '#c9a96e' },
  main: { flex: 1, transition: 'margin-left 0.2s ease', display: 'flex', flexDirection: 'column' },
  header: {
    background: '#fff', borderBottom: '1px solid #e8e8e8', padding: '0.75rem 1.5rem',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
    position: 'sticky', top: 0, zIndex: 50, flexWrap: 'wrap'
  },
  searchWrap: { position: 'relative', flex: 1, minWidth: 220, maxWidth: 480 },
  searchInput: {
    width: '100%', padding: '0.55rem 0.9rem', border: '1px solid #e0e0e0', borderRadius: 8,
    fontSize: '0.9rem', outline: 'none'
  },
  searchDropdown: {
    position: 'absolute', top: '110%', left: 0, right: 0, background: '#fff', border: '1px solid #e8e8e8',
    borderRadius: 8, maxHeight: 420, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', zIndex: 200
  },
  searchGroup: { padding: '0.5rem 0.9rem', fontSize: '0.7rem', textTransform: 'uppercase', color: '#9a9a9a', background: '#fafafa' },
  searchItem: { display: 'flex', flexDirection: 'column', padding: '0.55rem 0.9rem', textDecoration: 'none', color: '#1a1a1a', borderBottom: '1px solid #f3f3f3' },
  searchMeta: { fontSize: '0.75rem', color: '#8a8a8a' },
  searchEmpty: { padding: '1rem', color: '#8a8a8a', fontSize: '0.85rem' },
  headerRight: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  iconBtn: { background: '#f5f5f7', border: '1px solid #e8e8e8', borderRadius: 20, padding: '0.35rem 0.7rem', cursor: 'pointer', position: 'relative' },
  badge: { background: '#c0392b', color: '#fff', borderRadius: 10, fontSize: '0.65rem', padding: '0 0.35rem', marginLeft: 4 },
  notifDropdown: {
    position: 'absolute', right: 0, top: '120%', width: 320, background: '#fff', border: '1px solid #e8e8e8',
    borderRadius: 8, maxHeight: 400, overflowY: 'auto', zIndex: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.08)'
  },
  notifHeader: { display: 'flex', justifyContent: 'space-between', padding: '0.75rem', borderBottom: '1px solid #eee' },
  notifItem: { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid #f3f3f3', padding: '0.7rem', cursor: 'pointer' },
  notifUnread: { background: '#fbf7ef' },
  notifError: { background: "#fdf0f0", borderLeft: "3px solid #c0392b" },
  errorDot: { width: 8, height: 8, borderRadius: '50%', background: '#c0392b', display: 'inline-block', flexShrink: 0, marginRight: 4 },
  headerErrorDot: { position: 'absolute', top: 2, right: 2, width: 10, height: 10, borderRadius: '50%', background: '#c0392b', border: '1px solid #fff', animation: 'pulse 2s infinite', zIndex: 5 },
  linkish: { background: 'none', border: 'none', color: '#8a6d3b', cursor: 'pointer', fontSize: '0.75rem' },
  userBadge: { fontSize: '0.8rem', color: '#6b6b6b', padding: '0.35rem 0.7rem', background: '#f5f5f7', borderRadius: 20 },
  logoutBtn: { padding: '0.4rem 0.8rem', background: 'none', border: '1px solid #e8e8e8', borderRadius: 20, fontSize: '0.8rem', color: '#6b6b6b', cursor: 'pointer' },
  content: { flex: 1, padding: '1.5rem', overflowY: 'auto' },
  srOnly: { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', border: 0 }
}

export default AdminLayout





