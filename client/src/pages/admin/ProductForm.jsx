/**
 * Product Form Component
 * Used inside modal for creating/editing products
 */
import { useState, useEffect, useRef } from 'react'
import api from '../../services/api.js'
import './admin-styles.css'

function ProductForm({ initialData, onSubmit, onCancel, isEditing, productItems }) {
  const emptyForm = {
    name: '', slug: '', description: '', shortDescription: '',
    brandId: '', categoryId: '', gender: '', productType: 'PERFUME', price: '', price100ml: '', compareAtPrice: '',
    stockQuantity: '', stock50ml: '', stock100ml: '', sku: '', size: '', concentration: '',
    year: '', country: '', isActive: true, isFeatured: false,
    isNew: false, isLuxury: false
  }
  const [form, setForm] = useState(initialData || emptyForm)
  const [brands, setBrands] = useState([])
  const [categories, setCategories] = useState([])

  // "Inventory Items Used" — components consumed when this product is sold
  const [itemsUsed, setItemsUsed] = useState(
    (productItems || []).map((pi) => ({
      itemId: pi.itemId,
      name: pi.item?.name || '',
      itemCode: pi.item?.itemCode || '',
      category: pi.item?.category?.name || '',
      size: pi.item?.size || '',
      color: pi.item?.color || '',
      stock: pi.itemTotalStock ?? 0,
      quantity: Number(pi.quantity) || 1,
      isRequired: pi.isRequired !== false
    }))
  )
  const [showPicker, setShowPicker] = useState(false)
  const [itemSearch, setItemSearch] = useState('')
  const [itemResults, setItemResults] = useState([])
  const itemTimer = useRef(null)

  useEffect(() => {
    clearTimeout(itemTimer.current)
    if (!showPicker) return
    itemTimer.current = setTimeout(() => {
      const params = new URLSearchParams({ limit: 20, isActive: 'true' })
      if (itemSearch.trim()) params.set('search', itemSearch.trim())
      api.get(`/api/items?${params.toString()}`).then((r) => setItemResults(r.data || [])).catch(() => {})
    }, 300)
    return () => clearTimeout(itemTimer.current)
  }, [itemSearch, showPicker])

  const addItemUsed = (item) => {
    if (itemsUsed.some((i) => i.itemId === item.id)) return
    setItemsUsed((prev) => [...prev, {
      itemId: item.id, name: item.name, itemCode: item.itemCode, category: item.category?.name || '',
      size: item.size || '', color: item.color || '', stock: item.totalQuantity ?? 0, quantity: 1, isRequired: true
    }])
    setShowPicker(false)
    setItemSearch('')
  }
  const removeItemUsed = (itemId) => setItemsUsed((prev) => prev.filter((i) => i.itemId !== itemId))
  const setItemUsedQty = (itemId, qty) => setItemsUsed((prev) => prev.map((i) => (i.itemId === itemId ? { ...i, quantity: qty } : i)))
  const setItemUsedRequired = (itemId, required) => setItemsUsed((prev) => prev.map((i) => (i.itemId === itemId ? { ...i, isRequired: required } : i)))

  useEffect(() => {
    api.get('/api/brands?limit=100').then((r) => setBrands(r.data)).catch(() => {})
    api.get('/api/categories?flat=true').then((r) => setCategories(r.data)).catch(() => {})
  }, [])

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const isGram = form.productType === 'OIL' || form.productType === 'PURE_OIL'
  const isPerfume = form.productType === 'PERFUME'

  // Bottle size checkboxes for perfumes — none checked = sold in both sizes (picked at sale time)
  const sizeHas50 = /50ml/i.test(form.size || '')
  const sizeHas100 = /100ml/i.test(form.size || '')
  const setSize = (has50, has100) => {
    const value = has50 && has100 ? '50ml / 100ml' : has50 ? '50ml' : has100 ? '100ml' : ''
    set('size', value)
  }
  // When sold in both sizes, each bottle has its own price:
  // `price` = 50ml price, `price100ml` = 100ml price
  const bothSizes = isPerfume && sizeHas50 && sizeHas100

  // Bottle stock boxes: perfumes are stocked per size (50ml / 100ml bottles) and
  // Stock (bottles) is always their total. Oils keep a single gram quantity.
  const num = (value) => {
    const parsed = parseFloat(value)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
  }
  const totalBottles = num(form.stock50ml) + num(form.stock100ml)

  const handleSubmit = (e) => {
    e.preventDefault()
    const payload = { ...form }
    if (isPerfume) {
      payload.stock50ml = num(form.stock50ml)
      payload.stock100ml = num(form.stock100ml)
      payload.stockQuantity = totalBottles
    }
    payload.productItems = itemsUsed
      .filter((i) => i.itemId && parseFloat(i.quantity) > 0)
      .map((i) => ({ itemId: i.itemId, quantity: parseFloat(i.quantity), isRequired: i.isRequired }))
    onSubmit(payload)
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="form-grid">
        <Field label="Name *" value={form.name} onChange={(v) => set('name', v)} />
        <Field label="Slug *" value={form.slug} onChange={(v) => set('slug', v)} />
        {bothSizes ? (
          <>
            <Field label="Price 50ml (ETB) *" type="number" value={form.price} onChange={(v) => set('price', v)} placeholder="per 50ml bottle" />
            <Field label="Price 100ml (ETB) *" type="number" value={form.price100ml} onChange={(v) => set('price100ml', v)} placeholder="per 100ml bottle" />
          </>
        ) : (
          <Field label="Price (ETB) *" type="number" value={form.price} onChange={(v) => set('price', v)} placeholder={isGram ? 'per gram' : 'per bottle'} />
        )}
        <Field label="Compare Price" type="number" value={form.compareAtPrice} onChange={(v) => set('compareAtPrice', v)} />
        {isPerfume ? (
          <>
            <Field label="Stock 50ml (bottles)" type="number" value={form.stock50ml} onChange={(v) => set('stock50ml', v)} placeholder="number of 50ml bottles" />
            <Field label="Stock 100ml (bottles)" type="number" value={form.stock100ml} onChange={(v) => set('stock100ml', v)} placeholder="number of 100ml bottles" />
            <div className="form-field">
              <label>Stock (bottles) — total</label>
              <input
                value={totalBottles}
                readOnly
                disabled
                title="50ml bottles + 100ml bottles"
                style={{ background: '#f7f7f9', fontWeight: 600, color: '#1a1a2e' }}
              />
            </div>
          </>
        ) : (
          <Field label="Stock (grams)" type="number" value={form.stockQuantity} onChange={(v) => set('stockQuantity', v)} placeholder="grams in stock" />
        )}
        <Field label="SKU" value={form.sku} onChange={(v) => set('sku', v)} />
        <p className="page-subtitle full-width">Leave SKU blank to generate the configured code prefix automatically. You can also enter a custom code.</p>
        <div className="form-field">
          <label>Product Type</label>
          <select value={form.productType || 'PERFUME'} onChange={(e) => set('productType', e.target.value)}>
            <option value="PURE_OIL">Pure Oil — sold by gram</option>
            <option value="OIL">Oil — sold by gram</option>
            <option value="PERFUME">Perfume — 50ml &amp; 100ml bottles</option>
          </select>
        </div>
        {isPerfume ? (
          <div className="form-field">
            <label>Bottle Size (ml)</label>
            <div className="checkbox-group">
              <label className="checkbox-label"><input type="checkbox" checked={sizeHas50} onChange={(e) => setSize(e.target.checked, sizeHas100)} /> 50ml</label>
              <label className="checkbox-label"><input type="checkbox" checked={sizeHas100} onChange={(e) => setSize(sizeHas50, e.target.checked)} /> 100ml</label>
            </div>
          </div>
        ) : (
          <Field label={isGram ? 'Size (optional)' : 'Size'} value={form.size} onChange={(v) => set('size', v)} placeholder={isGram ? 'e.g. bulk' : 'e.g. 50ml'} />
        )}
        {isPerfume && <p className="page-subtitle full-width">Perfumes are stocked per bottle size — enter the number of 50ml and 100ml bottles you have; <strong>Stock (bottles)</strong> is their total. At the point of sale the cashier picks the bottle, and only that size (its ml) is deducted from stock.</p>}
        {isGram && <p className="page-subtitle full-width">{form.productType === 'PURE_OIL' ? 'Pure oils' : 'Oils'} are sold by gram — stock is tracked in grams and price is per gram.</p>}
        <Field label="Concentration" value={form.concentration} onChange={(v) => set('concentration', v)} placeholder="e.g. EDP" />
        <Field label="Year" type="number" value={form.year} onChange={(v) => set('year', v)} />
        <Field label="Country" value={form.country} onChange={(v) => set('country', v)} />
        <div className="form-field">
          <label>Gender</label>
          <select value={form.gender} onChange={(e) => set('gender', e.target.value)}>
            <option value="">Select...</option>
            <option value="men">Men</option>
            <option value="women">Women</option>
            <option value="unisex">Unisex</option>
            <option value="kids">Kids</option>
          </select>
        </div>
        <div className="form-field">
          <label>Brand *</label>
          <select value={form.brandId} onChange={(e) => set('brandId', e.target.value)}>
            <option value="">Select brand...</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="form-field full-width">
          <label>Category</label>
          <select value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
            <option value="">Select category...</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="form-field full-width">
          <label>Short Description</label>
          <input value={form.shortDescription} onChange={(e) => set('shortDescription', e.target.value)} />
        </div>
        <div className="form-field full-width">
          <label>Description</label>
          <textarea style={{ minHeight: '80px' }} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </div>
      </div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h4 style={{ margin: 0, fontSize: '0.8rem', textTransform: 'uppercase', color: '#8a6d3b' }}>Inventory Items Used</h4>
          <button type="button" className="btn-secondary" onClick={() => { setShowPicker(true); setItemSearch('') }}>+ Add Item</button>
        </div>
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.78rem', color: '#9a9a9a' }}>Optional — components consumed from branch stock every time this product is sold. Leave empty for finished products.</p>
        {itemsUsed.length === 0 && <p style={{ margin: 0, fontSize: '0.8rem', color: '#9a9a9a', fontStyle: 'italic' }}>No items configured — selling this product will not consume any inventory items.</p>}
        {itemsUsed.map((row) => (
          <div key={row.itemId} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', padding: '0.5rem', border: '1px solid #eee', borderRadius: 8, marginBottom: '0.4rem' }}>
            <div style={{ flex: 2, minWidth: 180 }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{row.name}</div>
              <div style={{ fontSize: '0.68rem', color: '#9a9a9a' }}>
                {row.category || '—'}{row.size ? ` · ${row.size}` : ''}{row.color ? ` · ${row.color}` : ''} · Stock: {Number(row.stock).toLocaleString()}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <label style={{ fontSize: '0.7rem', color: '#9a9a9a' }}>Uses</label>
              <input type="number" min="0.01" step="0.01" value={row.quantity} onChange={(e) => setItemUsedQty(row.itemId, e.target.value)} style={{ width: 70, padding: '0.35rem', border: '1px solid #ddd', borderRadius: 6 }} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem' }}>
              <input type="checkbox" checked={row.isRequired} onChange={(e) => setItemUsedRequired(row.itemId, e.target.checked)} /> Required
            </label>
            <button type="button" onClick={() => removeItemUsed(row.itemId)} style={{ background: 'none', border: 'none', color: '#C62828', cursor: 'pointer' }} title="Remove">🗑</button>
          </div>
        ))}
        {showPicker && (
          <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: '0.75rem', marginTop: '0.5rem', background: '#fafafa' }}>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input autoFocus value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} placeholder="Search inventory items by name, code, SKU..." style={{ flex: 1, padding: '0.45rem', border: '1px solid #ddd', borderRadius: 6 }} />
              <button type="button" className="btn-cancel" onClick={() => setShowPicker(false)}>Close</button>
            </div>
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              {itemResults.length === 0 && <p style={{ margin: 0, fontSize: '0.8rem', color: '#9a9a9a' }}>No items found{itemSearch ? '' : ' — type to search'}</p>}
              {itemResults.map((item) => (
                <button type="button" key={item.id} onClick={() => addItemUsed(item)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem', background: 'none', border: 'none', borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{item.name} <span style={{ color: '#9a9a9a', fontWeight: 400 }}>({item.itemCode})</span></div>
                  <div style={{ fontSize: '0.68rem', color: '#9a9a9a' }}>
                    {item.category?.name || '—'}{item.size ? ` · ${item.size}` : ''}{item.color ? ` · ${item.color}` : ''} · Stock: {Number(item.totalQuantity ?? 0).toLocaleString()}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="checkbox-group">
        <label className="checkbox-label"><input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} /> Active</label>
        <label className="checkbox-label"><input type="checkbox" checked={form.isFeatured} onChange={(e) => set('isFeatured', e.target.checked)} /> Featured</label>
        <label className="checkbox-label"><input type="checkbox" checked={form.isNew} onChange={(e) => set('isNew', e.target.checked)} /> New</label>
        <label className="checkbox-label"><input type="checkbox" checked={form.isLuxury} onChange={(e) => set('isLuxury', e.target.checked)} /> Luxury</label>
      </div>
      <div className="form-actions">
        <button type="button" className="btn-cancel" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-save">{isEditing ? 'Update Product' : 'Create Product'}</button>
      </div>
    </form>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <div className="form-field">
      <label>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}

export default ProductForm