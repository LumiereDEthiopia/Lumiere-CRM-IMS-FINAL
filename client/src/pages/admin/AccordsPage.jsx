/**
 * Accords Management Page
 */
import { useEffect, useState, useCallback } from 'react'
import api from '../../services/api.js'
import DataTable from '../../components/DataTable.jsx'
import Modal from '../../components/Modal.jsx'
import './admin-styles.css'

function AccordsPage() {
  const [accords, setAccords] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', slug: '', color: '#c9a96e' })

  const fetch = useCallback(async (s = '') => {
    setLoading(true)
    try { const p = new URLSearchParams({ sortBy: 'name' }); if (s) p.set('search', s); const res = await api.get(`/api/accords?${p}`); setAccords(res.data) }
    catch (e) { alert(e.message) }
    setLoading(false)
  }, [])

  useEffect(() => { fetch(search) }, [fetch, search])

  const openCreate = () => { setEditing(null); setForm({ name: '', slug: '', color: '#c9a96e' }); setShowModal(true) }
  const openEdit = (a) => { setEditing(a); setForm({ name: a.name, slug: a.slug, color: a.color || '#c9a96e' }); setShowModal(true) }

  const handleSave = async () => {
    if (!form.name || !form.slug) { alert('Name and slug required'); return }
    try { if (editing) await api.put(`/api/accords/${editing.id}`, form); else await api.post('/api/accords', form); setShowModal(false); fetch(search) }
    catch (e) { alert(e.message) }
  }

  const handleDelete = async (id) => { if (!confirm('Delete accord?')) return; try { await api.delete(`/api/accords/${id}`); fetch(search) } catch (e) { alert(e.message) } }

  const cols = [
    { key: 'name', label: 'Name' },
    { key: 'slug', label: 'Slug' },
    { key: 'color', label: 'Color', width: '80px', render: (c) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{ width: 20, height: 20, borderRadius: 4, background: c || '#ccc', border: '1px solid #e8e8e8' }}></div>
        <span style={{ fontSize: '0.75rem', color: '#6b6b6b' }}>{c || '-'}</span>
      </div>
    )},
    { key: '_count', label: 'Used In', width: '80px', align: 'center', render: (c) => c?.productAccords || 0 },
    { key: 'isActive', label: 'Status', width: '80px', align: 'center', render: (a) => <span style={{ padding: '0.15rem 0.5rem', borderRadius: 10, fontSize: '0.65rem', fontWeight: 600, background: a ? '#E8F5E9' : '#FFEBEE', color: a ? '#2E7D32' : '#C62828' }}>{a ? 'Active' : 'Off'}</span> },
    { key: 'actions', label: '', width: '100px', align: 'center', render: (_, row) => (
      <div className="action-buttons"><button className="btn-edit" onClick={() => openEdit(row)}>Edit</button><button className="btn-danger-outline" onClick={() => handleDelete(row.id)}>Del</button></div>
    )}
  ]

  return (
    <div>
      <div className="page-toolbar">
        <input type="text" placeholder="Search accords..." value={search} onChange={(e) => setSearch(e.target.value)} className="search-input" />
        <button className="btn-primary" onClick={openCreate}>+ Add Accord</button>
      </div>
      <DataTable columns={cols} data={accords} loading={loading} emptyMessage="No accords found" />
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Accord' : 'Create Accord'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-grid">
            <div className="form-field"><label>Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="form-field"><label>Slug *</label><input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></div>
            <div className="form-field"><label>Color</label><div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}><input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} style={{ width: 40, height: 32, border: 'none', cursor: 'pointer' }} /><input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} style={{ flex: 1 }} /></div></div>
          </div>
          <div className="form-actions"><button className="btn-cancel" onClick={() => setShowModal(false)}>Cancel</button><button className="btn-save" onClick={handleSave}>{editing ? 'Update' : 'Create'}</button></div>
        </div>
      </Modal>
    </div>
  )
}

export default AccordsPage