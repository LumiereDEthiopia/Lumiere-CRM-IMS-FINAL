/**
 * Products Management Page
 */
import { useEffect, useState, useCallback } from 'react'
import api from '../../services/api.js'
import DataTable from '../../components/DataTable.jsx'
import Pagination from '../../components/Pagination.jsx'
import Modal from '../../components/Modal.jsx'
import ProductForm from './ProductForm.jsx'
import { useImportExport } from '../../hooks/useImportExport.js'
import { sizeStockSummary } from '../../lib/sizeStock.js'
import { etb } from '../../lib/currency.js'
import './admin-styles.css'

// Product section header — the 3 core categories of a fragrance/perfumery shop
const SECTIONS = [
  { key: 'ALL', title: 'All Products', sub: 'Complete catalog' },
  { key: 'PURE_OIL', title: 'Pure Oil', sub: 'Sold by gram' },
  { key: 'OIL', title: 'Oil', sub: 'Sold by gram' },
  { key: 'PERFUME', title: 'Perfume', sub: '50ml & 100ml bottles' },
]

const imgCol = { key: 'images', label: '', width: '50px', render: (imgs) => (
  <div style={{ width: 36, height: 36, borderRadius: 4, overflow: 'hidden', background: '#f5f5f7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>
    {imgs?.[0]?.imageUrl ? <img src={imgs[0].imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🧴'}
  </div>
)}
const actCol = { key: 'actions', label: '', width: '100px', align: 'center', render: (_, row) => (
  <div className="action-buttons">
    <button className="btn-edit" onClick={(e) => { e.stopPropagation(); row._openEdit() }}>Edit</button>
    <button className="btn-danger-outline" onClick={(e) => { e.stopPropagation(); row._delete() }}>Del</button>
  </div>
)}

// Single bottle size under the code — perfumes sharing the same code are identified by Size (ml).
// Returns '' when the perfume is sold in both sizes ("50ml / 100ml") or when not a perfume.
const codeSize = (row) => {
  if ((row.productType || 'PERFUME') !== 'PERFUME' || !row.size) return ''
  const s = String(row.size).trim().toLowerCase()
  if (s.includes('50ml') && s.includes('100ml')) return ''
  return String(row.size).trim()
}

function ProductsPage() {
  const [products, setProducts] = useState([])
  const [pg, setPg] = useState({ page: 1, totalPages: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [section, setSection] = useState('ALL')
  const [counts, setCounts] = useState({})
  const [selectedIds, setSelectedIds] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [formData, setFormData] = useState(null)
  const imp = useImportExport('products', { onImported: () => loadProducts(1, search) })

  const loadProducts = useCallback(async (page = 1, s = '', sec = 'ALL') => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ page, limit: 20 })
      if (s) p.set('search', s)
      if (sec && sec !== 'ALL') p.set('productType', sec)
      const res = await api.get(`/api/products?${p}`)
      setProducts(res.data.map(pr => ({ ...pr, _openEdit: () => openEdit(pr), _delete: () => handleDelete(pr.id) })))
      setPg(res.pagination)
    } catch (err) { alert('Failed: ' + err.message) }
    setLoading(false)
  }, [])

  useEffect(() => { loadProducts(1, search, section) }, [loadProducts, search, section])

  // Counts per section for the header cards
  useEffect(() => {
    Promise.all(
      ['PURE_OIL', 'OIL', 'PERFUME'].map((t) =>
        api.get(`/api/products?limit=1&productType=${t}`)
          .then((r) => [t, r.pagination.total])
          .catch(() => [t, 0])
      )
    ).then((rs) => setCounts(Object.fromEntries(rs)))
  }, [showModal])

  const handleDelete = async (id) => { if (!confirm('Delete?')) return; try { await api.delete(`/api/products/${id}`); loadProducts(pg.page, search, section) } catch (e) { alert(e.message) } }
  const handleBulkDelete = async () => { if (!confirm(`Delete ${selectedIds.length}?`)) return; try { await api.delete('/api/products', { data: { ids: selectedIds } }); setSelectedIds([]); loadProducts(1, search, section) } catch (e) { alert(e.message) } }

  const openCreate = () => { setEditing(null); setFormData(null); setShowModal(true) }
  const openEdit = async (product) => {
    setLoading(true)
    try {
      const res = await api.get(`/api/products/${product.id}`); const p = res.data
      // Perfumes: show the 50ml / 100ml stock boxes. Products saved before
      // per-size stock only have a total — place it in the box matching their
      // size (the same rule the API applies) so editing cannot wipe stock.
      const isPerfumeRow = (p.productType || 'PERFUME') === 'PERFUME'
      const untracked = isPerfumeRow && Number(p.stock50ml || 0) + Number(p.stock100ml || 0) === 0
      const only100ml = /100ml/i.test(p.size || '') && !/50ml/i.test(p.size || '')
      const s50 = untracked ? (only100ml ? 0 : Number(p.stockQuantity || 0)) : Number(p.stock50ml || 0)
      const s100 = untracked ? (only100ml ? Number(p.stockQuantity || 0) : 0) : Number(p.stock100ml || 0)
      setEditing(p); setFormData({ name: p.name, slug: p.slug, description: p.description || '', shortDescription: p.shortDescription || '', brandId: p.brandId, categoryId: p.categoryId || '', gender: p.gender || '', productType: p.productType || 'PERFUME', price: String(p.price), price100ml: p.price100ml != null ? String(p.price100ml) : '', compareAtPrice: p.compareAtPrice ? String(p.compareAtPrice) : '', stockQuantity: String(p.stockQuantity), stock50ml: String(s50), stock100ml: String(s100), sku: p.sku || '', size: p.size || '', concentration: p.concentration || '', year: p.year ? String(p.year) : '', country: p.country || '', isActive: p.isActive, isFeatured: p.isFeatured, isNew: p.isNew, isLuxury: p.isLuxury }); setShowModal(true)
    } catch (e) { alert(e.message) }
    setLoading(false)
  }

  const handleSave = async (fd) => {
    if (!fd.name || !fd.slug || !fd.brandId) { alert('Name, slug, brand required'); return }
    try {
      // Perfumes: the 50ml / 100ml boxes are sent as the source of truth and the
      // total ("Stock (bottles)") is their sum. Oils keep the gram quantity.
      const isPerfumeRow = (fd.productType || 'PERFUME') === 'PERFUME'
      const s50 = parseFloat(fd.stock50ml) || 0
      const s100 = parseFloat(fd.stock100ml) || 0
      const pl = {
        ...fd,
        price: parseFloat(fd.price) || 0,
        price100ml: fd.price100ml != null && fd.price100ml !== '' ? parseFloat(fd.price100ml) : null,
        stockQuantity: isPerfumeRow ? s50 + s100 : (parseFloat(fd.stockQuantity) || 0),
        stock50ml: isPerfumeRow ? s50 : undefined,
        stock100ml: isPerfumeRow ? s100 : undefined,
        year: fd.year ? parseInt(fd.year) : null,
        compareAtPrice: fd.compareAtPrice ? parseFloat(fd.compareAtPrice) : null
      }
      if (editing) await api.put(`/api/products/${editing.id}`, pl); else await api.post('/api/products', pl)
      setShowModal(false); loadProducts(1, search, section)
    }
    catch (e) { alert(e.message) }
  }

    const cols = [imgCol, { key: 'sku', label: 'Code', width: '110px', render: (s, row) => (<span style={{ fontWeight: 500 }}>{s || '-'}{codeSize(row) && <span style={{ display: 'block', fontSize: '0.65rem', color: '#6b7280', fontWeight: 600 }}>{codeSize(row)}</span>}</span>) }, { key: 'name', label: 'Name' }, { key: 'productType', label: 'Type', render: (t, row) => (<span><span style={{ fontWeight: 600 }}>{t === 'PURE_OIL' ? 'Pure Oil' : t === 'OIL' ? 'Oil' : 'Perfume'}</span><span style={{ fontSize: '0.7rem', color: '#9a9a9a', marginLeft: 6 }}>{t === 'PERFUME' ? (row.size || '50/100ml') : 'per gram'}</span></span>) }, { key: 'brand', label: 'Brand', render: (b) => b?.name || '-' }, { key: 'category', label: 'Category', render: (c) => c?.name || '-' }, { key: 'price', label: 'Price', width: '130px', render: (p, row) => row.productType === 'PERFUME' ? (row.price100ml != null ? <span>{etb(Number(p))} <span style={{ fontSize: '0.65rem', color: '#6b7280' }}>50ml</span><br />{etb(Number(row.price100ml))} <span style={{ fontSize: '0.65rem', color: '#6b7280' }}>100ml</span></span> : <span>{etb(Number(p))} <span style={{ fontSize: '0.65rem', color: '#6b7280' }}>/bottle</span></span>) : etb(Number(p)) + ' /g' }, { key: 'stockQuantity', label: 'Stock', width: '120px', align: 'center', render: (q, row) => {
      const summary = sizeStockSummary(row)
      return (
        <span>
          <span style={{ color: Number(q) <= 10 ? '#C62828' : Number(q) <= 20 ? '#E65100' : '#2E7D32', fontWeight: 600 }}>{Number(q)}{row.productType === 'PERFUME' ? '' : ' g'}</span>
          {summary && <span style={{ display: 'block', fontSize: '0.62rem', color: '#6b7280', whiteSpace: 'nowrap' }}>{summary}</span>}
        </span>
      )
    } }, { key: 'isActive', label: 'Status', width: '80px', align: 'center', render: (a) => <span style={{ padding: '0.15rem 0.5rem', borderRadius: 10, fontSize: '0.65rem', fontWeight: 600, background: a ? '#E8F5E9' : '#FFEBEE', color: a ? '#2E7D32' : '#C62828' }}>{a ? 'Active' : 'Off'}</span> }, actCol]

  return (
    <div>
      <div className="page-toolbar">
        <input type="text" placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} className="search-input" />
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {selectedIds.length > 0 && <button className="btn-danger" onClick={handleBulkDelete}>Delete ({selectedIds.length})</button>}
          <button className="btn btn-secondary" onClick={() => imp.downloadExport('xlsx')}>Export Excel</button>
          <button className="btn btn-secondary" onClick={imp.openImportModal}>Import Excel</button>
          <button className="btn-primary" onClick={openCreate}>+ Add Product</button>
        </div>
      </div>
      <div className="section-tabs" role="tablist" aria-label="Product sections">
        {SECTIONS.map((s) => {
          const count = s.key === 'ALL' ? (counts.PURE_OIL || 0) + (counts.OIL || 0) + (counts.PERFUME || 0) : counts[s.key]
          return (
            <button key={s.key} type="button" role="tab" aria-selected={section === s.key} className={`section-tab ${section === s.key ? 'active' : ''}`} onClick={() => setSection(s.key)}>
              <div className="section-tab-head">
                <span className="section-tab-title">{s.title}</span>
                <span className="section-tab-count">{count ?? '—'}</span>
              </div>
              <span className="section-tab-sub">{s.sub}</span>
            </button>
          )
        })}
      </div>
      <DataTable columns={cols} data={products} loading={loading} selectedIds={selectedIds} onSelectAll={(c, d) => setSelectedIds(c ? d.map(p => p.id) : [])} onSelectRow={(id, c) => setSelectedIds(p => c ? [...p, id] : p.filter(i => i !== id))} emptyMessage="No products found" />
      <Pagination page={pg.page} totalPages={pg.totalPages} total={pg.total} onPageChange={(p) => loadProducts(p, search, section)} />
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Product' : 'Create Product'} size="lg">
        <ProductForm initialData={formData} productItems={editing?.productItems} onSubmit={handleSave} onCancel={() => setShowModal(false)} isEditing={!!editing} />
      </Modal>
      <Modal isOpen={imp.showImportModal} onClose={imp.closeImportModal} title="Import Products (Excel / CSV)" size="lg">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="header-actions">
            <button type="button" className="btn btn-secondary" onClick={() => imp.downloadTemplate('xlsx')}>Download Excel Template</button>
            <button type="button" className="btn btn-secondary" onClick={() => imp.downloadTemplate('csv')}>Download CSV Template</button>
          </div>
          <label className="file-label">
            Upload Excel or CSV File
            <input type="file" accept=".csv,text/csv,.xlsx,.xls" onChange={imp.handleFile} ref={imp.fileInputRef} />
          </label>
          <label>
            Or paste CSV data
            <textarea rows={6} onChange={(e) => imp.handleCsvPaste(e.target.value)} placeholder="id,name,code,brand,price,gender,category,stockStatus,description,rating,accords,fragranceProfile,dayNight,seasons,notes.top,notes.middle,notes.base" />
          </label>
          <p className="page-subtitle">
            Format: price in Birr (ETB) · multi-values separated with " | " · accords like "Floral:95 | Citrus:85" · stockStatus "In Stock" / "Out of Stock"
          </p>
          {imp.importError && <div className="error-text" role="alert">{imp.importError}</div>}
          {imp.importMessage && <div className="success-text" role="status">{imp.importMessage}</div>}
          {imp.importPreview && (
            <div className="preview-box">
              <p>Total: {imp.importPreview.totalRows} · Valid: {imp.importPreview.validCount} · Errors: {imp.importPreview.errorCount}</p>
              {!imp.importPreview.canImport && <p className="error-text">Fix all errors before importing. Partial import is not allowed.</p>}
              {imp.importPreview.errors?.length > 0 && (
                <ul className="alert-list">
                  {imp.importPreview.errors.slice(0, 20).map((err, i) => (
                    <li key={i}>Row {err.row}: {err.errors.join(', ')}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="header-actions">
            <button type="button" className="btn btn-secondary" disabled={imp.importBusy} onClick={imp.runPreview}>Validate Preview</button>
            <button type="button" className="btn btn-primary" disabled={imp.importBusy || !imp.importPreview?.canImport} onClick={imp.runImport}>Confirm Import</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default ProductsPage