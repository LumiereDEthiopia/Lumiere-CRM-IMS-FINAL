/**
 * Reports & Business Intelligence Page
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { API_BASE_URL } from '../../services/api.js'
import { etb } from '../../lib/currency.js'
import './admin-styles.css'

function money(n) {
  return etb(n)
}

function ReportsPage() {
  const [tab, setTab] = useState('sales')
  const [filters, setFilters] = useState({ startDate: '', endDate: '', locationId: '', employeeId: '', productType: '', productId: '', flavor: '', form: '', size: '', paymentMethod: '' })
  const [locations, setLocations] = useState([])
  const [employees, setEmployees] = useState([])
  const [sales, setSales] = useState(null)
  const [inventory, setInventory] = useState(null)
  const [crm, setCrm] = useState(null)
  const [salesLogs, setSalesLogs] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/api/locations').then((r) => setLocations(r.data?.data || r.data || [])).catch(() => {})
    api.get('/api/employees').then((r) => setEmployees(r.data?.data || r.data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    loadTab(tab)
  }, [tab])

  async function loadTab(name) {
    setLoading(true)
    setError('')
    try {
      if (name === 'sales') {
        const q = new URLSearchParams()
        if (filters.startDate) q.set('startDate', filters.startDate)
        if (filters.endDate) q.set('endDate', filters.endDate)
        if (filters.locationId) q.set('locationId', filters.locationId)
        if (filters.employeeId) q.set('soldByEmployeeId', filters.employeeId)
        for (const key of ['productType', 'productId', 'flavor', 'form', 'size', 'paymentMethod']) if (filters[key]) q.set(key, filters[key])
        const r = await api.get(`/api/reports/sales?${q}`)
        setSales(r.data)
      } else if (name === 'sales-logs') {
        const q = new URLSearchParams()
        if (filters.startDate) q.set('startDate', filters.startDate)
        if (filters.endDate) q.set('endDate', filters.endDate)
        if (filters.locationId) q.set('locationId', filters.locationId)
        if (filters.employeeId) q.set('employeeId', filters.employeeId)
        const r = await api.get(`/api/reports/sales-logs?${q}`)
        setSalesLogs(r.data)
      } else if (name === 'inventory') {
        const r = await api.get('/api/reports/inventory')
        setInventory(r.data)
      } else if (name === 'crm') {
        const r = await api.get('/api/reports/crm')
        setCrm(r.data)
      }
    } catch (e) {
      setError(e.message || 'Failed to load report')
    }
    setLoading(false)
  }

  function exportCsv(type) {
    const token = localStorage.getItem('auth_token')
    const base = API_BASE_URL
    const exportType = tab === 'sales-logs' ? 'sales-logs' : tab === 'crm' ? 'customers' : tab === 'inventory' ? 'inventory' : 'sales'
    window.open(`${base}/api/exports/${exportType}?format=csv&token=`, '_blank')
    // Prefer fetch blob for auth header
    fetch(`${base}/api/exports/${exportType}?format=csv`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${exportType}-export.csv`
        a.click()
        URL.revokeObjectURL(url)
      })
      .catch(() => setError('Export failed'))
  }

  function printReport() {
    window.print()
  }

  return (
    <div className="dashboard-container">
      <div className="page-header-row">
        <div>
          <h2 className="page-title">Reports</h2>
          <p className="page-subtitle">Business intelligence and analytics</p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn btn-secondary" onClick={printReport}>Print</button>
          <button type="button" className="btn btn-secondary" onClick={() => exportCsv(tab === 'crm' ? 'customers' : tab === 'inventory' ? 'inventory' : 'sales')}>Export CSV</button>
        </div>
      </div>

      <div className="tab-row" role="tablist">
        {['sales', 'sales-logs', 'inventory', 'crm'].map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'sales-logs' ? 'Sales Log' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        <Link to="/admin/reports/accounting" className="tab-btn" style={{ textDecoration: 'none', display: 'inline-block' }}>Accounting →</Link>
      </div>

      {tab === 'sales' && (
        <div className="filter-bar">
          <label>
            Start
            <input type="date" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} />
          </label>
          <label>
            End
            <input type="date" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} />
          </label>
          <label>
            Location
            <select value={filters.locationId} onChange={(e) => setFilters({ ...filters, locationId: e.target.value })}>
              <option value="">All</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <label>Sold By<select value={filters.employeeId} onChange={(e) => setFilters({ ...filters, employeeId: e.target.value })}><option value="">All</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}</select></label>
          <label>Type<select value={filters.productType} onChange={(e) => setFilters({ ...filters, productType: e.target.value })}><option value="">All</option><option value="PERFUME">Perfume</option><option value="PURE_OIL">Pure Oil</option><option value="MUSK">Musk</option><option value="CREAM">Cream/Jelly</option></select></label>
          {filters.productType === 'MUSK' && <label>Flavor<input value={filters.flavor} onChange={(e) => setFilters({ ...filters, flavor: e.target.value })} /></label>}
          {filters.productType === 'CREAM' && <><label>Form<select value={filters.form} onChange={(e) => setFilters({ ...filters, form: e.target.value })}><option value="">All</option><option value="CREAM">Cream</option><option value="JELLY">Jelly</option></select></label><label>Size<select value={filters.size} onChange={(e) => setFilters({ ...filters, size: e.target.value })}><option value="">All</option><option value="30 ml">30 ml</option><option value="50 ml">50 ml</option></select></label></>}
          <label>Payment<select value={filters.paymentMethod} onChange={(e) => setFilters({ ...filters, paymentMethod: e.target.value })}><option value="">All</option><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="TELEBIRR">Telebirr</option><option value="CARD">Card</option><option value="CREDIT">Credit</option></select></label>
          <button type="button" className="btn btn-primary" onClick={() => loadTab('sales')}>Apply</button>
        </div>
      )}

      {tab === 'sales-logs' && (
        <div className="filter-bar">
          <label>
            Start
            <input type="date" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} />
          </label>
          <label>
            End
            <input type="date" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} />
          </label>
          <label>
            Location
            <select value={filters.locationId} onChange={(e) => setFilters({ ...filters, locationId: e.target.value })}>
              <option value="">All</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <label>
            Employee
            <select value={filters.employeeId} onChange={(e) => setFilters({ ...filters, employeeId: e.target.value })}>
              <option value="">All</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
            </select>
          </label>
          <button type="button" className="btn btn-primary" onClick={() => loadTab('sales-logs')}>Apply</button>
        </div>
      )}

      {loading && <div className="loading-container"><div className="spinner" /><span>Loading report...</span></div>}
      {error && <div className="error-text" role="alert">{error}</div>}

      {!loading && tab === 'sales' && sales && (
        <>
          <div className="card-grid">
            <Metric title="Revenue" value={money(sales.summary?.revenue)} />
            <Metric title="Transactions" value={sales.summary?.transactions} />
            <Metric title="Units Sold" value={sales.summary?.unitsSold} />
            <Metric title="Avg Transaction" value={money(sales.summary?.averageTransactionValue)} />
            <Metric title="Gross Sales" value={money(sales.summary?.grossSales)} />
            <Metric title="Total Discounts" value={money(sales.summary?.totalDiscounts)} />
            <Metric title="Net Taxable Sales" value={money(sales.summary?.netTaxableSales)} />
            <Metric title="VAT" value={money(sales.summary?.vatTotal)} />
            <Metric title="Cost of Goods" value={money(sales.summary?.cost)} />
            <Metric title="Profit" value={money(sales.summary?.profit)} />
            <Metric title="Pure Oil Consumed (ml)" value={sales.summary?.pureOilConsumedMl ?? 0} />
            <Metric title="Free Gift Items" value={sales.summary?.freeGiftCount ?? 0} />
            <Metric title="Free Gift Value" value={money(sales.summary?.freeGiftValue)} />
          </div>
          <div className="dashboard-row">
            <div className="card">
              <h3 className="card-title">Discounts by Employee</h3>
              <DataTable columns={['Employee', 'Discount', 'Txns']} rows={(sales.summary?.discountByEmployee || []).map((e) => [e.name, money(e.discount), e.transactions])} empty="No discounts in this period." />
            </div>
            <div className="card">
              <h3 className="card-title">Discounts by Branch</h3>
              <DataTable columns={['Branch', 'Discount', 'Txns']} rows={(sales.summary?.discountByBranch || []).map((l) => [l.name, money(l.discount), l.transactions])} empty="No discounts in this period." />
            </div>
            <div className="card">
              <h3 className="card-title">Free Gifts by Employee</h3>
              <DataTable columns={['Employee', 'Qty', 'Value']} rows={(sales.summary?.freeGiftByEmployee || []).map((e) => [e.name, e.quantity, money(e.value)])} empty="No free gifts in this period." />
            </div>
          </div>
          <div className="dashboard-row">
            <div className="card">
              <h3 className="card-title">Free Gifts by Branch</h3>
              <DataTable columns={['Branch', 'Qty', 'Value']} rows={(sales.summary?.freeGiftByBranch || []).map((l) => [l.name, l.quantity, money(l.value)])} empty="No free gifts in this period." />
            </div>
            <div className="card">
              <h3 className="card-title">Free Gift Products (internal value — not revenue)</h3>
              <DataTable columns={['Product', 'Qty', 'Value']} rows={(sales.summary?.freeGiftProducts || []).map((p) => [p.name, p.quantity, money(p.value)])} empty="No free gifts in this period." />
            </div>
          </div>
          <div className="dashboard-row">
            <div className="card">
              <h3 className="card-title">Sales Over Time</h3>
              <BarList items={(sales.overTime || []).map((d) => ({ label: d.day, value: d.revenue }))} />
            </div>
            <div className="card">
              <h3 className="card-title">By Brand</h3>
              <BarList items={(sales.byBrand || []).map((d) => ({ label: d.name, value: d.revenue }))} />
            </div>
            <div className="card">
              <h3 className="card-title">By Category</h3>
              <BarList items={(sales.byCategory || []).map((d) => ({ label: d.name, value: d.revenue }))} />
            </div>
          </div>
          <div className="card">
            <h3 className="card-title">By Product</h3>
            <DataTable columns={['Product', 'Qty', 'Revenue', 'Cost', 'Profit', 'Txns']} rows={(sales.byProduct || []).map((p) => [p.name, p.quantity, money(p.revenue), money(p.cost), money(p.profit), p.transactions])} />
          </div>
          <div className="card">
            <h3 className="card-title">Employee Performance (by Sales Count)</h3>
            <DataTable columns={['Employee', 'Sales Count', 'Total Revenue']} rows={(sales.employeePerformance || []).map((e) => [e.name, e.salesCount, money(e.totalRevenue)])} empty="No employee sales data." />
          </div>
          <div className="card">
            <h3 className="card-title">Pure Oil consumption (inventory cost, not sales)</h3>
            <DataTable columns={['Pure Oil', 'Consumed (ml)', 'Cream/Jelly product', 'Sale', 'Date']} rows={(sales.creamConsumption || []).map((m) => [m.productName, m.quantity, m.creamProductName || 'Cream/Jelly', m.saleId || '—', m.createdAt ? new Date(m.createdAt).toLocaleString() : '—'])} empty="No Pure Oil consumption recorded for this period." />
          </div>
        </>
      )}

      {!loading && tab === 'sales-logs' && salesLogs && (
        <>
          <div className="card-grid">
            <Metric title="Total Logs" value={salesLogs.pagination?.total || 0} />
            <Metric title="Total Revenue" value={money(salesLogs.data?.reduce((sum, log) => sum + Number(log.totalAmount || 0), 0))} />
          </div>
          <div className="card">
            <h3 className="card-title">Sales Log</h3>
            <DataTable
              columns={['Sale #', 'Date', 'Employee', 'Employee Code', 'User', 'Location', 'Customer', 'TIN', 'Amount']}
              rows={(salesLogs.data || []).map((log) => [
                log.saleNumber,
                new Date(log.soldAt).toLocaleString(),
                log.employeeName || '-',
                log.employeeCode || '-',
                log.userName || '-',
                log.locationName || '-',
                log.customerName || '-',
                log.customerTin || '-',
                money(log.totalAmount)
              ])}
              empty="No sales logs found for the selected filters."
            />
          </div>
        </>
      )}

      {!loading && tab === 'inventory' && inventory && (
        <>
          <div className="card-grid">
            <Metric title="Cost Value" value={money(inventory.valuation?.costValue)} />
            <Metric title="Retail Value" value={money(inventory.valuation?.retailValue)} />
            <Metric title="Total Units" value={inventory.valuation?.totalUnits} />
            <Metric title="Low Stock SKUs" value={inventory.lowStock?.length || 0} />
          </div>
          <div className="dashboard-row">
            <div className="card">
              <h3 className="card-title">Stock by Location</h3>
              <DataTable columns={['Location', 'Units', 'Available']} rows={(inventory.byLocation || []).map((l) => [l.name, l.units, l.available])} />
            </div>
            <div className="card">
              <h3 className="card-title">Out of Stock</h3>
              <DataTable columns={['Product', 'Location']} rows={(inventory.outOfStock || []).map((i) => [i.product?.name, i.location?.name])} empty="No out-of-stock items." />
            </div>
          </div>
          <div className="card">
            <h3 className="card-title">Inventory Valuation</h3>
            <DataTable
              columns={['Product', 'SKU', 'Stock', 'Cost Value', 'Retail Value']}
              rows={(inventory.products || []).slice(0, 50).map((p) => [p.name, p.sku, p.totalStock, money(p.costValue), money(p.retailValue)])}
            />
          </div>
        </>
      )}

      {!loading && tab === 'crm' && crm && (
        <>
          <div className="card-grid">
            <Metric title="Total" value={crm.overview?.total} />
            <Metric title="New (30d)" value={crm.overview?.newCustomers} />
            <Metric title="Active" value={crm.overview?.active} />
            <Metric title="Inactive" value={crm.overview?.inactive} />
            <Metric title="Leads" value={crm.overview?.leads} />
            <Metric title="VIP" value={crm.overview?.vip} />
            <Metric title="Wholesale" value={crm.overview?.wholesale} />
            <Metric title="Lost" value={crm.overview?.lost} />
          </div>
          <div className="dashboard-row">
            <div className="card">
              <h3 className="card-title">By Status</h3>
              <BarList items={(crm.charts?.byStatus || []).map((d) => ({ label: d.status, value: d.count }))} />
            </div>
            <div className="card">
              <h3 className="card-title">By Type</h3>
              <BarList items={(crm.charts?.byType || []).map((d) => ({ label: d.type, value: d.count }))} />
            </div>
            <div className="card">
              <h3 className="card-title">By Source</h3>
              <BarList items={(crm.charts?.bySource || []).map((d) => ({ label: d.source, value: d.count }))} />
            </div>
          </div>
          <div className="card">
            <h3 className="card-title">Customer Value</h3>
            <DataTable
              columns={['Customer', 'Purchases', 'Total Value', 'Avg Txn', 'Last Purchase']}
              rows={(crm.customerValue || []).map((c) => [
                c.name,
                c.purchaseCount,
                money(c.totalValue),
                money(c.averageTransaction),
                c.lastPurchase ? new Date(c.lastPurchase).toLocaleDateString() : '—'
              ])}
            />
          </div>
        </>
      )}
    </div>
  )
}

function Metric({ title, value }) {
  return (
    <div className="stat-card">
      <div>
        <span className="stat-value">{value}</span>
        <span className="stat-title">{title}</span>
      </div>
    </div>
  )
}

function BarList({ items }) {
  if (!items?.length) return <p className="empty-text">No data.</p>
  const max = Math.max(...items.map((i) => Number(i.value) || 0), 1)
  return (
    <div className="bar-list">
      {items.slice(0, 12).map((item) => (
        <div key={item.label} className="bar-row">
          <span className="bar-label">{item.label}</span>
          <div className="bar-track" aria-hidden="true">
            <div className="bar-fill" style={{ width: `${(Number(item.value) / max) * 100}%` }} />
          </div>
          <span className="bar-value">{typeof item.value === 'number' && item.value > 100 ? money(item.value) : item.value}</span>
        </div>
      ))}
    </div>
  )
}

function DataTable({ columns, rows, empty = 'No data found.' }) {
  if (!rows?.length) return <p className="empty-text">{empty}</p>
  return (
    <div className="table-wrapper">
      <table className="table">
        <thead><tr>{columns.map((c) => <th key={c} className="th">{c}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="tr">{row.map((cell, j) => <td key={j} className="td">{cell ?? '—'}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default ReportsPage
