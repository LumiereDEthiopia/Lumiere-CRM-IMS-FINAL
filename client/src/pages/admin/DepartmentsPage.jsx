/**
 * Departments Management Page
 */
import { useEffect, useState } from 'react'
import api from '../../services/api.js'
import DataTable from '../../components/DataTable.jsx'
import Modal from '../../components/Modal.jsx'
import './admin-styles.css'

function DepartmentsPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', code: '', description: '' })

  const fetch = async () => { setLoading(true); try { const res = await api.get('/api/departments'); setItems(res.data) } catch (e) { alert(e.message) } setLoading(false) }
  useEffect(() => { fetch() }, [])

  const openCreate = () => { setEditing(null); setForm({ name: '', code: '', description: '' }); setShowModal(true) }
  const openEdit = (d) => { setEditing(d); setForm({ name: d.name, code: d.code || '', description: d.description || '' }); setShowModal(true) }

  const handleSave = async () => {
    if (!form.name || !form.code) { alert('Name and code required'); return }
    try {
      if (editing) await api.put(`/api/departments/${editing.id}`, form)
      else await api.post('/api/departments', form)
      setShowModal(false); fetch()
    } catch (e) { alert(e.message) }
  }

  const handleDelete = async (d) => {
    if (!confirm(`Delete department "${d.name}"?`)) return
    try { await api.delete(`/api/departments/${d.id}`); fetch() } catch (e) { alert(e.message) }
  }

  const cols = [
    { key: 'code', label: 'Code', width: '80px' },
    { key: 'name', label: 'Name' },
    { key: 'description', label: 'Description' },
    { key: 'isActive', label: 'Status', width: '80px', render: (a) => <span style={{ padding: '0.15rem 0.5rem', borderRadius: 10, fontSize: '0.65rem', fontWeight: 600, background: a ? '#E8F5E9' : '#FFEBEE', color: a ? '#2E7D32' : '#C62828' }}>{a ? 'Active' : 'Off'}</span> },
    { key: 'actions', label: '', width: '100px', align: 'center', render: (_, row) => (
      <div className="action-buttons">
        <button className="btn-edit" onClick={(e) => { e.stopPropagation(); openEdit(row) }}>Edit</button>
        <button className="btn-danger-outline" onClick={(e) => { e.stopPropagation(); handleDelete(row) }}>Del</button>
      </div>
    ) },
  ]

  return (
    <div>
      <div className="page-toolbar"><button className="btn-primary" onClick={openCreate}>+ Add Department</button></div>
      <DataTable columns={cols} data={items} loading={loading} emptyMessage="No departments found" />
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Department' : 'Create Department'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-grid">
            <div className="form-field"><label>Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="form-field"><label>Code *</label><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div className="form-field full-width"><label>Description</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <div className="form-actions"><button className="btn-cancel" onClick={() => setShowModal(false)}>Cancel</button><button className="btn-save" onClick={handleSave}>{editing ? 'Update' : 'Create'}</button></div>
        </div>
      </Modal>
    </div>
  )
}

export default DepartmentsPage