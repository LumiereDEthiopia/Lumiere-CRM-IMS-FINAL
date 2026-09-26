/**
 * Settings Management Page — Stage 4 sections.
 * All values persist server-side (Setting table via /api/settings) through the
 * shared SettingsContext, so saved changes reach every module immediately and
 * survive refresh/logout. Inputs are type-aware so saved values stay valid.
 */
import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import api from '../../services/api.js'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { useSettings } from '../../contexts/SettingsContext.jsx'
import './admin-styles.css'

const SECTIONS = {
  General: ['currency', 'timezone'],
  Business: ['business_name', 'business_phone', 'business_email', 'business_address', 'receipt_footer'],
  'Sales & POS': ['pos_default_payment_method', 'pos_payment_methods', 'pos_discount_limit_percent'],
  Inventory: ['low_stock_threshold', 'overstock_multiplier', 'default_location'],
  'Product Codes': ['product_code_prefix_unisex', 'product_code_prefix_male', 'product_code_prefix_female', 'product_code_prefix_kids', 'product_code_prefix_oil', 'product_code_next_number'],
  'Ethiopian Finance': ['finance_country', 'finance_currency', 'finance_accounting_basis', 'inventory_cost_method', 'finance_fiscal_year_start', 'ethiopia_taxpayer_tin', 'ethiopia_vat_registered', 'ethiopia_vat_rate', 'ethiopia_vat_inclusive', 'ethiopia_withholding_enabled', 'ethiopia_withholding_rate', 'ethiopia_invoice_prefix', 'ethiopia_invoice_next_number'],
  Notifications: ['notifications_enabled'],
  Backups: ['backup_interval_hours', 'backup_retention_days']
}

// Human labels + input types per setting key. Unlisted keys render as text
// inputs with a generated label. Boolean/number/select inputs keep values in
// the exact shape the backend validation expects.
const FIELD_META = {
  currency: { label: 'Currency', input: 'select', options: ['ETB', 'USD', 'EUR', 'GBP', 'AED', 'KES'] },
  business_name: { label: 'Business Name' },
  business_phone: { label: 'Business Phone' },
  business_email: { label: 'Business Email', input: 'email' },
  business_address: { label: 'Business Address', full: true },
  receipt_footer: { label: 'Receipt Footer', input: 'textarea', full: true },
  pos_default_payment_method: { label: 'Default Payment Method', input: 'payment' },
  pos_payment_methods: { label: 'Payment Methods (comma separated codes)', full: true },
  pos_discount_limit_percent: { label: 'Cashier Discount Limit (% of sale) — discounts above this need the sale:discount permission; 0 = no limit' },
  low_stock_threshold: { label: 'Low Stock Threshold', input: 'number' },
  overstock_multiplier: { label: 'Overstock Multiplier', input: 'number' },
  default_location: { label: 'Default Location', input: 'location' },
  product_code_next_number: { label: 'Product Code Next Number', input: 'number' },
  finance_accounting_basis: { label: 'Accounting Basis', input: 'select', options: ['ACCRUAL', 'CASH'] },
  inventory_cost_method: { label: 'Inventory Cost Method', input: 'select', options: ['FIFO', 'LIFO', 'AVCO'] },
  ethiopia_taxpayer_tin: { label: 'Taxpayer TIN' },
  ethiopia_vat_registered: { label: 'VAT Registered', input: 'boolean' },
  ethiopia_vat_rate: { label: 'VAT Rate (%)', input: 'number' },
  ethiopia_vat_inclusive: { label: 'VAT Inclusive Pricing', input: 'boolean' },
  ethiopia_withholding_enabled: { label: 'Withholding Enabled', input: 'boolean' },
  ethiopia_withholding_rate: { label: 'Withholding Rate (%)', input: 'number' },
  ethiopia_invoice_next_number: { label: 'Invoice Next Number', input: 'number' },
  notifications_enabled: { label: 'Notifications Enabled', input: 'boolean' },
  backup_interval_hours: { label: 'Backup Interval (hours)', input: 'number' },
  backup_retention_days: { label: 'Backup Retention (days)', input: 'number' }
}

function SettingsPage() {
  const { settingsMap, settingsList, loading, error: loadError, refreshSettings, saveSettings } = useSettings()
  const [editValues, setEditValues] = useState({})
  const [initialized, setInitialized] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [section, setSection] = useState('General')
  const [locations, setLocations] = useState([])
  const { user, hasPermission } = useAuth()
  const canManageRoles = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' || hasPermission('setting:manage')
  const canManageSettings = canManageRoles
  const [roles, setRoles] = useState([])
  const [permModules, setPermModules] = useState([])
  const [selectedRoleId, setSelectedRoleId] = useState(null)
  const [draftPerms, setDraftPerms] = useState([])
  const [draftDesc, setDraftDesc] = useState('')
  const [roleLoading, setRoleLoading] = useState(true)
  const [roleSaving, setRoleSaving] = useState(false)
  const [roleMsg, setRoleMsg] = useState('')
  const [roleErr, setRoleErr] = useState('')
  const [addingRole, setAddingRole] = useState(false)
  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleDesc, setNewRoleDesc] = useState('')

  // Seed the editable values from the server list once loaded — and only once,
  // so an automatic refresh after saving never clobbers the user's edits.
  useEffect(() => {
    if (!initialized && settingsList.length) {
      const vals = {}
      settingsList.forEach((s) => { vals[s.key] = s.value || '' })
      setEditValues(vals)
      setInitialized(true)
    }
  }, [settingsList, initialized])

  // Locations for the Default Location picker (Settings → Inventory).
  useEffect(() => { api.get('/api/locations?limit=100').then((r) => setLocations(r.data || [])).catch(() => {}) }, [])

  // Unsaved-changes tracking: any value that differs from the saved backend
  // value. Used for the warning banner, the beforeunload guard and the save
  // payload (only changed keys are sent).
  const dirtyKeys = useMemo(() => {
    const keys = new Set([...Object.keys(settingsMap), ...Object.keys(editValues)])
    return [...keys].filter((k) => (editValues[k] ?? '') !== (settingsMap[k] ?? ''))
  }, [settingsMap, editValues])
  useEffect(() => {
    if (!dirtyKeys.length) return
    const handler = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirtyKeys.length])

  const applyRole = (list, id) => {
    const r = list.find((x) => x.id === id)
    setSelectedRoleId(id)
    setDraftPerms(r ? r.permissions : [])
    setDraftDesc(r ? (r.description || '') : '')
    setRoleMsg('')
    setRoleErr('')
  }

  const loadRoles = async () => {
    setRoleLoading(true)
    try {
      const [rr, permsRes] = await Promise.all([
        api.get('/api/roles'),
        api.get('/api/roles/permissions')
      ])
      const list = rr.data || []
      setRoles(list)
      setPermModules(permsRes.data?.modules || [])
      if (list.length) applyRole(list, list[0].id)
      setRoleLoading(false)
    } catch (e) {
      setRoleErr(e.message)
      setRoleLoading(false)
    }
  }

  useEffect(() => { loadRoles() }, [])

  const togglePerm = (name) => {
    if (!canManageRoles) return
    setDraftPerms((prev) => (prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]))
  }

  const toggleModule = (modPerms, checked) => {
    if (!canManageRoles) return
    setDraftPerms((prev) => {
      if (checked) return [...new Set([...prev, ...modPerms])]
      return prev.filter((p) => !modPerms.includes(p))
    })
  }

  const saveRole = async () => {
    if (!canManageRoles || !selectedRoleId) return
    setRoleSaving(true)
    setRoleErr('')
    setRoleMsg('')
    try {
      await api.put(`/api/roles/${selectedRoleId}`, { description: draftDesc, permissions: draftPerms })
      const rr = await api.get('/api/roles')
      const list = rr.data || []
      setRoles(list)
      const saved = list.find((r) => r.id === selectedRoleId)
      setRoleMsg(`Permissions saved for ${saved?.label || 'role'}. Changes apply to every account with this role.`)
    } catch (e) {
      setRoleErr(e.message)
    }
    setRoleSaving(false)
  }

  const createRole = async () => {
    if (!canManageRoles) return
    setRoleErr('')
    setRoleMsg('')
    try {
      const res = await api.post('/api/roles', { name: newRoleName, description: newRoleDesc, permissions: [] })
      setAddingRole(false)
      setNewRoleName('')
      setNewRoleDesc('')
      const rr = await api.get('/api/roles')
      const list = rr.data || []
      setRoles(list)
      applyRole(list, res.data.id)
      setRoleMsg(`Role "${res.data.name}" created. Grant permissions below.`)
    } catch (e) {
      setRoleErr(e.message)
    }
  }

  const deleteRole = async (id) => {
    if (!canManageRoles || !confirm('Delete this custom role?')) return
    setRoleErr('')
    setRoleMsg('')
    try {
      await api.delete(`/api/roles/${id}`)
      await loadRoles()
      setRoleMsg('Role deleted.')
    } catch (e) {
      setRoleErr(e.message)
    }
  }

  const handleSaveAll = async () => {
    if (!canManageSettings) { setError('You do not have permission to change global settings.'); return }
    setSaving(true)
    setError('')
    setMessage('')
    try {
      if (!dirtyKeys.length) { setMessage('No changes to save.'); setSaving(false); return }
      // Only changed keys are sent; the backend validates every value and
      // persists them in one transaction, then the context updates from the
      // server response so other modules see the new values immediately.
      const payload = dirtyKeys.map((key) => {
        const meta = FIELD_META[key] || {}
        const existing = settingsList.find((s) => s.key === key)
        let type = existing?.type
        if (!type) type = meta.input === 'boolean' ? 'boolean' : meta.input === 'number' ? 'number' : 'string'
        return { key, value: editValues[key] ?? '', type }
      })
      await saveSettings(payload)
      setMessage(`Saved ${payload.length} setting${payload.length === 1 ? '' : 's'} — the new values are live across the app.`)
    } catch (e) {
      // Do not pretend it succeeded: show the error and keep the user's
      // unsaved input so it can be corrected and retried.
      setError(e.message || 'Failed to save settings.')
    }
    setSaving(false)
  }

  if (loading) return <div className="loading-container"><div className="spinner" /><span>Loading settings...</span></div>

  const sectionKeys = SECTIONS[section] || []
  const sectionSettings = settingsList.filter((s) => sectionKeys.includes(s.key))

  // Ensure known keys appear even if not yet saved
  const knownMissing = sectionKeys.filter((k) => !settingsList.find((s) => s.key === k))

  const selectedRole = roles.find((r) => r.id === selectedRoleId)
  const roleReadOnly = !canManageRoles || selectedRole?.name === 'SUPER_ADMIN'

  return (
    <div className="dashboard-container">
      <div className="page-header-row">
        <div>
          <h2 className="page-title">Settings</h2>
          <p className="page-subtitle">Business configuration — changes are audited</p>
        </div>
        <div className="header-actions">
          <Link to="/admin/data-tools" className="btn btn-secondary">Import / Export</Link>
          <button type="button" className="btn btn-primary" onClick={handleSaveAll} disabled={saving || !canManageSettings || !dirtyKeys.length} title={canManageSettings ? (dirtyKeys.length ? 'Save changed settings' : 'No changes to save yet') : 'View only — requires the setting:manage permission'}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {error && <div className="error-text" role="alert">{error}</div>}
      {loadError && !settingsList.length && (
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p className="error-text" role="alert">Settings could not be loaded: {loadError}</p>
          <button type="button" className="btn btn-primary" onClick={refreshSettings}>Retry</button>
        </div>
      )}
      {message && <div className="success-text" role="status">{message}</div>}
      {!canManageSettings && <p className="page-subtitle" style={{ margin: '0.25rem 0 0.5rem' }}>View only — changing global settings requires the <code>setting:manage</code> permission.</p>}
      {dirtyKeys.length > 0 && <p className="page-subtitle" style={{ color: '#8a6d3b', margin: '0.25rem 0 0.5rem' }}>⚠ {dirtyKeys.length} unsaved change{dirtyKeys.length === 1 ? '' : 's'} — click Save Changes (top right) or they will be lost when you leave this page.</p>}

      <div className="tab-row" role="tablist">
        {Object.keys(SECTIONS).concat(['Account Roles', 'Security']).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={section === t} className={`tab-btn ${section === t ? 'active' : ''}`} onClick={() => setSection(t)}>
            {t}
          </button>
        ))}
      </div>

      {section === 'Account Roles' ? (
        <div className="card">
          <h3 className="card-title">Account Roles & Permissions</h3>
          <p className="page-subtitle">Professional job-role structure — Super Admin, Admin, CEO, General Manager, Accounting &amp; Finance, Purchasing &amp; Store Manager, Sales, Inventory, Freelancer. Choose a job role, then grant module permissions. Permissions are enforced by the backend on every request.</p>
          {roleErr && <div className="error-text" role="alert">{roleErr}</div>}
          {roleMsg && <div className="success-text" role="status">{roleMsg}</div>}
          {roleLoading ? (
            <div className="loading-container"><div className="spinner" /><span>Loading roles...</span></div>
          ) : (
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 210, maxWidth: 250, flex: '0 1 auto' }}>
                {roles.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => applyRole(roles, r.id)}
                    title={r.description}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                      padding: '0.6rem 0.8rem', marginBottom: 6, border: 'none',
                      borderRadius: 8, fontSize: '0.85rem', fontWeight: 600, color: '#6b6b6b',
                      backgroundColor: selectedRoleId === r.id ? '#f5f0e6' : '#f8f8fa',
                      boxShadow: selectedRoleId === r.id ? '0 0 0 2px #c9a96e' : 'none'
                    }}
                  >
                    <div style={{ color: selectedRoleId === r.id ? '#1a1a2e' : '#6b6b6b', fontWeight: 600 }}>{r.label}</div>
                    <div style={{ fontSize: '0.7rem', color: '#9a9a9a' }}>
                      {r.permissions.length} perms{r.isBuiltin ? '' : ' · custom'}{r.userCount ? ` · ${r.userCount} acc` : ''}
                    </div>
                  </button>
                ))}
                {canManageRoles && (
                  <button type="button" onClick={() => setAddingRole(!addingRole)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.6rem 0.8rem', border: '1px dashed #c9a96e', borderRadius: 8, background: 'none', color: '#8a6d3b', cursor: 'pointer', fontSize: '0.85rem' }}>
                    + Add Role
                  </button>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                {selectedRole ? (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <h4 style={{ margin: 0 }}>{selectedRole.label}</h4>
                      <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.6rem', borderRadius: 12, background: '#eef1f7', color: '#5a5a5a' }}>{selectedRole.permissions.length} permission{selectedRole.permissions.length === 1 ? '' : 's'}</span>
                      {selectedRole.isBuiltin && <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.6rem', borderRadius: 12, background: '#f5f0e6', color: '#8a6d3b' }}>Built-in</span>}
                      {!canManageRoles && <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.6rem', borderRadius: 12, background: '#ffe9ec', color: '#c62828' }}>Read-only</span>}
                      {selectedRole.name === 'SUPER_ADMIN' && <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.6rem', borderRadius: 12, background: '#c9a96e', color: '#fff' }}>Full access</span>}
                      {canManageRoles && !selectedRole.isBuiltin && (
                        <button type="button" onClick={() => deleteRole(selectedRole.id)} style={{ border: '1px solid #c62828', background: 'none', color: '#c62828', borderRadius: 6, padding: '0.25rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer' }}>Delete</button>
                      )}
                    </div>
                    <textarea
                      rows={2}
                      value={draftDesc}
                      disabled={roleReadOnly}
                      onChange={(e) => setDraftDesc(e.target.value)}
                      placeholder="Role description"
                      style={{ width: '100%', marginTop: '0.35rem', padding: '0.4rem', border: '1px solid #e0e0e0', borderRadius: 6, fontSize: '0.8rem' }}
                    />
                    {selectedRole.name === 'SUPER_ADMIN' && <p className="page-subtitle">Super Admin always holds every permission and cannot be modified.</p>}
                    <div>
                      {permModules.map(({ module, permissions: perms }) => {
                        const modNames = perms.map((p) => p.name)
                        const checkedCount = modNames.filter((n) => draftPerms.includes(n)).length
                        const allChecked = checkedCount === modNames.length
                        return (
                          <div key={module} style={{ border: '1px solid #e8e8e8', borderRadius: 8, marginBottom: 10, overflow: 'hidden' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.6rem', background: '#f5f5f7', cursor: roleReadOnly ? 'default' : 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
                              <input type="checkbox" checked={allChecked} onChange={(e) => toggleModule(modNames, e.target.checked)} disabled={roleReadOnly} />
                              {module}
                              <span style={{ fontSize: '0.7rem', color: '#9a9a9a', marginLeft: 'auto' }}>{checkedCount}/{modNames.length}</span>
                            </label>
                            {perms.map((p) => (
                              <label key={p.name} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.32rem 0.6rem', cursor: roleReadOnly ? 'default' : 'pointer', fontSize: '0.8rem' }}>
                                <input type="checkbox" checked={draftPerms.includes(p.name)} onChange={() => togglePerm(p.name)} disabled={roleReadOnly} />
                                <span>{p.description}</span>
                                <code style={{ fontSize: '0.65rem', color: '#9a9a9a', background: '#f0f0f2', padding: '0 0.3rem', borderRadius: 4 }}>{p.name}</code>
                              </label>
                            ))}
                          </div>
                        )
                      })}
                    </div>
                    {canManageRoles && !roleReadOnly && (
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                        <button type="button" className="btn btn-primary" onClick={saveRole} disabled={roleSaving}>
                          {roleSaving ? 'Saving...' : 'Save Permissions'}
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => applyRole(roles, selectedRoleId)}>Reset</button>
                      </div>
                    )}
                    {!canManageRoles && (
                      <p className="page-subtitle">You have view-only access. Only Super Admin and Admin can grant or revoke role permissions.</p>
                    )}
                    <p className="page-subtitle">Assign this job role when creating an employee account (Employees → Add Employee → Account Role). Changes apply immediately to all accounts with this role.</p>
                  </div>
                ) : (
                  <p className="empty-text">Select a role to view and manage its permissions.</p>
                )}
              </div>
            </div>
          )}
          {addingRole && canManageRoles && (
            <div style={{ border: '1px dashed #c9a96e', borderRadius: 8, padding: '1rem', marginTop: '1rem' }}>
              <h4 style={{ marginTop: 0 }}>Create Custom Role</h4>
              <div className="form-grid">
                <div className="form-field">
                  <label>Role Name *</label>
                  <input value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder="e.g. Regional Manager" />
                </div>
                <div className="form-field">
                  <label>Description</label>
                  <input value={newRoleDesc} onChange={(e) => setNewRoleDesc(e.target.value)} />
                </div>
              </div>
              <div className="form-actions">
                <button type="button" className="btn-cancel" onClick={() => setAddingRole(false)}>Cancel</button>
                <button type="button" className="btn-save" onClick={createRole}>Create Role</button>
              </div>
            </div>
          )}
        </div>
      ) : section === 'Security' ? (
        <div className="card">
          <h3 className="card-title">Security</h3>
          <ul className="alert-list">
            <li>Authentication uses salted password hashes and session tokens.</li>
            <li>Rate limiting is enabled on login and sensitive endpoints.</li>
            <li>Authorization is enforced on the backend for all protected APIs.</li>
            <li>Sensitive employee fields require <code>employee:view_sensitive</code>.</li>
            <li>Secrets (R2 keys, encryption keys) stay in environment variables only.</li>
          </ul>
        </div>
      ) : (
        <div className="card">
          <h3 className="card-title">{section}</h3>
          {section === 'Ethiopian Finance' && <p className="page-subtitle">Configurable Ethiopian tax and accounting controls. Confirm rates and registration status with the Ethiopian Revenue Ministry or your tax adviser before use.</p>}
          {section === 'Business' && <p className="page-subtitle">Business identity used across the app and printed on every receipt.</p>}
          {section === 'Sales & POS' && <p className="page-subtitle">Defaults used by the New Sale screen. Payment methods are codes like CASH, BANK_TRANSFER, TELEBIRR, CARD, CREDIT. The Discount Limit gates large discounts behind the sale:discount permission (free gifts always need sale:free_gift — grant both in Account Roles).</p>}
          {section === 'Backups' && <p className="page-subtitle">Backup interval applies when the server starts (env BACKUP_ENABLED still gates automatic backups).</p>}
          {!sectionSettings.length && !knownMissing.length ? (
            <p className="empty-text">No settings in this section.</p>
          ) : (
            <div className="form-grid">
              {[...sectionSettings.map((s) => s.key), ...knownMissing].map((key) => {
                const meta = FIELD_META[key] || {}
                const label = meta.label || key.replace(/_/g, ' ')
                const value = editValues[key] || ''
                const set = (v) => setEditValues((prev) => ({ ...prev, [key]: v }))
                const dirty = dirtyKeys.includes(key)
                const disabled = !canManageSettings
                return (
                  <div className={`form-field${meta.full ? ' full-width' : ''}`} key={key}>
                    <label htmlFor={`setting-${key}`}>{label}{dirty ? ' •' : ''}</label>
                    {meta.input === 'boolean' ? (
                      <select id={`setting-${key}`} value={value === 'true' ? 'true' : 'false'} onChange={(e) => set(e.target.value)} disabled={disabled}>
                        <option value="true">Enabled (true)</option>
                        <option value="false">Disabled (false)</option>
                      </select>
                    ) : meta.input === 'select' ? (
                      <select id={`setting-${key}`} value={value} onChange={(e) => set(e.target.value)} disabled={disabled}>
                        {(meta.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : meta.input === 'payment' ? (
                      <select id={`setting-${key}`} value={value} onChange={(e) => set(e.target.value)} disabled={disabled}>
                        {(editValues.pos_payment_methods || 'CASH,BANK_TRANSFER,TELEBIRR,CARD,CREDIT').split(',').map((m) => m.trim()).filter(Boolean).map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    ) : meta.input === 'location' ? (
                      <select id={`setting-${key}`} value={value} onChange={(e) => set(e.target.value)} disabled={disabled}>
                        <option value="">None</option>
                        {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    ) : meta.input === 'textarea' ? (
                      <textarea id={`setting-${key}`} rows={2} value={value} onChange={(e) => set(e.target.value)} disabled={disabled} />
                    ) : (
                      <input id={`setting-${key}`} type={meta.input === 'number' ? 'number' : meta.input === 'email' ? 'email' : 'text'} value={value} onChange={(e) => set(e.target.value)} disabled={disabled} />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default SettingsPage
