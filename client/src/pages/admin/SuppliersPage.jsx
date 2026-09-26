/**
 * Suppliers Management Page
 */
import { useEffect, useState, useCallback } from 'react'
import api from '../../services/api.js'
import DataTable from '../../components/DataTable.jsx'
import Pagination from '../../components/Pagination.jsx'
import Modal from '../../components/Modal.jsx'
import { useImportExport } from '../../hooks/useImportExport.js'
import './admin-styles.css'

function SuppliersPage() {
  const [items, setItems] = useState([])
  const [pg, setPg] = useState({ page: 1, totalPages: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name: '', contactPerson: '', email: '', phone: '', address: '', city: '', country: '' })
  const imp = useImportExport('suppliers', { onImported: () => fetch(1, search) })

  const fetch = useCallback(async (page = 1, s = '') => {
    setLoading(true)
    try { const p = new URLSearchParams({ page, limit: 20 }); if (s) p.set('search', s); const res = await api.get(`/api/suppliers?${p}`); setItems(res.data); setPg(res.pagination) }
    catch (e) { alert(e.message) }
    setLoading(false)
  }, [])

  useEffect(() => { fetch(1, search) }, [fetch, search])

  const handleSave = async () => {
    if (!form.name) { alert('Name required'); return }
    try { await api.post('/api/suppliers', form); setShowModal(false); fetch(1, search) } catch (e) { alert(e.message) }
  }

  const cols = [
    { key: 'name', label: 'Name' },
    { key: 'contactPerson', label: 'Contact' },
    { key: 'phone', label: 'Phone' },
    { key: 'email', label: 'Email' },
    { key: 'city', label: 'City' },
    { key: 'isActive', label: 'Status', width: '80px', render: (a) => <span style={{ padding: '0.15rem 0.5rem', borderRadius: 10, fontSize: '0.65rem', fontWeight: 600, background: a ? '#E8F5E9' : '#FFEBEE', color: a ? '#2E7D32' : '#C62828' }}>{a ? 'Active' : 'Off'}</span> },
  ]

  return (
    <div>
      <div className="page-toolbar">
        <input type="text" placeholder="Search suppliers..." value={search} onChange={(e) => setSearch(e.target.value)} className="search-input" />
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={() => imp.downloadExport('xlsx')}>Export Excel</button>
          <button className="btn btn-secondary" onClick={imp.openImportModal}>Import Excel</button>
          <button className="btn-primary" onClick={() => { setForm({ name: '', contactPerson: '', email: '', phone: '', address: '', city: '', country: '' }); setShowModal(true) }}>+ Add Supplier</button>
        </div>
      </div>
      <DataTable columns={cols} data={items} loading={loading} emptyMessage="No suppliers found" />
      <Pagination page={pg.page} totalPages={pg.totalPages} total={pg.total} onPageChange={(p) => fetch(p, search)} />
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Create Supplier">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-grid">
            <div className="form-field"><label>Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="form-field"><label>Contact Person</label><input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} /></div>
            <div className="form-field"><label>Email</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="form-field"><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="form-field"><label>City</label><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
            <div className="form-field"><label>Country</label><input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
            <div className="form-field full-width"><label>Address</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          </div>
          <div className="form-actions"><button className="btn-cancel" onClick={() => setShowModal(false)}>Cancel</button><button className="btn-save" onClick={handleSave}>Create</button></div>
        </div>
      </Modal>
      <Modal isOpen={imp.showImportModal} onClose={imp.closeImportModal} title="Import Suppliers (Excel / CSV)" size="lg">
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
            <textarea rows={6} onChange={(e) => imp.handleCsvPaste(e.target.value)} placeholder="name,contact_person,email,phone,city,country,address" />
          </label>
          <p className="page-subtitle">Required: name · Optional: contact_person, email, phone, city, country, address</p>
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

export default SuppliersPage