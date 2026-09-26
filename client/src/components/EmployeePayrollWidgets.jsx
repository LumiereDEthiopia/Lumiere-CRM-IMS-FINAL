import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import api from '../services/api.js'

export default function EmployeePayrollWidgets() {
  const { hasPermission } = useAuth()
  const canView = hasPermission('employee:view')
  const canPayroll = hasPermission('payroll:view') && hasPermission('employee:view_sensitive')
  const [employee, setEmployee] = useState(null)
  const [payroll, setPayroll] = useState(null)
  const [alerts, setAlerts] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true
    const load = async () => {
      try {
        const [e, p, a] = await Promise.all([
          canView ? api.get('/api/dashboard/employee-summary') : null,
          canPayroll ? api.get('/api/dashboard/payroll-summary') : null,
          canPayroll ? api.get('/api/dashboard/payroll-alerts') : null
        ])
        if (live) { setEmployee(e?.data); setPayroll(p?.data); setAlerts(a?.data) }
      } catch (e) { if (live) setError(e.message) }
    }
    load()
    return () => { live = false }
  }, [canView, canPayroll])
  if (!canView && !canPayroll) return null
  const money = n => `ETB ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
  const card = (label, value, detail) => <div className="stat-card" key={label}><div><span className="stat-title">{label.replaceAll('_', ' ')}</span><span className="stat-value">{value}</span>{detail && <span className="stat-meta">{detail}</span>}</div></div>
  return <section className="employee-payroll-widgets" aria-label="Employee and payroll dashboard">
    {error && <p className="error-text" role="alert">Employee dashboard: {error}</p>}
    {employee && <><h3>Employee Summary</h3><div className="card-grid">
      {card('Total Employees', employee.total)}{card('Active Employees', employee.active)}
      {card('Inactive Employees', employee.inactive)}{card('New Employees This Month', employee.newThisMonth)}
    </div></>}
    {payroll && <><h3>Payroll Summary</h3><div className="card-grid">
      {card('Total Monthly Salary', money(payroll.monthlyPayroll))}{card('Due Today', money(payroll.dueToday))}
      {card('Due This Week', money(payroll.dueThisWeek))}{card('Overdue', money(payroll.overdue))}
      {card('Paid This Month', money(payroll.paidThisMonth))}{card('Pending Payments', payroll.pendingPayments)}
    </div></>}
    {alerts && <><h3>Salary Payment Alerts</h3><div className="card-grid">
      {Object.entries(alerts.alerts || {}).map(([name, bucket]) => card(name, money(bucket.total), `${bucket.count} employees`))}
    </div><h3>Employee Information Alerts</h3><div className="card-grid">
      {card('Salary Missing', alerts.employeeAlerts?.employeesWithoutSalary?.count ?? 0)}
      {card('TIN Missing', alerts.employeeAlerts?.employeesWithoutTin?.count ?? 0)}
      {card('Pension ID Missing', alerts.employeeAlerts?.employeesWithoutPensionId?.count ?? 0)}
      {card('Upcoming Payments', alerts.employeeAlerts?.upcomingPayments?.count ?? 0)}
      {card('Overdue Payments', alerts.employeeAlerts?.overduePayments?.count ?? 0)}
    </div><Link className="btn btn-secondary payroll-history-link" to="/admin/payroll">View payroll and payment history</Link>
    <p className="page-subtitle">Unrecorded upcoming amounts are salary estimates. A due date never confirms payment.</p></>}
  </section>
}
