/**
 * Categories Management Page
 */
import { useEffect, useState, useCallback } from 'react'
import api from '../../services/api.js'
import DataTable from '../../components/DataTable.jsx'
import Modal from '../../components/Modal.jsx'
import './admin-styles.css'

function CategoriesPage() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', slug: '', description: '', parentId: '', imageUrl: '', sortOrder: '0' })

  const fetch = useCallback(async (s = '') => {
    setLoading(true)
    try { const p = new URLSearchParams({ flat: 'true' }); if (s) p.set('search', s); const res = await api.get(`/api/categories?${p}`); setCategories(res.data) }
    catch (e) { alert(e.message) }
    setLoading(false)
  }, [])

  useEffect(() => { fetch(search) }, [fetch, search])

  const openCreate = () => { setEditing(null); setForm({ name: '', slug: '', description: '', parentId: '', imageUrl: '', sortOrder: '0' }); setShowModal(true) }
  const openEdit = (c) => { setEditing(c); setForm({ name: c.name, slug: c.slug, description: c.description || '', parentId: c.parentId || '', imageUrl: c.imageUrl || '', sortOrder: String(c.sortOrder || 0) }); setShowModal(true) }

  const handleSave = async () => {
    if (!form.name || !form.slug) { alert('Name and slug required'); return }
    try { const payload = { ...form, sortOrder: parseInt(form.sortOrder) || 0, parentId: form.parentId || null }; if (editing) await api.put(`/api/categories/${editing.id}`, payload); else await api.post('/api/categories', payload); setShowModal(false); fetch(search) }
    catch (e) { alert(e.message) }
  }

  const handleDelete = async (id) => { if (!confirm('Delete category?')) return; try { await api.delete(`/api/categories/${id}`); fetch(search) } catch (e) { alert(e.message) } }

  const cols = [
    { key: 'name', label: 'Name' },
    { key: 'slug', label: 'Slug' },
    { key: 'parent', label: 'Parent', render: (p) => p?.name || '-' },
    { key: '_count', label: 'Products', width: '90px', align: 'center', render: (c) => c?.products || 0 },
    { key: 'isActive', label: 'Status', width: '80px', align: 'center', render: (a) => <span style={{ padding: '0.15rem 0.5rem', borderRadius: 10, fontSize: '0.65rem', fontWeight: 600, background: a ? '#E8F5E9' : '#FFEBEE', color: a ? '#2E7D32' : '#C62828' }}>{a ? 'Active' : 'Off'}</span> },
    { key: 'actions', label: '', width: '100px', align: 'center', render: (_, row) => (
      <div className="action-buttons"><button className="btn-edit" onClick={() => openEdit(row)}>Edit</button><button className="btn-danger-outline" onClick={() => handleDelete(row.id)}>Del</button></div>
    )}
  ]

  return (
    <div>
      <div className="page-toolbar">
        <input type="text" placeholder="Search categories..." value={search} onChange={(e) => setSearch(e.target.value)} className="search-input" />
        <button className="btn-primary" onClick={openCreate}>+ Add Category</button>
      </div>
      <DataTable columns={cols} data={categories} loading={loading} emptyMessage="No categories found" />
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Category' : 'Create Category'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-grid">
            <div className="form-field"><label>Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="form-field"><label>Slug *</label><input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></div>
            <div className="form-field"><label>Parent</label>
              <select value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
                <option value="">None (Top Level)</option>
                {categories.filter(c => !editing || c.id !== editing.id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-field"><label>Sort Order</label><input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></div>
            <div className="form-field full-width"><label>Image URL</label><input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} /></div>
            <div className="form-field full-width"><label>Description</label><textarea style={{ minHeight: '60px' }} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <div className="form-actions"><button className="btn-cancel" onClick={() => setShowModal(false)}>Cancel</button><button className="btn-save" onClick={handleSave}>{editing ? 'Update' : 'Create'}</button></div>
        </div>
      </Modal>
    </div>
  )
}

export default CategoriesPage