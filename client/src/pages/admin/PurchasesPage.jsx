/**
 * Purchases Management Page
 */
import { useEffect, useState, useCallback } from 'react'
import api from '../../services/api.js'
import DataTable from '../../components/DataTable.jsx'
import Pagination from '../../components/Pagination.jsx'
import Modal from '../../components/Modal.jsx'
import './admin-styles.css'

function PurchasesPage() {
  const [purchases, setPurchases] = useState([])
  const [pg, setPg] = useState({ page: 1, totalPages: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [suppliers, setSuppliers] = useState([])
  const [locations, setLocations] = useState([])
  const [products, setProducts] = useState([])
  const [form, setForm] = useState({ supplierId: '', locationId: '', items: [] })
  const emptyLine = { lineType: 'PRODUCT', productId: '', itemId: '', quantity: 1, unitCost: 0, notes: '' }
  const [itemsCatalog, setItemsCatalog] = useState([])

  const fetch = useCallback(async (page = 1) => {
    setLoading(true)
    try { const res = await api.get(`/api/purchases?page=${page}&limit=20`); setPurchases(res.data); setPg(res.pagination) }
    catch (e) { alert(e.message) }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetch(1)
    api.get('/api/suppliers?limit=100').then(r => setSuppliers(r.data)).catch(() => {})
    api.get('/api/locations').then(r => setLocations(r.data)).catch(() => {})
    api.get('/api/products?limit=100').then(r => setProducts(r.data)).catch(() => {})
    api.get('/api/items?limit=100&isActive=true').then(r => setItemsCatalog(r.data)).catch(() => {})
  }, [fetch])

  const setLine = (index, key, value) => setForm((prev) => ({ ...prev, items: prev.items.map((l, i) => (i === index ? { ...l, [key]: value } : l)) }))
  const addLine = () => setForm((prev) => ({ ...prev, items: [...prev.items, { ...emptyLine }] }))
  const removeLine = (index) => setForm((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }))

  const handleSave = async () => {
    if (!form.supplierId || !form.locationId || form.items.length === 0) { alert('Supplier, location and at least one line are required'); return }
    const lines = form.items.map((l) => ({
      ...(l.lineType === 'ITEM' ? { itemId: l.itemId } : { productId: l.productId }),
      quantity: parseInt(l.quantity) || 0,
      unitCost: parseFloat(l.unitCost) || 0,
      notes: l.notes || null
    }))
    if (lines.some((l) => !l.productId && !l.itemId)) { alert('Every line needs a product or an item'); return }
    try { await api.post('/api/purchases', { ...form, items: lines }); setShowModal(false); fetch(1) }
    catch (e) { alert(e.message) }
  }

  const cols = [
    { key: 'purchaseNumber', label: 'PO #', width: '90px' },
    { key: 'supplier', label: 'Supplier', render: (s) => s?.name || '-' },
    { key: 'location', label: 'Location', render: (l) => l?.name || '-' },
    { key: 'status', label: 'Status', width: '100px', render: (s) => <span style={{ padding: '0.15rem 0.5rem', borderRadius: 10, fontSize: '0.65rem', fontWeight: 600, background: s === 'RECEIVED' ? '#E8F5E9' : '#FFF3E0', color: s === 'RECEIVED' ? '#2E7D32' : '#E65100' }}>{s}</span> },
    { key: 'total', label: 'Total (Br)', width: '110px', render: (t) => `Br ${Number(t).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
    { key: '_count', label: 'Items', width: '60px', align: 'center', render: (c) => c?.items || 0 },
  ]

  return (
    <div>
      <div className="page-toolbar"><button className="btn-primary" onClick={() => setShowModal(true)}>+ New Purchase</button></div>
      <DataTable columns={cols} data={purchases} loading={loading} emptyMessage="No purchases found" />
      <Pagination page={pg.page} totalPages={pg.totalPages} total={pg.total} onPageChange={fetch} />
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Create Purchase Order" size="lg">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-grid">
            <div className="form-field"><label>Supplier *</label><select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}><option value="">Select...</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div className="form-field"><label>Location *</label><select value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}><option value="">Select...</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <strong style={{ fontSize: '0.85rem' }}>Lines</strong>
              <button type="button" className="btn-secondary" onClick={addLine}>+ Add Line</button>
            </div>
            {form.items.length === 0 && <p style={{ margin: 0, fontSize: '0.8rem', color: '#9a9a9a' }}>No lines yet — add a finished Product or an inventory Item (bottles, boxes, bags...).</p>}
            {form.items.map((line, index) => (
              <div key={index} style={{ display: 'grid', gridTemplateColumns: '90px 2fr 80px 100px 40px', gap: '0.4rem', alignItems: 'center', padding: '0.4rem', border: '1px solid #eee', borderRadius: 8, marginBottom: '0.4rem' }}>
                <select value={line.lineType} onChange={(e) => setLine(index, 'lineType', e.target.value)}>
                  <option value="PRODUCT">Product</option>
                  <option value="ITEM">Item</option>
                </select>
                {line.lineType === 'ITEM' ? (
                  <select value={line.itemId} onChange={(e) => setLine(index, 'itemId', e.target.value)}>
                    <option value="">Select item...</option>
                    {itemsCatalog.map(i => <option key={i.id} value={i.id}>{i.name} ({i.itemCode})</option>)}
                  </select>
                ) : (
                  <select value={line.productId} onChange={(e) => setLine(index, 'productId', e.target.value)}>
                    <option value="">Select product...</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                )}
                <input type="number" min="1" value={line.quantity} onChange={(e) => setLine(index, 'quantity', e.target.value)} placeholder="Qty" />
                <input type="number" min="0" step="0.01" value={line.unitCost} onChange={(e) => setLine(index, 'unitCost', e.target.value)} placeholder="Unit cost" />
                <button type="button" onClick={() => removeLine(index)} style={{ background: 'none', border: 'none', color: '#C62828', cursor: 'pointer' }}>✕</button>
              </div>
            ))}
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: '#9a9a9a' }}>Receiving an Item line increases ItemInventory at the purchase branch and records ITEM_PURCHASE movements. Receiving a Product line keeps the existing behaviour.</p>
          </div>
          <div className="form-actions"><button className="btn-cancel" onClick={() => setShowModal(false)}>Cancel</button><button className="btn-save" onClick={handleSave}>Create PO</button></div>
        </div>
      </Modal>
    </div>
  )
}

export default PurchasesPage