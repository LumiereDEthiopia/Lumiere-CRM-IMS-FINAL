/**
 * useImportExport — Shared hook for Excel/CSV import & export across all sections
 */
import { useState, useRef } from 'react'
import api, { API_BASE_URL } from '../services/api.js'

export function useImportExport(type, { onImported } = {}) {
  const [importPreview, setImportPreview] = useState(null)
  const [importError, setImportError] = useState('')
  const [importMessage, setImportMessage] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const fileInputRef = useRef(null)
  const xlsxBase64Ref = useRef('')
  const csvRef = useRef('')

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError('')
    setImportPreview(null)
    const fileName = file.name.toLowerCase()
    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      const base64 = await fileToBase64(file)
      xlsxBase64Ref.current = base64
      csvRef.current = ''
    } else {
      xlsxBase64Ref.current = ''
      const reader = new FileReader()
      reader.onload = () => { csvRef.current = String(reader.result || '') }
      reader.readAsText(file)
    }
  }

  function handleCsvPaste(val) {
    csvRef.current = val
    xlsxBase64Ref.current = ''
  }

  async function runPreview() {
    setImportBusy(true); setImportError(''); setImportMessage(''); setImportPreview(null)
    try {
      const body = { type }
      if (xlsxBase64Ref.current) body.xlsx = xlsxBase64Ref.current
      else body.csv = csvRef.current
      const r = await api.post('/api/exports/import/preview', body)
      setImportPreview(r.data)
    } catch (e) {
      setImportError(e.message)
    }
    setImportBusy(false)
  }

  async function runImport() {
    if (!importPreview?.canImport) return
    setImportBusy(true); setImportError(''); setImportMessage('')
    try {
      const body = { type }
      if (xlsxBase64Ref.current) body.xlsx = xlsxBase64Ref.current
      else body.csv = csvRef.current
      const r = await api.post('/api/exports/import/confirm', body)
      setImportMessage(`Imported ${r.data.imported} ${type} successfully.`)
      setImportPreview(null)
      xlsxBase64Ref.current = ''
      csvRef.current = ''
      setShowImportModal(false)
      if (onImported) onImported()
    } catch (e) {
      setImportError(e.message)
    }
    setImportBusy(false)
  }

  async function downloadExport(format = 'xlsx') {
    setImportError('')
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
      setImportError(e.message)
    }
  }

  async function downloadTemplate(format = 'xlsx') {
    setImportError('')
    try {
      const token = localStorage.getItem('auth_token')
      const base = API_BASE_URL
      const endpoint = format === 'xlsx'
        ? `${base}/api/exports/templates/${type}/xlsx`
        : `${base}/api/exports/templates/${type}`
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
      a.download = `${type}-template.${format}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setImportError(e.message)
    }
  }

  function openImportModal() {
    setShowImportModal(true)
    setImportPreview(null)
    setImportError('')
    setImportMessage('')
    xlsxBase64Ref.current = ''
    csvRef.current = ''
  }

  function closeImportModal() {
    setShowImportModal(false)
    setImportPreview(null)
    setImportError('')
    setImportMessage('')
  }

  return {
    // Import modal state
    showImportModal,
    openImportModal,
    closeImportModal,
    // Import data
    importPreview,
    importError,
    importMessage,
    importBusy,
    // Refs
    fileInputRef,
    // Actions
    handleFile,
    handleCsvPaste,
    runPreview,
    runImport,
    downloadExport,
    downloadTemplate,
  }
}

export default useImportExport