import { useEffect, useState, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api.js'
import { etb } from '../../lib/currency.js'
import { useSettings } from '../../contexts/SettingsContext.jsx'
import { useAuth } from '../../contexts/AuthContext.jsx'
import TinVerifier from '../../components/TinVerifier.jsx'
import Receipt from '../../components/Receipt.jsx'
import { availableForSize, inventoryAt, sizeStockSummary, sizeStockOf, sizeMlOf } from '../../lib/sizeStock.js'
import './admin-styles.css'

// Held sale ("SAVE DRAFT") lives ONLY on this device — never in the database.
const POS_DRAFT_KEY = 'lumier_pos_draft_v1'

// Product sections — same 3 categories as the Products page header
const SALE_SECTIONS = [
  { key: 'ALL', title: 'All' },
  { key: 'PURE_OIL', title: 'Pure Oil', sub: 'per gram' },
  { key: 'OIL', title: 'Oil', sub: 'per gram' },
  { key: 'PERFUME', title: 'Perfume', sub: '50/100ml' },
]

export default function NewSalePage() {
  const navigate = useNavigate()
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [locations, setLocations] = useState([])
  const [cart, setCart] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [selectedLocation, setSelectedLocation] = useState('')
  const [discount, setDiscount] = useState(0)
  // Sale-level discount is entered as % or fixed Birr (backend re-validates).
  const [discountType, setDiscountType] = useState('FIXED')
  // Cash tendered → change is computed from the authoritative server total.
  const [paidInput, setPaidInput] = useState('')
  // Free-gift picker, per-line discount editor, post-sale panel, held draft.
  const [showGiftPicker, setShowGiftPicker] = useState(false)
  const [editingLineKey, setEditingLineKey] = useState(null)
  const [lineDraft, setLineDraft] = useState({ type: 'FIXED', value: '' })
  const [completedSale, setCompletedSale] = useState(null)
  const [draftNotice, setDraftNotice] = useState('')
  const [notes, setNotes] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [salesChannel, setSalesChannel] = useState('DIRECT')
  const [customerRegistrationNote, setCustomerRegistrationNote] = useState('')
  const [showNewCustomer, setShowNewCustomer] = useState(false)
  const [newCustomer, setNewCustomer] = useState({ name: '', tinNumber: '', phone: '', email: '' })
  // eTrade TIN verification (official business license checker via our backend)
  const [tinLookup, setTinLookup] = useState('')
  const [verifiedTin, setVerifiedTin] = useState(null) // { tin, name } when verified
  const [newCustomerTinVerified, setNewCustomerTinVerified] = useState(null) // { tin, name } inside the Add-Customer modal
  const [searchTerm, setSearchTerm] = useState('')
  const [section, setSection] = useState('ALL')
  const [sizeChoice, setSizeChoice] = useState({})
  const [cardQty, setCardQty] = useState({})
  const [customerSearch, setCustomerSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [applyWithholding, setApplyWithholding] = useState(false)
  const searchRef = useRef(null)

  // Saved settings arrive through the shared SettingsContext (single fetch for
  // the whole app — no duplicate /api/settings call here) and stay live after
  // the Settings page saves.
  const { settingsMap } = useSettings()
  const taxConfig = useMemo(() => ({
    vatRegistered: settingsMap.ethiopia_vat_registered === 'true',
    vatRate: Number(settingsMap.ethiopia_vat_rate || 0),
    vatInclusive: settingsMap.ethiopia_vat_inclusive === 'true',
    withholdingEnabled: settingsMap.ethiopia_withholding_enabled === 'true',
    withholdingRate: Number(settingsMap.ethiopia_withholding_rate || 0)
  }), [settingsMap])
  // Payment methods + defaults come from Settings → Sales & POS. The fallback
  // list matches the methods the business flow has always supported.
  const paymentMethods = useMemo(() => {
    const raw = settingsMap.pos_payment_methods || 'CASH,BANK_TRANSFER,TELEBIRR,CARD,CREDIT'
    return raw.split(',').map((m) => m.trim()).filter(Boolean)
  }, [settingsMap.pos_payment_methods])
  const defaultPaymentMethod = settingsMap.pos_default_payment_method || 'CASH'

  // Free gifts are permission-gated server-side (sale:free_gift); the POS
  // mirrors the same session permission so cashiers see the truth immediately.
  const { hasPermission } = useAuth()
  const canIssueFreeGift = hasPermission('sale:free_gift')

  // Default selling location (Settings → Inventory → Default Location) applies
  // when nothing is selected yet and the saved id exists among locations.
  useEffect(() => {
    const saved = settingsMap.default_location
    if (!selectedLocation && saved && locations.some((l) => l.id === saved)) setSelectedLocation(saved)
  }, [settingsMap.default_location, locations, selectedLocation])

  useEffect(() => {
    loadData(); searchRef.current?.focus()
    // Offer to restore a held sale saved on this device (SAVE DRAFT).
    try { if (localStorage.getItem(POS_DRAFT_KEY)) setDraftNotice('A held sale (draft) was saved on this device.') } catch { /* storage unavailable */ }
  }, [])

  const loadData = async () => {
    try {
      const [c, p, l] = await Promise.all([
        api.get('/api/customers?limit=100'),
        api.get('/api/products?limit=200'),
        api.get('/api/locations?limit=100')
      ])
      setCustomers(c.data || []); setProducts(p.data || []); setLocations(l.data || [])
      if (l.data?.length === 1) setSelectedLocation(l.data[0].id)
    } catch (e) { setError('Failed to load: ' + e.message) }
  }

  // Sellable quantity for a bottle size. Perfumes stocked per size read the
  // matching 50ml / 100ml box; products without per-size stock (oils by gram,
  // legacy rows) keep using the per-location stock, or the product total when
  // the location has no stock record yet.
  const availableForSizeAt = (product, size, locationId = selectedLocation) =>
    availableForSize({ product, inventory: inventoryAt(product, locationId), size })

  const availableForLocation = (product, locationId = selectedLocation) =>
    availableForSize({ product, inventory: inventoryAt(product, locationId), size: null })

  // Size per bottle for perfumes (50ml / 100ml); null for gram products.
  // "50ml / 100ml" (both sizes) → cashier picks the bottle at sale time.
  const sizeOf = (p, chosen = sizeChoice[p.id]) => {
    if ((p.productType || 'PERFUME') !== 'PERFUME') return null
    const s = String(p.size || '').trim().toLowerCase()
    if (s.includes('50ml') && s.includes('100ml')) return chosen || '50ml'
    return (p.size || '').trim() || chosen || '50ml'
  }

  // Fixed single bottle size — blank when the perfume is sold in both sizes
  const fixedSizeOf = (p) => {
    if ((p.productType || 'PERFUME') !== 'PERFUME') return ''
    const s = String(p.size || '').trim().toLowerCase()
    if (s.includes('50ml') && s.includes('100ml')) return ''
    return String(p.size || '').trim()
  }

  // Sellable quantity for the bottle size actually being sold.  Size-tracked
  // perfumes use their matching box so the POS never over-sells a 100ml bottle
  // from the 50ml pool.
  const sellableFor = (product, chosenSize) => {
    if ((product.productType || 'PERFUME') === 'PERFUME' && chosenSize) {
      return availableForSizeAt(product, chosenSize)
    }
    return availableForLocation(product)
  }

  const addToCart = (product, size, qty = 1, isFreeGift = false) => {
    const chosenSize = sizeOf(product, size)
    const available = sellableFor(product, chosenSize)
    if (!available || available <= 0) { setError(`No available stock for ${product.name} at this location`); return }
    const isGram = (product.productType === 'OIL' || product.productType === 'PURE_OIL')
    // Paid and gift lines of the same product stay separate cart rows.
    const lineKey = `${product.id}::${chosenSize || ''}${isFreeGift ? '::GIFT' : ''}`
    const lineName = `${isFreeGift ? 'FREE GIFT — ' : ''}${isGram ? `${product.name} (${qty}g)` : chosenSize ? `${product.name} (${chosenSize})` : product.name}`
    const existing = cart.find(i => i.key === lineKey && !!i.isFreeGift === !!isFreeGift)
    if (existing) {
      const newQty = parseFloat((existing.quantity + qty).toFixed(2))
      if (newQty > available) { setError(`Only ${available} ${chosenSize || 'units'} available for ${lineName}`); return }
      setCart(cart.map(i => i.key === lineKey ? { ...i, quantity: newQty, available } : i))
      setError(`${lineName} added to cart`)
      return
    }
    const unitPrice = (chosenSize === '100ml' && product.price100ml != null) ? Number(product.price100ml) : Number(product.price)
    const addQty = Math.min(parseFloat(qty.toFixed(2)), available)
    setCart([...cart, {
      key: lineKey, productId: product.id, productName: product.name, size: isGram ? `${qty}g` : chosenSize,
      sku: product.sku, unitPrice, quantity: addQty, available, isGram,
      // Discount / free-gift attributes — the backend re-validates every one.
      isFreeGift, discountType: null, discountValue: 0
    }])
    setError(`${lineName} added to cart`)
  }

  const updateQty = (key, qty) => {
    const item = cart.find(i => i.key === key)
    const precision = item?.isGram ? 2 : 0
    const rounded = parseFloat(qty.toFixed(precision))
    const nextQty = Math.min(Math.max(0, rounded), item?.available || 0)
    if (rounded > nextQty) setError(`Only ${item.available} available for ${item.productName}`)
    if (nextQty === 0) setCart(cart.filter(i => i.key !== key))
    else setCart(cart.map(i => i.key === key ? { ...i, quantity: nextQty } : i))
  }

  const changeLocation = (locationId) => {
    setSelectedLocation(locationId)
    setCart(cart.map((item) => {
      const product = products.find((candidate) => candidate.id === item.productId)
      if (!product) return { ...item, available: 0 }
      const chosenSize = item.isGram ? null : item.size
      const available = sellableFor(product, chosenSize)
      return { ...item, available, quantity: Math.min(item.quantity, available) }
    }).filter((item) => item.quantity > 0))
  }
  const removeFromCart = (key) => setCart(cart.filter(i => i.key !== key))

  // ---------------------------------------------------------------------------
  // FREE GIFT / line-discount cart controls (backend re-validates on submit)
  // ---------------------------------------------------------------------------
  const toggleGift = (key) => {
    setCart(cart.map(i => i.key === key
      ? { ...i, isFreeGift: !i.isFreeGift, discountType: null, discountValue: 0 }
      : i))
    setEditingLineKey(null)
  }
  const openLineDiscount = (item) => {
    setEditingLineKey(item.key)
    setLineDraft({ type: item.discountType || 'FIXED', value: item.discountValue ? String(item.discountValue) : '' })
  }
  const applyLineDiscount = () => {
    const item = cart.find(i => i.key === editingLineKey)
    if (!item) { setEditingLineKey(null); return }
    if (item.isFreeGift) { setError('A FREE GIFT line cannot also carry a discount'); return }
    const gross = Math.round(item.unitPrice * item.quantity * 100) / 100
    if (lineDraft.value === '') { clearLineDiscount(item.key); return }
    const v = Number(lineDraft.value)
    if (!Number.isFinite(v) || v < 0) { setError('Discount must be a non-negative number'); return }
    if (lineDraft.type === 'PERCENTAGE' && v > 100) { setError('Discount percentage cannot exceed 100%'); return }
    if (lineDraft.type === 'FIXED' && v > gross) { setError(`Discount cannot exceed the line amount ${etb(gross)}`); return }
    setCart(cart.map(i => i.key === item.key ? { ...i, discountType: lineDraft.type, discountValue: v } : i))
    setEditingLineKey(null); setError('')
  }
  const clearLineDiscount = (key) => {
    setCart(cart.map(i => i.key === key ? { ...i, discountType: null, discountValue: 0 } : i))
    setEditingLineKey(null)
  }

  // ---------------------------------------------------------------------------
  // LIVE PREVIEW — the backend computes and persists the authoritative values.
  // Order: Subtotal → Discount → Taxable Amount → VAT → Grand Total → Paid →
  // Change. Discounts reduce the consideration BEFORE VAT (Proclamation
  // 1341/2024). Free gifts contribute 0 to revenue but keep their real value.
  // ---------------------------------------------------------------------------
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
  const lineGrossOf = (i) => r2(i.unitPrice * i.quantity)
  const lineDiscountOf = (i) => {
    if (i.isFreeGift) return 0
    const v = Number(i.discountValue || 0)
    if (!Number.isFinite(v) || v <= 0) return 0
    if (i.discountType === 'PERCENTAGE') return v > 100 ? 0 : r2(lineGrossOf(i) * v / 100)
    return r2(Math.min(v, lineGrossOf(i)))
  }
  // Product Price = gross of PAID lines only (gifts never enter revenue).
  const subtotal = r2(cart.filter(i => !i.isFreeGift).reduce((s, i) => s + lineGrossOf(i), 0))
  const itemDiscounts = r2(cart.reduce((s, i) => s + lineDiscountOf(i), 0))
  const giftValue = r2(cart.filter(i => i.isFreeGift).reduce((s, i) => s + lineGrossOf(i), 0))
  const giftUnits = cart.filter(i => i.isFreeGift).reduce((s, i) => s + i.quantity, 0)
  const discountEligible = r2(subtotal - itemDiscounts)
  // Sale-level discount: % of the post-item-discount base, or fixed Birr.
  const enteredDiscount = Number(discount)
  const rawSaleDiscount = Number.isFinite(enteredDiscount) && enteredDiscount > 0
    ? (discountType === 'PERCENTAGE'
      ? (enteredDiscount <= 100 ? r2(discountEligible * enteredDiscount / 100) : 0)
      : r2(enteredDiscount))
    : 0
  const saleDiscount = r2(Math.min(rawSaleDiscount, discountEligible))
  const totalDiscount = r2(itemDiscounts + saleDiscount)
  // Consideration after ALL discounts — VAT derives from this figure.
  const netSubtotal = r2(subtotal - totalDiscount)
  const vatAmount = r2(taxConfig.vatRegistered && taxConfig.vatRate > 0
    ? (taxConfig.vatInclusive ? netSubtotal - netSubtotal / (1 + taxConfig.vatRate / 100) : netSubtotal * taxConfig.vatRate / 100)
    : 0)
  // Taxable Amount = VAT base (inclusive mode → consideration minus extracted VAT).
  const taxableAmount = r2(taxConfig.vatInclusive ? netSubtotal - vatAmount : netSubtotal)
  const taxableSubtotal = taxableAmount
  const selectedCustomerObj = customers.find(c => c.id === selectedCustomer)
  const customerHasTin = !!(selectedCustomerObj?.tinNumber && selectedCustomerObj.tinNumber.trim().length > 0)
  // Withholding is a tax BREAKDOWN only — it must never reduce the amount due.
  const withholdingAmount = taxConfig.withholdingEnabled && applyWithholding && customerHasTin && taxConfig.withholdingRate > 0 ? taxableSubtotal * taxConfig.withholdingRate / 100 : 0
  const total = r2(taxConfig.vatInclusive ? netSubtotal : netSubtotal + vatAmount)
  // Paid / Change preview (server recomputes change from its own total).
  const paid = paidInput === '' ? null : (Number.isFinite(Number(paidInput)) && Number(paidInput) >= 0 ? r2(Number(paidInput)) : NaN)
  const change = paid == null || Number.isNaN(paid) ? paid : r2(Math.max(0, paid - total))

  const handleSubmit = () => {
    setError('')
    if (!selectedLocation) { setError('Select a location'); return }
    if (!cart.length) { setError('Cart is empty'); return }
    if (total < 0) { setError('Total cannot be negative'); return }
    // Discount inputs must be numbers in range (backend enforces the same rules).
    const dv = Number(discount)
    if (discount !== '' && (!Number.isFinite(dv) || dv < 0)) { setError('Discount must be a non-negative number'); return }
    if (discountType === 'PERCENTAGE' && dv > 100) { setError('Discount percentage cannot exceed 100%'); return }
    if (discountType === 'FIXED' && dv > discountEligible + 0.001) { setError(`Discount cannot exceed the eligible amount ${etb(discountEligible)}`); return }
    // Paid must be a non-negative number when provided.
    if (paidInput !== '' && (paid == null || Number.isNaN(paid))) { setError('Paid amount must be a non-negative number'); return }
    // Free gifts are permission-gated — mirror the server check up-front.
    if (giftUnits > 0 && !canIssueFreeGift) { setError("Free gifts require the 'sale:free_gift' permission — ask a manager to grant it in Settings → Account Roles."); return }
    for (const i of cart) {
      const available = i.isGram ? i.available : (i.size ? (i.available ? i.available : 0) : i.available)
      if (i.quantity > available) { setError(`Insufficient stock: ${i.productName} — ${i.size ? i.size : 'each'}`); return }
    }
    setShowConfirm(true)
  }

  const confirmSale = async () => {
    setLoading(true); setError('')
    try {
      const payload = {
        customerId: selectedCustomer || null,
        locationId: selectedLocation,
        saleType: 'DIRECT',
        // Sale-level discount (type + entered value) — backend recalculates.
        discount: Number(discount) || 0,
        discountType: Number(discount) > 0 ? discountType : null,
        discountValue: Number(discount) || 0,
        // Cash tendered — the server derives change from its own total.
        paidAmount: paidInput === '' ? null : Number(paidInput),
        notes,
        paymentMethod: paymentMethod || defaultPaymentMethod,
        salesChannel,
        customerRegistrationNote,
        applyWithholding,
        ...(verifiedTin ? { customerTin: verifiedTin.tin } : {}),
        items: cart.map(i => ({
          productId: i.productId,
          productName: i.productName,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          ...(i.size ? { size: i.size } : {}),
          // Line discount / free-gift flags (backend is authoritative)
          discountType: (!i.isFreeGift && i.discountValue) ? i.discountType : null,
          discountValue: (!i.isFreeGift && i.discountValue) ? i.discountValue : 0,
          isFreeGift: !!i.isFreeGift,
          itemType: i.isFreeGift ? 'FREE_GIFT' : (i.discountValue ? 'DISCOUNTED' : 'NORMAL')
        }))
      }
      const res = await api.post('/api/sales', payload)
      setShowConfirm(false)
      // Post-sale panel: PRINT RECEIPT / View Sale / New Sale. The existing
      // Sale detail page (View Sale) still carries the full receipt flow.
      setCompletedSale(res.data)
      localStorage.removeItem(POS_DRAFT_KEY)
      setDraftNotice('')
    } catch (e) { setError(e.message); setShowConfirm(false) }
    setLoading(false)
  }

  // ---------------------------------------------------------------------------
  // SAVE DRAFT — held locally on this device only (no database records, so
  // reports/inventory are untouched until the cashier completes the sale).
  // ---------------------------------------------------------------------------
  const saveDraft = () => {
    if (!cart.length) { setError('Cart is empty — nothing to hold'); return }
    try {
      localStorage.setItem(POS_DRAFT_KEY, JSON.stringify({
        cart, selectedCustomer, selectedLocation, discount, discountType,
        paidInput, notes, paymentMethod, salesChannel, customerRegistrationNote,
        savedAt: new Date().toISOString()
      }))
      setError('Held sale saved on this device')
    } catch { setError('Could not save the held sale (device storage unavailable)') }
  }
  const restoreDraft = () => {
    try {
      const raw = localStorage.getItem(POS_DRAFT_KEY)
      if (!raw) { setDraftNotice(''); return }
      const d = JSON.parse(raw)
      if (Array.isArray(d.cart)) setCart(d.cart)
      setSelectedCustomer(d.selectedCustomer || '')
      if (d.selectedLocation) setSelectedLocation(d.selectedLocation)
      setDiscount(Number(d.discount) || 0)
      setDiscountType(d.discountType || 'FIXED')
      setPaidInput(d.paidInput ?? '')
      setNotes(d.notes || '')
      setPaymentMethod(d.paymentMethod || '')
      setSalesChannel(d.salesChannel || 'DIRECT')
      setCustomerRegistrationNote(d.customerRegistrationNote || '')
      localStorage.removeItem(POS_DRAFT_KEY)
      setDraftNotice('')
      setError('Held sale restored')
    } catch { setError('Could not restore the held sale') }
  }
  const discardDraft = () => {
    try { localStorage.removeItem(POS_DRAFT_KEY) } catch { /* ignore */ }
    setDraftNotice('')
  }
  const resetSaleState = () => {
    setCart([]); setDiscount(0); setDiscountType('FIXED'); setPaidInput('')
    setNotes(''); setCustomerRegistrationNote(''); setApplyWithholding(false)
    setVerifiedTin(null); setTinLookup(''); setSelectedCustomer('')
    setCompletedSale(null); setEditingLineKey(null); setError('')
  }

  const createNewCustomer = async () => {
    if (!newCustomer.name.trim()) { setError('Customer name is required'); return }
    try {
      const response = await api.post('/api/customers', { ...newCustomer, email: newCustomer.email || undefined })
      setCustomers((current) => [response.data, ...current])
      setSelectedCustomer(response.data.id)
      setShowNewCustomer(false)
      setNewCustomer({ name: '', tinNumber: '', phone: '', email: '' })
      setNewCustomerTinVerified(null)
      setTinLookup('')
      setVerifiedTin(null)
      setError('Customer added and selected')
    } catch (e) { setError(e.message) }
  }

  // eTrade verification finished for the TIN typed in the Customer card
  const handleTinVerified = (result) => {
    if (!result || !result.verified) {
      setVerifiedTin(null)
      if (result && result.message) setError(result.message)
      return
    }
    setVerifiedTin({ tin: result.tin, name: result.name })
    if (result.existingCustomer) {
      // Same TIN already saved — select it instead of creating a duplicate
      setSelectedCustomer(result.existingCustomer.id)
      setError(`TIN matches existing customer ${result.existingCustomer.customerCode} (${result.existingCustomer.name}) — selected ✓`)
    } else {
      setError(`✓ TIN Verified: ${result.name}. Use "Add as New Customer" to save it, or complete the sale as walk-in.`)
    }
  }

  // Prefill the Add New Customer modal with the government-verified name/TIN
  const openNewCustomerFromTin = () => {
    if (!verifiedTin) return
    setNewCustomer({ name: verifiedTin.name || '', tinNumber: verifiedTin.tin, phone: '', email: '' })
    setNewCustomerTinVerified(verifiedTin)
    setShowNewCustomer(true)
  }

  // Inside the Add-Customer modal: auto-fill the registered name on success
  const handleNewCustomerTinResult = (result) => {
    if (result && result.verified) {
      setNewCustomer((current) => ({ ...current, tinNumber: result.tin, name: result.name || current.name }))
      setNewCustomerTinVerified({ tin: result.tin, name: result.name })
      setError(`✓ TIN Verified: ${result.name}`)
    } else if (result && result.message) {
      setNewCustomerTinVerified(null)
      setError(result.message)
    } else {
      setNewCustomerTinVerified(null)
    }
  }

  const fp = products.filter(p => {
    if (section !== 'ALL' && (p.productType || 'PERFUME') !== section) return false
    if (!searchTerm) return true
    const t = searchTerm.toLowerCase()
    return p.name?.toLowerCase().includes(t) || p.sku?.toLowerCase().includes(t)
  })
  const fc = customers.filter(c => { if (!customerSearch) return true; const t = customerSearch.toLowerCase(); return c.name?.toLowerCase().includes(t) || c.phone?.includes(t) || c.tinNumber?.toLowerCase().includes(t) })

  return (
    <div className="dashboard-container">
      <div className="page-header-row">
        <div><h2 className="page-title">New Sale — Direct Sale</h2><p className="page-subtitle">Point of Sale · customer → products → cart → complete</p></div>
        <div className="header-actions"><button className="btn btn-secondary" onClick={() => navigate('/admin/sales')}>Back</button></div>
      </div>
      {error && <div className="error-text" style={{ marginBottom: '1rem', padding: '0.75rem', background: '#FFEBEE', borderRadius: '6px' }}>{error}</div>}
      {draftNotice && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#FFF8E1', border: '1px solid #FFECB3', borderRadius: '6px', fontSize: '0.85rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span style={{ flex: 1 }}>{draftNotice}</span>
          <button className="btn btn-secondary" style={{ padding: '0.3rem 0.7rem', fontSize: '0.75rem' }} onClick={restoreDraft}>Restore</button>
          <button className="btn btn-secondary" style={{ padding: '0.3rem 0.7rem', fontSize: '0.75rem' }} onClick={discardDraft}>Discard</button>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.5rem', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card">
            <input ref={searchRef} type="text" placeholder="Search products (name / code / barcode)..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ width: '100%', padding: '0.75rem', border: '1px solid #e8e8e8', borderRadius: '8px', fontSize: '0.9rem' }} />
            {canIssueFreeGift && (
              <button type="button" className="btn btn-secondary" onClick={() => setShowGiftPicker(true)} style={{ width: '100%', marginTop: '0.5rem' }}>
                🎁 Add Free Gift…
              </button>
            )}
          </div>
          <div className="section-tabs compact" role="tablist" aria-label="Product sections">
            {SALE_SECTIONS.map((s) => (
              <button key={s.key} type="button" role="tab" aria-selected={section === s.key} className={`section-tab ${section === s.key ? 'active' : ''}`} onClick={() => setSection(s.key)}>
                <span className="section-tab-title">{s.title}</span>
                {s.sub && <span className="section-tab-sub">{s.sub}</span>}
              </button>
            ))}
          </div>
          <div className="product-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
            {fp.map(p => {
              const isGram = (p.productType || 'PERFUME') !== 'PERFUME'
              const chosenSize = sizeOf(p)
              return (
                <div key={p.id} className="product-card" onClick={() => addToCart(p, chosenSize)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addToCart(p, chosenSize) } }} role="button" tabIndex={0} aria-label={`Add ${p.name} to cart`} style={{ cursor: 'pointer' }}>
                  <div className="product-image">{p.images?.[0]?.imageUrl ? <img src={p.images[0].imageUrl} alt="" className="product-img" /> : <span className="product-placeholder">🧴</span>}</div>
                  <span style={{ fontSize: '0.62rem', color: '#9a9a9a', alignSelf: 'flex-start', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.sku}{fixedSizeOf(p) ? ` · ${fixedSizeOf(p)}` : ''}{p.brand?.name ? ` · ${p.brand.name}` : ''}</span>
                  <span className="product-name">{p.name}</span>
                  {isGram ? (
                    <span style={{ fontSize: '0.62rem', fontWeight: 600, color: '#6b7280', alignSelf: 'flex-start', border: '1px solid #e8e8e8', borderRadius: 999, padding: '0.1rem 0.45rem' }}>per gram</span>
                  ) : fixedSizeOf(p) ? (
                    <span style={{ fontSize: '0.62rem', fontWeight: 600, color: '#1a1a2e', alignSelf: 'flex-start', background: '#f3f4f6', border: '1px solid #e8e8e8', borderRadius: 999, padding: '0.1rem 0.45rem' }}>{fixedSizeOf(p)}</span>
                  ) : (
                    <div style={{ display: 'flex', gap: '0.25rem', alignSelf: 'flex-start' }} role="group" aria-label="Choose bottle size">
                      {['50ml', '100ml'].map((s) => (
                        <button key={s} type="button" onClick={(e) => { e.stopPropagation(); setSizeChoice((prev) => ({ ...prev, [p.id]: s })) }}
                          aria-pressed={chosenSize === s}
                          style={{ fontSize: '0.62rem', fontWeight: 600, padding: '0.1rem 0.45rem', borderRadius: 999, cursor: 'pointer', border: '1px solid ' + (chosenSize === s ? '#1a1a2e' : '#e8e8e8'), background: chosenSize === s ? '#1a1a2e' : '#fff', color: chosenSize === s ? '#fff' : '#555' }}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  <span className="product-price">{isGram ? `${etb(p.price)}/g` : (chosenSize === '100ml' && p.price100ml != null) ? `${etb(p.price100ml)} · 100ml` : `${etb(p.price)} · ${chosenSize}`}</span>
                  <span style={{ fontSize: '0.65rem', color: availableForLocation(p) > 0 ? '#2E7D32' : '#C62828' }}>Stock: {availableForLocation(p)}{isGram ? ' g' : ''}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', width: '100%', marginTop: '0.5rem' }}>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setCardQty((q) => ({ ...q, [p.id]: isGram ? Math.max(0.5, parseFloat(((q[p.id] || 1) - 0.5).toFixed(2))) : Math.max(1, (q[p.id] || 1) - 1) })) }} style={{ width: '32px', height: '28px', border: '1px solid #e8e8e8', borderRadius: '4px', background: '#fff', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>−</button>
                    <input type="number" value={cardQty[p.id] || 1} onChange={(e) => { e.stopPropagation(); const raw = isGram ? parseFloat(e.target.value) : parseInt(e.target.value); const v = isGram ? Math.max(0.5, parseFloat((raw || 0.5).toFixed(2))) : Math.max(1, raw || 1); setCardQty((q) => ({ ...q, [p.id]: v })) }} onClick={(e) => e.stopPropagation()} style={{ width: '44px', textAlign: 'center', padding: '0.2rem', border: '1px solid #e8e8e8', borderRadius: '4px', fontSize: '0.75rem' }} min={isGram ? '0.5' : '1'} step={isGram ? '0.5' : '1'} />
                    <button type="button" onClick={(e) => { e.stopPropagation(); setCardQty((q) => ({ ...q, [p.id]: isGram ? parseFloat(((q[p.id] || 1) + 0.5).toFixed(2)) : (q[p.id] || 1) + 1 })) }} style={{ width: '32px', height: '28px', border: '1px solid #e8e8e8', borderRadius: '4px', background: '#fff', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>+</button>
                    <button type="button" className="btn btn-primary" onClick={(e) => { e.stopPropagation(); addToCart(p, chosenSize, cardQty[p.id] || 1); setCardQty((q) => ({ ...q, [p.id]: 1 })) }} disabled={!availableForLocation(p)} style={{ flex: 1, padding: '0.35rem', fontSize: '0.7rem', marginLeft: 'auto' }}>Add</button>
                  </div>
                </div>
              )
            })}
            {!fp.length && <p className="empty-text">No products in this section.</p>}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card">
            <h3 className="card-title">Customer</h3>
            <button type="button" className="btn btn-secondary" onClick={() => setShowNewCustomer(true)} style={{ width: '100%', marginBottom: '0.5rem' }}>+ Add New Customer</button>
            <select value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)} style={{ width: '100%', padding: '0.5rem', border: '1px solid #e8e8e8', borderRadius: '6px' }}>
              <option value="">Walk-in Customer</option>
              {fc.map(c => <option key={c.id} value={c.id}>{c.name}{c.tinNumber ? ` (${c.tinNumber})` : ''}{c.tinVerified ? ' ✓' : ''}</option>)}
            </select>
            <input type="text" placeholder="Search customer..." value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} style={{ width: '100%', padding: '0.5rem', border: '1px solid #e8e8e8', borderRadius: '6px', marginTop: '0.5rem' }} />
            {selectedCustomerObj?.tinVerified && (
              <div style={{ marginTop: '0.5rem', padding: '0.45rem 0.6rem', background: '#E8F5E9', border: '1px solid #C8E6C9', borderRadius: '6px', fontSize: '0.8rem', color: '#2E7D32' }}>
                ✓ TIN Verified — eTrade{selectedCustomerObj.tinNumber ? ` · ${selectedCustomerObj.tinNumber}` : ''}
              </div>
            )}
            <div style={{ marginTop: '0.75rem', borderTop: '1px solid #e8e8e8', paddingTop: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.35rem' }}>Customer TIN — verify with eTrade</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={13}
                placeholder="Enter 10-digit TIN (e.g. 0092183201)"
                value={tinLookup}
                onChange={e => setTinLookup(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #e8e8e8', borderRadius: '6px' }}
              />
              <div style={{ marginTop: '0.5rem' }}>
                <TinVerifier tin={tinLookup} onResult={handleTinVerified} disabled={loading} />
              </div>
              {verifiedTin && !customers.some(c => c.tinNumber === verifiedTin.tin) && (
                <button type="button" className="btn btn-secondary" onClick={openNewCustomerFromTin} style={{ width: '100%', marginTop: '0.5rem' }}>
                  + Add “{verifiedTin.name}” as New Customer
                </button>
              )}
            </div>
          </div>
          <div className="card">
            <h3 className="card-title">Location</h3>
            <select value={selectedLocation} onChange={e => changeLocation(e.target.value)} style={{ width: '100%', padding: '0.5rem', border: '1px solid #e8e8e8', borderRadius: '6px' }}>
              <option value="">Select Location</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="card">
            <h3 className="card-title">Sale Details</h3>
            <div className="form-field"><label>Sales Section</label><select value={salesChannel} onChange={e => setSalesChannel(e.target.value)}><option value="DIRECT">Direct Sales</option><option value="YETESAFEBET">Yetesafebet</option><option value="YALETETAFEBET">Yaletetafebet</option></select></div>
            <div className="form-field"><label>Payment Method</label><select value={paymentMethod || defaultPaymentMethod} onChange={e => setPaymentMethod(e.target.value)}>{paymentMethods.map((m) => <option key={m} value={m}>{m.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}</option>)}</select></div>
            <div className="form-field"><label>Customer / Registration Note</label><input value={customerRegistrationNote} onChange={e => setCustomerRegistrationNote(e.target.value)} /></div>
          </div>
          <CartPanel cart={cart} updateQty={updateQty} removeFromCart={removeFromCart} editingLineKey={editingLineKey} lineDraft={lineDraft} setLineDraft={setLineDraft} onOpenDiscount={openLineDiscount} onApplyDiscount={applyLineDiscount} onClearDiscount={clearLineDiscount} onToggleGift={toggleGift} canGift={canIssueFreeGift} />
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}><span>Subtotal</span><span>{etb(subtotal)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                Discount
                <select value={discountType} onChange={e => setDiscountType(e.target.value)} style={{ padding: '0.15rem', border: '1px solid #e8e8e8', borderRadius: '6px', fontSize: '0.72rem' }}>
                  <option value="FIXED">Br</option>
                  <option value="PERCENTAGE">%</option>
                </select>
              </span>
              <input type="number" value={discount} onChange={e => setDiscount(e.target.value)} style={{ width: '100px', padding: '0.4rem', border: '1px solid #e8e8e8', borderRadius: '6px', textAlign: 'right' }} min="0" step="0.01" placeholder={discountType === 'PERCENTAGE' ? '0-100' : '0.00'} />
            </div>
            {itemDiscounts > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.78rem', color: '#C62828' }}>
                <span>· item-level discounts</span><span>-{etb(itemDiscounts)}</span>
              </div>
            )}
             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', color: '#C62828' }}><span>Discount amount</span><span>-{etb(totalDiscount)}</span></div>
            {giftValue > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.78rem', color: '#6A1B9A' }}>
                <span>🎁 Free Gift value ({giftUnits} item{giftUnits === 1 ? '': 's'}) — not charged</span><span>{etb(giftValue)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}><span>Taxable Amount</span><span>{etb(taxableAmount)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}><span>VAT ({taxConfig.vatRate}%):</span><span>{etb(vatAmount)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}><span>Withholding ({taxConfig.withholdingRate}%):</span><span>{etb(withholdingAmount)}</span></div>
            {taxConfig.withholdingEnabled && taxConfig.withholdingRate > 0 && <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', padding: '0.6rem 0.75rem', background: applyWithholding ? '#E8F5E9' : '#FFF8E1', borderRadius: '6px', border: '1px solid ' + (applyWithholding ? '#C8E6C9' : '#FFECB3') }}>
              <input type="checkbox" id="withholding-tick" checked={applyWithholding} onChange={e => setApplyWithholding(e.target.checked)} disabled={!customerHasTin} style={{ width: '16px', height: '16px', cursor: customerHasTin ? 'pointer' : 'not-allowed', accentColor: '#1565C0' }} />
              <label htmlFor="withholding-tick" style={{ fontSize: '0.8rem', fontWeight: 500, color: customerHasTin ? '#2E7D32' : '#9E9E9E' }}>
                {customerHasTin ? (applyWithholding ? `Withholding (${taxConfig.withholdingRate}%) — ${etb(withholdingAmount)} tax breakdown (does not reduce the Total)` : `Withholding (${taxConfig.withholdingRate}%) — not applied to this sale`) : 'Customer has no TIN — withholding cannot be applied'}
              </label>
            </div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: 600, borderTop: '1px solid #e8e8e8', paddingTop: '0.5rem' }}><span>Total</span><span>{etb(total)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.6rem', marginBottom: '0.5rem' }}>
              <span>Paid</span>
              <input type="number" value={paidInput} onChange={e => setPaidInput(e.target.value)} style={{ width: '110px', padding: '0.4rem', border: '1px solid #e8e8e8', borderRadius: '6px', textAlign: 'right' }} min="0" step="0.01" placeholder="0.00" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span>Change</span>
              <span style={{ fontWeight: 600, color: (change != null && !Number.isNaN(change) && change > 0) ? '#2E7D32' : 'inherit' }}>{change == null || Number.isNaN(change) ? etb(0) : etb(change)}</span>
            </div>
            <textarea placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} style={{ width: '100%', padding: '0.5rem', border: '1px solid #e8e8e8', borderRadius: '6px', marginTop: '0.75rem', minHeight: '60px', resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button className="btn btn-secondary" onClick={saveDraft} style={{ flex: 1, padding: '0.75rem' }}>SAVE DRAFT</button>
              <button className="btn btn-primary" onClick={handleSubmit} style={{ flex: 2, padding: '0.75rem', fontSize: '1rem' }}>COMPLETE SALE</button>
            </div>
          </div>
        </div>
      </div>
      {showConfirm && <ConfirmModal customers={customers} selectedCustomer={selectedCustomer} verifiedTin={verifiedTin} locations={locations} selectedLocation={selectedLocation} cart={cart} total={total} taxConfig={taxConfig} totalDiscount={totalDiscount} taxableAmount={taxableAmount} vatAmount={vatAmount} loading={loading} onBack={() => setShowConfirm(false)} onConfirm={confirmSale} />}
      {completedSale && (
        <SaleCompletedPanel
          sale={completedSale}
          onNew={resetSaleState}
          onView={() => navigate('/admin/sales/' + completedSale.id)}
        />
      )}
      {showGiftPicker && (
        <GiftPickerModal
          products={products}
          sizeOf={sizeOf}
          onClose={() => setShowGiftPicker(false)}
          onPick={(p, size, quantity) => { addToCart(p, size, quantity, true); setShowGiftPicker(false) }}
        />
      )}
      {showNewCustomer && <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="card" style={{ width: 'min(92vw, 460px)' }}>
          <h3 className="card-title">Add New Customer</h3>
          <div className="form-grid">
            <div className="form-field full-width"><label>Name *</label><input value={newCustomer.name} onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })} /></div>
            <div className="form-field full-width">
              <label>TIN{newCustomerTinVerified ? ' ✓ Verified (eTrade)' : ''}</label>
              <input value={newCustomer.tinNumber} onChange={e => setNewCustomer({ ...newCustomer, tinNumber: e.target.value })} />
              <div style={{ marginTop: '0.5rem' }}>
                <TinVerifier tin={newCustomer.tinNumber} onResult={handleNewCustomerTinResult} autoVerify={false} />
              </div>
              {newCustomerTinVerified && <div style={{ marginTop: '0.35rem', fontSize: '0.78rem', color: '#2E7D32' }}>✓ TIN Verified — {newCustomerTinVerified.name}</div>}
            </div>
            <div className="form-field"><label>Phone</label><input value={newCustomer.phone} onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })} /></div>
            <div className="form-field full-width"><label>Email</label><input type="email" value={newCustomer.email} onChange={e => setNewCustomer({ ...newCustomer, email: e.target.value })} /></div>
          </div>
          <div className="form-actions"><button type="button" className="btn-cancel" onClick={() => { setShowNewCustomer(false); setNewCustomerTinVerified(null) }}>Cancel</button><button type="button" className="btn-save" onClick={createNewCustomer}>Save Customer</button></div>
        </div>
      </div>}

      {/* Post-sale: complete → PRINT RECEIPT / View Sale / New Sale */}
    </div>
  )
}

/**
 * Success panel shown right after a Direct Sale completes. PRINT RECEIPT
 * renders the standard LUMIER receipt from the server's authoritative response.
 */
function SaleCompletedPanel({ sale, onNew, onView }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', maxWidth: '760px', width: '94%', maxHeight: '92vh', overflowY: 'auto' }}>
        <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '1.5rem', marginBottom: '0.35rem' }}>✓ Sale Complete — {sale.saleNumber}</h3>
        <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', fontSize: '0.88rem', marginBottom: '0.75rem' }}>
          <span><strong>Total:</strong> {etb(sale.total)}</span>
          {sale.taxableAmount != null && <span><strong>Taxable:</strong> {etb(sale.taxableAmount)}</span>}
          {Number(sale.vatAmount) > 0 && <span><strong>VAT:</strong> {etb(sale.vatAmount)}</span>}
          {sale.paidAmount != null && <span><strong>Paid:</strong> {etb(sale.paidAmount)}</span>}
          {sale.changeAmount != null && <span><strong>Change:</strong> {etb(sale.changeAmount)}</span>}
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.9rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => window.print()}>PRINT RECEIPT</button>
          <button className="btn btn-secondary" onClick={onView}>View Sale</button>
          <button className="btn btn-secondary" onClick={onNew}>New Sale</button>
        </div>
        <div style={{ background: '#f9f9f7', borderRadius: '8px', padding: '1rem', maxHeight: '46vh', overflowY: 'auto' }}>
          <Receipt data={sale} />
        </div>
      </div>
    </div>
  )
}

/**
 * Free-gift product picker — choose an in-stock product (existing inventory)
 * to hand over as a FREE GIFT. The product's real price stays untouched.
 */
function GiftPickerModal({ products, sizeOf, onClose, onPick }) {
  const [q, setQ] = useState('')
  const [quantities, setQuantities] = useState({})
  const list = products.filter(p => {
    const t = q.toLowerCase()
    return !q || p.name?.toLowerCase().includes(t) || p.sku?.toLowerCase().includes(t)
  }).slice(0, 50)
  const isBothSizes = (p) => {
    const s = String(p.size || '').toLowerCase()
    return (p.productType || 'PERFUME') === 'PERFUME' && s.includes('50ml') && s.includes('100ml')
  }
  const isGram = (p) => p.productType === 'OIL' || p.productType === 'PURE_OIL'
  const quantityFor = (p) => {
    const value = Number(quantities[p.id] ?? 1)
    return Number.isFinite(value) && value > 0 ? value : 1
  }
  const pick = (p, size) => onPick(p, size, quantityFor(p))
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', maxWidth: '650px', width: '92%', maxHeight: '82vh', overflowY: 'auto' }}>
        <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '1.4rem', marginBottom: '0.4rem' }}>Add Free Gift 🎁</h3>
        <p style={{ fontSize: '0.76rem', color: '#7a7a7a', marginBottom: '0.75rem' }}>
          Each gift is displayed as <strong>FREE GIFT — Br 0.00</strong>. Its real price stays on the product record
          and stock is reduced with a FREE_GIFT movement.
        </p>
        <input autoFocus type="text" placeholder="Search inventory (name / code)..." value={q} onChange={(e) => setQ(e.target.value)} style={{ width: '100%', padding: '0.65rem', border: '1px solid #e8e8e8', borderRadius: '8px', marginBottom: '0.75rem' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {list.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', background: '#fafafa', borderRadius: '6px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                <div style={{ fontSize: '0.7rem', color: '#9a9a9a' }}>
                  {p.sku}{p.price != null ? ` · ${etb(p.price)}` : ''}{p.price100ml != null ? ` · 100ml ${etb(p.price100ml)}` : ''}
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', color: '#666' }}>
                Qty
                <input
                  type="number"
                  min={isGram(p) ? '0.5' : '1'}
                  step={isGram(p) ? '0.5' : '1'}
                  value={quantities[p.id] ?? 1}
                  onChange={(e) => setQuantities((current) => ({ ...current, [p.id]: e.target.value }))}
                  style={{ width: '58px', padding: '0.25rem', border: '1px solid #e8e8e8', borderRadius: '4px' }}
                />
              </label>
              {isBothSizes(p)
                ? (
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <button className="btn btn-secondary" style={{ fontSize: '0.7rem', padding: '0.3rem 0.5rem' }} onClick={() => pick(p, '50ml')}>Gift 50ml</button>
                    <button className="btn btn-secondary" style={{ fontSize: '0.7rem', padding: '0.3rem 0.5rem' }} onClick={() => pick(p, '100ml')}>Gift 100ml</button>
                  </div>
                )
                : <button className="btn btn-primary" style={{ fontSize: '0.7rem', padding: '0.3rem 0.7rem', whiteSpace: 'nowrap' }} onClick={() => pick(p, sizeOf(p))}>Add Gift</button>}
            </div>
          ))}
          {!list.length && <p className="empty-text">No products match.</p>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

function CartPanel({ cart, updateQty, removeFromCart, editingLineKey, lineDraft, setLineDraft, onOpenDiscount, onApplyDiscount, onClearDiscount, onToggleGift, canGift }) {
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
  const grossOf = (i) => r2(i.unitPrice * i.quantity)
  const discountOf = (i) => {
    if (i.isFreeGift) return 0
    const v = Number(i.discountValue || 0)
    if (!Number.isFinite(v) || v <= 0) return 0
    if (i.discountType === 'PERCENTAGE') return v > 100 ? 0 : r2(grossOf(i) * v / 100)
    return r2(Math.min(v, grossOf(i)))
  }
  const tinyBtn = { width: '26px', height: '26px', border: '1px solid #e8e8e8', borderRadius: '4px', background: '#fff', cursor: 'pointer', fontSize: '0.75rem', lineHeight: 1 }
  return (
    <div className="card">
      <h3 className="card-title">Cart ({cart.length}) — Qty · Discount · Amount · Type</h3>
      {!cart.length ? <p className="empty-text">No items yet.</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '340px', overflowY: 'auto' }}>
          {cart.map(i => {
            const lineDiscount = discountOf(i)
            const charged = i.isFreeGift ? 0 : r2(grossOf(i) - lineDiscount)
            return (
              <div key={i.key} style={{ padding: '0.5rem', background: i.isFreeGift ? '#F3E5F5' : '#fafafa', border: i.isFreeGift ? '1px dashed #8E24AA' : '1px solid transparent', borderRadius: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.productName}</span>
                      {i.isFreeGift && <span style={{ fontSize: '0.58rem', fontWeight: 800, color: '#fff', background: '#8E24AA', borderRadius: '4px', padding: '0.05rem 0.35rem', whiteSpace: 'nowrap' }}>FREE GIFT</span>}
                      {!i.isFreeGift && lineDiscount > 0 && <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#C62828', whiteSpace: 'nowrap' }}>-{etb(lineDiscount)}</span>}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#9a9a9a' }}>{etb(i.unitPrice)}{i.isGram ? ' /g' : (i.size ? ` /${i.size}` : ' each')}{i.isFreeGift ? ` · value ${etb(grossOf(i))}` : ''}</div>
                  </div>
                  <button onClick={() => updateQty(i.key, i.isGram ? parseFloat((i.quantity - 0.5).toFixed(2)) : i.quantity - 1)} style={{ width: '24px', height: '24px', border: '1px solid #e8e8e8', borderRadius: '4px', background: '#fff', cursor: 'pointer' }}>-</button>
                  <input type="number" value={i.quantity} onChange={e => { const raw = i.isGram ? parseFloat(e.target.value) : parseInt(e.target.value); updateQty(i.key, isNaN(raw) ? 0 : raw) }} step={i.isGram ? '0.5' : '1'} min={i.isGram ? '0.5' : '1'} style={{ width: '44px', textAlign: 'center', padding: '0.25rem', border: '1px solid #e8e8e8', borderRadius: '4px' }} />
                  <button onClick={() => updateQty(i.key, i.isGram ? parseFloat((i.quantity + 0.5).toFixed(2)) : i.quantity + 1)} disabled={i.quantity >= i.available} style={{ width: '24px', height: '24px', border: '1px solid #e8e8e8', borderRadius: '4px', background: '#fff', cursor: i.quantity >= i.available ? 'not-allowed' : 'pointer', opacity: i.quantity >= i.available ? 0.45 : 1 }}>+</button>
                  <div style={{ fontWeight: 600, fontSize: '0.8rem', minWidth: '84px', textAlign: 'right' }}>
                    {i.isFreeGift
                      ? <span style={{ color: '#8E24AA', fontWeight: 800 }}>FREE GIFT — {etb(0)}</span>
                      : <>{etb(charged)}{i.isGram ? ` (${i.quantity}g)` : (i.size ? ` ×${i.size}` : '')}</>}
                  </div>
                  <button title="Line discount" onClick={() => onOpenDiscount(i)} disabled={i.isFreeGift} style={{ ...tinyBtn, cursor: i.isFreeGift ? 'not-allowed' : 'pointer', opacity: i.isFreeGift ? 0.4 : 1, fontWeight: 700 }}>-Br</button>
                  <button title={i.isFreeGift ? 'Remove FREE GIFT flag' : (canGift ? 'Mark as FREE GIFT' : 'Needs sale:free_gift')} onClick={() => onToggleGift(i.key)} disabled={!i.isFreeGift && !canGift} style={{ ...tinyBtn, cursor: (!i.isFreeGift && !canGift) ? 'not-allowed' : 'pointer', opacity: (!i.isFreeGift && !canGift) ? 0.4 : 1 }}>🎁</button>
                  <button title="Remove" onClick={() => removeFromCart(i.key)} style={{ background: 'none', border: 'none', color: '#c62828', cursor: 'pointer', fontSize: '1rem' }}>×</button>
                </div>
                {editingLineKey === i.key && (
                  <LineDiscountEditor item={i} gross={grossOf(i)} lineDraft={lineDraft} setLineDraft={setLineDraft} onApply={onApplyDiscount} onClear={() => onClearDiscount(i.key)} />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Inline % / Br discount editor for one cart line (item-level discount). */
function LineDiscountEditor({ item, gross, lineDraft, setLineDraft, onApply, onClear }) {
  return (
    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.45rem', alignItems: 'center', fontSize: '0.75rem', flexWrap: 'wrap' }}>
      <span style={{ fontWeight: 600 }}>Line discount:</span>
      <select value={lineDraft.type} onChange={e => setLineDraft({ ...lineDraft, type: e.target.value })} style={{ padding: '0.2rem', border: '1px solid #e8e8e8', borderRadius: '4px' }}>
        <option value="FIXED">Br</option>
        <option value="PERCENTAGE">%</option>
      </select>
      <input type="number" min="0" step="0.01" value={lineDraft.value} onChange={e => setLineDraft({ ...lineDraft, value: e.target.value })} placeholder={lineDraft.type === 'PERCENTAGE' ? '0-100' : `max ${etb(gross)}`} style={{ width: '100px', padding: '0.25rem', border: '1px solid #e8e8e8', borderRadius: '4px' }} />
      <button className="btn btn-primary" style={{ padding: '0.2rem 0.6rem', fontSize: '0.7rem' }} onClick={onApply}>Apply</button>
      <button className="btn btn-secondary" style={{ padding: '0.2rem 0.6rem', fontSize: '0.7rem' }} onClick={onClear}>Clear</button>
      <span style={{ color: '#9a9a9a' }}>{item.productName}</span>
    </div>
  )
}

function ConfirmModal({ customers, selectedCustomer, verifiedTin, locations, selectedLocation, cart, total, taxConfig = { vatRate: 0 }, totalDiscount = 0, taxableAmount = 0, vatAmount = 0, loading, onBack, onConfirm }) {
  const customerObj = selectedCustomer ? customers.find(c => c.id === selectedCustomer) : null
  const displayTin = customerObj ? (customerObj.tinNumber || '-') : (verifiedTin ? `${verifiedTin.tin} ✓` : '-')
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: '12px', padding: '2rem', maxWidth: '500px', width: '90%', maxHeight: '80vh', overflowY: 'auto' }}>
        <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '1.5rem', marginBottom: '1rem' }}>Confirm Sale</h3>
        <div style={{ marginBottom: '1rem' }}>
          <strong>Customer:</strong> {selectedCustomer ? customerObj?.name : (verifiedTin ? `Walk-in — ${verifiedTin.name} (verified)` : 'Walk-in')}<br />
          <strong>TIN:</strong> {displayTin}<br />
          <strong>Location:</strong> {locations.find(l => l.id === selectedLocation)?.name}<br />
          <strong>Items:</strong> {cart.length} | <strong>Total:</strong> {etb(total)}
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.85rem', marginBottom: '1rem' }}>
          <span><strong>Discount:</strong> {etb(totalDiscount || 0)}</span>
          <span><strong>Taxable Amount:</strong> {etb(taxableAmount || 0)}</span>
          <span><strong>VAT ({taxConfig.vatRate}%):</strong> {etb(vatAmount || 0)}</span>
        </div>
        <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '1rem' }}>
          {cart.map(i => (
            <div key={i.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', fontSize: '0.85rem', color: i.isFreeGift ? '#6A1B9A' : 'inherit' }}>
              <span>{i.productName} * {i.quantity}{i.isGram ? 'g' : (i.size ? ` ${i.size}` : '')}{i.isFreeGift ? ' — FREE GIFT' : ''}</span>
              <span>{i.isFreeGift ? `FREE GIFT — ${etb(0)}` : etb(i.unitPrice * i.quantity)}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onBack} disabled={loading}>Back</button>
          <button className="btn btn-primary" onClick={onConfirm} disabled={loading}>{loading ? 'Processing...' : 'Complete Sale'}</button>
        </div>
      </div>
    </div>
  )
}
