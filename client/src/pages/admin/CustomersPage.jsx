/**
 * Customers Management Page
 */
import { useEffect, useState, useCallback } from 'react'
import api from '../../services/api.js'
import DataTable from '../../components/DataTable.jsx'
import Pagination from '../../components/Pagination.jsx'
import Modal from '../../components/Modal.jsx'
import TinVerifier from '../../components/TinVerifier.jsx'
import { useImportExport } from '../../hooks/useImportExport.js'
import './admin-styles.css'

function CustomersPage() {
  const [customers, setCustomers] = useState([])
  const [pg, setPg] = useState({ page: 1, totalPages: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', email: '', tinNumber: '', phone: '', address: '', city: '', country: '' })
  const [tinVerifiedInfo, setTinVerifiedInfo] = useState(null) // { tin, name } from eTrade
  const imp = useImportExport('customers', { onImported: () => fetch(pg.page, search) })

  const fetch = useCallback(async (page = 1, s = '') => {
    setLoading(true)
    try { const p = new URLSearchParams({ page, limit: 20 }); if (s) p.set('search', s); const res = await api.get(`/api/customers?${p}`); setCustomers(res.data); setPg(res.pagination) }
    catch (e) { alert(e.message) }
    setLoading(false)
  }, [])

  useEffect(() => { fetch(1, search) }, [fetch, search])

  const openCreate = () => { setEditing(null); setForm({ name: '', email: '', tinNumber: '', phone: '', address: '', city: '', country: '' }); setTinVerifiedInfo(null); setShowModal(true) }
  const openEdit = (c) => {
    setEditing(c)
    setForm({ name: c.name, email: c.email, tinNumber: c.tinNumber || '', phone: c.phone || '', address: c.address || '', city: c.city || '', country: c.country || '' })
    setTinVerifiedInfo(c.tinVerified && c.tinNumber ? { tin: c.tinNumber, name: c.name } : null)
    setShowModal(true)
  }

  // eTrade verification inside the customer form
  const handleFormTinResult = (result) => {
    if (result && result.verified) {
      setForm((current) => ({ ...current, tinNumber: result.tin, name: result.name || current.name }))
      setTinVerifiedInfo({ tin: result.tin, name: result.name })
    } else if (result && result.message) {
      setTinVerifiedInfo(null)
      alert(result.message)
    } else {
      setTinVerifiedInfo(null)
    }
  }

  const handleSave = async () => {
    if (!form.name || !form.email) { alert('Name and email required'); return }
    try { if (editing) await api.put(`/api/customers/${editing.id}`, form); else await api.post('/api/customers', form); setShowModal(false); setTinVerifiedInfo(null); fetch(pg.page, search) }
    catch (e) { alert(e.message) }
  }

  const handleDelete = async (id) => { if (!confirm('Delete?')) return; try { await api.delete(`/api/customers/${id}`); fetch(pg.page, search) } catch (e) { alert(e.message) } }

  const cols = [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'tinNumber', label: 'TIN' },
    { key: 'tinVerified', label: 'TIN Status', width: '110px', align: 'center', render: (_, row) => row?.tinVerified
      ? <span style={{ color: '#2E7D32', fontWeight: 600 }} title={row.tinVerifiedAt ? `Verified ${new Date(row.tinVerifiedAt).toLocaleString()} via eTrade` : 'Verified via eTrade'}>✓ Verified</span>
      : <span style={{ color: '#9a9a9a' }}>—</span> },
    { key: 'phone', label: 'Phone' },
    { key: 'city', label: 'City' },
    { key: 'country', label: 'Country' },
    { key: '_count', label: 'Orders', width: '80px', align: 'center', render: (c) => c?.orders || 0 },
    { key: 'actions', label: '', width: '140px', align: 'center', render: (_, row) => (
      <div className="action-buttons">
        <button className="btn-edit" onClick={() => openEdit(row)}>Edit</button>
        <button className="btn-danger-outline" onClick={() => handleDelete(row.id)}>Del</button>
      </div>
    )}
  ]

  return (
    <div>
      <div className="page-toolbar">
        <input type="text" placeholder="Search customers..." value={search} onChange={(e) => setSearch(e.target.value)} className="search-input" />
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={() => imp.downloadExport('xlsx')}>Export Excel</button>
          <button className="btn btn-secondary" onClick={imp.openImportModal}>Import Excel</button>
          <button className="btn-primary" onClick={openCreate}>+ Add Customer</button>
        </div>
      </div>
      <DataTable columns={cols} data={customers} loading={loading} emptyMessage="No customers found" />
      <Pagination page={pg.page} totalPages={pg.totalPages} total={pg.total} onPageChange={(p) => fetch(p, search)} />
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Customer' : 'Create Customer'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-grid">
            <div className="form-field"><label>Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="form-field"><label>Email *</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="form-field"><label>TIN Number</label><input value={form.tinNumber} onChange={(e) => setForm({ ...form, tinNumber: e.target.value })} /></div>
            <div className="form-field full-width" style={{ paddingTop: '0.25rem' }}>
              <TinVerifier tin={form.tinNumber} onResult={handleFormTinResult} customerId={editing?.id} autoVerify={false} />
              {tinVerifiedInfo && <div style={{ marginTop: '0.35rem', fontSize: '0.78rem', color: '#2E7D32' }}>✓ TIN Verified — {tinVerifiedInfo.name}</div>}
            </div>
            <div className="form-field"><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="form-field"><label>City</label><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
            <div className="form-field"><label>Country</label><input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
            <div className="form-field full-width"><label>Address</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          </div>
          <div className="form-actions"><button className="btn-cancel" onClick={() => setShowModal(false)}>Cancel</button><button className="btn-save" onClick={handleSave}>{editing ? 'Update' : 'Create'}</button></div>
        </div>
      </Modal>
      <Modal isOpen={imp.showImportModal} onClose={imp.closeImportModal} title="Import Customers (Excel / CSV)" size="lg">
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
            <textarea rows={6} onChange={(e) => imp.handleCsvPaste(e.target.value)} placeholder="name,email,phone,customer_type,status,source,city,country,address" />
          </label>
          <p className="page-subtitle">Required: name · Optional: email, phone, customer_type, status, source, city, country, address</p>
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

export default CustomersPage