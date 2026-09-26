/**
 * Employees Management Page
 */
import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import api from '../../services/api.js'
import DataTable from '../../components/DataTable.jsx'
import Pagination from '../../components/Pagination.jsx'
import Modal from '../../components/Modal.jsx'
import { useImportExport } from '../../hooks/useImportExport.js'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { etb } from '../../lib/currency.js'
import './admin-styles.css'

const roleLabel = (name) => String(name || '').toLowerCase().split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

const PAYMENT_FREQUENCIES = ['MONTHLY', 'WEEKLY', 'BIWEEKLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL']

const emptyForm = () => ({
  firstName: '', lastName: '', email: '', phone: '', jobTitle: '', departmentId: '',
  employmentType: 'FULL_TIME', accountRole: '', accountEmail: '', accountPassword: '',
  idFrontUrl: '', idBackUrl: '', pdfDocumentUrl: '',
  salary: '', salaryCurrency: 'ETB', salaryPaymentFrequency: 'MONTHLY', salaryPaymentDay: '',
  salaryStartDate: '', salaryNotes: '', salaryChangeReason: '',
  tinNumber: '', pensionIdNumber: ''
})

const fmtDate = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '-')

function EmployeesPage() {
  const [employees, setEmployees] = useState([])
  const [pg, setPg] = useState({ page: 1, totalPages: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [departments, setDepartments] = useState([])
  const [roles, setRoles] = useState([])
  const [form, setForm] = useState(emptyForm())
  const imp = useImportExport('employees', { onImported: () => fetch(1, search) })
  const { hasPermission } = useAuth()
  const canViewSensitive = hasPermission('employee:view_sensitive')

  const fetch = useCallback(async (page = 1, s = '') => {
    setLoading(true)
    try { const p = new URLSearchParams({ page, limit: 20 }); if (s) p.set('search', s); const res = await api.get(`/api/employees?${p}`); setEmployees(res.data); setPg(res.pagination) }
    catch (e) { alert(e.message) }
    setLoading(false)
  }, [])

  useEffect(() => { fetch(1, search); api.get('/api/departments').then(r => setDepartments(r.data)).catch(() => {}); api.get('/api/roles').then(r => setRoles(r.data || [])).catch(() => {}) }, [fetch, search])

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setShowModal(true) }
  const openEdit = async (emp) => {
    setLoading(true)
    try {
      const res = await api.get(`/api/employees/${emp.id}`)
      const d = res.data
      setEditing(d)
      setForm({
        ...emptyForm(),
        firstName: d.firstName, lastName: d.lastName, email: d.email || '', phone: d.phone || '',
        jobTitle: d.jobTitle || '', departmentId: d.departmentId || '', employmentType: d.employmentType,
        accountRole: d.user?.role?.name || '', accountEmail: d.user?.email || '', accountPassword: '',
        idFrontUrl: d.idFrontUrl || '', idBackUrl: d.idBackUrl || '', pdfDocumentUrl: d.pdfDocumentUrl || '',
        salary: d.salary == null ? '' : String(d.salary),
        salaryCurrency: d.salaryCurrency || 'ETB',
        salaryPaymentFrequency: d.paymentFrequency || d.salaryPaymentFrequency || 'MONTHLY',
        salaryPaymentDay: d.salaryPaymentDay == null ? '' : String(d.salaryPaymentDay),
        salaryStartDate: d.salaryStartDate ? fmtDate(d.salaryStartDate) : '',
        salaryNotes: d.salaryNotes || '',
        tinNumber: d.tinNumber || '',
        pensionIdNumber: d.pensionIdNumber || ''
      })
      setShowModal(true)
    }
    catch (e) { alert(e.message) }
    setLoading(false)
  }

  const handleSave = async () => {
    if (!form.firstName || !form.lastName) { alert('First and last name required'); return }
    try {
      const payload = { ...form }
      delete payload.idFrontFile; delete payload.idBackFile; delete payload.pdfFile
      // Users without employee:view_sensitive must not be able to change (or wipe)
      // salary / TIN / pension data — those fields are simply not submitted.
      if (!canViewSensitive) {
        for (const f of ['salary', 'salaryCurrency', 'salaryPaymentFrequency', 'salaryPaymentDay', 'salaryStartDate', 'salaryNotes', 'tinNumber', 'pensionIdNumber']) delete payload[f]
      }
      if (payload.salary === '') delete payload.salary
      if (payload.salaryPaymentDay === '') payload.salaryPaymentDay = null
      if (!payload.salaryStartDate) delete payload.salaryStartDate
      const response = editing ? await api.put(`/api/employees/${editing.id}`, payload) : await api.post('/api/employees', payload)
      const employeeId = response.data.id
      for (const [file, documentType] of [[form.idFrontFile, 'ID_FRONT'], [form.idBackFile, 'ID_BACK'], [form.pdfFile, 'EMPLOYEE_PDF']]) {
        if (!file) continue
        const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file) })
        await api.post(`/api/employees/${employeeId}/documents`, { name: file.name, documentType, dataUrl })
      }
      setShowModal(false); fetch(1, search)
    }
    catch (e) { alert(e.message) }
  }

  const handleDeactivate = async (id) => { if (!confirm('Deactivate?')) return; try { await api.delete(`/api/employees/${id}`); fetch(pg.page, search) } catch (e) { alert(e.message) } }

  const cols = [
    { key: 'employeeCode', label: 'Code', width: '90px' },
    { key: 'firstName', label: 'Employee', render: (_, r) => <Link to={`/admin/employees/${r.id}`} style={{ color: '#8a6d3b', fontWeight: 600 }}>{r.firstName} {r.lastName}</Link> },
    { key: 'department', label: 'Department', render: (d) => d?.name || '-' },
    { key: 'jobTitle', label: 'Job Title' },
    { key: 'employmentStatus', label: 'Status', width: '100px', render: (s) => <span style={{ padding: '0.15rem 0.5rem', borderRadius: 10, fontSize: '0.65rem', fontWeight: 600, background: s === 'ACTIVE' ? '#E8F5E9' : '#FFEBEE', color: s === 'ACTIVE' ? '#2E7D32' : '#C62828' }}>{s}</span> },
    canViewSensitive
      ? { key: 'salary', label: 'Salary', align: 'right', render: (s, r) => (s == null ? <span className="empty-text">Not set</span> : etb(s)) }
      : { key: 'hasSalary', label: 'Salary', align: 'center', render: (has) => (has ? 'Set' : 'Missing') },
    canViewSensitive
      ? { key: 'salaryPaymentDay', label: 'Payment Day', align: 'center', render: (d) => d ?? '-' }
      : { key: 'paymentFrequency', label: 'Frequency', align: 'center', render: (f) => f || '-' },
    { key: 'nextPaymentDate', label: 'Next Payment', width: '120px', render: (d) => fmtDate(d) },
    { key: 'tinStatus', label: 'TIN', width: '80px', align: 'center', render: (_, r) => (r.tinNumber || r.hasTin ? '✓' : '—') },
    { key: 'pensionStatus', label: 'Pension ID', width: '100px', align: 'center', render: (_, r) => (r.pensionIdNumber || r.hasPensionId ? '✓' : '—') },
    { key: 'actions', label: '', width: '150px', align: 'center', render: (_, row) => (<div className="action-buttons"><Link className="btn-edit" to={`/admin/employees/${row.id}`}>View</Link><button className="btn-edit" onClick={() => openEdit(row)}>Edit</button><button className="btn-danger-outline" onClick={() => handleDeactivate(row.id)}>Del</button></div>) }
  ]

  return (
    <div>
      <div className="page-toolbar">
        <input type="text" placeholder="Search employees..." value={search} onChange={(e) => setSearch(e.target.value)} className="search-input" />
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={() => imp.downloadExport('xlsx')}>Export Excel</button>
          <button className="btn btn-secondary" onClick={imp.openImportModal}>Import Excel</button>
          <button className="btn-primary" onClick={openCreate}>+ Add Employee</button>
        </div>
      </div>
      <DataTable columns={cols} data={employees} loading={loading} emptyMessage="No employees found" />
      <Pagination page={pg.page} totalPages={pg.totalPages} total={pg.total} onPageChange={(p) => fetch(p, search)} />
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Employee' : 'Create Employee'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-grid">
            <div className="form-field"><label>First Name *</label><input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
            <div className="form-field"><label>Last Name *</label><input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
            <div className="form-field"><label>Email</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="form-field"><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="form-field"><label>Job Title</label><input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} /></div>
            <div className="form-field"><label>Department</label><select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}><option value="">Select...</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
            <div className="form-field"><label>Account Role</label><select value={form.accountRole} onChange={(e) => setForm({ ...form, accountRole: e.target.value })}><option value="">No account</option>{roles.map((r) => <option key={r.name} value={r.name}>{roleLabel(r.name)}</option>)}</select></div>
            <div className="form-field"><label>Account Email</label><input type="email" value={form.accountEmail} onChange={(e) => setForm({ ...form, accountEmail: e.target.value })} /></div>
            <div className="form-field"><label>Account Password</label><input type="password" value={form.accountPassword} onChange={(e) => setForm({ ...form, accountPassword: e.target.value })} placeholder={editing ? 'Leave blank to keep current' : ''} /></div>
            <div className="form-field"><label>ID Front Image URL</label><input value={form.idFrontUrl} onChange={(e) => setForm({ ...form, idFrontUrl: e.target.value })} /></div>
            <div className="form-field"><label>ID Back Image URL</label><input value={form.idBackUrl} onChange={(e) => setForm({ ...form, idBackUrl: e.target.value })} /></div>
            <div className="form-field full-width"><label>PDF Document URL</label><input value={form.pdfDocumentUrl} onChange={(e) => setForm({ ...form, pdfDocumentUrl: e.target.value })} /></div>
            <div className="form-field"><label>ID Front Image</label><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setForm({ ...form, idFrontFile: e.target.files?.[0] })} /></div>
            <div className="form-field"><label>ID Back Image</label><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setForm({ ...form, idBackFile: e.target.files?.[0] })} /></div>
            <div className="form-field full-width"><label>PDF Document</label><input type="file" accept="application/pdf" onChange={(e) => setForm({ ...form, pdfFile: e.target.files?.[0] })} /></div>
          </div>

          {canViewSensitive ? (
            <>
              <h4 className="alert-title" style={{ marginTop: '0.5rem' }}>Salary &amp; Payment</h4>
              <div className="form-grid">
                <div className="form-field"><label>Salary</label><input type="number" min="0" step="0.01" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} placeholder="15000" /></div>
                <div className="form-field"><label>Currency</label>
                  <select value={form.salaryCurrency} onChange={(e) => setForm({ ...form, salaryCurrency: e.target.value })}>
                    <option value="ETB">ETB</option><option value="USD">USD</option><option value="EUR">EUR</option>
                  </select>
                </div>
                <div className="form-field"><label>Payment Frequency</label>
                  <select value={form.salaryPaymentFrequency} onChange={(e) => setForm({ ...form, salaryPaymentFrequency: e.target.value })}>
                    {PAYMENT_FREQUENCIES.map((f) => <option key={f} value={f}>{roleLabel(f)}</option>)}
                  </select>
                </div>
                <div className="form-field"><label>Payment Day (1-31)</label><input type="number" min="1" max="31" value={form.salaryPaymentDay} onChange={(e) => setForm({ ...form, salaryPaymentDay: e.target.value })} placeholder="30" /></div>
                <div className="form-field"><label>Salary Start Date</label><input type="date" value={form.salaryStartDate} onChange={(e) => setForm({ ...form, salaryStartDate: e.target.value })} /></div>
                {editing && <div className="form-field"><label>Change Reason</label><input value={form.salaryChangeReason} onChange={(e) => setForm({ ...form, salaryChangeReason: e.target.value })} placeholder="Promotion / annual review" /></div>}
                <div className="form-field full-width"><label>Salary Notes</label><input value={form.salaryNotes} onChange={(e) => setForm({ ...form, salaryNotes: e.target.value })} /></div>
              </div>
              <p className="page-subtitle">A salary change adds a new salary-history entry — previous salaries are never overwritten. Month-end payment days (30/31) are always adjusted to a valid calendar date.</p>

              <h4 className="alert-title" style={{ marginTop: '0.5rem' }}>Identification</h4>
              <div className="form-grid">
                <div className="form-field"><label>TIN Number</label><input value={form.tinNumber} onChange={(e) => setForm({ ...form, tinNumber: e.target.value })} placeholder="Optional" /></div>
                <div className="form-field"><label>Pension ID Number</label><input value={form.pensionIdNumber} onChange={(e) => setForm({ ...form, pensionIdNumber: e.target.value })} placeholder="Optional" /></div>
              </div>
            </>
          ) : (
            <p className="page-subtitle">Salary, TIN and Pension ID require the <code>employee:view_sensitive</code> permission.</p>
          )}
          <div className="form-actions"><button className="btn-cancel" onClick={() => setShowModal(false)}>Cancel</button><button className="btn-save" onClick={handleSave}>{editing ? 'Update' : 'Create'}</button></div>
        </div>
      </Modal>
      <Modal isOpen={imp.showImportModal} onClose={imp.closeImportModal} title="Import Employees (Excel / CSV)" size="lg">
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
            <textarea rows={6} onChange={(e) => imp.handleCsvPaste(e.target.value)} placeholder="first_name,last_name,email,phone,job_title,department,location,employment_type,employment_status" />
          </label>
          <p className="page-subtitle">Required: first_name, last_name · Optional: email, phone, job_title, department, location, employment_type, employment_status</p>
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

export default EmployeesPage