import { useEffect, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import api from '../../services/api.js'
import { etb } from '../../lib/currency.js'
import StatusBadge from '../../components/StatusBadge.jsx'
import Receipt from '../../components/Receipt.jsx'
import './admin-styles.css'

export default function SaleDetailPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const [sale, setSale] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showReceipt, setShowReceipt] = useState(false)

  const printReceipt = () => setShowReceipt(true)

  useEffect(() => {
    api.get('/api/sales/' + id).then(r => { setSale(r.data); setLoading(false) }).catch(e => { setError(e.message); setLoading(false) })
  }, [id])

  if (loading) return <div className="loading-container"><div className="spinner" /><span>Loading sale...</span></div>
  if (error) return <div className="error-text">{error}</div>
  if (!sale) return <div className="empty-text">Sale not found.</div>

  // Authoritative stored VAT base for new sales; keep the legacy derivation for
  // historical sales (their new columns hold schema defaults only).
  const subtotalExclVat = sale.taxableAmount != null
    ? Number(sale.taxableAmount)
    : Number(sale.subtotal || 0) - Number(sale.discount || 0) - Number(sale.vatAmount || 0)
  const giftItems = (sale.items || []).filter((i) => i.isFreeGift)
  const giftValue = giftItems.reduce((s, i) => s + Number(i.regularUnitPrice ?? i.unitPrice ?? 0) * Number(i.quantity || 0), 0)

  return (
    <div className="dashboard-container">
      {searchParams.get('success') === 'true' && <div className="success-text" style={{ marginBottom: '1rem' }}>Sale completed successfully!</div>}
      <div className="page-header-row">
        <div><h2 className="page-title">Sale {sale.saleNumber}</h2><p className="page-subtitle">Sale Details</p></div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={() => setShowReceipt(true)}>View Receipt</button>
          <button className="btn btn-secondary" onClick={printReceipt}>Print</button>
          <Link to="/admin/sales" className="btn btn-secondary">Back to Sales</Link>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        <div className="card">
          <h3 className="card-title">Sale Information</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div><strong>Sale #:</strong> {sale.saleNumber}</div>
            <div><strong>Date:</strong> {new Date(sale.soldAt).toLocaleString()}</div>
            <div><strong>Customer:</strong> {sale.customer?.name || 'Walk-in'}</div>
            <div>
              <strong>TIN:</strong> {sale.customerTin || sale.customer?.tinNumber || '-'}
              {sale.customerTinVerified && (
                <span style={{ color: '#2E7D32', fontWeight: 600, marginLeft: '0.35rem' }} title="Verified against the official eTrade business license checker">✓ Verified</span>
              )}
            </div>
            {sale.customerTinVerified && sale.customerTinName && (
              <div><strong>Verified Name (eTrade):</strong> {sale.customerTinName}</div>
            )}
            <div><strong>Phone:</strong> {sale.customer?.phone || '-'}</div>
            <div><strong>Sales Section:</strong> {sale.salesChannel || 'DIRECT'}</div>
            <div><strong>Payment:</strong> {sale.paymentMethod || '-'}</div>
            <div><strong>Registration Note:</strong> {sale.customerRegistrationNote || '-'}</div>
            <div><strong>Location:</strong> {sale.location?.name}</div>
            <div><strong>Sold By:</strong> {sale.createdBy || '-'}</div>
            <div><strong>Status:</strong> <StatusBadge status={sale.status} type="order" /></div>
            {sale.notes && <div><strong>Notes:</strong> {sale.notes}</div>}
          </div>
        </div>
        <div className="card">
          <h3 className="card-title">Financial Summary</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal:</span><span>{etb(sale.subtotal)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Discount:</span><span>-{etb(sale.discount)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Taxable Amount:</span><span>{etb(subtotalExclVat)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>VAT ({Number(sale.vatRate || 0)}%):</span><span>{etb(sale.vatAmount)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Withholding ({Number(sale.withholdingRate || 0)}%):</span><span>{etb(sale.withholdingAmount)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.2rem', fontWeight: 600, borderTop: '1px solid #e8e8e8', paddingTop: '0.5rem' }}><span>Total:</span><span>{etb(sale.total)}</span></div>
            {sale.paidAmount != null && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Paid:</span><span>{etb(sale.paidAmount)}</span></div>}
            {sale.changeAmount != null && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Change:</span><span>{etb(sale.changeAmount)}</span></div>}
            {giftValue > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6A1B9A' }}><span>Free Gift value (not charged):</span><span>{etb(giftValue)}</span></div>}
          </div>
        </div>
      </div>
      <div className="card">
        <h3 className="card-title">Items</h3>
        <table className="table">
          <thead><tr><th className="th">Product</th><th className="th">SKU</th><th className="th">Size</th><th className="th">Qty</th><th className="th">Unit Price</th><th className="th">Discount</th><th className="th">Total</th><th className="th">Type</th><th className="th">Stock</th></tr></thead>
          <tbody>{sale.items?.map((item, i) => {
            const prod = item.product
            const isPerfume = prod?.productType === 'PERFUME'
            const stockUnit = isPerfume ? '' : ' g'
            return (
              <tr key={i} className="tr" style={item.isFreeGift ? { background: '#F3E5F5' } : undefined}>
                <td className="td">{item.productName}</td>
                <td className="td">{prod?.sku || '-'}</td>
                <td className="td">{isPerfume ? (prod?.size || '50/100ml') : 'per gram'}</td>
                <td className="td">{item.quantity}</td>
                <td className="td">{etb(item.regularUnitPrice ?? item.unitPrice)}{isPerfume ? '' : '/g'}</td>
                <td className="td">{Number(item.discountAmount || 0) > 0 ? <span style={{ color: '#C62828' }}>-{etb(item.discountAmount)}</span> : '-'}</td>
                <td className="td">
                  {item.isFreeGift
                    ? <><strong style={{ color: '#6A1B9A' }}>FREE GIFT — {etb(0)}</strong><br /><small>value {etb(item.regularUnitPrice ?? item.unitPrice)}</small></>
                    : etb(item.totalPrice)}
                </td>
                <td className="td">{item.isFreeGift ? <strong style={{ color: '#6A1B9A' }}>FREE_GIFT</strong> : (item.itemType === 'DISCOUNTED' ? 'DISCOUNTED' : 'NORMAL')}</td>
                <td className="td">{prod?.stockQuantity != null ? <span style={{ color: prod.stockQuantity <= 10 ? '#C62828' : prod.stockQuantity <= 20 ? '#E65100' : '#2E7D32', fontWeight: 600 }}>{prod.stockQuantity}{stockUnit}</span> : '-'}</td>
              </tr>
            )
          })}</tbody>
        </table>
      </div>
      {showReceipt && (
        <div className="receipt-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="receipt-modal" style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', maxWidth: '860px', width: '94%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '1.25rem', margin: 0 }}>Receipt</h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-primary" onClick={() => window.print()}>Print</button>
                <button className="btn btn-secondary" onClick={() => setShowReceipt(false)}>Close</button>
              </div>
            </div>
            <Receipt data={sale} />
          </div>
        </div>
      )}
    </div>
  )
}
