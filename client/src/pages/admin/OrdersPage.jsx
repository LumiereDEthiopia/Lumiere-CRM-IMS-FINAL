/**
 * Sales Management Page — LUMIER PERFUME
 * Internal sales transactions (NOT e-commerce orders)
 */
import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import api from '../../services/api.js'
import { etb } from '../../lib/currency.js'
import DataTable from '../../components/DataTable.jsx'
import Pagination from '../../components/Pagination.jsx'
import Modal from '../../components/Modal.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import './admin-styles.css'

function OrdersPage() {
  const [sales, setSales] = useState([])
  const [pg, setPg] = useState({ page: 1, totalPages: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [viewSale, setViewSale] = useState(null)
  const [locations, setLocations] = useState([])
  const [locationFilter, setLocationFilter] = useState('')

  const fetchLocations = useCallback(async () => {
    try { const r = await api.get('/api/locations?limit=100'); setLocations(r.data || []) } catch {}
  }, [])

  const fetch = useCallback(async (page, s, status, loc) => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ page: page || 1, limit: 20 })
      if (s) p.set('search', s)
      if (status) p.set('status', status)
      if (loc) p.set('locationId', loc)
      const res = await api.get(`/api/sales?${p}`)
      setSales(res.data); setPg(res.pagination)
    } catch (e) { alert(e.message) }
    setLoading(false)
  }, [])

  useEffect(() => { fetchLocations() }, [fetchLocations])
  useEffect(() => { fetch(1, search, statusFilter, locationFilter) }, [fetch, search, statusFilter, locationFilter])

  const handleCancel = async (id) => {
    if (!confirm('Cancel this sale? Inventory will be restored.')) return
    try { await api.post(`/api/sales/${id}/cancel`); fetch(pg.page, search, statusFilter, locationFilter) }
    catch (e) { alert(e.message) }
  }

  const cols = [
    { key: 'saleNumber', label: 'Sale #', render: (v) => <strong style={{ color: '#8a6d3b' }}>{v}</strong> },
    { key: 'soldAt', label: 'Date/Time', width: '140px', render: (d) => new Date(d).toLocaleString() },
    { key: 'customer', label: 'Customer', render: (c) => c?.name || <span style={{ color: '#9a9a9a' }}>Walk-in</span> },
    { key: 'location', label: 'Location', render: (l) => l?.name || '-' },
    { key: '_count', label: 'Items', width: '70px', align: 'center', render: (c) => c?.items || 0 },
    { key: 'total', label: 'Total', width: '110px', render: (t) => <strong>{etb(t)}</strong> },
    { key: 'status', label: 'Status', width: '100px', render: (s) => <StatusBadge status={s} type="order" /> },
    { key: 'actions', label: '', width: '200px', align: 'center', render: (_, row) => (
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
          <Link to="/admin/sales/new" className="btn btn-primary">+ New Sale</Link>
          <Link to="/admin/sales/daily" className="btn btn-secondary">Daily Activity</Link>
        </div>
      </div>
      <div className="filter-bar" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="text" placeholder="Search sale #, customer, phone..." value={search} onChange={(e) => setSearch(e.target.value)} className="search-input" style={{ width: '220px' }} />
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
        </div>
      </div>
      <DataTable columns={cols} data={sales} loading={loading} emptyMessage="No sales found" />
      <Pagination page={pg.page} totalPages={pg.totalPages} total={pg.total} onPageChange={(p) => fetch(p, search, statusFilter, locationFilter)} />

      {/* Sale Detail Modal */}
      <Modal isOpen={!!viewSale} onClose={() => setViewSale(null)} title={`Sale ${viewSale?.saleNumber || ''}`} size="lg">
        {viewSale && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div><strong>Customer:</strong> {viewSale.customer?.name || 'Walk-in'}</div>
              <div><strong>Phone:</strong> {viewSale.customer?.phone || '-'}</div>
              <div><strong>Location:</strong> {viewSale.location?.name}</div>
              <div><strong>Status:</strong> <StatusBadge status={viewSale.status} type="order" /></div>
              <div><strong>Date:</strong> {new Date(viewSale.soldAt).toLocaleString()}</div>
              <div><strong>Sold By:</strong> {viewSale.createdBy || '-'}</div>
            </div>
            <div>
              <strong>Items:</strong>
              <table className="table" style={{ marginTop: '0.5rem' }}>
                <thead><tr><th className="th">Product</th><th className="th">Qty</th><th className="th">Price</th><th className="th">Total</th></tr></thead>
                <tbody>{viewSale.items?.map((item, i) => (
                  <tr key={i} className="tr"><td className="td">{item.productName}</td><td className="td">{item.quantity}</td><td className="td">{etb(item.unitPrice)}</td><td className="td">{etb(item.totalPrice)}</td></tr>
                ))}</tbody>
              </table>
            </div>
            <div style={{ textAlign: 'right', fontSize: '1.1rem' }}>
              <div>Subtotal: {etb(Number(viewSale.subtotal || 0) - Number(viewSale.discount || 0) - Number(viewSale.vatAmount || 0))}</div>
              <div>Discount: {etb(viewSale.discount)}</div>
              <div>VAT ({Number(viewSale.vatRate || 0)}%): {etb(viewSale.vatAmount)}</div>
              <div>Withholding ({Number(viewSale.withholdingRate || 0)}%): {etb(viewSale.withholdingAmount)}</div>
              <div><strong>Total: {etb(viewSale.total)}</strong></div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default OrdersPage