/**
 * Payroll page — salary payment records, payment announcements and the
 * configurable payroll rules that drive tax / pension calculations.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../services/api.js'
import DataTable from '../../components/DataTable.jsx'
import Pagination from '../../components/Pagination.jsx'
import Modal from '../../components/Modal.jsx'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { etb } from '../../lib/currency.js'
import './admin-styles.css'

const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'OTHER']
const RULE_TYPES = ['INCOME_TAX_BRACKET', 'INCOME_TAX_DEDUCTION', 'PENSION_EMPLOYEE', 'PENSION_EMPLOYER', 'OTHER_DEDUCTION']
const fmtDate = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '—')
const fmtNum = (value) => (value == null || value === '' ? '—' : etb(value))
const statusTone = (status) => ({
  PAID: { background: '#E8F5E9', color: '#2E7D32' },
  SCHEDULED: { background: '#FFF8E1', color: '#8a6d3b' },
  PARTIALLY_PAID: { background: '#E3F2FD', color: '#1565C0' },
  OVERDUE: { background: '#FFEBEE', color: '#C62828' },
  CANCELLED: { background: '#ECEFF1', color: '#546E7A' }
}[status] || { background: '#F5F5F5', color: '#555' })

function PayrollPage() {
  const { hasPermission } = useAuth()
  const canProcess = hasPermission('payroll:process')
  const canCreate = hasPermission('payroll:create')

  const [tab, setTab] = useState('all')
  const [rows, setRows] = useState([])
  const [pg, setPg] = useState({ page: 1, totalPages: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [summary, setSummary] = useState(null)
  const [alerts, setAlerts] = useState(null)
  const [rules, setRules] = useState([])
  const [config, setConfig] = useState(null)
  const [showRules, setShowRules] = useState(false)
  const [busy, setBusy] = useState(false)
  const [payModal, setPayModal] = useState(null)
  const [payForm, setPayForm] = useState({ paymentMethod: 'CASH', paymentReference: '', paidDate: '', status: 'PAID', notes: '' })
  const [ruleForm, setRuleForm] = useState({ name: '', ruleType: 'INCOME_TAX_BRACKET', rate: '', threshold: '', effectiveFrom: '', effectiveTo: '', legalReference: '' })
  const [createModal, setCreateModal] = useState(false)
  const [employees, setEmployees] = useState([])
  const [createForm, setCreateForm] = useState({ employeeId: '', scheduledDate: '', overtime: '', bonus: '', allowances: '', otherEarnings: '', otherDeductions: '', notes: '' })

  const loadList = useCallback(async (page = 1, s = search, st = status) => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ page, limit: 20 })
      if (s) p.set('search', s)
      if (st) p.set('status', st)
      const res = await api.get(`/api/payroll?${p}`)
      setRows(res.data); setPg(res.pagination)
    } catch (e) { alert(e.message) }
    setLoading(false)
  }, [search, status])

  const loadAlerts = useCallback(async () => {
    try {
      const res = await api.get('/api/dashboard/payroll-alerts')
      setAlerts(res.data)
    } catch { setAlerts(null) }
  }, [])

  const loadRules = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([api.get('/api/payroll/rules?includeInactive=true'), api.get('/api/payroll/config')])
      setRules(r.data || []); setConfig(c.data)
    } catch { setRules([]) }
  }, [])

  useEffect(() => { loadList(1, search, status) }, [loadList, search, status]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    api.get('/api/dashboard/payroll-summary').then((r) => setSummary(r.data)).catch(() => setSummary(null))
    loadAlerts(); loadRules()
  }, [loadAlerts, loadRules])

  const openPay = (payment) => {
    setPayModal(payment)
    setPayForm({ paymentMethod: payment.paymentMethod || 'CASH', paymentReference: payment.paymentReference || '', paidDate: fmtDate(new Date()), status: 'PAID', notes: payment.notes || '' })
  }

  const confirmPaid = async () => {
    if (!payModal) return
    setBusy(true)
    try {
      await api.put(`/api/payroll/${payModal.id}/pay`, payForm)
      setPayModal(null); await loadList(pg.page); loadAlerts()
    } catch (e) { alert(e.message) }
    setBusy(false)
  }

  const cancelPayment = async (payment) => {
    if (!confirm('Cancel this salary payment?')) return
    setBusy(true)
    try { await api.put(`/api/payroll/${payment.id}/cancel`, {}); await loadList(pg.page) } catch (e) { alert(e.message) }
    setBusy(false)
  }

  const openCreate = async () => {
    setCreateModal(true)
    if (!employees.length) {
      try { const res = await api.get('/api/employees?limit=100'); setEmployees(res.data || []) } catch { setEmployees([]) }
    }
  }

  const createPayment = async () => {
    if (!createForm.employeeId) { alert('Select an employee'); return }
    setBusy(true)
    try {
      const payload = { employeeId: createForm.employeeId }
      for (const [key, value] of Object.entries(createForm)) {
        if (key !== 'employeeId' && value !== '' && value != null) payload[key] = value
      }
      await api.post('/api/payroll', payload)
      setCreateModal(false)
      setCreateForm({ employeeId: '', scheduledDate: '', overtime: '', bonus: '', allowances: '', otherEarnings: '', otherDeductions: '', notes: '' })
      await loadList(1); loadAlerts()
    } catch (e) { alert(e.message) }
    setBusy(false)
  }

  const createRule = async () => {
    if (!ruleForm.name || ruleForm.rate === '') { alert('Rule name and rate are required'); return }
    setBusy(true)
    try {
      await api.post('/api/payroll/rules', ruleForm)
      setRuleForm({ name: '', ruleType: 'INCOME_TAX_BRACKET', rate: '', threshold: '', effectiveFrom: '', effectiveTo: '', legalReference: '' })
      await loadRules()
    } catch (e) { alert(e.message) }
    setBusy(false)
  }

  const disableRule = async (rule) => {
    if (!confirm(`Deactivate payroll rule "${rule.name}"? Historical payroll keeps the rule that applied to it.`)) return
    try { await api.delete(`/api/payroll/rules/${rule.id}`); await loadRules() } catch (e) { alert(e.message) }
  }

  const cols = [
    { key: 'employee', label: 'Employee', render: (e, r) => <Link to={`/admin/employees/${r.employeeId}`} style={{ color: '#8a6d3b', fontWeight: 600 }}>{e?.firstName} {e?.lastName}</Link> },
    { key: 'employeeCode', label: 'Code', width: '90px', render: (_, r) => r.employee?.employeeCode || '—' },
    { key: 'payrollPeriod', label: 'Period', width: '100px' },
    { key: 'grossSalary', label: 'Gross', align: 'right', render: (v) => fmtNum(v) },
    { key: 'incomeTax', label: 'Tax', align: 'right', render: (v) => fmtNum(v) },
    { key: 'employeePension', label: 'Pension (EE)', align: 'right', render: (v) => fmtNum(v) },
    { key: 'employerPension', label: 'Pension (ER)', align: 'right', render: (v) => fmtNum(v) },
    { key: 'netSalary', label: 'Net', align: 'right', render: (v) => <strong>{fmtNum(v)}</strong> },
    { key: 'scheduledDate', label: 'Scheduled', width: '110px', render: (v) => fmtDate(v) },
    { key: 'paidDate', label: 'Paid', width: '110px', render: (v) => fmtDate(v) },
    { key: 'status', label: 'Status', width: '120px', render: (s) => <span style={{ padding: '0.15rem 0.5rem', borderRadius: 10, fontSize: '0.65rem', fontWeight: 600, ...statusTone(s) }}>{s}</span> },
    {
      key: 'actions', label: '', width: '150px', align: 'center', render: (_, row) => (
        <div className="action-buttons">
          {canProcess && !['PAID', 'CANCELLED'].includes(row.status) && <button className="btn-edit" disabled={busy} onClick={() => openPay(row)}>Pay this payment</button>}
          {canProcess && !['PAID', 'CANCELLED'].includes(row.status) && <button className="btn-danger-outline" disabled={busy} onClick={() => cancelPayment(row)}>Cancel</button>}
          {['PAID', 'CANCELLED'].includes(row.status) && <span className="empty-text">—</span>}
        </div>
      )
    }
  ]

  const alertRows = (key) => (alerts?.alerts?.[key]?.employees || [])

  return (
    <div className="dashboard-container">
      <div className="page-header-row">
        <div>
          <h2 className="page-title">Payroll</h2>
          <p className="page-subtitle">
            Salary payments, payment announcements and configurable payroll rules
            {config?.source === 'UNCONFIGURED' ? ' — deductions not configured; enter approved amounts or configure verified rules' : ''}
          </p>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={() => setShowRules(true)}>Payroll rules</button>
          {canCreate && <button className="btn btn-primary" disabled={busy} onClick={openCreate}>Record payment</button>}
        </div>
      </div>

      {summary && (
        <div className="card-grid">
          <div className="stat-card"><div><span className="stat-value">{fmtNum(summary.monthlyPayroll)}</span><span className="stat-title">Total Monthly Salary</span></div></div>
          <div className="stat-card"><div><span className="stat-value">{fmtNum(summary.dueToday)}</span><span className="stat-title">Salary Due Today ({summary.dueTodayCount})</span></div></div>
          <div className="stat-card"><div><span className="stat-value">{fmtNum(summary.dueThisWeek)}</span><span className="stat-title">Due This Week ({summary.dueThisWeekCount})</span></div></div>
          <div className="stat-card tone-danger"><div><span className="stat-value">{fmtNum(summary.overdue)}</span><span className="stat-title">Overdue Salary ({summary.overdueCount})</span></div></div>
          <div className="stat-card"><div><span className="stat-value">{fmtNum(summary.paidThisMonth)}</span><span className="stat-title">Paid This Month ({summary.paidThisMonthCount})</span></div></div>
          <div className="stat-card tone-warning"><div><span className="stat-value">{summary.pendingPayments}</span><span className="stat-title">Pending Salary Payments</span></div></div>
        </div>
      )}
      <div className="card">
        <h3 className="card-title">Salary Payment Alerts</h3>
        <div className="dashboard-row">
          <div className="card">
            <h4 className="alert-title">Due Today ({alerts?.alerts?.TODAY?.count || 0}) · {fmtNum(alerts?.alerts?.TODAY?.total)}</h4>
            {alertRows('TODAY').length === 0 ? <p className="empty-text">None</p> : (
              <ul className="alert-list">{alertRows('TODAY').slice(0, 5).map((e) => <li key={e.employeeId}>{e.name} — {fmtNum(e.amount)}</li>)}</ul>
            )}
          </div>
          <div className="card">
            <h4 className="alert-title">Tomorrow ({alerts?.alerts?.TOMORROW?.count || 0}) · {fmtNum(alerts?.alerts?.TOMORROW?.total)}</h4>
            {alertRows('TOMORROW').length === 0 ? <p className="empty-text">None</p> : (
              <ul className="alert-list">{alertRows('TOMORROW').slice(0, 5).map((e) => <li key={e.employeeId}>{e.name} — {fmtNum(e.amount)}</li>)}</ul>
            )}
          </div>
          <div className="card">
            <h4 className="alert-title">Upcoming this week ({alerts?.alerts?.UPCOMING?.count || 0}) · {fmtNum(alerts?.alerts?.UPCOMING?.total)}</h4>
            {alertRows('UPCOMING').length === 0 ? <p className="empty-text">None</p> : (
              <ul className="alert-list">{alertRows('UPCOMING').slice(0, 5).map((e) => <li key={e.employeeId}>{e.name} — {fmtDate(e.scheduledDate)} · {fmtNum(e.amount)}</li>)}</ul>
            )}
          </div>
          <div className="card">
            <h4 className="alert-title">Overdue ({alerts?.alerts?.OVERDUE?.count || 0}) · {fmtNum(alerts?.alerts?.OVERDUE?.total)}</h4>
            {alertRows('OVERDUE').length === 0 ? <p className="empty-text">None</p> : (
              <ul className="alert-list">{alertRows('OVERDUE').slice(0, 5).map((e) => <li key={`${e.employeeId}-${e.scheduledDate}`}>{e.name} — {fmtDate(e.scheduledDate)} ({e.daysOverdue}d)</li>)}</ul>
            )}
          </div>
        </div>
        <div className="mini-stats" style={{ marginTop: '0.75rem' }}>
          <div><span className="mini-label">Paid (records)</span><strong>{alerts?.alerts?.PAID?.count || 0}</strong></div>
          <div><span className="mini-label">Employees without salary</span><strong>{alerts?.employeeAlerts?.employeesWithoutSalary?.count ?? 0}</strong></div>
          <div><span className="mini-label">TIN missing</span><strong>{alerts?.employeeAlerts?.employeesWithoutTin?.count ?? 0}</strong></div>
          <div><span className="mini-label">Pension ID missing</span><strong>{alerts?.employeeAlerts?.employeesWithoutPensionId?.count ?? 0}</strong></div>
        </div>
        <p className="page-subtitle">A payment is only reported as PAID from its confirmed payment record — a due date arriving never marks a payment as paid. Amounts come from the recorded net salary, or the employee salary when no record exists yet.</p>
      </div>

      <div className="page-toolbar">
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {['all', 'upcoming', 'overdue'].map((t) => (
            <button key={t} className={`btn ${tab === t ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab(t)}>{t === 'all' ? 'All payments' : t === 'upcoming' ? 'Upcoming' : 'Overdue'}</button>
          ))}
        </div>
        <input type="text" placeholder="Search employee..." value={search} onChange={(e) => setSearch(e.target.value)} className="search-input" />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {['SCHEDULED', 'PAID', 'PARTIALLY_PAID', 'CANCELLED'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <DataTable columns={cols} data={rows} loading={loading} emptyMessage="No salary payment records found." />
      </div>
      <Pagination {...pg} onPageChange={(page) => loadList(page)} />

      <Modal isOpen={!!payModal} onClose={() => !busy && setPayModal(null)} title="Confirm salary payment">
        <form onSubmit={(e) => { e.preventDefault(); confirmPaid() }}>
          <p>Confirm an actual payment of {fmtNum(payModal?.netSalary)}. The scheduled date alone does not confirm payment.</p>
          <div className="form-group"><label>Payment method</label><select required value={payForm.paymentMethod} onChange={(e) => setPayForm({ ...payForm, paymentMethod: e.target.value })}>{PAYMENT_METHODS.map((method) => <option key={method}>{method}</option>)}</select></div>
          <div className="form-group"><label>Payment reference</label><input value={payForm.paymentReference} onChange={(e) => setPayForm({ ...payForm, paymentReference: e.target.value })} /></div>
          <div className="form-group"><label>Paid date</label><input type="date" required value={payForm.paidDate} onChange={(e) => setPayForm({ ...payForm, paidDate: e.target.value })} /></div>
          <div className="form-group"><label>Notes</label><textarea value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} /></div>
          <button className="btn btn-primary" disabled={busy || !canProcess} type="submit">{busy ? 'Saving…' : 'Pay this payment'}</button>
        </form>
      </Modal>

      <Modal isOpen={createModal} onClose={() => !busy && setCreateModal(false)} title="Record scheduled salary payment" size="lg">
        <form onSubmit={(e) => { e.preventDefault(); createPayment() }}>
          <p>Base salary comes from the salary history applicable on the scheduled date. Tax and pension use configured rules only; employer pension does not reduce net salary.</p>
          <div className="form-group"><label>Employee</label><select required value={createForm.employeeId} onChange={(e) => setCreateForm({ ...createForm, employeeId: e.target.value })}><option value="">Select employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employeeCode} — {employee.firstName} {employee.lastName}</option>)}</select></div>
          <div className="form-group"><label>Scheduled date</label><input type="date" value={createForm.scheduledDate} onChange={(e) => setCreateForm({ ...createForm, scheduledDate: e.target.value })} /></div>
          <div className="form-grid">{[['overtime', 'Overtime'], ['bonus', 'Bonus'], ['allowances', 'Allowances'], ['otherEarnings', 'Other earnings'], ['otherDeductions', 'Other deductions']].map(([key, label]) => <div className="form-group" key={key}><label>{label}</label><input type="number" min="0" step="0.01" value={createForm[key]} onChange={(e) => setCreateForm({ ...createForm, [key]: e.target.value })} /></div>)}</div>
          <div className="form-group"><label>Notes</label><textarea value={createForm.notes} onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })} /></div>
          <button type="submit" className="btn btn-primary" disabled={busy || !canCreate}>{busy ? 'Saving…' : 'Create scheduled payment'}</button>
        </form>
      </Modal>

      <Modal isOpen={showRules} onClose={() => setShowRules(false)} title="Payroll rules" size="xl">
        <p>Configure only rates approved by your payroll administrator, with effective dates and a legal reference. No unverified statutory rate is assumed.</p>
        <p>{config?.note}</p>
        <div style={{ overflowX: 'auto' }}><DataTable data={rules} columns={[
          { key: 'name', label: 'Rule' }, { key: 'ruleType', label: 'Type' },
          { key: 'rate', label: 'Rate' }, { key: 'threshold', label: 'Threshold' },
          { key: 'effectiveFrom', label: 'From', render: fmtDate },
          { key: 'effectiveTo', label: 'Until', render: fmtDate },
          { key: 'legalReference', label: 'Legal reference' },
          { key: 'isActive', label: 'Active', render: (value) => value ? 'Yes' : 'No' },
          { key: 'actions', label: '', render: (_, rule) => canProcess && rule.isActive && <button className="btn-danger-outline" onClick={() => disableRule(rule)}>Deactivate</button> }
        ]} /></div>
        {canProcess && <form onSubmit={(e) => { e.preventDefault(); createRule() }}>
          <h3>Add rule</h3>
          <div className="form-group"><label>Rule type</label><select value={ruleForm.ruleType} onChange={(e) => setRuleForm({ ...ruleForm, ruleType: e.target.value })}>{RULE_TYPES.map((type) => <option key={type}>{type}</option>)}</select></div>
          <div className="form-grid">{[['name', 'Rule name', 'text'], ['rate', 'Rate', 'number'], ['threshold', 'Threshold', 'number'], ['effectiveFrom', 'Effective from', 'date'], ['effectiveTo', 'Effective until', 'date'], ['legalReference', 'Legal reference', 'text']].map(([key, label, type]) => <div className="form-group" key={key}><label>{label}</label><input type={type} step={type === 'number' ? 'any' : undefined} required={['name', 'rate', 'effectiveFrom', 'legalReference'].includes(key)} value={ruleForm[key]} onChange={(e) => setRuleForm({ ...ruleForm, [key]: e.target.value })} /></div>)}</div>
          <button type="submit" className="btn btn-primary" disabled={busy}>Add configured rule</button>
        </form>}
      </Modal>
    </div>
  )
}

export default PayrollPage
