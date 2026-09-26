/**
 * Inventory Management Page
 */
import { useEffect, useState, useCallback } from 'react'
import api from '../../services/api.js'
import DataTable from '../../components/DataTable.jsx'
import Pagination from '../../components/Pagination.jsx'
import Modal from '../../components/Modal.jsx'
import './admin-styles.css'

function InventoryPage() {
  const [items, setItems] = useState([])
  const [pg, setPg] = useState({ page: 1, totalPages: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [showAdjust, setShowAdjust] = useState(false)
  const [products, setProducts] = useState([])
  const [locations, setLocations] = useState([])
  const [form, setForm] = useState({ productId: '', locationId: '', adjustmentType: 'IN', quantity: '', reason: '' })

  const fetch = useCallback(async (page = 1) => {
    setLoading(true)
    try { const res = await api.get(`/api/inventory?page=${page}&limit=20`); setItems(res.data); setPg(res.pagination) }
    catch (e) { alert(e.message) }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetch(1)
    api.get('/api/products?limit=100').then(r => setProducts(r.data)).catch(() => {})
    api.get('/api/locations').then(r => setLocations(r.data)).catch(() => {})
  }, [fetch])

  const handleAdjust = async () => {
    if (!form.productId || !form.locationId || !form.quantity) { alert('All fields required'); return }
    try { await api.post('/api/inventory/adjust', { ...form, quantity: parseFloat(form.quantity) }); setShowAdjust(false); fetch(1) }
    catch (e) { alert(e.message) }
  }

  const cols = [
    { key: 'product', label: 'Product', render: (p) => p?.name || '-' },
    { key: 'location', label: 'Location', render: (l) => l?.name || '-' },
    { key: 'quantity', label: 'Qty', width: '70px', align: 'center' },
    { key: 'reservedQuantity', label: 'Reserved', width: '80px', align: 'center' },
    { key: 'availableQuantity', label: 'Available', width: '80px', align: 'center', render: (q) => <span style={{ color: q <= 0 ? '#C62828' : q <= 10 ? '#E65100' : '#2E7D32', fontWeight: 600 }}>{q}</span> },
  ]

  return (
    <div>
      <div className="page-toolbar">
        <button className="btn-primary" onClick={() => setShowAdjust(true)}>+ Adjust Stock</button>
      </div>
      <DataTable columns={cols} data={items} loading={loading} emptyMessage="No inventory records" />
      <Pagination page={pg.page} totalPages={pg.totalPages} total={pg.total} onPageChange={fetch} />
      <Modal isOpen={showAdjust} onClose={() => setShowAdjust(false)} title="Adjust Stock">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-grid">
            <div className="form-field"><label>Product</label><select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}><option value="">Select...</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div className="form-field"><label>Location</label><select value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}><option value="">Select...</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
            <div className="form-field"><label>Type</label><select value={form.adjustmentType} onChange={(e) => setForm({ ...form, adjustmentType: e.target.value })}><option value="IN">Stock In</option><option value="OUT">Stock Out</option><option value="SET">Set Quantity</option></select></div>
            <div className="form-field"><label>Quantity</label><input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
            <div className="form-field full-width"><label>Reason</label><input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
          </div>
          <div className="form-actions"><button className="btn-cancel" onClick={() => setShowAdjust(false)}>Cancel</button><button className="btn-save" onClick={handleAdjust}>Apply</button></div>
        </div>
      </Modal>
    </div>
  )
}

export default InventoryPage