/**
 * Items — dashboard-style inventory page for bottles, packaging and every
 * other business consumable. Tabs: All Items / per category / Low Stock /
 * Out of Stock / Stock Movements / Transfers.
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api.js'
import DataTable from '../../components/DataTable.jsx'
import Pagination from '../../components/Pagination.jsx'
import Modal from '../../components/Modal.jsx'
import { useAuth } from '../../contexts/AuthContext.jsx'
import ItemForm from './ItemForm.jsx'
import './admin-styles.css'

const MOVEMENT_TYPES = ['ITEM_INITIAL_STOCK', 'ITEM_PURCHASE', 'ITEM_ADJUSTMENT_IN', 'ITEM_ADJUSTMENT_OUT',
  'ITEM_TRANSFER_IN', 'ITEM_TRANSFER_OUT', 'ITEM_SALE_CONSUMPTION', 'ITEM_DAMAGE', 'ITEM_LOSS',
  'ITEM_RETURN_IN', 'ITEM_RETURN_OUT']

function statusBadge(status) {
  const map = { OK: ['#E8F5E9', '#2E7D32', 'Healthy'], LOW: ['#FFF3E0', '#E65100', 'Low Stock'], OUT: ['#FDECEA', '#C62828', 'Out of Stock'] }
  const [bg, color, label] = map[status] || ['#EEEEEE', '#616161', status]
  return <span style={{ padding: '0.15rem 0.5rem', borderRadius: 10, fontSize: '0.65rem', fontWeight: 600, background: bg, color }}>{label}</span>
}

function ItemsPage() {
  const { hasPermission } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('ALL')
  const [items, setItems] = useState([])
  const [pg, setPg] = useState({ page: 1, totalPages: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState([])
  const [locations, setLocations] = useState([])
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [activeFilter, setActiveFilter] = useState('')
  const [stats, setStats] = useState(null)
  const canViewCost = hasPermission('items:view_cost')
  const canCreate = hasPermission('items:create')
  const canEdit = hasPermission('items:edit')
  const canAdjust = hasPermission('items:adjust')
  const canTransfer = hasPermission('items:transfer')

  const searchTimer = useRef(null)
  useEffect(() => {
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setDebouncedSearch(search.trim()), 350)
    return () => clearTimeout(searchTimer.current)
  }, [search])

  const tabParams = useCallback(() => {
    const params = {}
    if (tab.startsWith('cat:')) params.categoryId = tab.slice(4)
    if (tab === 'LOW' || tab === 'OUT') params.stockStatus = tab
    return params
  }, [tab])

  const fetchItems = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const query = new URLSearchParams({ page, limit: 20, ...tabParams() })
      if (debouncedSearch) query.set('search', debouncedSearch)
      if (locationFilter) query.set('locationId', locationFilter)
      if (activeFilter) query.set('isActive', activeFilter)
      const res = await api.get(`/api/items?${query.toString()}`)
      setItems(res.data || [])
      setPg(res.pagination || { page: 1, totalPages: 1, total: 0 })
    } catch (e) { alert(e.message) }
    setLoading(false)
  }, [debouncedSearch, locationFilter, activeFilter, tabParams])

  const fetchSide = useCallback(async () => {
    api.get('/api/item-categories').then((r) => setCategories(r.data || [])).catch(() => {})
    api.get('/api/locations').then((r) => setLocations(r.data || [])).catch(() => {})
    api.get('/api/items/stats').then((r) => setStats(r.data)).catch(() => {})
  }, [])

  useEffect(() => { fetchSide() }, [fetchSide])
  useEffect(() => { fetchItems(1) }, [fetchItems])

  // ---------- item create/edit ----------
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const openCreate = () => { setEditingItem(null); setShowForm(true) }
  const openEdit = (item) => { setEditingItem(item); setShowForm(true) }
  const handleItemSave = async (payload) => {
    try {
      if (editingItem) await api.put(`/api/items/${editingItem.id}`, payload)
      else await api.post('/api/items', payload)
      setShowForm(false); setEditingItem(null); fetchItems(pg.page || 1); fetchSide()
    } catch (e) { alert(e.message) }
  }

  const toggleActive = async (item) => {
    if (!window.confirm(`Are you sure you want to ${item.isActive ? 'deactivate' : 'reactivate'} "${item.name}"?`)) return
    try { await api.put(`/api/items/${item.id}`, { isActive: !item.isActive }); fetchItems(pg.page || 1) }
    catch (e) { alert(e.message) }
  }

  // ---------- categories ----------
  const [showCategory, setShowCategory] = useState(false)
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '' })
  const handleCategorySave = async () => {
    if (!categoryForm.name.trim()) { alert('Category name is required'); return }
    try { await api.post('/api/item-categories', categoryForm); setCategoryForm({ name: '', description: '' }); setShowCategory(false); fetchSide() }
    catch (e) { alert(e.message) }
  }

  // ---------- stock adjustment ----------
  const [showAdjust, setShowAdjust] = useState(false)
  const [adjustForm, setAdjustForm] = useState({ itemId: '', locationId: '', adjustmentType: 'IN', quantity: '', reason: '' })
  const openAdjust = (item) => {
    setAdjustForm({ itemId: item.id, locationId: locationFilter || (locations[0]?.id || ''), adjustmentType: 'IN', quantity: '', reason: '' })
    setShowAdjust(true)
  }
  const handleAdjust = async () => {
    if (!adjustForm.itemId || !adjustForm.locationId || !adjustForm.quantity) { alert('Item, branch and quantity are required'); return }
    try {
      await api.post('/api/item-inventory/adjust', { ...adjustForm, quantity: parseFloat(adjustForm.quantity) })
      setShowAdjust(false); fetchItems(pg.page || 1)
    } catch (e) { alert(e.message) }
  }

  // ---------- transfers ----------
  const [showTransfer, setShowTransfer] = useState(false)
  const [transferItems, setTransferItems] = useState([])
  const [transferForm, setTransferForm] = useState({ fromLocationId: '', toLocationId: '', itemId: '', quantity: '', notes: '' })
  const openTransfer = () => {
    setTransferForm({ fromLocationId: locationFilter || '', toLocationId: '', itemId: '', quantity: '', notes: '' })
    api.get('/api/items?limit=100&isActive=true').then((r) => setTransferItems(r.data || [])).catch(() => {})
    setShowTransfer(true)
  }
  const handleTransfer = async () => {
    if (!transferForm.fromLocationId || !transferForm.toLocationId || !transferForm.itemId || !transferForm.quantity) {
      alert('Source, destination, item and quantity are required'); return
    }
    try {
      const res = await api.post('/api/item-transfers', {
        fromLocationId: transferForm.fromLocationId,
        toLocationId: transferForm.toLocationId,
        notes: transferForm.notes,
        items: [{ itemId: transferForm.itemId, quantity: parseFloat(transferForm.quantity) }]
      })
      await api.put(`/api/item-transfers/${res.data.id}/complete`)
      setShowTransfer(false); fetchItems(pg.page || 1)
    } catch (e) { alert(e.message) }
  }

  // ---------- movements & transfers tabs ----------
  const [movements, setMovements] = useState([])
  const [movPg, setMovPg] = useState({ page: 1, totalPages: 1, total: 0 })
  const [movementFilter, setMovementFilter] = useState({ type: '', locationId: '' })
  const fetchMovements = useCallback(async (page = 1) => {
    try {
      const query = new URLSearchParams({ page, limit: 20 })
      if (movementFilter.type) query.set('type', movementFilter.type)
      if (movementFilter.locationId) query.set('locationId', movementFilter.locationId)
      const res = await api.get(`/api/item-inventory/movements?${query.toString()}`)
      setMovements(res.data || [])
      setMovPg(res.pagination || { page: 1, totalPages: 1, total: 0 })
    } catch (e) { alert(e.message) }
  }, [movementFilter])

  const [transfers, setTransfers] = useState([])
  const [trfPg, setTrfPg] = useState({ page: 1, totalPages: 1, total: 0 })
  const fetchTransfers = useCallback(async (page = 1) => {
    try {
      const res = await api.get(`/api/item-transfers?page=${page}&limit=20`)
      setTransfers(res.data || [])
      setTrfPg(res.pagination || { page: 1, totalPages: 1, total: 0 })
    } catch (e) { alert(e.message) }
  }, [])
  useEffect(() => { if (tab === 'MOVEMENTS') fetchMovements(1) }, [tab, fetchMovements])
  useEffect(() => { if (tab === 'TRANSFERS') fetchTransfers(1) }, [tab, fetchTransfers])

  const completeTransfer = async (transfer) => {
    try { await api.put(`/api/item-transfers/${transfer.id}/complete`); fetchTransfers(trfPg.page || 1) }
    catch (e) { alert(e.message) }
  }
  const cancelTransfer = async (transfer) => {
    if (!window.confirm(`Cancel transfer ${transfer.transferNumber}? No stock will be moved.`)) return
    try { await api.put(`/api/item-transfers/${transfer.id}/cancel`); fetchTransfers(trfPg.page || 1) }
    catch (e) { alert(e.message) }
  }

  const itemColumns = [
    { key: 'name', label: 'Item', render: (_, item) => (
      <div>
        <div style={{ fontWeight: 600 }}>{item.name}</div>
        <div style={{ fontSize: '0.7rem', color: '#9a9a9a' }}>{item.itemCode}{item.color ? ` · ${item.color}` : ''}{item.size ? ` · ${item.size}` : ''}</div>
      </div>
    ) },
    { key: 'category', label: 'Category', render: (c) => c?.name || '-' },
    { key: 'unit', label: 'Unit', width: '70px', align: 'center' },
    { key: 'totalQuantity', label: locationFilter ? 'Branch Stock' : 'Total Stock', width: '110px', align: 'center',
      render: (_, item) => <strong>{locationFilter && item.branchQuantity !== undefined ? item.branchQuantity : item.totalQuantity}</strong> },
    { key: 'branchCount', label: 'Branches', width: '80px', align: 'center' },
    { key: 'stockStatus', label: 'Status', width: '110px', align: 'center', render: (s) => statusBadge(s) },
    ...(canViewCost ? [{ key: 'costPrice', label: 'Cost (Br)', width: '90px', align: 'right', render: (c) => Number(c).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }] : []),
    { key: 'actions', label: 'Actions', width: '230px', align: 'center', render: (_, item) => (
      <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        <button className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem' }} onClick={() => navigate(`/admin/items/${item.id}`)}>View</button>
        {canEdit && <button className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem' }} onClick={() => openEdit(item)}>Edit</button>}
        {canAdjust && <button className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem' }} onClick={() => openAdjust(item)}>Adjust</button>}
        {canEdit && <button className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', color: item.isActive ? '#C62828' : '#2E7D32' }} onClick={() => toggleActive(item)}>{item.isActive ? 'Deactivate' : 'Activate'}</button>}
      </div>
    ) }
  ]

  const tabs = [
    { key: 'ALL', label: 'All Items' },
    ...categories.map((c) => ({ key: `cat:${c.id}`, label: c.name })),
    { key: 'LOW', label: 'Low Stock' },
    { key: 'OUT', label: 'Out of Stock' },
    { key: 'MOVEMENTS', label: 'Stock Movements' },
    { key: 'TRANSFERS', label: 'Transfers' }
  ]

  return (
    <div>
      <div className="page-toolbar" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
        {canCreate && <button className="btn-primary" onClick={openCreate}>+ New Item</button>}
        {canCreate && <button className="btn-secondary" onClick={() => setShowCategory(true)}>+ Category</button>}
        {canTransfer && <button className="btn-secondary" onClick={openTransfer}>Transfer Stock</button>}
      </div>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
          <StatCard label="Item Types" value={stats.totalItemTypes} />
          {stats.byCategory.slice(0, 3).map((c) => <StatCard key={c.id} label={c.name} value={c.count} />)}
          <StatCard label="Low Stock" value={stats.lowStockItems} color="#E65100" />
          <StatCard label="Out of Stock" value={stats.outOfStockItems} color="#C62828" />
          <StatCard label="Total Units" value={stats.totalItemUnits} />
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginBottom: '1rem', borderBottom: '2px solid #eee', paddingBottom: '0.5rem' }}>
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '0.4rem 0.8rem', borderRadius: 16, fontSize: '0.78rem', cursor: 'pointer', border: '1px solid ' + (tab === t.key ? '#8a6d3b' : '#ddd'),
            background: tab === t.key ? '#8a6d3b' : '#fff', color: tab === t.key ? '#fff' : '#444'
          }}>{t.label}</button>
        ))}
      </div>

      {tab !== 'MOVEMENTS' && tab !== 'TRANSFERS' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
            <div className="form-field"><label>Search</label><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, code, SKU, barcode..." /></div>
            <div className="form-field"><label>Branch</label>
              <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}>
                <option value="">All branches</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="form-field"><label>State</label>
              <select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)}>
                <option value="">All</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
          </div>
          <DataTable columns={itemColumns} data={items} loading={loading} emptyMessage="No items found" />
          <Pagination page={pg.page} totalPages={pg.totalPages} total={pg.total} onPageChange={fetchItems} />
        </>
      )}

      {tab === 'MOVEMENTS' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
            <div className="form-field"><label>Movement type</label>
              <select value={movementFilter.type} onChange={(e) => setMovementFilter({ ...movementFilter, type: e.target.value })}>
                <option value="">All types</option>
                {MOVEMENT_TYPES.map((t) => <option key={t} value={t}>{t.replace('ITEM_', '')}</option>)}
              </select>
            </div>
            <div className="form-field"><label>Branch</label>
              <select value={movementFilter.locationId} onChange={(e) => setMovementFilter({ ...movementFilter, locationId: e.target.value })}>
                <option value="">All branches</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          </div>
          <DataTable loading={loading} emptyMessage="No item movements yet" data={movements} columns={[
            { key: 'createdAt', label: 'Date', width: '150px', render: (d) => new Date(d).toLocaleString() },
            { key: 'item', label: 'Item', render: (i) => i ? `${i.name} (${i.itemCode})` : '-' },
            { key: 'location', label: 'Branch', render: (l) => l?.name || '-' },
            { key: 'type', label: 'Movement', width: '160px', render: (t) => t.replace('ITEM_', '') },
            { key: 'quantity', label: 'Qty', width: '70px', align: 'center', render: (q) => Number(q) },
            { key: 'previousQuantity', label: 'Prev → New', width: '120px', align: 'center', render: (_, m) => `${Number(m.previousQuantity ?? 0)} → ${Number(m.resultingQuantity ?? 0)}` },
            { key: 'referenceType', label: 'Reference', width: '110px', render: (r) => r || '-' },
            { key: 'reason', label: 'Reason', render: (r) => r || '-' }
          ]} />
          <Pagination page={movPg.page} totalPages={movPg.totalPages} total={movPg.total} onPageChange={fetchMovements} />
        </>
      )}

      {tab === 'TRANSFERS' && (
        <>
          <DataTable loading={loading} emptyMessage="No item transfers yet" data={transfers} columns={[
            { key: 'transferNumber', label: 'Transfer #', width: '110px' },
            { key: 'fromLocation', label: 'From', render: (l) => l?.name || '-' },
            { key: 'toLocation', label: 'To', render: (l) => l?.name || '-' },
            { key: 'items', label: 'Lines', width: '80px', align: 'center', render: (lines) => lines?.length || 0 },
            { key: 'createdAt', label: 'Created', width: '150px', render: (d) => new Date(d).toLocaleString() },
            { key: 'status', label: 'Status', width: '110px', align: 'center', render: (s) => (
              <span style={{ padding: '0.15rem 0.5rem', borderRadius: 10, fontSize: '0.65rem', fontWeight: 600, background: s === 'COMPLETED' ? '#E8F5E9' : s === 'CANCELLED' ? '#FDECEA' : '#FFF3E0', color: s === 'COMPLETED' ? '#2E7D32' : s === 'CANCELLED' ? '#C62828' : '#E65100' }}>{s}</span>
            ) },
            { key: 'actions', label: 'Actions', width: '170px', align: 'center', render: (_, t) => t.status === 'PENDING' ? (
              <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center' }}>
                {canTransfer && <button className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', color: '#2E7D32' }} onClick={() => completeTransfer(t)}>Complete</button>}
                {canTransfer && <button className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', color: '#C62828' }} onClick={() => cancelTransfer(t)}>Cancel</button>}
              </div>
            ) : <span style={{ color: '#9a9a9a', fontSize: '0.7rem' }}>—</span> }
          ]} />
          <Pagination page={trfPg.page} totalPages={trfPg.totalPages} total={trfPg.total} onPageChange={fetchTransfers} />
        </>
      )}

      <Modal isOpen={showForm} onClose={() => { setShowForm(false); setEditingItem(null) }} title={editingItem ? `Edit Item — ${editingItem.name}` : 'New Item'} size="lg">
        <ItemForm
          initialData={editingItem}
          isEditing={!!editingItem}
          onSubmit={handleItemSave}
          onCancel={() => { setShowForm(false); setEditingItem(null) }}
        />
      </Modal>

      <Modal isOpen={showCategory} onClose={() => setShowCategory(false)} title="New Item Category">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-grid">
            <div className="form-field"><label>Name *</label><input value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} placeholder="e.g. Caps, Spray Pumps, Ribbons..." /></div>
            <div className="form-field"><label>Description</label><input value={categoryForm.description} onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })} /></div>
          </div>
          <p style={{ margin: 0, fontSize: '0.78rem', color: '#9a9a9a' }}>Existing: {categories.map((c) => c.name).join(', ') || 'none yet'}</p>
          <div className="form-actions">
            <button className="btn-cancel" onClick={() => setShowCategory(false)}>Cancel</button>
            <button className="btn-save" onClick={handleCategorySave}>Create Category</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showAdjust} onClose={() => setShowAdjust(false)} title="Adjust Item Stock">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-grid">
            <div className="form-field full-width"><label>Item</label>
              <select value={adjustForm.itemId} onChange={(e) => setAdjustForm({ ...adjustForm, itemId: e.target.value })}>
                <option value="">Select item...</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.itemCode})</option>)}
              </select>
            </div>
            <div className="form-field"><label>Branch *</label>
              <select value={adjustForm.locationId} onChange={(e) => setAdjustForm({ ...adjustForm, locationId: e.target.value })}>
                <option value="">Select branch...</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="form-field"><label>Type</label>
              <select value={adjustForm.adjustmentType} onChange={(e) => setAdjustForm({ ...adjustForm, adjustmentType: e.target.value })}>
                <option value="IN">Stock In</option>
                <option value="OUT">Stock Out</option>
                <option value="SET">Set Quantity</option>
              </select>
            </div>
            <div className="form-field"><label>Quantity *</label><input type="number" min="0" value={adjustForm.quantity} onChange={(e) => setAdjustForm({ ...adjustForm, quantity: e.target.value })} /></div>
            <div className="form-field full-width"><label>Reason</label><input value={adjustForm.reason} onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })} placeholder="e.g. Physical inventory count" /></div>
          </div>
          <div className="form-actions">
            <button className="btn-cancel" onClick={() => setShowAdjust(false)}>Cancel</button>
            <button className="btn-save" onClick={handleAdjust}>Apply Adjustment</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showTransfer} onClose={() => setShowTransfer(false)} title="Transfer Item Stock">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-grid">
            <div className="form-field"><label>From branch *</label>
              <select value={transferForm.fromLocationId} onChange={(e) => setTransferForm({ ...transferForm, fromLocationId: e.target.value })}>
                <option value="">Select...</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="form-field"><label>To branch *</label>
              <select value={transferForm.toLocationId} onChange={(e) => setTransferForm({ ...transferForm, toLocationId: e.target.value })}>
                <option value="">Select...</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="form-field full-width"><label>Item *</label>
              <select value={transferForm.itemId} onChange={(e) => setTransferForm({ ...transferForm, itemId: e.target.value })}>
                <option value="">Select item...</option>
                {transferItems.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.itemCode})</option>)}
              </select>
            </div>
            <div className="form-field"><label>Quantity *</label><input type="number" min="0" value={transferForm.quantity} onChange={(e) => setTransferForm({ ...transferForm, quantity: e.target.value })} /></div>
            <div className="form-field full-width"><label>Notes</label><input value={transferForm.notes} onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })} /></div>
          </div>
          <p style={{ margin: 0, fontSize: '0.78rem', color: '#9a9a9a' }}>The transfer is completed atomically — TRANSFER_OUT and TRANSFER_IN movements are recorded and the source branch can never go negative.</p>
          <div className="form-actions">
            <button className="btn-cancel" onClick={() => setShowTransfer(false)}>Cancel</button>
            <button className="btn-save" onClick={handleTransfer}>Transfer</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function StatCard({ label, value, color = '#8a6d3b' }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: '0.75rem 1rem' }}>
      <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#9a9a9a' }}>{label}</div>
      <div style={{ fontSize: '1.3rem', fontWeight: 700, color }}>{Number(value).toLocaleString()}</div>
    </div>
  )
}

export default ItemsPage
