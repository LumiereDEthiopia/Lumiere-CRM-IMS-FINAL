/**
 * Advanced Admin Dashboard — Stage 4 BI
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../services/api.js'
import { etb } from '../../lib/currency.js'
import DonutChart from '../../components/DonutChart.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import EmployeePayrollWidgets from '../../components/EmployeePayrollWidgets.jsx'
import './admin-styles.css'
import './dashboard-styles.css'

function money(n) {
  return etb(n)
}

function DashboardPage() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/api/dashboard/stats')
      .then((data) => { setStats(data.data); setLoading(false) })
      .catch((e) => { setError(e.message || 'Failed to load dashboard'); setLoading(false) })
  }, [])

  if (loading) {
    return (
      <div className="loading-container" role="status" aria-live="polite">
        <div className="spinner" />
        <span>Loading dashboard...</span>
      </div>
    )
  }
  if (error || !stats) return <div className="error-text" role="alert">{error || 'Failed to load dashboard'}</div>

  const { overview, sales, purchasing, crm, employees, inventoryAlerts, backup } = stats

  return (
    <div className="dashboard-container business-dashboard">
      <div className="page-header-row">
        <div>
          <h2 className="page-title">Business Overview</h2>
          <p className="page-subtitle">Production management dashboard</p>
        </div>
        <div className="header-actions">
          <Link to="/admin/reports" className="btn btn-secondary">Reports</Link>
          <Link to="/admin/backups" className="btn btn-secondary">Backups</Link>
        </div>
      </div>

      <div className="card-grid">
        <StatCard title="Total Products" value={overview.totalProducts} />
        <StatCard title="Active Products" value={overview.activeProducts} />
        <StatCard title="Inventory Units" value={overview.totalInventoryUnits} />
        <StatCard title="Value at Cost" value={money(overview.inventoryValueCost)} />
        <StatCard title="Value at Retail" value={money(overview.inventoryValueRetail)} />
        <StatCard title="Low Stock" value={overview.lowStockCount} tone="warning" />
        <StatCard title="Out of Stock" value={overview.outOfStockCount} tone="danger" />
        <StatCard title="Customers" value={overview.totalCustomers} />
        <StatCard title="Active Customers" value={overview.activeCustomers} />
        <StatCard title="Suppliers" value={overview.totalSuppliers} />
        <StatCard title="Employees" value={overview.totalEmployees} />
        <StatCard title="Active Employees" value={overview.activeEmployees} />
      </div>

      <EmployeePayrollWidgets />

      <section className="dashboard-section">
        <h3 className="section-title">Sales</h3>
        <div className="card-grid">
          <PeriodCard label="Today" data={sales?.today} />
          <PeriodCard label="This Week" data={sales?.week} />
          <PeriodCard label="This Month" data={sales?.month} />
          <PeriodCard label="This Year" data={sales?.year} />
        </div>
        <div className="card-grid" style={{ marginTop: '0.75rem' }}>
          <StatCard title="Gross Sales (today)" value={money(sales?.today?.gross)} />
          <StatCard title="Discounts (today)" value={money(sales?.today?.discounts)} />
          <StatCard title="Net Sales (today)" value={money(sales?.today?.total)} />
          <StatCard title="VAT (today)" value={money(sales?.today?.vat)} />
          <StatCard title="Free Gift Count (today)" value={sales?.freeGifts?.count ?? 0} />
          <StatCard title="Free Gift Value (today)" value={money(sales?.freeGifts?.value)} />
        </div>
      </section>

      <section className="dashboard-section">
        <h3 className="section-title">Reports — Circle Charts</h3>
        <div className="dashboard-row">
          <div className="card">
            <h3 className="card-title">Sales by Location</h3>
            <DonutChart data={(sales?.byLocation || []).map((l) => ({ name: l.name, value: Number(l.total) }))} />
          </div>
          <div className="card">
            <h3 className="card-title">Revenue by Brand</h3>
            <DonutChart data={(sales?.topBrands || []).map((b) => ({ name: b.name, value: Number(b.revenue) }))} />
          </div>
          <div className="card">
            <h3 className="card-title">Units Sold — Top Products</h3>
            <DonutChart data={(sales?.topProducts || []).map((p) => ({ name: p.name, value: Number(p.quantity) }))} money={false} centerTitle="Units" />
          </div>
        </div>
      </section>

      <div className="dashboard-row">
        <div className="card">
          <h3 className="card-title">Top-Selling Products</h3>
          <SimpleTable
            columns={['Product', 'Qty', 'Revenue']}
            rows={(sales?.topProducts || []).map((p) => [p.name, p.quantity, money(p.revenue)])}
            empty="No sales data yet."
          />
        </div>
        <div className="card">
          <h3 className="card-title">Top Brands</h3>
          <SimpleTable
            columns={['Brand', 'Units', 'Revenue']}
            rows={(sales?.topBrands || []).map((b) => [b.name, b.units, money(b.revenue)])}
            empty="No brand sales yet."
          />
        </div>
        <div className="card">
          <h3 className="card-title">Sales by Location</h3>
          <SimpleTable
            columns={['Location', 'Sales', 'Total']}
            rows={(sales?.byLocation || []).map((l) => [l.name, l.count, money(l.total)])}
            empty="No location sales yet."
          />
        </div>
      </div>

      <div className="dashboard-row">
        <div className="card">
          <h3 className="card-title">Purchasing</h3>
          <div className="mini-stats">
            <div><span className="mini-label">Total Purchases</span><strong>{purchasing?.totalCount || 0}</strong></div>
            <div><span className="mini-label">Purchase Value</span><strong>{money(purchasing?.totalValue)}</strong></div>
            <div><span className="mini-label">Outstanding</span><strong>{purchasing?.outstandingCount || 0}</strong></div>
          </div>
          <SimpleTable
            columns={['#', 'Supplier', 'Total']}
            rows={(purchasing?.recent || []).map((p) => [p.purchaseNumber, p.supplier?.name, money(p.total)])}
            empty="No recent purchases."
          />
        </div>
        <div className="card">
          <h3 className="card-title">CRM</h3>
          <div className="mini-stats">
            <div><span className="mini-label">New (30d)</span><strong>{crm?.newCustomers || 0}</strong></div>
            <div><span className="mini-label">Leads</span><strong>{crm?.leads || 0}</strong></div>
            <div><span className="mini-label">VIP</span><strong>{crm?.vipCustomers || 0}</strong></div>
            <div><span className="mini-label">Follow-ups Due</span><strong>{crm?.followUpsDue || 0}</strong></div>
            <div><span className="mini-label">Overdue Tasks</span><strong className="text-danger">{crm?.overdueTasks || 0}</strong></div>
            <div><span className="mini-label">Upcoming Tasks</span><strong>{crm?.upcomingTasks || 0}</strong></div>
          </div>
        </div>
        <div className="card">
          <h3 className="card-title">Employees</h3>
          <div className="mini-stats">
            <div><span className="mini-label">Total</span><strong>{employees?.total || 0}</strong></div>
            <div><span className="mini-label">Active</span><strong>{employees?.active || 0}</strong></div>
          </div>
          <SimpleTable
            columns={['Department', 'Count']}
            rows={(employees?.byDepartment || []).map((d) => [d.name, d.count])}
            empty="No department data."
          />
          <div style={{ marginTop: '0.75rem' }}>
            <Link to="/admin/employees/analytics" className="link-btn">View employee analytics →</Link>
          </div>
        </div>
      </div>

      <div className="dashboard-row">
        <div className="card">
          <h3 className="card-title">Inventory Alerts</h3>
          <div className="alert-columns">
            <AlertList title="Out of Stock" items={inventoryAlerts?.outOfStock} render={(i) => `${i.product?.name} @ ${i.location?.name}`} />
            <AlertList title="Low Stock" items={inventoryAlerts?.lowStock} render={(i) => `${i.product?.name}: ${i.availableQuantity}`} />
            <AlertList title="Overstock" items={inventoryAlerts?.overstock} render={(i) => `${i.product?.name}: ${i.quantity}`} />
          </div>
        </div>
        <div className="card">
          <h3 className="card-title">Backup Status</h3>
          {backup ? (
            <div className="mini-stats">
              <div><span className="mini-label">Enabled</span><strong>{backup.enabled ? 'Yes' : 'No'}</strong></div>
              <div><span className="mini-label">Healthy</span><strong className={backup.healthy ? 'text-ok' : 'text-danger'}>{backup.healthy ? 'Yes' : 'No'}</strong></div>
              <div><span className="mini-label">R2</span><strong>{backup.r2Status}</strong></div>
              <div><span className="mini-label">Last Success</span><strong>{backup.lastSuccess ? new Date(backup.lastSuccess).toLocaleString() : 'Never'}</strong></div>
              <div><span className="mini-label">Backup Age</span><strong>{backup.backupAge != null ? `${backup.backupAge}h` : '—'}</strong></div>
              <div><span className="mini-label">Count</span><strong>{backup.backupCount || 0}</strong></div>
            </div>
          ) : (
            <p className="empty-text">Backup status unavailable.</p>
          )}
        </div>
      </div>

      <div className="dashboard-row">
        <div className="card">
          <h3 className="card-title">Recent Sales</h3>
          <div className="table-wrapper">
            {(stats.recentSales || sales?.recent || []).length > 0 ? (
              <table className="table">
                <thead>
                  <tr>
                    <th className="th">Sale #</th>
                    <th className="th">Customer</th>
                    <th className="th">Location</th>
                    <th className="th">Status</th>
                    <th className="th">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(stats.recentSales || sales?.recent || []).map((sale) => (
                    <tr key={sale.id} className="tr">
                      <td className="td">{sale.saleNumber}</td>
                      <td className="td">{sale.customer?.name}</td>
                      <td className="td">{sale.location?.name}</td>
                      <td className="td"><StatusBadge status={sale.status} type="order" /></td>
                      <td className="td">{money(sale.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="empty-text">No recent sales.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ title, value, tone }) {
  return (
    <div className={`stat-card ${tone ? `tone-${tone}` : ''}`}>
      <div>
        <span className="stat-value">{value}</span>
        <span className="stat-title">{title}</span>
      </div>
    </div>
  )
}

function PeriodCard({ label, data }) {
  return (
    <div className="stat-card">
      <div>
        <span className="stat-title">{label}</span>
        <span className="stat-value">{money(data?.total)}</span>
        <span className="stat-meta">{data?.count || 0} sales · avg {money(data?.average)}</span>
      </div>
    </div>
  )
}

function SimpleTable({ columns, rows, empty }) {
  if (!rows?.length) return <p className="empty-text">{empty}</p>
  return (
    <div className="table-wrapper">
      <table className="table">
        <thead>
          <tr>{columns.map((c) => <th key={c} className="th">{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="tr">
              {row.map((cell, j) => <td key={j} className="td">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AlertList({ title, items, render }) {
  return (
    <div>
      <h4 className="alert-title">{title} ({items?.length || 0})</h4>
      {!items?.length ? <p className="empty-text">None</p> : (
        <ul className="alert-list">
          {items.slice(0, 5).map((item, i) => <li key={item.id || i}>{render(item)}</li>)}
        </ul>
      )}
    </div>
  )
}

export default DashboardPage
