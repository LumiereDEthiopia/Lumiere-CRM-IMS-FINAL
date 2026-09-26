/**
 * Printable LUMIER PERFUME sales receipt / invoice.
 * Business information (name, phone, address, TIN, footer, currency) comes
 * from the saved Settings (SettingsContext) — with the original hardcoded
 * values kept as fallbacks so nothing changes until settings are configured.
 */
import { etb, getActiveCurrency } from '../lib/currency.js'
import { useSettings } from '../contexts/SettingsContext.jsx'

const formatDateTime = (value) => new Date(value || Date.now()).toLocaleString('en-US')

export default function Receipt({ data }) {
  const { getSetting } = useSettings()
  if (!data) return null

  const items = data.items || []
  const subtotal = Number(data.subtotal || 0)   // Product Price — paid lines, gross
  const discount = Number(data.discount || 0)   // item-level + sale-level discounts
  const vatAmount = Number(data.vatAmount || 0)
  const total = Number(data.total || 0)
  const paidAmount = data.paidAmount != null ? Number(data.paidAmount) : null
  const changeAmount = data.changeAmount != null ? Number(data.changeAmount) : null
  const giftItems = items.filter((i) => i.isFreeGift)
  const giftValue = giftItems.reduce((s, i) => s + Number(i.regularUnitPrice ?? i.unitPrice ?? 0) * Number(i.quantity || 0), 0)
  // New sales store the authoritative VAT base; legacy receipts keep the
  // original derivation (subtotal − discount − VAT) so historical documents
  // print exactly as they always have.
  const taxableSubtotal = data.taxableAmount != null
    ? Number(data.taxableAmount)
    : subtotal - discount - vatAmount

  // Saved business settings (Settings → Business) — empty values fall back to
  // the built-in defaults so receipts never print blank headers.
  const businessName = getSetting('business_name', 'LUMIER PERFUME')
  const businessPhone = getSetting('business_phone', '')
  const businessAddress = getSetting('business_address', '')
  const businessTin = getSetting('ethiopia_taxpayer_tin', '')
  const receiptFooter = getSetting('receipt_footer', 'Thank you for choosing LUMIER PERFUME. Please keep this receipt for your records.')
  const currencyCode = getActiveCurrency().code

  return (
    <article className="receipt" aria-label={`Receipt ${data.saleNumber}`}>
      <header className="receipt-header">
        <div className="receipt-brand">
          <img src="/logo-removebg-preview.png" alt="LUMIER PERFUME" className="receipt-logo" />
          <div><h1>{businessName}</h1><p>PERFUME &amp; FRAGRANCE</p></div>
        </div>
        <div className="receipt-title-block"><h2>Receipt</h2><p>Original customer copy</p></div>
      </header>

      <div className="receipt-rule" />

      <section className="receipt-section">
        <h3 className="receipt-section-title">Sale Information</h3>
      <section className="receipt-meta" aria-label="Receipt information">
        <div><span>Sale #</span><strong>{data.saleNumber || '-'}</strong></div>
         {data.taxInvoiceNumber
           ? <div><span>Tax Invoice #</span><strong>{data.taxInvoiceNumber}</strong></div>
           : <div className="receipt-muted"><span>Tax Invoice #</span><strong>N/A — Receipt</strong></div>}
        <div><span>Date</span><strong>{formatDateTime(data.soldAt)}</strong></div>
        <div><span>Status</span><strong>{data.status || 'COMPLETED'}</strong></div>
        <div><span>Sales Section</span><strong>{data.salesChannel || 'DIRECT'}</strong></div>
        <div><span>Payment Method</span><strong>{data.paymentMethod || '-'}</strong></div>
      </section>
      </section>

      <section className="receipt-parties">
        <div>
          <h3>Bill To</h3>
          <strong>{data.customer?.name || data.customerTinName || (data.customerTinVerified ? `Walk-in (TIN ${data.customerTin})` : 'Walk-in Customer')}</strong>
          <span>Phone: {data.customer?.phone || '-'}</span>
          <span>TIN: {data.customerTin || data.customer?.tinNumber || '-'}{data.customerTinVerified ? ' ✓' : ''}</span>
          {data.customerTinVerified && data.customerTinName && <span>Verified name: {data.customerTinName}</span>}
          {data.customer?.address && <span>{data.customer.address}</span>}
        </div>
        <div><h3>Store Details</h3><strong>{data.location?.name || businessName}</strong><span>Served by: {data.createdBy || '-'}</span><span>Currency: {currencyCode}</span>{businessPhone && <span>Phone: {businessPhone}</span>}{businessAddress && <span>Address: {businessAddress}</span>}{businessTin && <span>TIN: {businessTin}</span>}</div>
      </section>

      <section className="receipt-section">
        <h3 className="receipt-section-title">Items</h3>
      <table className="receipt-items">
        <thead><tr><th>Item Code</th><th>Product</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead>
        <tbody>{items.map((item, index) => {
          const isGift = !!item.isFreeGift
          const lineDiscount = Number(item.discountAmount || 0)
          const shownUnitPrice = item.regularUnitPrice ?? item.unitPrice
          return (
            <tr key={item.id || index} style={isGift ? { background: '#F3E5F5' } : undefined}>
              <td>{item.product?.sku || '-'}</td>
              <td>
                {item.productName || '-'}
                {isGift && <><br /><strong style={{ color: '#6A1B9A' }}>FREE GIFT</strong></>}
                {!isGift && lineDiscount > 0 && <><br /><small style={{ color: '#C62828' }}>Discount -{etb(lineDiscount)}</small></>}
              </td>
              <td>{item.quantity}</td>
              <td>{etb(shownUnitPrice)}</td>
              <td>
                {isGift
                  ? <><strong style={{ color: '#6A1B9A' }}>FREE GIFT — {etb(0)}</strong><br /><small>Value {etb(shownUnitPrice)}</small></>
                  : etb(item.totalPrice)}
              </td>
            </tr>
          )
        })}</tbody>
      </table>
      </section>

      <section className="receipt-section receipt-financial-section">
        <h3 className="receipt-section-title">Financial Summary</h3>
      <section className="receipt-summary">
        <div><span>Subtotal</span><strong>{etb(subtotal)}</strong></div>
        <div><span>Discount</span><strong>-{etb(discount)}</strong></div>
        {giftValue > 0 && <div><span>Free Gift value ({giftItems.length} line{giftItems.length === 1 ? '' : 's'})</span><strong>{etb(giftValue)} · charged {etb(0)}</strong></div>}
        <div><span>Taxable Amount</span><strong>{etb(taxableSubtotal)}</strong></div>
        <div><span>VAT ({Number(data.vatRate || 0)}%)</span><strong>{etb(vatAmount)}</strong></div>
        <div><span>Withholding ({Number(data.withholdingRate || 0)}%)</span><strong>{etb(data.withholdingAmount)}</strong></div>
        <div className="receipt-grand-total"><span>Total</span><strong>{etb(total)}</strong></div>
        {paidAmount != null && <div><span>Paid ({data.paymentMethod || 'CASH'})</span><strong>{etb(paidAmount)}</strong></div>}
        {changeAmount != null && <div><span>Change</span><strong>{etb(changeAmount)}</strong></div>}
      </section>
      </section>

      {(data.customerRegistrationNote || data.notes) && <section className="receipt-notes">{data.customerRegistrationNote && <p><strong>Customer note:</strong> {data.customerRegistrationNote}</p>}{data.notes && <p><strong>Notes:</strong> {data.notes}</p>}</section>}

      <footer className="receipt-footer"><p>{receiptFooter}</p><div className="receipt-signatures"><span>Customer Signature</span><span>Authorized Signature</span></div></footer>
    </article>
  )
}
