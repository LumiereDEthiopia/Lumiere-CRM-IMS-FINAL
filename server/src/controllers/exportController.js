/**
 * Export / Import Controllers
 */
import { exportData } from '../services/exportService.js'
import { previewImport, confirmImport, getImportTemplate } from '../services/importService.js'
import { ApiError } from '../middleware/errorHandler.js'

export async function handleExport(req, res, next) {
  try {
    const type = req.params.type
    const format = req.query.format || 'csv'
    const result = await exportData({
      type,
      format,
      userId: req.userId || req.user?.userId,
      permissions: req.user?.permissions || [],
      ipAddress: req.ip
    })
    res.setHeader('Content-Type', result.contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`)
    res.send(result.body)
  } catch (e) { next(e) }
}

export async function handleImportPreview(req, res, next) {
  try {
    const { type, csv, xlsx } = req.body
    if (!type || (!csv && !xlsx)) throw new ApiError(400, 'type and (csv or xlsx) are required')
    const preview = await previewImport({ type, csvText: csv, xlsxBase64: xlsx })
    const { _validRows, ...safe } = preview
    res.json({ success: true, data: safe })
  } catch (e) { next(e) }
}

export async function handleImportConfirm(req, res, next) {
  try {
    const { type, csv, xlsx } = req.body
    if (!type || (!csv && !xlsx)) throw new ApiError(400, 'type and (csv or xlsx) are required')
    const result = await confirmImport({
      type,
      csvText: csv,
      xlsxBase64: xlsx,
      userId: req.userId || req.user?.userId,
      ipAddress: req.ip
    })
    res.json({ success: true, data: result })
  } catch (e) { next(e) }
}

export async function handleImportTemplate(req, res, next) {
  try {
    const csv = getImportTemplate(req.params.type)
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.type}-template.csv"`)
    res.send(csv)
  } catch (e) { next(e) }
}

export async function handleImportTemplateXlsx(req, res, next) {
  try {
    const XLSX = await import('xlsx')
    const csv = getImportTemplate(req.params.type)
    const headers = csv.trim().split(',')
    const ws = XLSX.utils.json_to_sheet([], { header: headers })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, req.params.type)
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.type}-template.xlsx"`)
    res.send(buf)
  } catch (e) { next(e) }
}

export default { handleExport, handleImportPreview, handleImportConfirm, handleImportTemplate, handleImportTemplateXlsx }
