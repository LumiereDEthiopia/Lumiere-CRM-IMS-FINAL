import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../services/api.js'
import { etb } from '../../lib/currency.js'
import DonutChart from '../../components/DonutChart.jsx'
import './admin-styles.css'

export default function DailySalesPage() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    api.get('/api/sales/daily-activity?date=' + date).then(r => { setData(r.data); setLoading(false) }).catch(e => { setError(e.message); setLoading(false) })
  }, [date])

  if (loading) return <div className="loading-container"><div className="spinner" /><span>Loading daily activity...</span></div>
  if (error) return <div className="error-text">{error}</div>
  if (!data) return <div className="empty-text">No data available.</div>

  const { summary, topProducts, byEmployee, byLocation, byBrand, byCategory, sales } = data

  return (
    <div className="dashboard-container">
      <div className="page-header-row">
        <div><h2 className="page-title">Daily Sales Activity</h2><p className="page-subtitle">Sales performance for {date}</p></div>
        <div className="header-actions">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ padding: '0.45rem', border: '1px solid #e8e8e8', borderRadius: '6px' }} />
          <Link to="/admin/sales" className="btn btn-secondary">Back to Sales</Link>
        </div>
      </div>
      <div className="card-grid">
        <div className="stat-card"><div><span className="stat-value">{summary.totalSales}</span><span className="stat-title">Total Sales</span></div></div>
        <div className="stat-card"><div><span className="stat-value">{etb(summary.totalRevenue)}</span><span className="stat-title">Revenue</span></div></div>
        <div className="stat-card"><div><span className="stat-value">{summary.totalUnits}</span><span className="stat-title">Units Sold</span></div></div>
        <div className="stat-card"><div><span className="stat-value">{etb(summary.totalDiscount)}</span><span className="stat-title">Discounts</span></div></div>
        <div className="stat-card"><div><span className="stat-value">{etb(summary.averageTransaction)}</span><span className="stat-title">Avg Transaction</span></div></div>
      </div>
      <div className="dashboard-row">
        <div className="card"><h3 className="card-title">Top Products</h3><DonutChart data={topProducts.map(p => ({ name: p.name, value: Number(p.revenue) }))} /></div>
        <div className="card"><h3 className="card-title">Sales by Location</h3><DonutChart data={byLocation.map(l => ({ name: l.name, value: Number(l.revenue) }))} /></div>
        <div className="card"><h3 className="card-title">Sales by Employee</h3><DonutChart data={byEmployee.map(e => ({ name: e.name || 'Unknown', value: Number(e.revenue) }))} /></div>
        <div className="card"><h3 className="card-title">Sales by Brand</h3><DonutChart data={byBrand.map(b => ({ name: b.name, value: Number(b.revenue) }))} /></div>
      </div>
      <div className="card">
        <h3 className="card-title">Transactions ({sales.length})</h3>
        <table className="table">
          <thead><tr><th className="th">Sale #</th><th className="th">Time</th><th className="th">Customer</th><th className="th">Location</th><th className="th">Items</th><th className="th">Total</th></tr></thead>
          <tbody>{sales.map(s => (
            <tr key={s.id} className="tr"><td className="td"><Link to={'/admin/sales/' + s.id}>{s.saleNumber}</Link></td><td className="td">{new Date(s.soldAt).toLocaleTimeString()}</td><td className="td">{s.customer?.name || 'Walk-in'}</td><td className="td">{s.location?.name}</td><td className="td">{s.items?.reduce((n, i) => n + i.quantity, 0)}</td><td className="td"><strong>{etb(s.total)}</strong></td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  )
}
