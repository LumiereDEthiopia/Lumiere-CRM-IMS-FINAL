/**
 * Employee Details page — information, identification, salary, payment history.
 * Sensitive fields are only shown when the user holds employee:view_sensitive,
 * and the backend enforces the same rule.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../../services/api.js'
import Modal from '../../components/Modal.jsx'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { etb } from '../../lib/currency.js'
import './admin-styles.css'

const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'OTHER']
const fmtDate = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '—')
const fmtNum = (value, fallback = '—') => (value == null || value === '' ? fallback : etb(value))
const statusTone = (status) => ({
  PAID: { background: '#E8F5E9', color: '#2E7D32' },
  SCHEDULED: { background: '#FFF8E1', color: '#8a6d3b' },
  PARTIALLY_PAID: { background: '#E3F2FD', color: '#1565C0' },
  OVERDUE: { background: '#FFEBEE', color: '#C62828' },
  CANCELLED: { background: '#ECEFF1', color: '#546E7A' }
}[status] || { background: '#F5F5F5', color: '#555' })

function Field({ label, value }) {
  return <div><span className="mini-label">{label}</span><strong>{value ?? '—'}</strong></div>
}

function EmployeeDetailPage() {
  const { id } = useParams()
  const { hasPermission } = useAuth()
  const canViewSensitive = hasPermission('employee:view_sensitive')
  const canProcess = hasPermission('payroll:process')
  const canCreatePayroll = hasPermission('payroll:create')

  const [employee, setEmployee] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [payModal, setPayModal] = useState(null)
  const [payForm, setPayForm] = useState({ paymentMethod: 'CASH', paymentReference: '', paidDate: '', status: 'PAID', notes: '' })
  const [recordForm, setRecordForm] = useState({ scheduledDate: '', overtime: '', bonus: '', allowances: '', otherEarnings: '', otherDeductions: '', paymentMethod: 'CASH', paymentReference: '', notes: '' })
  const [showRecord, setShowRecord] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await api.get(`/api/employees/${id}`)
      setEmployee(res.data)
    } catch (e) { setError(e.message) }
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const payroll = employee?.payroll
  const salary = payroll || {}
  const payments = payroll?.payments || employee?.salaryPayments || []

  const openPay = (payment) => {
    setPayModal(payment)
    setPayForm({ paymentMethod: payment.paymentMethod || 'CASH', paymentReference: payment.paymentReference || '', paidDate: fmtDate(new Date()), status: 'PAID', notes: payment.notes || '' })
  }

  const confirmPaid = async () => {
    if (!payModal) return
    setBusy(true)
    try {
      await api.put(`/api/payroll/${payModal.id}/pay`, payForm)
      setPayModal(null); await load()
    } catch (e) { alert(e.message) }
    setBusy(false)
  }

  const recordPayment = async () => {
    setBusy(true)
    try {
      const payload = { employeeId: id }
      for (const [key, value] of Object.entries(recordForm)) {
        if (value !== '' && value != null) payload[key] = value
      }
      await api.post('/api/payroll', payload)
      setShowRecord(false); await load()
    } catch (e) { alert(e.message) }
    setBusy(false)
  }

  const cancelPayment = async (payment) => {
    if (!confirm('Cancel this salary payment?')) return
    setBusy(true)
    try { await api.put(`/api/payroll/${payment.id}/cancel`, {}); await load() } catch (e) { alert(e.message) }
    setBusy(false)
  }

  if (loading) return <div className="loading-container"><div className="spinner" /><span>Loading employee...</span></div>
  if (error) return <div className="error-text" role="alert">{error}</div>
  if (!employee) return <div className="empty-text">Employee not found.</div>

  return (
    <div className="dashboard-container">
      <div className="page-header-row">
        <div>
          <h2 className="page-title">{employee.firstName} {employee.lastName}</h2>
          <p className="page-subtitle">{employee.employeeCode} · {employee.jobTitle || 'No job title'} · {employee.department?.name || 'No department'}</p>
        </div>
        <div className="header-actions">
          <Link to="/admin/employees" className="btn btn-secondary">Back to list</Link>
          {canCreatePayroll && <button className="btn btn-primary" disabled={busy} onClick={() => setShowRecord(true)}>Record salary payment</button>}
        </div>
      </div>

      <div className="dashboard-row">
        <div className="card">
          <h3 className="card-title">Employee Information</h3>
          <div className="mini-stats">
            <Field label="Employee Code" value={employee.employeeCode} />
            <Field label="Full Name" value={`${employee.firstName} ${employee.lastName}`} />
            <Field label="Job Title" value={employee.jobTitle} />
            <Field label="Department" value={employee.department?.name} />
            <Field label="Location" value={employee.location?.name} />
            <Field label="Employment Status" value={employee.employmentStatus} />
            <Field label="Employment Type" value={employee.employmentType} />
            <Field label="Hire Date" value={fmtDate(employee.hireDate)} />
          </div>
        </div>

        <div className="card">
          <h3 className="card-title">Contact</h3>
          <div className="mini-stats">
            <Field label="Phone" value={employee.phone} />
            <Field label="Email" value={employee.email} />
            <Field label="Address" value={employee.address} />
          </div>
          <h3 className="card-title" style={{ marginTop: '1rem' }}>Identification</h3>
          {canViewSensitive ? (
            <div className="mini-stats">
              <Field label="TIN Number" value={employee.tinNumber} />
              <Field label="Pension ID Number" value={employee.pensionIdNumber} />
            </div>
          ) : (
            <p className="page-subtitle">TIN and Pension ID require the <code>employee:view_sensitive</code> permission.</p>
          )}
        </div>
      </div>

      <div className="dashboard-row">
        <div className="card">
          <h3 className="card-title">Salary</h3>
          {canViewSensitive ? (
            <>
              <div className="mini-stats">
                <Field label="Current Salary" value={fmtNum(salary.salary)} />
                <Field label="Currency" value={salary.currency || 'ETB'} />
                <Field label="Payment Frequency" value={salary.paymentFrequency} />
                <Field label="Payment Day" value={salary.paymentDay ?? 'Last day of month'} />
                <Field label="Salary Start Date" value={fmtDate(salary.salaryStartDate)} />
                <Field label="Next Payment Date" value={fmtDate(salary.nextPaymentDate)} />
              </div>
              {salary.salaryNotes && <p className="page-subtitle">{salary.salaryNotes}</p>}
            </>
          ) : (
            <p className="page-subtitle">Salary information requires the <code>employee:view_sensitive</code> permission.</p>
          )}
        </div>

        <div className="card">
          <h3 className="card-title">Payment</h3>
          {canViewSensitive ? (
            <div className="mini-stats">
              <Field label="Last Salary Payment" value={salary.lastPayment ? `${fmtDate(salary.lastPayment.paidDate || salary.lastPayment.scheduledDate)} · ${fmtNum(salary.lastPayment.netSalary)}` : 'None recorded'} />
              <Field label="Next Salary Payment" value={fmtDate(salary.nextPaymentDate)} />
              <Field label="Payment Status" value={salary.paymentStatus || 'No payments recorded'} />
            </div>
          ) : (
            <p className="page-subtitle">Payment figures require the <code>employee:view_sensitive</code> permission.</p>
          )}
        </div>
      </div>
      {canViewSensitive && (
        <div className="card">
          <h3 className="card-title">Salary History</h3>
          <p className="page-subtitle">Previous salaries are preserved — historical payroll uses the salary that applied at the time.</p>
          <div className="table-wrapper">
            {(salary.history || employee.salaryHistory || []).length === 0 ? <p className="empty-text">No salary history yet.</p> : (
              <table className="table">
                <thead>
                  <tr>
                    <th className="th">Salary</th>
                    <th className="th">Currency</th>
                    <th className="th">Effective From</th>
                    <th className="th">Effective To</th>
                    <th className="th">Reason</th>
                    <th className="th">Recorded By</th>
                  </tr>
                </thead>
                <tbody>
                  {(salary.history || employee.salaryHistory || []).map((row) => (
                    <tr key={row.id} className="tr">
                      <td className="td">{etb(row.salary)}</td>
                      <td className="td">{row.currency}</td>
                      <td className="td">{fmtDate(row.effectiveFrom)}</td>
                      <td className="td">{row.effectiveTo ? fmtDate(row.effectiveTo) : 'Current'}</td>
                      <td className="td">{row.reason || '—'}</td>
                      <td className="td">{row.createdBy?.name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {canViewSensitive && (
        <div className="card">
          <h3 className="card-title">Payment History</h3>
          <div className="table-wrapper">
            {payments.length === 0 ? <p className="empty-text">No salary payments recorded yet.</p> : (
              <table className="table">
                <thead>
                  <tr>
                    <th className="th">Period</th>
                    <th className="th">Gross</th>
                    <th className="th">Tax</th>
                    <th className="th">Pension (Employee)</th>
                    <th className="th">Pension (Employer)</th>
                    <th className="th">Deductions</th>
                    <th className="th">Net</th>
                    <th className="th">Payment Date</th>
                    <th className="th">Status</th>
                    <th className="th">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => {
                    const tone = statusTone(p.status)
                    return (
                      <tr key={p.id} className="tr">
                        <td className="td">{p.payrollPeriod}</td>
                        <td className="td">{fmtNum(p.grossSalary)}</td>
                        <td className="td">{fmtNum(p.incomeTax)}</td>
                        <td className="td">{fmtNum(p.employeePension)}</td>
                        <td className="td">{fmtNum(p.employerPension)}</td>
                        <td className="td">{fmtNum(p.otherDeductions)}</td>
                        <td className="td" style={{ fontWeight: 600 }}>{fmtNum(p.netSalary)}</td>
                        <td className="td">{fmtDate(p.paidDate || p.scheduledDate)}</td>
                        <td className="td"><span style={{ padding: '0.15rem 0.5rem', borderRadius: 10, fontSize: '0.65rem', fontWeight: 600, ...tone }}>{p.status}</span></td>
                        <td className="td">
                          <div className="action-buttons">
                            {canProcess && !['PAID', 'CANCELLED'].includes(p.status) && <button className="btn-edit" disabled={busy} onClick={() => openPay(p)}>Mark paid</button>}
                            {canProcess && !['PAID', 'CANCELLED'].includes(p.status) && <button className="btn-danger-outline" disabled={busy} onClick={() => cancelPayment(p)}>Cancel</button>}
                            {['PAID', 'CANCELLED'].includes(p.status) && <span className="empty-text">—</span>}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="card-title">Documents &amp; Notes</h3>
        {(employee.documents || []).length === 0 && !employee.notes ? <p className="empty-text">No documents on file.</p> : (
          <div className="mini-stats">
            {(employee.documents || []).map((doc) => (
              <Field key={doc.id} label={doc.documentType} value={doc.fileUrl ? <a href={doc.fileUrl} target="_blank" rel="noreferrer">{doc.name}</a> : doc.name} />
            ))}
            {employee.notes && <Field label="Notes" value={employee.notes} />}
          </div>
        )}
      </div>

      <Modal isOpen={!!payModal} onClose={() => setPayModal(null)} title="Confirm salary payment">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p className="page-subtitle">Period {payModal?.payrollPeriod} · Net {fmtNum(payModal?.netSalary)}. Confirming records who processed the payment.</p>
          <div className="form-grid">
            <div className="form-field"><label>Paid Date</label><input type="date" value={payForm.paidDate} onChange={(e) => setPayForm({ ...payForm, paidDate: e.target.value })} /></div>
            <div className="form-field"><label>Payment Method</label>
              <select value={payForm.paymentMethod} onChange={(e) => setPayForm({ ...payForm, paymentMethod: e.target.value })}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div className="form-field"><label>Payment Reference</label><input value={payForm.paymentReference} onChange={(e) => setPayForm({ ...payForm, paymentReference: e.target.value })} placeholder="Bank / mobile reference" /></div>
            <div className="form-field"><label>Status</label>
              <select value={payForm.status} onChange={(e) => setPayForm({ ...payForm, status: e.target.value })}>
                <option value="PAID">Paid</option>
                <option value="PARTIALLY_PAID">Partially paid</option>
              </select>
            </div>
            <div className="form-field full-width"><label>Notes</label><input value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} /></div>
          </div>
          <div className="form-actions"><button className="btn-cancel" onClick={() => setPayModal(null)}>Cancel</button><button className="btn-save" disabled={busy} onClick={confirmPaid}>Confirm payment</button></div>
        </div>
      </Modal>

      <Modal isOpen={showRecord} onClose={() => setShowRecord(false)} title="Record salary payment">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p className="page-subtitle">Leave amounts blank to calculate them from the employee salary and the configured payroll rules. Records start as SCHEDULED until an authorised user confirms payment.</p>
          <div className="form-grid">
            <div className="form-field"><label>Scheduled Date</label><input type="date" value={recordForm.scheduledDate} onChange={(e) => setRecordForm({ ...recordForm, scheduledDate: e.target.value })} /></div>
            <div className="form-field"><label>Overtime</label><input type="number" min="0" value={recordForm.overtime} onChange={(e) => setRecordForm({ ...recordForm, overtime: e.target.value })} /></div>
            <div className="form-field"><label>Bonus</label><input type="number" min="0" value={recordForm.bonus} onChange={(e) => setRecordForm({ ...recordForm, bonus: e.target.value })} /></div>
            <div className="form-field"><label>Allowances</label><input type="number" min="0" value={recordForm.allowances} onChange={(e) => setRecordForm({ ...recordForm, allowances: e.target.value })} /></div>
            <div className="form-field"><label>Other Earnings</label><input type="number" min="0" value={recordForm.otherEarnings} onChange={(e) => setRecordForm({ ...recordForm, otherEarnings: e.target.value })} /></div>
            <div className="form-field"><label>Other Deductions</label><input type="number" min="0" value={recordForm.otherDeductions} onChange={(e) => setRecordForm({ ...recordForm, otherDeductions: e.target.value })} /></div>
            <div className="form-field"><label>Payment Method</label>
              <select value={recordForm.paymentMethod} onChange={(e) => setRecordForm({ ...recordForm, paymentMethod: e.target.value })}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div className="form-field"><label>Payment Reference</label><input value={recordForm.paymentReference} onChange={(e) => setRecordForm({ ...recordForm, paymentReference: e.target.value })} /></div>
            <div className="form-field full-width"><label>Notes</label><input value={recordForm.notes} onChange={(e) => setRecordForm({ ...recordForm, notes: e.target.value })} /></div>
          </div>
          <div className="form-actions"><button className="btn-cancel" onClick={() => setShowRecord(false)}>Cancel</button><button className="btn-save" disabled={busy} onClick={recordPayment}>Create payment</button></div>
        </div>
      </Modal>
    </div>
  )
}

export default EmployeeDetailPage
