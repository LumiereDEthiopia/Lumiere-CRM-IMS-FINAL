/**
 * Product Analytics Page
 */
import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../../services/api.js'
import { etb } from '../../lib/currency.js'
import './admin-styles.css'

function money(n) {
  return etb(n)
}

function ProductAnalyticsPage() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get(`/api/products/${id}/analytics`)
      .then((r) => { setData(r.data); setLoading(false) })
      .catch((e) => { setError(e.message); setLoading(false) })
  }, [id])

  if (loading) return <div className="loading-container"><div className="spinner" /><span>Loading product analytics...</span></div>
  if (error) return <div className="error-text" role="alert">{error}</div>
  if (!data) return <div className="empty-text">Product not found.</div>

  const p = data.product

  return (
    <div className="dashboard-container">
      <div className="page-header-row">
        <div>
          <h2 className="page-title">{p.name}</h2>
          <p className="page-subtitle">{p.sku || 'No SKU'} · {p.brand || '—'} · {p.category || '—'}</p>
        </div>
        <Link to="/admin/products" className="btn btn-secondary">Back to Products</Link>
      </div>

      <div className="card-grid">
        <Stat title="Current Stock" value={data.currentStock} />
        <Stat title="Sales Qty" value={data.salesQuantity} />
        <Stat title="Sales Value" value={money(data.salesValue)} />
        <Stat title="Purchase Qty" value={data.purchaseQuantity} />
        <Stat title="Purchase Value" value={money(data.purchaseValue)} />
        <Stat title="Movements" value={data.stockMovementCount} />
      </div>

      <div className="dashboard-row">
        <div className="card">
          <h3 className="card-title">Activity</h3>
          <ul className="alert-list">
            <li>Last sale: {data.lastSale ? `${data.lastSale.saleNumber} (${new Date(data.lastSale.date).toLocaleString()})` : '—'}</li>
            <li>Last purchase: {data.lastPurchase ? `${data.lastPurchase.purchaseNumber} (${new Date(data.lastPurchase.date).toLocaleString()})` : '—'}</li>
            <li>Last adjustment: {data.lastAdjustment ? new Date(data.lastAdjustment.createdAt).toLocaleString() : '—'}</li>
          </ul>
        </div>
        <div className="card">
          <h3 className="card-title">Location Distribution</h3>
          {!data.locationDistribution?.length ? <p className="empty-text">No inventory records.</p> : (
            <table className="table">
              <thead><tr><th className="th">Location</th><th className="th">Qty</th><th className="th">Available</th><th className="th">Reserved</th></tr></thead>
              <tbody>
                {data.locationDistribution.map((l) => (
                  <tr key={l.locationId} className="tr">
                    <td className="td">{l.location}</td>
                    <td className="td">{l.quantity}</td>
                    <td className="td">{l.available}</td>
                    <td className="td">{l.reserved}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ title, value }) {
  return (
    <div className="stat-card">
      <div>
        <span className="stat-value">{value}</span>
        <span className="stat-title">{title}</span>
      </div>
    </div>
  )
}

export default ProductAnalyticsPage
