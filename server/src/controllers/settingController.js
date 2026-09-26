/**
 * Setting Controller
 */
import prisma from '../config/prisma.js'
import { ApiError } from '../middleware/errorHandler.js'
import { createAuditLog } from '../services/auditService.js'

const DEFAULT_SETTINGS = [
  { key: 'business_name', value: 'Lumière Perfume', type: 'string' },
  { key: 'business_phone', value: '', type: 'string' },
  { key: 'business_email', value: '', type: 'string' },
  { key: 'currency', value: 'ETB', type: 'string' },
  { key: 'timezone', value: 'UTC', type: 'string' },
  { key: 'low_stock_threshold', value: '5', type: 'number' },
  { key: 'overstock_multiplier', value: '5', type: 'number' },
  { key: 'default_location', value: '', type: 'string' },
  { key: 'backup_interval_hours', value: '6', type: 'number' },
  { key: 'backup_retention_days', value: '30', type: 'number' },
  { key: 'notifications_enabled', value: 'true', type: 'boolean' },
  { key: 'finance_country', value: 'ETHIOPIA', type: 'string' },
  { key: 'finance_currency', value: 'ETB', type: 'string' },
  { key: 'finance_accounting_basis', value: 'ACCRUAL', type: 'string' },
  { key: 'inventory_cost_method', value: 'FIFO', type: 'string' },
  { key: 'finance_fiscal_year_start', value: '07-08', type: 'string' },
  { key: 'ethiopia_taxpayer_tin', value: '', type: 'string' },
  { key: 'ethiopia_vat_registered', value: 'false', type: 'boolean' },
  { key: 'ethiopia_vat_rate', value: '15', type: 'number' },
  { key: 'ethiopia_vat_inclusive', value: 'false', type: 'boolean' },
  { key: 'ethiopia_withholding_enabled', value: 'false', type: 'boolean' },
  { key: 'ethiopia_withholding_rate', value: '2', type: 'number' },
  { key: 'ethiopia_invoice_prefix', value: 'INV-', type: 'string' },
  { key: 'ethiopia_invoice_next_number', value: '1', type: 'number' }
  ,{ key: 'product_code_prefix_unisex', value: 'U', type: 'string' }
  ,{ key: 'product_code_prefix_male', value: 'M', type: 'string' }
  ,{ key: 'product_code_prefix_female', value: 'F', type: 'string' }
  ,{ key: 'product_code_prefix_kids', value: 'K', type: 'string' }
  ,{ key: 'product_code_prefix_oil', value: 'O', type: 'string' }
  ,{ key: 'product_code_next_number', value: '1', type: 'number' }
  ,{ key: 'business_address', value: '', type: 'string' }
  ,{ key: 'receipt_footer', value: 'Thank you for choosing LUMIER PERFUME. Please keep this receipt for your records.', type: 'string' }
  ,{ key: 'pos_default_payment_method', value: 'CASH', type: 'string' }
  ,{ key: 'pos_payment_methods', value: 'CASH,BANK_TRANSFER,TELEBIRR,CARD,CREDIT', type: 'string' }
  // POS cashier discount limit: total sale discount up to this percent needs no
  // extra permission; above it the 'sale:discount' permission is required.
  // 0 = unlimited (the historic behaviour — no limit configured).
  ,{ key: 'pos_discount_limit_percent', value: '0', type: 'number' }
]

// Stable identifiers + types for every known setting. Used to validate and
// normalise incoming values — frontend values are never trusted blindly.
const SETTING_KEY_RE = /^[a-z0-9_]{1,100}$/
const SETTING_TYPES = ['string', 'number', 'boolean']
const SETTING_TYPE_BY_KEY = Object.fromEntries(DEFAULT_SETTINGS.map((s) => [s.key, s.type]))

/**
 * Validate & normalise one setting entry. Throws ApiError(400) with a clear
 * message on invalid input; otherwise returns { key, value, type } ready for
 * persistence. Booleans must be true/false, numbers must be numeric, payment
 * method lists must be comma-separated codes (CASH,BANK_TRANSFER,...).
 * Exported for pure unit testing (no database required).
 */
export function validateSettingEntry({ key, value, type }) {
  if (typeof key !== 'string' || !SETTING_KEY_RE.test(key)) {
    throw new ApiError(400, `Invalid setting key: ${String(key ?? '').slice(0, 40)}`)
  }
  if (type != null && !SETTING_TYPES.includes(type)) {
    throw new ApiError(400, `Invalid type "${type}" for setting ${key}`)
  }
  const effectiveType = SETTING_TYPE_BY_KEY[key] || (SETTING_TYPES.includes(type) ? type : 'string')
  let text = value == null ? '' : String(value)
  if (text.length > 2000) throw new ApiError(400, `Value for ${key} is too long (max 2000 characters)`)
  if (effectiveType === 'boolean') {
    if (text !== '' && text !== 'true' && text !== 'false') {
      throw new ApiError(400, `${key} must be true or false`)
    }
    if (text === '') text = 'false'
  }
  if (effectiveType === 'number' && text !== '' && !Number.isFinite(Number(text))) {
    throw new ApiError(400, `${key} must be a valid number`)
  }
  if (key === 'pos_payment_methods' && text.trim()) {
    const methods = text.split(',').map((m) => m.trim().toUpperCase()).filter(Boolean)
    if (methods.some((m) => !/^[A-Z_]{1,40}$/.test(m))) {
      throw new ApiError(400, 'pos_payment_methods must be a comma-separated list of codes like CASH,BANK_TRANSFER')
    }
    text = methods.join(',')
  }
  if (key === 'pos_default_payment_method' && text.trim()) {
    const method = text.trim().toUpperCase()
    if (!/^[A-Z_]{1,40}$/.test(method)) throw new ApiError(400, 'pos_default_payment_method must be a code like CASH')
    text = method
  }
  return { key, value: text, type: effectiveType }
}

export async function listSettings(req, res, next) {
  try {
    // Seed any missing defaults, then return the full list. The existing keys
    // are read FIRST so that in steady state this endpoint costs a single
    // query — re-running an upsert for every known key on every request once
    // occupied the whole connection pool (29 parallel upserts) and starved
    // concurrent dashboard/report queries on the remote database.
    const existing = await prisma.setting.findMany({ select: { key: true } })
    const existingKeys = new Set(existing.map((s) => s.key))
    const missing = DEFAULT_SETTINGS.filter((s) => !existingKeys.has(s.key))
    for (const s of missing) {
      await prisma.setting.upsert({ where: { key: s.key }, update: {}, create: s })
    }
    const settings = await prisma.setting.findMany({ orderBy: { key: 'asc' } })
    res.json({ success: true, data: settings })
  } catch (error) {
    next(error)
  }
}

export async function getSetting(req, res, next) {
  try {
    const { key } = req.params
    const setting = await prisma.setting.findUnique({ where: { key } })
    if (!setting) throw new ApiError(404, 'Setting not found')
    res.json({ success: true, data: setting })
  } catch (error) {
    next(error)
  }
}

export async function updateSettings(req, res, next) {
  try {
    const { settings } = req.body
    if (!Array.isArray(settings) || settings.length === 0) {
      throw new ApiError(400, 'Settings array is required')
    }

    // Validate & normalise everything BEFORE writing — invalid input aborts
    // the whole request with a clear 400 message and nothing is persisted.
    const entries = settings
      .filter((s) => s && typeof s === 'object' && s.key !== undefined && s.key !== null && s.key !== '')
      .map(validateSettingEntry)
    if (!entries.length) throw new ApiError(400, 'No valid settings provided')

    const results = await prisma.$transaction(async (tx) => {
      const out = []
      for (const s of entries) {
        out.push(await tx.setting.upsert({
          where: { key: s.key },
          update: { value: s.value, type: s.type },
          create: { key: s.key, value: s.value, type: s.type }
        }))
      }
      return out
    })

    await createAuditLog({
      userId: req.userId || req.user?.userId,
      action: 'SETTINGS_UPDATED',
      entity: 'Setting',
      details: { keys: results.map((r) => r.key) },
      ipAddress: req.ip
    })

    res.json({ success: true, data: results })
  } catch (error) {
    next(error)
  }
}

export async function updateSetting(req, res, next) {
  try {
    const { key } = req.params
    const { value, type } = req.body
    const entry = validateSettingEntry({ key, value, type })

    const setting = await prisma.setting.upsert({
      where: { key: entry.key },
      update: { value: entry.value, type: entry.type },
      create: { key: entry.key, value: entry.value, type: entry.type }
    })

    await createAuditLog({
      userId: req.userId || req.user?.userId,
      action: 'SETTING_UPDATED',
      entity: 'Setting',
      entityId: setting.id,
      details: { key: entry.key },
      ipAddress: req.ip
    })

    res.json({ success: true, data: setting })
  } catch (error) {
    next(error)
  }
}

export async function deleteSetting(req, res, next) {
  try {
    const { key } = req.params
    const existing = await prisma.setting.findUnique({ where: { key } })
    if (!existing) throw new ApiError(404, 'Setting not found')

    await prisma.setting.delete({ where: { key } })
    await createAuditLog({
      userId: req.userId || req.user?.userId,
      action: 'SETTING_DELETED',
      entity: 'Setting',
      details: { key },
      ipAddress: req.ip
    })
    res.json({ success: true, message: 'Setting deleted successfully' })
  } catch (error) {
    next(error)
  }
}
