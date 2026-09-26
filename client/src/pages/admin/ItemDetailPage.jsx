/**
 * Item Detail Page — item info, per-branch inventory and movement history.
 */
import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../../services/api.js'
import DataTable from '../../components/DataTable.jsx'
import Pagination from '../../components/Pagination.jsx'
import './admin-styles.css'

function statusOf(qty, min) {
  if (qty <= 0) return { label: 'Out of Stock', bg: '#FDECEA', color: '#C62828' }
  if (qty <= min) return { label: 'Low Stock', bg: '#FFF3E0', color: '#E65100' }
  return { label: 'Healthy', bg: '#E8F5E9', color: '#2E7D32' }
}

function ItemDetailPage() {
  const { id } = useParams()
  const [item, setItem] = useState(null)
  const [movements, setMovements] = useState([])
  const [movPg, setMovPg] = useState({ page: 1, totalPages: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchMovements = useCallback(async (page = 1) => {
    try {
      const res = await api.get(`/api/items/${id}/movements?page=${page}&limit=10`)
      setMovements(res.data || [])
      setMovPg(res.pagination || { page: 1, totalPages: 1, total: 0 })
    } catch (e) { setError(e.message) }
  }, [id])

  useEffect(() => {
    setLoading(true)
    api.get(`/api/items/${id}`)
      .then((r) => setItem(r.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
    fetchMovements(1)
  }, [id, fetchMovements])

  if (loading) return <div className="loading-container"><div className="spinner" /><span>Loading item...</span></div>
  if (error) return <div><p>{error}</p><Link className="btn-secondary" to="/admin/items">← Back to Items</Link></div>
  if (!item) return null

  const info = [
    ['Item Code', item.itemCode], ['Category', item.category?.name], ['Brand', item.brandName],
    ['SKU', item.sku], ['Barcode', item.barcode], ['Size', item.size],
    ['Volume', item.volume ? `${item.volume} ${item.volumeUnit || ''}` : null], ['Stock Unit', item.unit],
    ['Color', item.color], ['Material', item.material], ['Shape', item.shape], ['Neck Size', item.neckSize],
    ['Package Type', item.packageType], ['Dimensions', item.dimensions],
    ['Cost Price', `Br ${Number(item.costPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
    ['Minimum Stock', Number(item.minimumStock)], ['Reorder Quantity', Number(item.reorderQuantity)],
    ['Supplier', item.supplier?.name]
  ].filter(([, v]) => v !== undefined && v !== null && v !== '')

  return (
    <div>
      <div className="page-toolbar" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div>
          <Link to="/admin/items" style={{ fontSize: '0.8rem', color: '#8a6d3b' }}>← Back to Items</Link>
          <h2 style={{ margin: '0.25rem 0 0' }}>{item.name}</h2>
        </div>
        <span style={{ padding: '0.25rem 0.75rem', borderRadius: 12, fontSize: '0.75rem', fontWeight: 600, background: item.isActive ? '#E8F5E9' : '#EEEEEE', color: item.isActive ? '#2E7D32' : '#616161' }}>
          {item.isActive ? 'ACTIVE' : 'INACTIVE'}
        </span>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 className="card-title">Item Information</h3>
        {item.imageUrl && <img src={item.imageUrl} alt={item.name} style={{ maxWidth: 180, maxHeight: 180, borderRadius: 8, marginBottom: '0.75rem', objectFit: 'cover' }} />}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
          {info.map(([label, value]) => (
            <div key={label}>
              <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: '#9a9a9a' }}>{label}</div>
              <div style={{ fontWeight: 600 }}>{String(value)}</div>
            </div>
          ))}
          <div>
            <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: '#9a9a9a' }}>Total Stock</div>
            <div style={{ fontWeight: 700, color: '#8a6d3b' }}>{Number(item.totalQuantity).toLocaleString()} {item.unit || ''}</div>
          </div>
        </div>
        {item.description && <p style={{ marginTop: '0.75rem', marginBottom: 0, color: '#555' }}>{item.description}</p>}
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 className="card-title">Branch Inventory</h3>
        <DataTable emptyMessage="No branch stock yet — use Adjust Stock or a transfer" data={item.inventories} columns={[
          { key: 'location', label: 'Branch', render: (l) => l?.name || '-' },
          { key: 'quantity', label: 'Quantity', width: '100px', align: 'center', render: (q) => <strong>{Number(q)}</strong> },
          { key: 'availableQuantity', label: 'Available', width: '100px', align: 'center', render: (q) => Number(q) },
          { key: 'minimumStock', label: 'Minimum Stock', width: '120px', align: 'center', render: (m) => Number(m) },
          { key: 'status', label: 'Status', width: '120px', align: 'center', render: (_, row) => {
            const s = statusOf(Number(row.quantity), Number(row.minimumStock))
            return <span style={{ padding: '0.15rem 0.5rem', borderRadius: 10, fontSize: '0.65rem', fontWeight: 600, background: s.bg, color: s.color }}>{s.label}</span>
          } }
        ]} />
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 className="card-title">Stock Movement History</h3>
        <DataTable emptyMessage="No movements yet" data={movements} columns={[
          { key: 'createdAt', label: 'Date', width: '150px', render: (d) => new Date(d).toLocaleString() },
          { key: 'location', label: 'Branch', render: (l) => l?.name || '-' },
          { key: 'type', label: 'Movement', width: '150px', render: (t) => String(t).replace('ITEM_', '') },
          { key: 'quantity', label: 'Quantity', width: '90px', align: 'center', render: (q) => Number(q) },
          { key: 'previousQuantity', label: 'Prev → New', width: '120px', align: 'center', render: (_, m) => `${Number(m.previousQuantity ?? 0)} → ${Number(m.resultingQuantity ?? 0)}` },
          { key: 'referenceType', label: 'Reference', width: '120px', render: (r) => r || '-' },
          { key: 'reason', label: 'Reason', render: (r) => r || '-' }
        ]} />
        <Pagination page={movPg.page} totalPages={movPg.totalPages} total={movPg.total} onPageChange={fetchMovements} />
      </div>

      {item.productItems?.length > 0 && (
        <div className="card">
          <h3 className="card-title">Used By Products</h3>
          <DataTable data={item.productItems} columns={[
            { key: 'product', label: 'Product', render: (p) => p?.name || '-' },
            { key: 'quantity', label: 'Qty / Sale', width: '100px', align: 'center', render: (q) => Number(q) },
            { key: 'isRequired', label: 'Required', width: '90px', align: 'center', render: (r) => r ? 'Yes' : 'No' }
          ]} />
        </div>
      )}
    </div>
  )
}

export default ItemDetailPage
