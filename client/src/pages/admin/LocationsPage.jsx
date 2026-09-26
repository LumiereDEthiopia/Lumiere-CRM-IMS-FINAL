/**
 * Locations Management Page
 */
import { useEffect, useState } from 'react'
import api from '../../services/api.js'
import DataTable from '../../components/DataTable.jsx'
import Modal from '../../components/Modal.jsx'
import './admin-styles.css'

function LocationsPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name: '', code: '', description: '', address: '', phone: '' })

  const fetch = async () => { setLoading(true); try { const res = await api.get('/api/locations'); setItems(res.data) } catch (e) { alert(e.message) } setLoading(false) }
  useEffect(() => { fetch() }, [])

  const handleSave = async () => {
    if (!form.name || !form.code) { alert('Name and code required'); return }
    try { await api.post('/api/locations', form); setShowModal(false); fetch() } catch (e) { alert(e.message) }
  }

  const cols = [
    { key: 'code', label: 'Code', width: '80px' },
    { key: 'name', label: 'Name' },
    { key: 'address', label: 'Address' },
    { key: 'phone', label: 'Phone' },
    { key: 'isActive', label: 'Status', width: '80px', render: (a) => <span style={{ padding: '0.15rem 0.5rem', borderRadius: 10, fontSize: '0.65rem', fontWeight: 600, background: a ? '#E8F5E9' : '#FFEBEE', color: a ? '#2E7D32' : '#C62828' }}>{a ? 'Active' : 'Off'}</span> },
  ]

  return (
    <div>
      <div className="page-toolbar"><button className="btn-primary" onClick={() => { setForm({ name: '', code: '', description: '', address: '', phone: '' }); setShowModal(true) }}>+ Add Location</button></div>
      <DataTable columns={cols} data={items} loading={loading} emptyMessage="No locations found" />
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Create Location">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-grid">
            <div className="form-field"><label>Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="form-field"><label>Code *</label><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div className="form-field"><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="form-field full-width"><label>Address</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div className="form-field full-width"><label>Description</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <div className="form-actions"><button className="btn-cancel" onClick={() => setShowModal(false)}>Cancel</button><button className="btn-save" onClick={handleSave}>Create</button></div>
        </div>
      </Modal>
    </div>
  )
}

export default LocationsPage