/**
 * Employee Analytics Page
 */
import { useEffect, useState } from 'react'
import api from '../../services/api.js'
import { etb } from '../../lib/currency.js'
import './admin-styles.css'

function EmployeeAnalyticsPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/api/employees/analytics')
      .then((r) => { setData(r.data); setLoading(false) })
      .catch((e) => { setError(e.message); setLoading(false) })
  }, [])

  if (loading) return <div className="loading-container"><div className="spinner" /><span>Loading analytics...</span></div>
  if (error) return <div className="error-text" role="alert">{error}</div>
  if (!data) return <div className="empty-text">No analytics available.</div>

  return (
    <div className="dashboard-container">
      <h2 className="page-title">Employee Analytics</h2>
      <p className="page-subtitle">Workforce overview (salary data requires employee:view_sensitive)</p>

      <div className="card-grid">
        <Stat title="Total" value={data.overview?.total} />
        <Stat title="Active" value={data.overview?.active} />
        <Stat title="Inactive" value={data.overview?.inactive} />
        <Stat title="Terminated" value={data.overview?.terminated} />
      </div>

      <div className="dashboard-row">
        <Panel title="By Department" items={data.byDepartment} labelKey="name" />
        <Panel title="By Location" items={data.byLocation} labelKey="name" />
        <Panel title="By Employment Type" items={data.byEmploymentType} labelKey="type" />
        <Panel title="By Status" items={data.byStatus} labelKey="status" />
      </div>

      {data.sensitive && (
        <div className="card">
          <h3 className="card-title">Sensitive Summary</h3>
          <div className="mini-stats">
            <div><span className="mini-label">Avg Salary</span><strong>{etb(data.sensitive.averageSalary)}</strong></div>
            <div><span className="mini-label">Total Salary</span><strong>{etb(data.sensitive.totalSalary)}</strong></div>
            <div><span className="mini-label">With Salary</span><strong>{data.sensitive.employeesWithSalary}</strong></div>
          </div>
        </div>
      )}

      {data.payroll && (
        <div className="card">
          <h3 className="card-title">Payroll — Ethiopia (ETB)</h3>
          <p className="page-subtitle">
            Monthly income tax per Proclamation 979/2016 · Pension 7% employee / 11% employer (Procl. 715/2011)
          </p>
          <div className="mini-stats" style={{ marginBottom: '0.75rem' }}>
            <div><span className="mini-label">Gross Total</span><strong>{etb(data.payroll.totals?.gross)}</strong></div>
            <div><span className="mini-label">Income Tax</span><strong>{etb(data.payroll.totals?.incomeTax)}</strong></div>
            <div><span className="mini-label">Pension (7%)</span><strong>{etb(data.payroll.totals?.pensionEmployee)}</strong></div>
            <div><span className="mini-label">Employer (11%)</span><strong>{etb(data.payroll.totals?.pensionEmployer)}</strong></div>
            <div><span className="mini-label">Net Payout</span><strong>{etb(data.payroll.totals?.netSalary)}</strong></div>
          </div>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th className="th">Code</th>
                  <th className="th">Name</th>
                  <th className="th">Department</th>
                  <th className="th">Gross</th>
                  <th className="th">Tax</th>
                  <th className="th">Rate</th>
                  <th className="th">Pension 7%</th>
                  <th className="th">Deductions</th>
                  <th className="th">Net Pay</th>
                </tr>
              </thead>
              <tbody>
                {(data.payroll.employees || []).map((p) => (
                  <tr key={p.id} className="tr">
                    <td className="td">{p.employeeCode}</td>
                    <td className="td">{p.name}</td>
                    <td className="td">{p.department || '-'}</td>
                    <td className="td">{etb(p.gross)}</td>
                    <td className="td">{etb(p.incomeTax)}</td>
                    <td className="td">{Math.round(p.taxRate * 100)}%</td>
                    <td className="td">{etb(p.pensionEmployee)}</td>
                    <td className="td">{etb(p.totalDeductions)}</td>
                    <td className="td" style={{ fontWeight: 600 }}>{etb(p.netSalary)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ title, value }) {
  return (
    <div className="stat-card">
      <div>
        <span className="stat-value">{value ?? 0}</span>
        <span className="stat-title">{title}</span>
      </div>
    </div>
  )
}

function Panel({ title, items, labelKey }) {
  return (
    <div className="card">
      <h3 className="card-title">{title}</h3>
      {!items?.length ? <p className="empty-text">No data.</p> : (
        <ul className="alert-list">
          {items.map((item, i) => (
            <li key={i}><strong>{item[labelKey] || '—'}</strong>: {item.count}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default EmployeeAnalyticsPage
