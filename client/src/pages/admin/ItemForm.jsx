/**
 * Item Form — create/edit bottles, packaging and any business consumable.
 * Used inside a modal on the Items page. On create, optional per-branch
 * initial stock can be provided (INITIAL_STOCK movements are created by the API).
 */
import { useEffect, useState } from 'react'
import api from '../../services/api.js'
import './admin-styles.css'

const emptyForm = {
  name: '', itemCode: '', categoryId: '', description: '', brandName: '', sku: '', barcode: '',
  size: '', volume: '', volumeUnit: 'ml', unit: 'pcs', color: '', material: '', shape: '', neckSize: '',
  dimensions: '', packageType: '', supplierId: '', costPrice: '', minimumStock: '', reorderQuantity: '',
  notes: '', isActive: true
}

function ItemForm({ initialData, onSubmit, onCancel, isEditing }) {
  const [form, setForm] = useState(initialData ? { ...emptyForm, ...initialData } : emptyForm)
  const [categories, setCategories] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [locations, setLocations] = useState([])
  const [initialStock, setInitialStock] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/api/item-categories').then((r) => setCategories(r.data || [])).catch(() => {})
    api.get('/api/suppliers?limit=100').then((r) => setSuppliers(r.data || [])).catch(() => {})
    api.get('/api/locations').then((r) => setLocations(r.data || [])).catch(() => {})
  }, [])

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const addStockRow = () => setInitialStock((prev) => [...prev, { locationId: '', quantity: '' }])
  const setStockRow = (index, key, value) => setInitialStock((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)))
  const removeStockRow = (index) => setInitialStock((prev) => prev.filter((_, i) => i !== index))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!String(form.name).trim()) { alert('Item name is required'); return }
    if (!isEditing && !String(form.itemCode).trim()) { alert('Item code is required'); return }
    if (!form.categoryId) { alert('Category is required'); return }
    setSaving(true)
    try {
      const payload = {
        ...form,
        volume: form.volume === '' ? null : parseFloat(form.volume),
        costPrice: parseFloat(form.costPrice) || 0,
        minimumStock: parseFloat(form.minimumStock) || 0,
        reorderQuantity: parseFloat(form.reorderQuantity) || 0,
        supplierId: form.supplierId || null
      }
      if (!isEditing) {
        payload.initialStock = initialStock
          .filter((row) => row.locationId && parseFloat(row.quantity) > 0)
          .map((row) => ({ locationId: row.locationId, quantity: parseFloat(row.quantity) }))
      } else {
        delete payload.itemCode
      }
      await onSubmit(payload)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', textTransform: 'uppercase', color: '#8a6d3b' }}>Basic Information</h4>
        <div className="form-grid">
          <Field label="Item Name *" value={form.name} onChange={(v) => set('name', v)} placeholder="e.g. 100ml Square Glass Bottle" />
          <Field label="Item Code *" value={form.itemCode} onChange={(v) => set('itemCode', v)} placeholder="unique, e.g. BOT-100-SQ" disabled={isEditing} />
          <div className="form-field">
            <label>Category *</label>
            <select value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">Select category...</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <Field label="Brand" value={form.brandName} onChange={(v) => set('brandName', v)} placeholder="optional" />
          <Field label="SKU" value={form.sku} onChange={(v) => set('sku', v)} />
          <Field label="Barcode" value={form.barcode} onChange={(v) => set('barcode', v)} />
        </div>
      </div>

      <div>
        <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', textTransform: 'uppercase', color: '#8a6d3b' }}>Physical Information</h4>
        <div className="form-grid">
          <Field label="Size" value={form.size} onChange={(v) => set('size', v)} placeholder="e.g. 100ml" />
          <Field label="Volume" type="number" value={form.volume} onChange={(v) => set('volume', v)} placeholder="e.g. 100" />
          <Field label="Volume Unit" value={form.volumeUnit} onChange={(v) => set('volumeUnit', v)} placeholder="ml / g" />
          <Field label="Stock Unit" value={form.unit} onChange={(v) => set('unit', v)} placeholder="pcs" />
          <Field label="Color" value={form.color} onChange={(v) => set('color', v)} placeholder="e.g. Black" />
          <Field label="Material" value={form.material} onChange={(v) => set('material', v)} placeholder="e.g. Glass" />
          <Field label="Shape" value={form.shape} onChange={(v) => set('shape', v)} placeholder="bottles, e.g. Square" />
          <Field label="Neck Size" value={form.neckSize} onChange={(v) => set('neckSize', v)} placeholder="optional" />
          <Field label="Package Type" value={form.packageType} onChange={(v) => set('packageType', v)} placeholder="e.g. BOX / BAG" />
          <Field label="Dimensions" value={form.dimensions} onChange={(v) => set('dimensions', v)} placeholder="e.g. 40 x 40 x 120 mm" />
        </div>
      </div>

      <div>
        <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', textTransform: 'uppercase', color: '#8a6d3b' }}>Inventory &amp; Supplier</h4>
        <div className="form-grid">
          <Field label="Cost Price (Br)" type="number" value={form.costPrice} onChange={(v) => set('costPrice', v)} />
          <Field label="Minimum Stock" type="number" value={form.minimumStock} onChange={(v) => set('minimumStock', v)} />
          <Field label="Reorder Quantity" type="number" value={form.reorderQuantity} onChange={(v) => set('reorderQuantity', v)} />
          <div className="form-field">
            <label>Supplier</label>
            <select value={form.supplierId || ''} onChange={(e) => set('supplierId', e.target.value)}>
              <option value="">Select supplier...</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-field full-width">
            <label>Image URL</label>
            <input value={form.imageUrl || ''} onChange={(e) => set('imageUrl', e.target.value)} placeholder="https://..." />
          </div>
          <div className="form-field full-width">
            <label>Notes</label>
            <textarea style={{ minHeight: '60px' }} value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </div>
      </div>

      {!isEditing && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h4 style={{ margin: 0, fontSize: '0.8rem', textTransform: 'uppercase', color: '#8a6d3b' }}>Initial Stock (optional, per branch)</h4>
            <button type="button" className="btn-secondary" onClick={addStockRow}>+ Add Branch</button>
          </div>
          {initialStock.length === 0 && <p style={{ margin: 0, fontSize: '0.8rem', color: '#9a9a9a' }}>No initial stock yet — add per-branch quantities. Every quantity creates an INITIAL_STOCK movement.</p>}
          {initialStock.map((row, index) => (
            <div key={index} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
              <select value={row.locationId} onChange={(e) => setStockRow(index, 'locationId', e.target.value)} style={{ flex: 2, padding: '0.5rem', border: '1px solid #ddd', borderRadius: 6 }}>
                <option value="">Select branch...</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <input type="number" min="0" value={row.quantity} onChange={(e) => setStockRow(index, 'quantity', e.target.value)} placeholder="Qty" style={{ flex: 1, padding: '0.5rem', border: '1px solid #ddd', borderRadius: 6 }} />
              <button type="button" onClick={() => removeStockRow(index)} style={{ background: 'none', border: 'none', color: '#C62828', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="checkbox-group">
        <label className="checkbox-label"><input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} /> Active</label>
      </div>
      <div className="form-actions">
        <button type="button" className="btn-cancel" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-save" disabled={saving}>{isEditing ? 'Update Item' : 'Create Item'}</button>
      </div>
    </form>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder, disabled }) {
  return (
    <div className="form-field">
      <label>{label}</label>
      <input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} />
    </div>
  )
}

export default ItemForm
