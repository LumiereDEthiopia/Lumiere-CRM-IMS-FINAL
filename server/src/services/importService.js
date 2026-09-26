/**
 * Import Service — CSV / XLSX import with validate → preview → confirm flow
 */
import prisma from '../config/prisma.js'
import { createAuditLog } from './auditService.js'
import { ApiError } from '../middleware/errorHandler.js'
import { hashPassword } from './authService.js'
import * as XLSX from 'xlsx'

function parseCsv(text) {
  const lines = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim())
  if (!lines.length) return { headers: [], rows: [] }

  const parseLine = (line) => {
    const cells = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
        else if (ch === '"') inQuotes = false
        else cur += ch
      } else if (ch === '"') inQuotes = true
      else if (ch === ',') { cells.push(cur.trim()); cur = '' }
      else cur += ch
    }
    cells.push(cur.trim())
    return cells
  }

  const headers = parseLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'))
  const rows = lines.slice(1).map((line, idx) => {
    const cells = parseLine(line)
    const obj = { _row: idx + 2 }
    headers.forEach((h, i) => { obj[h] = cells[i] ?? '' })
    return obj
  })
  return { headers, rows }
}

function parseXlsxBase64(base64String) {
  const buf = Buffer.from(base64String, 'base64')
  const wb = XLSX.read(buf, { type: 'buffer' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) return { headers: [], rows: [] }
  const sheet = wb.Sheets[sheetName]
  const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
  if (!jsonRows.length) return { headers: [], rows: [] }
  const headers = Object.keys(jsonRows[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'))
  const rows = jsonRows.map((row, idx) => {
    const obj = { _row: idx + 2 }
    headers.forEach((h, i) => {
      const originalKey = Object.keys(row)[i]
      obj[h] = row[originalKey] != null ? String(row[originalKey]) : ''
    })
    return obj
  })
  return { headers, rows }
}

function slugify(text) {
  return String(text).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item'
}

const SCHEMAS = {
  products: {
    // Perfumes catalog format (Excel-compatible): id/name/code/brand/price/gender/
    // category/stockStatus/description/rating/accords/fragranceProfile/dayNight/seasons/notes.*
    required: ['name'],
    optional: ['id', 'code', 'brand', 'price', 'gender', 'category', 'stockstatus', 'description',
      'rating', 'accords', 'fragranceprofile', 'daynight', 'seasons', 'notes.top', 'notes.middle', 'notes.base']
  },
  customers: {
    required: ['name'],
    optional: ['email', 'tin_number', 'phone', 'customer_type', 'status', 'source', 'city', 'country', 'address']
  },
  suppliers: {
    required: ['name'],
    optional: ['contact_person', 'email', 'phone', 'city', 'country', 'address']
  },
  employees: {
    required: ['first_name', 'last_name'],
    optional: ['email', 'phone', 'job_title', 'department', 'location', 'employment_type', 'employment_status']
  }
}

export async function previewImport({ type, csvText, xlsxBase64 }) {
  const schema = SCHEMAS[type]
  if (!schema) throw new ApiError(400, `Unsupported import type: ${type}`)

  let headers, rows
  if (xlsxBase64) {
    const parsed = parseXlsxBase64(xlsxBase64)
    headers = parsed.headers
    rows = parsed.rows
  } else if (csvText) {
    const parsed = parseCsv(csvText)
    headers = parsed.headers
    rows = parsed.rows
  } else {
    throw new ApiError(400, 'Either csvText or xlsxBase64 is required')
  }
  const missingHeaders = schema.required.filter((h) => !headers.includes(h))
  if (missingHeaders.length) {
    throw new ApiError(400, `Missing required headers: ${missingHeaders.join(', ')}`)
  }

  const valid = []
  const errors = []

  for (const row of rows) {
    const rowErrors = []
    for (const req of schema.required) {
      if (!row[req]) rowErrors.push(`Missing ${req}`)
    }
    if (type === 'customers' && row.email && !row.email.includes('@')) rowErrors.push('Invalid email')
    if (type === 'employees' && row.email && !row.email.includes('@')) rowErrors.push('Invalid email')
    if (type === 'products' && row.price && isNaN(Number(row.price))) rowErrors.push('Invalid price')
    if (type === 'products' && row.rating && (isNaN(Number(row.rating)) || Number(row.rating) < 0 || Number(row.rating) > 5)) rowErrors.push('Invalid rating (0-5)')

    if (rowErrors.length) {
      errors.push({ row: row._row, errors: rowErrors, data: row })
    } else {
      valid.push(row)
    }
  }

  return {
    type,
    headers,
    totalRows: rows.length,
    validCount: valid.length,
    errorCount: errors.length,
    preview: valid.slice(0, 20),
    errors: errors.slice(0, 100),
    canImport: errors.length === 0 && valid.length > 0,
    _validRows: valid
  }
}

export async function confirmImport({ type, csvText, xlsxBase64, userId, ipAddress }) {
  const preview = await previewImport({ type, csvText, xlsxBase64 })
  if (!preview.canImport) {
    throw new ApiError(400, 'Import blocked: fix validation errors before confirming. Partial import is not allowed.')
  }

  const rows = preview._validRows

  const result = await prisma.$transaction(async (tx) => {
    let imported = 0

    if (type === 'products') {
      // Perfumes catalog format: id→slug, code→sku, accords/notes as pipe-joined cells
      const genderMap = { female: 'women', male: 'men', men: 'men', women: 'women', unisex: 'unisex', kids: 'kids' }
      const splitPipe = (v) => String(v || '').split('|').map((s) => s.trim()).filter(Boolean)

      for (const row of rows) {
        // Brand — find-or-create
        let brand
        const brandName = String(row.brand || '').trim()
        if (brandName) {
          brand = await tx.brand.findFirst({ where: { name: { equals: brandName } } })
          if (!brand) {
            let slug = slugify(brandName)
            if (await tx.brand.findUnique({ where: { slug } })) slug = slug + '-' + Date.now().toString(36)
            brand = await tx.brand.create({ data: { name: brandName, slug, isActive: true } })
          }
        } else {
          brand = await tx.brand.findFirst() || await tx.brand.create({ data: { name: 'Unbranded', slug: 'unbranded' } })
        }

        // Category — find-or-create (e.g. "Brand Perfume", "Luxury Perfume")
        let categoryId = null
        const catName = String(row.category || '').trim()
        if (catName) {
          let cat = await tx.category.findFirst({ where: { name: { equals: catName } } })
          if (!cat) {
            let cslug = slugify(catName)
            if (await tx.category.findUnique({ where: { slug: cslug } })) cslug = cslug + '-' + Date.now().toString(36)
            cat = await tx.category.create({ data: { name: catName, slug: cslug, isActive: true } })
          }
          categoryId = cat.id
        }

        const slug = row.id ? slugify(row.id) : slugify(row.name)
        const stockStatus = String(row.stockstatus || '').toLowerCase()

        const workbookSlug = row.id ? slugify(row.id) : slugify(row.name)
        const existingProduct = await tx.product.findFirst({
          where: { OR: [{ slug: workbookSlug }, ...(row.code ? [{ sku: row.code }] : [])] }
        })

        const data = {
          name: String(row.name).trim(),
          slug: existingProduct?.slug || workbookSlug,
          sku: row.code || null,
          productType: (() => {
            const t = String(row.producttype || row.product_type || '').toUpperCase()
            return t === 'OIL' ? 'OIL' : t === 'PURE_OIL' ? 'PURE_OIL' : 'PERFUME'
          })(),
          brandId: brand.id,
          categoryId,
          gender: genderMap[String(row.gender || '').toLowerCase()] || (row.gender ? String(row.gender).toLowerCase() : null),
          price: Number(row.price || 0),
          description: row.description || null,
          rating: row.rating ? Number(row.rating) : null,
          fragranceProfile: row.fragranceprofile || null,
          dayNight: row.daynight || null,
          seasons: row.seasons || null,
          isActive: stockStatus ? !stockStatus.includes('out') && !stockStatus.includes('inactive') : true
        }

        // Upsert by id/slug so re-importing a catalog refreshes it instead of duplicating
        let product = existingProduct
        if (product) {
          product = await tx.product.update({ where: { id: product.id }, data })
        } else {
          product = await tx.product.create({ data })
        }

        // Accords — "Floral:95 | Citrus:85 | fresh spicy:83"
        if (row.accords !== undefined) {
          await tx.productAccord.deleteMany({ where: { productId: product.id } })
          let order = 0
          for (const part of splitPipe(row.accords)) {
            const sep = part.lastIndexOf(':')
            const aname = sep > 0 ? part.slice(0, sep).trim() : part
            const intensity = sep > 0 ? parseInt(part.slice(sep + 1)) || 50 : 50
            if (!aname) continue
            let accord = await tx.accord.findFirst({ where: { name: { equals: aname } } })
            if (!accord) {
              let aslug = slugify(aname)
              if (await tx.accord.findUnique({ where: { slug: aslug } })) aslug = aslug + '-' + Date.now().toString(36)
              accord = await tx.accord.create({ data: { name: aname, slug: aslug, isActive: true } })
            }
            await tx.productAccord.create({ data: { productId: product.id, accordId: accord.id, intensity, sortOrder: order++ } })
          }
        }

        // Notes — notes.top → TOP, notes.middle → HEART, notes.base → BASE
        if (row['notes.top'] !== undefined || row['notes.middle'] !== undefined || row['notes.base'] !== undefined) {
          await tx.productNote.deleteMany({ where: { productId: product.id } })
          let order = 0
          const seenNotes = new Set()
          const groups = [['notes.top', 'TOP'], ['notes.middle', 'HEART'], ['notes.base', 'BASE']]
          for (const [col, type] of groups) {
            for (const nname of splitPipe(row[col])) {
              const noteKey = `${type}:${nname.toLowerCase()}`
              if (seenNotes.has(noteKey)) continue
              seenNotes.add(noteKey)
              let note = await tx.fragranceNote.findFirst({ where: { name: { equals: nname } } })
              if (!note) {
                let nslug = slugify(nname)
                if (await tx.fragranceNote.findUnique({ where: { slug: nslug } })) nslug = nslug + '-' + Date.now().toString(36)
                note = await tx.fragranceNote.create({ data: { name: nname, slug: nslug } })
              }
              await tx.productNote.create({ data: { productId: product.id, fragranceNoteId: note.id, noteType: type, sortOrder: order++ } })
            }
          }
        }

        imported++
      }
    }

    if (type === 'customers') {
      for (const row of rows) {
        const count = await tx.customer.count()
        await tx.customer.create({
          data: {
            customerCode: 'CUS-' + String(count + imported + 1).padStart(4, '0'),
            name: row.name,
            email: row.email || null,
            tinNumber: row.tin_number || null,
            phone: row.phone || null,
            customerType: row.customer_type || 'INDIVIDUAL',
            status: row.status || 'LEAD',
            source: row.source || null,
            city: row.city || null,
            country: row.country || null,
            address: row.address || null
          }
        })
        imported++
      }
    }

    if (type === 'suppliers') {
      for (const row of rows) {
        await tx.supplier.create({
          data: {
            name: row.name,
            contactPerson: row.contact_person || null,
            email: row.email || null,
            phone: row.phone || null,
            city: row.city || null,
            country: row.country || null,
            address: row.address || null
          }
        })
        imported++
      }
    }

    if (type === 'employees') {
      for (const row of rows) {
        let departmentId = null
        let locationId = null
        if (row.department) {
          const dept = await tx.department.findFirst({ where: { OR: [{ name: row.department }, { code: row.department }] } })
          departmentId = dept?.id || null
        }
        if (row.location) {
          const loc = await tx.location.findFirst({ where: { OR: [{ name: row.location }, { code: row.location }] } })
          locationId = loc?.id || null
        }
        const count = await tx.employee.count()
        await tx.employee.create({
          data: {
            employeeCode: 'EMP-' + String(count + imported + 1).padStart(4, '0'),
            firstName: row.first_name,
            lastName: row.last_name,
            email: row.email || null,
            phone: row.phone || null,
            jobTitle: row.job_title || null,
            departmentId,
            locationId,
            employmentType: row.employment_type || 'FULL_TIME',
            employmentStatus: row.employment_status || 'ACTIVE'
          }
        })
        imported++
      }
    }

    return { imported }
  })

  await createAuditLog({
    userId,
    action: 'DATA_IMPORT',
    entity: 'Import',
    details: { type, imported: result.imported },
    ipAddress
  })

  return { success: true, imported: result.imported, type }
}

export function getImportTemplate(type) {
  const schema = SCHEMAS[type]
  if (!schema) throw new ApiError(400, `Unsupported import type: ${type}`)
  // Perfumes catalog template matches the Excel sheet exactly (17 columns)
  const headers = type === 'products'
    ? ['id', 'name', 'code', 'brand', 'price', 'gender', 'category', 'stockStatus', 'description', 'rating',
        'accords', 'fragranceProfile', 'dayNight', 'seasons', 'notes.top', 'notes.middle', 'notes.base']
    : [...schema.required, ...schema.optional]
  return headers.join(',') + '\n'
}

// Keep hashPassword imported for future user-linked employee import (unused intentionally guarded)
void hashPassword

export default { previewImport, confirmImport, getImportTemplate }
