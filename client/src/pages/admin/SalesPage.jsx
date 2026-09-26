import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import api from '../../services/api.js'
import { etb } from '../../lib/currency.js'
import DataTable from '../../components/DataTable.jsx'
import Pagination from '../../components/Pagination.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import './admin-styles.css'

export default function SalesPage() {
  const [sales, setSales] = useState([])
  const [pg, setPg] = useState({ page: 1, totalPages: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [channelFilter, setChannelFilter] = useState('')
  const [locations, setLocations] = useState([])

  const fetchLocs = useCallback(async () => {
    try { const r = await api.get('/api/locations?limit=100'); setLocations(r.data || []) } catch {}
  }, [])

  const fetch = useCallback(async (page, s, status, loc, channel) => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ page: page || 1, limit: 20 })
      if (s) p.set('search', s)
      if (status) p.set('status', status)
      if (loc) p.set('locationId', loc)
      if (channel) p.set('salesChannel', channel)
      const res = await api.get(`/api/sales?${p}`)
      setSales(res.data); setPg(res.pagination)
    } catch (e) { alert(e.message) }
    setLoading(false)
  }, [])

  useEffect(() => { fetchLocs() }, [fetchLocs])
  useEffect(() => { fetch(1, search, statusFilter, locationFilter, channelFilter) }, [fetch, search, statusFilter, locationFilter, channelFilter])

  const handleCancel = async (id) => {
    if (!confirm('Cancel sale? Inventory restored.')) return
    try { await api.post(`/api/sales/${id}/cancel`); fetch(pg.page, search, statusFilter, locationFilter, channelFilter) }
    catch (e) { alert(e.message) }
  }

  const cols = [
    { key: 'saleNumber', label: 'Sale #', render: (v) => <strong style={{ color: '#8a6d3b' }}>{v}</strong> },
    { key: 'soldAt', label: 'Date/Time', width: '140px', render: (d) => new Date(d).toLocaleString() },
    { key: 'customer', label: 'Customer', render: (c) => c?.name || <span style={{ color: '#9a9a9a' }}>Walk-in</span> },
    { key: 'salesChannel', label: 'Section', render: (c) => c || 'DIRECT' },
    { key: 'location', label: 'Location', render: (l) => l?.name || '-' },
    { key: '_count', label: 'Items', width: '70px', align: 'center', render: (c) => c?.items || 0 },
    { key: 'total', label: 'Total', width: '110px', render: (t) => <strong>{etb(t)}</strong> },
    { key: 'status', label: 'Status', width: '100px', render: (s) => <StatusBadge status={s} type="order" /> },
    { key: 'actions', label: '', width: '180px', align: 'center', render: (_, row) => (
      <div className="action-buttons">
        <Link to={`/admin/sales/${row.id}`} className="btn-edit" style={{ textDecoration: 'none', padding: '0.25rem 0.6rem', fontSize: '0.7rem' }}>View</Link>
        {row.status !== 'CANCELLED' && <button className="btn-danger-outline" style={{ fontSize: '0.7rem' }} onClick={() => handleCancel(row.id)}>Cancel</button>}
      </div>
    )}
  ]

  return (
    <div className="dashboard-container">
      <div className="page-header-row">
        <div>
          <h2 className="page-title">Sales Management</h2>
          <p className="page-subtitle">Daily sales transactions</p>
        </div>
        <div className="header-actions">
          <Link to="/admin/sales/new" className="btn btn-primary">+ New Direct Sale</Link>
          <Link to="/admin/sales/daily" className="btn btn-secondary">Daily Activity</Link>
        </div>
      </div>
      <div className="filter-bar" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="text" placeholder="Search sale #, customer..." value={search} onChange={(e) => setSearch(e.target.value)} className="search-input" style={{ width: '220px' }} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: '0.45rem 0.6rem', border: '1px solid #e8e8e8', borderRadius: '6px', fontSize: '0.85rem' }}>
            <option value="">All Status</option>
            <option value="COMPLETED">Completed</option>
            <option value="PENDING">Pending</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} style={{ padding: '0.45rem 0.6rem', border: '1px solid #e8e8e8', borderRadius: '6px', fontSize: '0.85rem' }}>
            <option value="">All Locations</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)} style={{ padding: '0.45rem 0.6rem', border: '1px solid #e8e8e8', borderRadius: '6px', fontSize: '0.85rem' }}>
            <option value="">All Sales Sections</option>
            <option value="DIRECT">Direct</option>
            <option value="YETESAFEBET">Yetesafebet</option>
            <option value="YALETETAFEBET">Yaletetafebet</option>
          </select>
        </div>
      </div>
      <DataTable columns={cols} data={sales} loading={loading} emptyMessage="No sales found" />
      <Pagination page={pg.page} totalPages={pg.totalPages} total={pg.total} onPageChange={(p) => fetch(p, search, statusFilter, locationFilter, channelFilter)} />
    </div>
  )
}