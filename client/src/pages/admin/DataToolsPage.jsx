/**
 * Data Import / Export tools (Settings section companion page)
 * Supports both CSV and Excel (.xlsx) formats
 */
import { useState } from 'react'
import api, { API_BASE_URL } from '../../services/api.js'
import './admin-styles.css'

const IMPORT_TYPES = ['products', 'customers', 'suppliers', 'employees']
const EXPORT_TYPES = ['products', 'inventory', 'customers', 'suppliers', 'sales', 'purchases', 'employees', 'stock_movements', 'audit_logs']

function DataToolsPage() {
  const [importType, setImportType] = useState('products')
  const [csv, setCsv] = useState('')
  const [xlsxBase64, setXlsxBase64] = useState('')
  const [preview, setPreview] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function runPreview() {
    setBusy(true); setError(''); setMessage(''); setPreview(null)
    try {
      const body = { type: importType }
      if (xlsxBase64) body.xlsx = xlsxBase64
      else body.csv = csv
      const r = await api.post('/api/exports/import/preview', body)
      setPreview(r.data)
    } catch (e) {
      setError(e.message)
    }
    setBusy(false)
  }

  async function runImport() {
    if (!preview?.canImport) return
    setBusy(true); setError(''); setMessage('')
    try {
      const body = { type: importType }
      if (xlsxBase64) body.xlsx = xlsxBase64
      else body.csv = csv
      const r = await api.post('/api/exports/import/confirm', body)
      setMessage(`Imported ${r.data.imported} ${importType} successfully.`)
      setPreview(null)
      setXlsxBase64('')
      setCsv('')
    } catch (e) {
      setError(e.message)
    }
    setBusy(false)
  }

  async function downloadExport(type, format = 'xlsx') {
    setError('')
    try {
      const token = localStorage.getItem('auth_token')
      const base = API_BASE_URL
      const res = await fetch(`${base}/api/exports/${type}?format=${format}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message || 'Export failed')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${type}-export.${format}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e.message)
    }
  }

  async function downloadTemplate(format = 'xlsx') {
    setError('')
    try {
      const token = localStorage.getItem('auth_token')
      const base = API_BASE_URL
      const endpoint = format === 'xlsx' ? `${base}/api/exports/templates/${importType}/xlsx` : `${base}/api/exports/templates/${importType}`
      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message || 'Template download failed')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${importType}-template.${format}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e.message)
    }
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result
        const base64 = result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const fileName = file.name.toLowerCase()
    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      setCsv('')
      const base64 = await fileToBase64(file)
      setXlsxBase64(base64)
    } else {
      setXlsxBase64('')
      const reader = new FileReader()
      reader.onload = () => setCsv(String(reader.result || ''))
      reader.readAsText(file)
    }
  }

  return (
    <div className="dashboard-container">
      <h2 className="page-title">Data Import / Export</h2>
      <p className="page-subtitle">Requires data:export / data:import permissions. Partial imports are blocked.</p>

      {error && <div className="error-text" role="alert">{error}</div>}
      {message && <div className="success-text" role="status">{message}</div>}

      <div className="dashboard-row">
        <div className="card">
          <h3 className="card-title">Export</h3>
          <div className="export-grid">
            {EXPORT_TYPES.map((t) => (
              <div key={t} style={{ display: 'flex', gap: '0.25rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => downloadExport(t, 'xlsx')}>{t} .xlsx</button>
                <button type="button" className="btn btn-secondary" onClick={() => downloadExport(t, 'csv')}>.csv</button>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 className="card-title">Import Data</h3>
          <label>
            Type
            <select value={importType} onChange={(e) => setImportType(e.target.value)}>
              {IMPORT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="file-label">
            Upload File (Excel or CSV)
            <input type="file" accept=".csv,text/csv,.xlsx,.xls" onChange={onFile} />
          </label>
          <label>
            Or paste CSV
            <textarea rows={8} value={csv} onChange={(e) => { setCsv(e.target.value); setXlsxBase64('') }} placeholder="id,name,code,brand,price,gender,category,stockStatus,description,rating,accords,fragranceProfile,dayNight,seasons,notes.top,notes.middle,notes.base" />
          </label>
          <div className="header-actions">
            <button type="button" className="btn btn-secondary" onClick={() => downloadTemplate('xlsx')}>Template .xlsx</button>
            <button type="button" className="btn btn-secondary" onClick={() => downloadTemplate('csv')}>Template .csv</button>
            <button type="button" className="btn btn-secondary" disabled={busy || (!csv && !xlsxBase64)} onClick={runPreview}>Validate Preview</button>
            <button type="button" className="btn btn-primary" disabled={busy || !preview?.canImport} onClick={runImport}>Confirm Import</button>
          </div>

          {importType === 'products' && (
            <p className="page-subtitle" style={{ marginTop: '0.5rem' }}>
              Perfumes catalog format: price in Birr (ETB) · multi-values separated with " | " ·
              accords like <code>Floral:95 | Citrus:85</code> · stockStatus <code>In Stock</code> / <code>Out of Stock</code>
            </p>
          )}

          {preview && (
            <div className="preview-box">
              <p>Total: {preview.totalRows} · Valid: {preview.validCount} · Errors: {preview.errorCount}</p>
              {!preview.canImport && <p className="error-text">Fix all errors before importing. Partial import is not allowed.</p>}
              {preview.errors?.length > 0 && (
                <ul className="alert-list">
                  {preview.errors.slice(0, 20).map((err, i) => (
                    <li key={i}>Row {err.row}: {err.errors.join(', ')}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default DataToolsPage
