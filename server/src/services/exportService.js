/**
 * Export Service — CSV / JSON / XLSX exports with permission-aware redaction
 */
import prisma from '../config/prisma.js'
import { createAuditLog } from './auditService.js'
import { ApiError } from '../middleware/errorHandler.js'
import * as XLSX from 'xlsx'

function toCsv(rows, columns) {
  const escape = (v) => {
    if (v == null) return ''
    const s = String(v)
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const header = columns.map((c) => escape(c.label)).join(',')
  const lines = rows.map((row) => columns.map((c) => escape(typeof c.value === 'function' ? c.value(row) : row[c.key])).join(','))
  return [header, ...lines].join('\n')
}

const EXPORTERS = {
  products: async () => {
    // Excel "Perfumes" catalog format — 17 columns, multi-values pipe-joined
    const rows = await prisma.product.findMany({
      include: {
        brand: { select: { name: true } },
        category: { select: { name: true } },
        accords: { include: { accord: { select: { name: true } } }, orderBy: { sortOrder: 'asc' } },
        notes: { include: { fragranceNote: { select: { name: true } } }, orderBy: { sortOrder: 'asc' } }
      },
      take: 10000
    })
    const genderLabel = (g) => {
      const map = { men: 'Male', male: 'Male', women: 'Female', female: 'Female', unisex: 'Unisex', kids: 'Kids' }
      return map[String(g || '').toLowerCase()] || (g ? String(g) : '')
    }
    const byType = (r, type) => (r.notes || []).filter((n) => n.noteType === type).map((n) => n.fragranceNote?.name).filter(Boolean).join(' | ')
    return {
      columns: [
        { key: 'slug', label: 'id' },
        { key: 'name', label: 'name' },
        { key: 'sku', label: 'code' },
        { key: 'productType', label: 'productType' },
        { label: 'brand', value: (r) => r.brand?.name },
        { key: 'price', label: 'price' },
        { label: 'gender', value: (r) => genderLabel(r.gender) },
        { label: 'category', value: (r) => r.category?.name },
        { label: 'stockStatus', value: (r) => (r.isActive ? 'In Stock' : 'Out of Stock') },
        { key: 'description', label: 'description' },
        { key: 'rating', label: 'rating' },
        { label: 'accords', value: (r) => (r.accords || []).map((a) => `${a.accord?.name || ''}:${a.intensity ?? 50}`).filter((s) => !s.startsWith(':')).join(' | ') },
        { key: 'fragranceProfile', label: 'fragranceProfile' },
        { key: 'dayNight', label: 'dayNight' },
        { key: 'seasons', label: 'seasons' },
        { label: 'notes.top', value: (r) => byType(r, 'TOP') },
        { label: 'notes.middle', value: (r) => byType(r, 'HEART') },
        { label: 'notes.base', value: (r) => byType(r, 'BASE') }
      ],
      rows
    }
  },
  inventory: async () => {
    const rows = await prisma.inventory.findMany({
      include: {
        product: { select: { name: true, sku: true, costPrice: true, price: true } },
        location: { select: { name: true, code: true } }
      },
      take: 10000
    })
    return {
      columns: [
        { label: 'Product', value: (r) => r.product?.name },
        { label: 'SKU', value: (r) => r.product?.sku },
        { label: 'Location', value: (r) => r.location?.name },
        { key: 'quantity', label: 'Quantity' },
        { key: 'reservedQuantity', label: 'Reserved' },
        { key: 'availableQuantity', label: 'Available' },
        { label: 'Reorder Level', value: (r) => r.product?.minimumStock },
        { label: 'Reorder Status', value: (r) => Number(r.availableQuantity) <= Number(r.product?.minimumStock || 0) ? 'REORDER' : 'OK' },
        { label: 'Cost Value', value: (r) => Number(r.quantity) * Number(r.product?.costPrice || 0) },
        { label: 'Retail Value', value: (r) => Number(r.quantity) * Number(r.product?.price || 0) }
      ],
      rows
    }
  },
  customers: async () => {
    const rows = await prisma.customer.findMany({ take: 10000 })
    return {
      columns: [
        { key: 'customerCode', label: 'Code' },
        { key: 'name', label: 'Name' },
        { key: 'email', label: 'Email' },
        { key: 'tinNumber', label: 'TIN Number' },
        { key: 'phone', label: 'Phone' },
        { key: 'customerType', label: 'Type' },
        { key: 'status', label: 'Status' },
        { key: 'source', label: 'Source' },
        { key: 'city', label: 'City' },
        { key: 'country', label: 'Country' }
      ],
      rows
    }
  },
  suppliers: async () => {
    const rows = await prisma.supplier.findMany({ take: 10000 })
    return {
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'contactPerson', label: 'Contact' },
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Phone' },
        { key: 'city', label: 'City' },
        { key: 'country', label: 'Country' },
        { key: 'isActive', label: 'Active' }
      ],
      rows
    }
  },
  sales: async () => {
    const rows = await prisma.sale.findMany({
      include: { customer: { select: { name: true, tinNumber: true } }, location: { select: { name: true } } },
      take: 10000,
      orderBy: { soldAt: 'desc' }
    })
    return {
      columns: [
        { key: 'saleNumber', label: 'Sale #' },
        { label: 'Customer', value: (r) => r.customer?.name },
        { label: 'Customer TIN', value: (r) => r.customer?.tinNumber },
        { key: 'salesChannel', label: 'Sales Section' },
        { key: 'paymentMethod', label: 'Payment Method' },
        { key: 'customerRegistrationNote', label: 'Customer / Registration Note' },
        { label: 'Location', value: (r) => r.location?.name },
        { key: 'status', label: 'Status' },
        { key: 'subtotal', label: 'Subtotal' },
        { key: 'discount', label: 'Discount' },
        { key: 'total', label: 'Total' },
        { key: 'soldAt', label: 'Sold At' }
      ],
      rows
    }
  },
  purchases: async () => {
    const rows = await prisma.purchase.findMany({
      include: { supplier: { select: { name: true } }, location: { select: { name: true } } },
      take: 10000
    })
    return {
      columns: [
        { key: 'purchaseNumber', label: 'Purchase #' },
        { label: 'Supplier', value: (r) => r.supplier?.name },
        { label: 'Location', value: (r) => r.location?.name },
        { key: 'status', label: 'Status' },
        { key: 'total', label: 'Total' },
        { key: 'createdAt', label: 'Created' }
      ],
      rows
    }
  },
  employees: async ({ includeSensitive }) => {
    const rows = await prisma.employee.findMany({
      include: {
        department: { select: { name: true } },
        location: { select: { name: true } }
      },
      take: 10000
    })
    const columns = [
      { key: 'employeeCode', label: 'Code' },
      { key: 'firstName', label: 'First Name' },
      { key: 'lastName', label: 'Last Name' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'jobTitle', label: 'Job Title' },
      { label: 'Department', value: (r) => r.department?.name },
      { label: 'Location', value: (r) => r.location?.name },
      { key: 'employmentType', label: 'Type' },
      { key: 'employmentStatus', label: 'Status' },
      { key: 'hireDate', label: 'Hire Date' }
    ]
    if (includeSensitive) {
      columns.push(
        { key: 'salary', label: 'Salary' },
        { key: 'salaryCurrency', label: 'Currency' },
        { key: 'dateOfBirth', label: 'DOB' },
        { key: 'emergencyContactName', label: 'Emergency Contact' },
        { key: 'emergencyContactPhone', label: 'Emergency Phone' }
      )
    }
    return { columns, rows }
  },
  stock_movements: async () => {
    const validProductIds = (await prisma.product.findMany({ select: { id: true } })).map((product) => product.id)
    const rows = await prisma.stockMovement.findMany({
      where: { productId: { in: validProductIds } },
      include: { product: { select: { name: true, sku: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10000
    })
    return {
      columns: [
        { label: 'Product', value: (r) => r.product?.name },
        { label: 'SKU', value: (r) => r.product?.sku },
        { key: 'locationId', label: 'Location ID' },
        { key: 'type', label: 'Type' },
        { key: 'quantity', label: 'Quantity' },
        { key: 'previousQuantity', label: 'Previous Qty' },
        { key: 'resultingQuantity', label: 'Resulting Qty' },
        { key: 'reason', label: 'Reason' },
        { key: 'createdAt', label: 'Date' }
      ],
      rows
    }
  },
  audit_logs: async () => {
    const rows = await prisma.auditLog.findMany({
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10000
    })
    return {
      columns: [
        { label: 'User', value: (r) => r.user?.name || r.userId },
        { key: 'action', label: 'Action' },
        { key: 'entity', label: 'Entity' },
        { key: 'entityId', label: 'Entity ID' },
        { key: 'details', label: 'Details' },
        { key: 'ipAddress', label: 'IP' },
        { key: 'createdAt', label: 'Date' }
      ],
      rows
    }
  }
}

export async function exportData({ type, format = 'csv', userId, permissions = [], ipAddress }) {
  const exporter = EXPORTERS[type]
  if (!exporter) throw new ApiError(400, `Unsupported export type: ${type}`)

  const includeSensitive = permissions.includes('employee:view_sensitive') || permissions.includes('*')
  if (type === 'employees' && !includeSensitive && !permissions.includes('employee:view') && !permissions.includes('*')) {
    throw new ApiError(403, 'Insufficient permissions')
  }

  const { columns, rows } = await exporter({ includeSensitive })
  await createAuditLog({
    userId,
    action: 'DATA_EXPORT',
    entity: 'Export',
    details: { type, format, rowCount: rows.length },
    ipAddress
  })

  if (format === 'json') {
    const safeRows = rows.map((r) => {
      const obj = {}
      for (const c of columns) {
        obj[c.label || c.key] = typeof c.value === 'function' ? c.value(r) : r[c.key]
      }
      return obj
    })
    return { contentType: 'application/json', body: JSON.stringify(safeRows, null, 2), filename: `${type}-export.json` }
  }

  if (format === 'xlsx') {
    const safeRows = rows.map((r) => {
      const obj = {}
      for (const c of columns) {
        obj[c.label || c.key] = typeof c.value === 'function' ? c.value(r) : r[c.key]
      }
      return obj
    })
    const ws = XLSX.utils.json_to_sheet(safeRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, type)
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    return {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: buf,
      filename: `${type}-export.xlsx`
    }
  }

  return {
    contentType: 'text/csv; charset=utf-8',
    body: toCsv(rows, columns),
    filename: `${type}-export.csv`
  }
}

export default { exportData }
