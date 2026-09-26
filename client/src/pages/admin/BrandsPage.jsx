/**
 * Brands Management Page
 */
import { useEffect, useState, useCallback } from 'react'
import api from '../../services/api.js'
import DataTable from '../../components/DataTable.jsx'
import Modal from '../../components/Modal.jsx'
import './admin-styles.css'

function BrandsPage() {
  const [brands, setBrands] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', slug: '', description: '', country: '', website: '', logoUrl: '' })

  const fetch = useCallback(async (s = '') => {
    setLoading(true)
    try { const p = new URLSearchParams({ limit: 100 }); if (s) p.set('search', s); const res = await api.get(`/api/brands?${p}`); setBrands(res.data) }
    catch (e) { alert(e.message) }
    setLoading(false)
  }, [])

  useEffect(() => { fetch(search) }, [fetch, search])

  const openCreate = () => { setEditing(null); setForm({ name: '', slug: '', description: '', country: '', website: '', logoUrl: '' }); setShowModal(true) }
  const openEdit = (b) => { setEditing(b); setForm({ name: b.name, slug: b.slug, description: b.description || '', country: b.country || '', website: b.website || '', logoUrl: b.logoUrl || '' }); setShowModal(true) }

  const handleSave = async () => {
    if (!form.name || !form.slug) { alert('Name and slug required'); return }
    try { if (editing) await api.put(`/api/brands/${editing.id}`, form); else await api.post('/api/brands', form); setShowModal(false); fetch(search) }
    catch (e) { alert(e.message) }
  }

  const handleDelete = async (id) => { if (!confirm('Delete brand?')) return; try { await api.delete(`/api/brands/${id}`); fetch(search) } catch (e) { alert(e.message) } }

  const cols = [
    { key: 'name', label: 'Name' },
    { key: 'slug', label: 'Slug' },
    { key: 'country', label: 'Country' },
    { key: 'website', label: 'Website', render: (w) => w ? <a href={w} target="_blank" rel="noopener" style={{ color: '#1565C0' }}>{w}</a> : '-' },
    { key: '_count', label: 'Products', width: '90px', align: 'center', render: (c) => c?.products || 0 },
    { key: 'actions', label: '', width: '100px', align: 'center', render: (_, row) => (
      <div className="action-buttons"><button className="btn-edit" onClick={() => openEdit(row)}>Edit</button><button className="btn-danger-outline" onClick={() => handleDelete(row.id)}>Del</button></div>
    )}
  ]

  return (
    <div>
      <div className="page-toolbar">
        <input type="text" placeholder="Search brands..." value={search} onChange={(e) => setSearch(e.target.value)} className="search-input" />
        <button className="btn-primary" onClick={openCreate}>+ Add Brand</button>
      </div>
      <DataTable columns={cols} data={brands} loading={loading} emptyMessage="No brands found" />
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Brand' : 'Create Brand'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-grid">
            <div className="form-field"><label>Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="form-field"><label>Slug *</label><input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></div>
            <div className="form-field"><label>Country</label><input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
            <div className="form-field"><label>Website</label><input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://" /></div>
            <div className="form-field full-width"><label>Logo URL</label><input value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} /></div>
            <div className="form-field full-width"><label>Description</label><textarea style={{ minHeight: '60px' }} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <div className="form-actions"><button className="btn-cancel" onClick={() => setShowModal(false)}>Cancel</button><button className="btn-save" onClick={handleSave}>{editing ? 'Update' : 'Create'}</button></div>
        </div>
      </Modal>
    </div>
  )
}

export default BrandsPage