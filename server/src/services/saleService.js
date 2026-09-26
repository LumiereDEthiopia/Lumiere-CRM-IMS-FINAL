/**
 * Sale Service - Internal Sales
 */
import prisma from '../config/prisma.js'
import { ApiError } from '../middleware/errorHandler.js'
import { createAuditLog } from './auditService.js'
import { sanitizeTin } from './tinVerificationService.js'
import { resolveSoldSize, sizeBuckets, sizeMlOf, availableForSize, productStockPatch, lineMl } from './sizeStockService.js'
import { consumeItemsForSale, validateItemsForSale, restoreItemsForSaleCancel } from './itemService.js'
import { postSaleEntry, deleteJournalEntriesForSource } from './accountingService.js'

// Monetary rounding — 2 decimals, same rule as the accounting service.
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

/**
 * Sale tax/total calculation — the single business rule for VAT, withholding and
 * the amount the customer actually pays.
 *
 * BUSINESS RULE: product prices are VAT-INCLUSIVE; the shelf price IS the final
 * selling price. Therefore:
 *   • VAT is EXTRACTED from the VAT-inclusive amount — never added on top of it.
 *   • The taxable (VAT-exclusive) base = VAT-inclusive amount − VAT.
 *   • Withholding is computed on that VAT-exclusive base and is a tax BREAKDOWN
 *     only — it never reduces the amount due.
 *   • TOTAL = (price × qty) − discount   (i.e. the VAT-inclusive amount).
 *
 * Example — Br 6,500.00, qty 1, no discount, VAT 15%, withholding 3%:
 *   VAT 847.83 · taxable 5,652.17 · withholding 169.57 · TOTAL 6,500.00
 */
export function computeSaleTaxTotals({
  subtotal,
  discount = 0,
  vatRate = 0,
  vatInclusive = true,
  withholdingRate = 0,
  withholdingEnabled = false,
  customerHasTin = false,
  applyWithholding = false
}) {
  // VAT-inclusive amount the customer pays, after discount.
  const netSubtotal = round2((Number(subtotal) || 0) - (Number(discount) || 0))
  const rate = Number(vatRate) || 0
  // VAT extracted from an inclusive price (or added to an exclusive one).
  const vatAmount = round2(rate > 0 ? (vatInclusive ? netSubtotal - (netSubtotal / (1 + rate / 100)) : netSubtotal * rate / 100) : 0)
  const taxableSubtotal = round2(vatInclusive ? netSubtotal - vatAmount : netSubtotal)
  // Withholding only applies to a registered (TIN-holding) customer, when enabled.
  const withholdingAmount = (withholdingEnabled && customerHasTin && Number(withholdingRate) > 0 && applyWithholding)
    ? round2(taxableSubtotal * Number(withholdingRate) / 100)
    : 0
  // Withholding is deliberately NOT subtracted — the customer pays the full
  // VAT-inclusive price (minus any discount).
  const total = round2(vatInclusive ? netSubtotal : netSubtotal + vatAmount)
  return { netSubtotal, vatAmount, taxableSubtotal, withholdingAmount, total }
}

// ---------------------------------------------------------------------------
// Direct Sale · Discount · Free Gift — pure pricing/authorization helpers.
// No database access: unit-tested directly (tests/sale-discount-free-gift.test.js).
// ---------------------------------------------------------------------------

const toNum = (v) => {
  if (v === null || v === undefined || v === '') return NaN
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}

/**
 * AUTHORITATIVE unit price — resolved from the product catalog, never from
 * the browser. Mirrors the POS display rule: the 100ml price applies when the
 * 100ml bottle is selected and configured, otherwise the base price.
 * Returns null only when the catalog has no usable price (legacy rows), so
 * the caller can fall back to a validated client value.
 */
export function resolveServerUnitPrice(product, requestedSize) {
  if (!product) return null
  if (String(requestedSize || '').trim().toLowerCase() === '100ml' && product.price100ml != null) {
    const p100 = toNum(product.price100ml)
    if (!Number.isNaN(p100) && p100 >= 0) return round2(p100)
  }
  const base = toNum(product.price)
  return Number.isNaN(base) || base < 0 ? null : round2(base)
}

/**
 * Validate a discount input and return the Birr amount it represents.
 * Rejects NaN, negatives, percentages > 100 and amounts above the eligible base.
 * `discountType`: 'PERCENTAGE' | 'FIXED' | null (null ⇒ the value itself is Birr).
 */
export function computeDiscountAmount({ base, discountType = null, discountValue = 0, label = 'Discount' }) {
  const baseAmt = round2(base)
  if (Number.isNaN(baseAmt) || baseAmt < 0) throw new ApiError(400, `Invalid amount for ${label}`)
  const type = discountType == null || discountType === '' ? null : String(discountType).toUpperCase()
  const value = discountValue == null || discountValue === '' ? 0 : toNum(discountValue)
  if (Number.isNaN(value)) throw new ApiError(400, `${label} value must be a number`)
  if (value < 0) throw new ApiError(400, `${label} cannot be negative`)
  const isPercent = type === 'PERCENTAGE' || type === 'PERCENT' || type === '%'
  if (isPercent) {
    if (value > 100) throw new ApiError(400, `${label} percentage cannot exceed 100%`)
    if (value === 0 || baseAmt === 0) return 0
    const amount = round2(baseAmt * value / 100)
    if (amount > baseAmt) throw new ApiError(400, `${label} exceeds the eligible amount`)
    return amount
  }
  if (type != null && type !== 'FIXED' && type !== 'AMOUNT' && type !== 'BIRR') {
    throw new ApiError(400, `Invalid ${label} type "${discountType}" — use PERCENTAGE or FIXED`)
  }
  if (value === 0) return 0
  const amount = round2(value)
  if (amount > baseAmt) throw new ApiError(400, `${label} exceeds the eligible amount`)
  return amount
}

/**
 * Line pricing: gross → discount → charged. A FREE GIFT line keeps its real
 * catalog price (regularUnitPrice) for internal reporting but is charged 0 and
 * contributes 0 to subtotal, discounts and revenue.
 */
export function resolveLinePricing({ unitPrice, quantity, discountType = null, discountValue = 0, isFreeGift = false, label = 'item' }) {
  const price = toNum(unitPrice)
  const qty = toNum(quantity)
  if (Number.isNaN(price) || price < 0) throw new ApiError(400, `Invalid unit price for ${label}`)
  if (Number.isNaN(qty) || qty <= 0) throw new ApiError(400, `Invalid quantity for ${label}`)
  const gross = round2(price * qty)
  if (isFreeGift) {
    return { unitPrice: round2(price), gross, discountAmount: 0, charged: 0, itemType: 'FREE_GIFT', giftValue: gross }
  }
  const discountAmount = computeDiscountAmount({ base: gross, discountType, discountValue, label: `Discount for ${label}` })
  const charged = round2(gross - discountAmount)
  if (charged < 0) throw new ApiError(400, `Discount exceeds the eligible amount for ${label}`)
  return { unitPrice: round2(price), gross, discountAmount, charged, itemType: discountAmount > 0 ? 'DISCOUNTED' : 'NORMAL', giftValue: 0 }
}

/**
 * Sale-level discount applied AFTER item discounts, on the remaining
 * consideration: eligible = subtotal − item discounts. The legacy amount-only
 * form (`discount`, no type/value) still works exactly as before.
 */
export function resolveSaleDiscount({ eligible, discount = 0, discountType = null, discountValue = null }) {
  const base = round2(eligible)
  if (Number.isNaN(base) || base < 0) throw new ApiError(400, 'Invalid sale amount')
  const hasType = discountType != null && discountType !== ''
  const hasValue = discountValue != null && discountValue !== ''
  if (hasType || hasValue) {
    const enteredType = hasType ? String(discountType).toUpperCase() : 'FIXED'
    const entered = hasValue ? discountValue : 0
    const isPercent = enteredType === 'PERCENTAGE' || enteredType === 'PERCENT' || enteredType === '%'
    const amount = computeDiscountAmount({ base, discountType: isPercent ? 'PERCENTAGE' : 'FIXED', discountValue: entered, label: 'Sale discount' })
    return { amount, type: isPercent ? 'PERCENTAGE' : 'FIXED', value: isPercent ? Number(entered) : amount }
  }
  const amount = computeDiscountAmount({ base, discountType: null, discountValue: discount ?? 0, label: 'Sale discount' })
  return { amount, type: amount > 0 ? 'FIXED' : null, value: amount }
}

/**
 * Permission gate — enforced through the EXISTING JWT/session role system.
 *  • Free gifts always require `sale:free_gift`.
 *  • Discounts within the configured cashier limit (Setting
 *    `pos_discount_limit_percent`, 0 = no limit) need no extra permission —
 *    matching how the POS has always worked; above the limit `sale:discount`
 *    is required (SUPER_ADMIN / '*' always pass).
 * Limits are business configuration — never hard-coded here.
 *
 * FREE GIFT VAT ASSUMPTION (flagged for business/tax review — do not treat as
 * legal advice): a gift line carries ZERO customer consideration, so no VAT is
 * charged on it under the consideration-based VAT rules (Proc. 1341/2024 /
 * Reg. 570/2025) already implemented in computeSaleTaxTotals. The item is
 * recorded as a FREE_GIFT promotional movement — NOT as a "VAT-exempt supply"
 * and NOT as zero-price stock. If a specific promotion is later ruled
 * otherwise by the tax authority, make the treatment configurable then.
 */
export function authorizeDiscountAndGift({ user, hasFreeGift, discountPercent, discountLimitPercent }) {
  const perms = user && Array.isArray(user.permissions) ? user.permissions : []
  const isSuper = !!user && (user.role === 'SUPER_ADMIN' || perms.includes('*'))
  const can = (perm) => isSuper || perms.includes(perm)
  if (hasFreeGift && !can('sale:free_gift')) {
    throw new ApiError(403, "Adding a free gift requires the 'sale:free_gift' permission — ask a manager to grant it in Settings → Account Roles.")
  }
  const limit = toNum(discountLimitPercent)
  const pct = toNum(discountPercent)
  if (!Number.isNaN(limit) && limit > 0 && !Number.isNaN(pct) && pct > limit && !can('sale:discount')) {
    throw new ApiError(403, `Discount of ${pct.toFixed(2)}% exceeds the ${limit}% cashier limit — the 'sale:discount' permission is required to approve it.`)
  }
}

/**
 * Change due = max(0, paid − total) at 2 decimals; null when nothing was
 * tendered. A paid amount below the total (credit part-sale) yields 0 change.
 */
export function computeChange(paid, total) {
  if (paid == null || paid === '') return null
  const p = toNum(paid)
  if (Number.isNaN(p) || p < 0) throw new ApiError(400, 'Invalid paid amount')
  return round2(Math.max(0, p - round2(total)))
}

/**
 * Validate the combined quantity requested for each product/size bucket.
 * A paid line and a FREE_GIFT line for the same product consume the same stock,
 * so checking each cart row independently would allow an oversell.
 */
export function validateCombinedSaleStock(lines) {
  const demandByBucket = new Map()
  const demandByProduct = new Map()

  for (const line of lines) {
    const product = line.product || {}
    const productId = product.id || line.productId
    const productName = product.name || line.productName || 'Product'
    const soldSize = line.soldSize || line.size || null
    const quantity = Number(line.quantity)
    const available = Number(line.available)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new ApiError(400, `Invalid quantity for ${productName}`)
    }

    const buckets = sizeBuckets(product)
    if (buckets.tracked) {
      // Track both the size-specific demand and total product demand. The
      // latter prevents an un-sized/legacy line from bypassing a 50ml/100ml
      // bucket check.
      const totalKey = `${productId}::TOTAL`
      const totalAvailable = Math.max(Number(product.stockQuantity || 0), buckets.s50 + buckets.s100)
      const totalDemand = demandByProduct.get(totalKey) || {
        productName,
        available: totalAvailable,
        quantity: 0
      }
      totalDemand.quantity += quantity
      demandByProduct.set(totalKey, totalDemand)

      if (soldSize) {
        const key = `${productId}::${soldSize}`
        const sizeAvailable = soldSize === '100ml' ? buckets.s100 : buckets.s50
        const sizeDemand = demandByBucket.get(key) || {
          productName,
          soldSize,
          available: sizeAvailable,
          quantity: 0
        }
        sizeDemand.quantity += quantity
        demandByBucket.set(key, sizeDemand)
      }
    } else {
      const key = `${productId}::AGGREGATE`
      const aggregateDemand = demandByBucket.get(key) || {
        productName,
        soldSize: null,
        available,
        quantity: 0
      }
      aggregateDemand.quantity += quantity
      demandByBucket.set(key, aggregateDemand)
    }
  }

  for (const demand of [...demandByProduct.values(), ...demandByBucket.values()]) {
    if (demand.quantity > demand.available + 1e-9) {
      const size = demand.soldSize ? ` (${demand.soldSize})` : ''
      throw new ApiError(400, `Insufficient stock for ${demand.productName}${size} — only ${demand.available} available`)
    }
  }
}

export async function listSales({ page = 1, limit = 20, search, status, locationId, salesChannel, dateFrom, dateTo, createdBy, minAmount, maxAmount }) {
  page = parseInt(page) || 1
  limit = parseInt(limit) || 20
  const where = {}
  if (search) {
    where.OR = [
      { saleNumber: { contains: search } },
      { customer: { name: { contains: search } } },
      { customer: { phone: { contains: search } } },
      { customer: { customerCode: { contains: search } } }
    ]
  }
  if (status) where.status = status
  if (locationId) where.locationId = locationId
  if (salesChannel) where.salesChannel = salesChannel
  if (createdBy) where.createdBy = createdBy
  if (dateFrom || dateTo) {
    where.soldAt = {}
    if (dateFrom) where.soldAt.gte = new Date(dateFrom)
    if (dateTo) where.soldAt.lte = new Date(dateTo + 'T23:59:59')
  }
  if (minAmount || maxAmount) {
    where.total = {}
    if (minAmount) where.total.gte = parseFloat(minAmount)
    if (maxAmount) where.total.lte = parseFloat(maxAmount)
  }
  const [sales, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true, tinNumber: true, customerCode: true } },
        location: { select: { id: true, name: true } },
        _count: { select: { items: true } }
      },
      orderBy: { soldAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.sale.count({ where })
  ])
  return { data: sales, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
}

export async function getSale(id) {
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: {
      customer: true,
      location: true,
      items: { include: { product: { select: { id: true, name: true, sku: true, size: true, productType: true, price: true, price100ml: true, stockQuantity: true, brand: { select: { id: true, name: true } }, category: { select: { id: true, name: true } } } } } }
    }
  })
  if (!sale) throw new ApiError(404, 'Sale not found')
  return sale
}

/**
 * Daily sales activity for a given date (YYYY-MM-DD). Defaults to today.
 */
export async function getDailySalesActivity(date) {
  const day = date ? new Date(date) : new Date()
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate())
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)

  const [sales, topProducts, byEmployee, byLocation, byBrand, byCategory] = await Promise.all([
    prisma.sale.findMany({
      where: { soldAt: { gte: start, lt: end }, status: { not: 'CANCELLED' } },
      include: {
        customer: { select: { name: true } },
        location: { select: { name: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true, size: true, productType: true, price: true, price100ml: true, stockQuantity: true, brand: { select: { id: true, name: true } }, category: { select: { id: true, name: true } } } } } }
      },
      orderBy: { soldAt: 'desc' }
    }),
    prisma.$queryRawUnsafe(`
      SELECT si.productId, p.name, SUM(si.quantity) as units, SUM(si.totalPrice) as revenue
      FROM SaleItem si
      JOIN Product p ON si.productId = p.id
      JOIN Sale s ON si.saleId = s.id
      WHERE s.soldAt >= ? AND s.soldAt < ? AND s.status != 'CANCELLED'
      GROUP BY si.productId
      ORDER BY revenue DESC
      LIMIT 5
    `, start, end),
    prisma.$queryRawUnsafe(`
      SELECT s.createdBy, u.name, COUNT(*) as sales, SUM(s.total) as revenue
      FROM Sale s
      LEFT JOIN User u ON s.createdBy = u.id
      WHERE s.soldAt >= ? AND s.soldAt < ? AND s.status != 'CANCELLED'
      GROUP BY s.createdBy
      ORDER BY revenue DESC
    `, start, end),
    prisma.$queryRawUnsafe(`
      SELECT s.locationId, l.name, COUNT(*) as sales, SUM(s.total) as revenue
      FROM Sale s
      JOIN Location l ON s.locationId = l.id
      WHERE s.soldAt >= ? AND s.soldAt < ? AND s.status != 'CANCELLED'
      GROUP BY s.locationId
      ORDER BY revenue DESC
    `, start, end),
    prisma.$queryRawUnsafe(`
      SELECT b.name, SUM(si.quantity) as units, SUM(si.totalPrice) as revenue
      FROM SaleItem si
      JOIN Product p ON si.productId = p.id
      JOIN Brand b ON p.brandId = b.id
      JOIN Sale s ON si.saleId = s.id
      WHERE s.soldAt >= ? AND s.soldAt < ? AND s.status != 'CANCELLED'
      GROUP BY b.id
      ORDER BY revenue DESC
      LIMIT 5
    `, start, end),
    prisma.$queryRawUnsafe(`
      SELECT c.name, SUM(si.quantity) as units, SUM(si.totalPrice) as revenue
      FROM SaleItem si
      JOIN Product p ON si.productId = p.id
      JOIN Category c ON p.categoryId = c.id
      JOIN Sale s ON si.saleId = s.id
      WHERE s.soldAt >= ? AND s.soldAt < ? AND s.status != 'CANCELLED'
      GROUP BY c.id
      ORDER BY revenue DESC
      LIMIT 5
    `, start, end)
  ])

  const totalRevenue = sales.reduce((s, r) => s + Number(r.total || 0), 0)
  const totalDiscount = sales.reduce((s, r) => s + Number(r.discount || 0), 0)
  const totalUnits = sales.reduce((s, r) => s + r.items.reduce((qs, i) => qs + i.quantity, 0), 0)

  return {
    date: start.toISOString(),
    summary: {
      totalSales: sales.length,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalDiscount: Math.round(totalDiscount * 100) / 100,
      totalUnits,
      averageTransaction: sales.length ? Math.round((totalRevenue / sales.length) * 100) / 100 : 0
    },
    topProducts: topProducts.map(p => ({ ...p, units: Number(p.units), revenue: Number(p.revenue) })),
    byEmployee: byEmployee.map(e => ({ ...e, sales: Number(e.sales), revenue: Number(e.revenue) })),
    byLocation: byLocation.map(l => ({ ...l, sales: Number(l.sales), revenue: Number(l.revenue) })),
    byBrand: byBrand.map(b => ({ ...b, units: Number(b.units), revenue: Number(b.revenue) })),
    byCategory: byCategory.map(c => ({ ...c, units: Number(c.units), revenue: Number(c.revenue) })),
    sales
  }
}

/**
 * Resolve the TIN snapshot stored on the sale/invoice.
 * Names are taken ONLY from authoritative sources — the verified customer
 * record or the eTrade verification cache — never from the client payload.
 */
async function resolveSaleTin({ customerId, customerTin }) {
  const raw = customerTin != null && String(customerTin).trim() !== '' ? customerTin : null
  let tin = null
  if (raw) {
    const sanitized = sanitizeTin(raw)
    if (!sanitized.ok) throw new ApiError(400, sanitized.message)
    tin = sanitized.tin
  }

  if (customerId) {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } })
    if (!customer) throw new ApiError(404, 'Customer not found')
    // The customer's own TIN is authoritative when present
    const effectiveTin = customer.tinNumber || tin || null
    if (!effectiveTin) return { customerTin: null, customerTinName: null, customerTinVerified: false }
    if (customer.tinVerified) {
      return { customerTin: effectiveTin, customerTinName: customer.name, customerTinVerified: true }
    }
    const cached = await prisma.tinVerificationCache.findUnique({ where: { tin: effectiveTin } })
    return { customerTin: effectiveTin, customerTinName: cached?.verified ? cached.name : null, customerTinVerified: !!cached?.verified }
  }

  // Walk-in sale with a TIN: keep the TIN, but only mark/attach a name when
  // the TIN is verifiably registered in eTrade (from the verification cache).
  if (!tin) return { customerTin: null, customerTinName: null, customerTinVerified: false }
  const cached = await prisma.tinVerificationCache.findUnique({ where: { tin } })
  return { customerTin: tin, customerTinName: cached?.verified ? cached.name : null, customerTinVerified: !!cached?.verified }
}

export async function createSale({
  customerId, locationId, items, discount = 0, notes, paymentMethod,
  customerRegistrationNote, salesChannel = 'DIRECT', saleType = 'DIRECT',
  discountType = null, discountValue = null, paidAmount = null,
  soldAt, createdBy, applyWithholding = false, customerTin, user = null
}) {
  const tinSnapshot = await resolveSaleTin({ customerId, customerTin })
  // Read tax/withholding configuration and the customer TIN state OUTSIDE the
  // interactive transaction. These are display-only reads — running them
  // inside the transaction held a pool connection for several extra remote
  // round-trips per sale and contributed to connection-pool exhaustion.
  const settingRows = await Promise.all([
    'ethiopia_vat_registered',
    'ethiopia_vat_rate',
    'ethiopia_vat_inclusive',
    'ethiopia_withholding_enabled',
    'ethiopia_withholding_rate',
    'pos_discount_limit_percent'
  ].map((key) => prisma.setting.findUnique({ where: { key } })))
  const [vatRegisteredRow, vatRateRow, vatInclusiveRow, withholdingEnabledRow, withholdingRateRow, discountLimitRow] = settingRows
  const vatRegistered = vatRegisteredRow?.value === 'true'
  const vatRate = vatRegistered ? Number(vatRateRow?.value || 0) : 0
  const vatInclusive = vatInclusiveRow?.value === 'true'
  const withholdingEnabled = withholdingEnabledRow?.value === 'true'
  const withholdingRate = withholdingEnabled ? Number(withholdingRateRow?.value || 0) : 0
  // Configurable cashier discount limit (0 / unset = no limit configured).
  const discountLimitPercent = Number(discountLimitRow?.value || 0)
  // Withholding only applies when customer is a registered taxpayer (has TIN) and setting is enabled
  const customerForWithholding = customerId ? await prisma.customer.findUnique({ where: { id: customerId } }) : null
  const customerHasTin = customerForWithholding?.tinNumber && customerForWithholding.tinNumber.trim().length > 0

  // --- Direct Sale metadata validation (safe defaults, never trust the body) ---
  const finalSaleType = /^[A-Z_]{2,30}$/.test(String(saleType || '')) ? String(saleType) : 'DIRECT'
  const finalSalesChannel = /^[A-Z_]{2,40}$/.test(String(salesChannel || '')) ? String(salesChannel) : 'DIRECT'
  // Cash tendered (optional). Rejected when negative/NaN; change is computed
  // server-side AFTER the authoritative total — never taken from the browser.
  let paid = null
  if (paidAmount != null && paidAmount !== '') {
    const parsedPaid = toNum(paidAmount)
    if (Number.isNaN(parsedPaid) || parsedPaid < 0) throw new ApiError(400, 'Invalid paid amount')
    paid = round2(parsedPaid)
  }
  return prisma.$transaction(async (tx) => {
    // ---- Pass 1: stock validation + AUTHORITATIVE line pricing (no writes) ----
    // Perfumes are stocked per bottle size (the 50ml / 100ml boxes): the bottle
    // being sold is identified first and only that box is checked. A per-location
    // Inventory row is authoritative for products without per-size stock.
    // Prices are resolved from the CATALOG — the browser's numbers are
    // validated but never trusted for money maths (backend is authoritative).
    const linePricing = []
    for (const item of items) {
      const product = await tx.product.findUnique({
        where: { id: item.productId },
        select: { id: true, name: true, productType: true, size: true, stockQuantity: true, stock50ml: true, stock100ml: true, price: true, price100ml: true }
      })
      if (!product) throw new ApiError(404, `Product ${item.productId} not found`)
      const quantity = parseFloat(item.quantity)
      if (!(quantity > 0)) throw new ApiError(400, `Invalid quantity for ${product.name}`)
      const inv = await tx.inventory.findUnique({ where: { productId_locationId: { productId: item.productId, locationId } } })
      const soldSize = resolveSoldSize({ product, requested: item.size })
      const available = availableForSize({ product, inventory: inv, size: soldSize })
      if (available < quantity) {
        throw new ApiError(400, `Insufficient stock for ${product.name}${soldSize ? ` (${soldSize})` : ''} — only ${available} available`)
      }

      const catalogPrice = resolveServerUnitPrice(product, item.size)
      let unitPrice
      if (catalogPrice != null) {
        unitPrice = catalogPrice
      } else {
        // Legacy product without a usable catalog price: accept the client
        // value only after strict validation.
        const fallbackPrice = toNum(item.unitPrice)
        if (Number.isNaN(fallbackPrice) || fallbackPrice < 0) throw new ApiError(400, `Invalid unit price for ${product.name}`)
        unitPrice = round2(fallbackPrice)
      }
      const pricing = resolveLinePricing({
        unitPrice,
        quantity,
        discountType: item.discountType ?? null,
        discountValue: item.discountValue ?? 0,
        isFreeGift: item.isFreeGift === true || String(item.itemType || '').toUpperCase() === 'FREE_GIFT',
        label: product.name
      })
      linePricing.push({ item, product, quantity, soldSize, available, ...pricing })
    }
    validateCombinedSaleStock(linePricing)

    // ---- Pass 2: totals, permission gate & tax — still before any write ----
    // subtotal = gross of PAID lines only (free gifts never enter revenue).
    let subtotal = 0
    let itemDiscountTotal = 0
    let giftValue = 0
    let giftUnits = 0
    for (const line of linePricing) {
      if (line.itemType === 'FREE_GIFT') {
        giftValue = round2(giftValue + line.giftValue)
        giftUnits += line.quantity
      } else {
        subtotal = round2(subtotal + line.gross)
        itemDiscountTotal = round2(itemDiscountTotal + line.discountAmount)
      }
    }
    // Sale-level discount applies to what remains AFTER item discounts, so the
    // two levels can never be double-counted or exceed the consideration.
    const eligibleAfterItemDiscounts = round2(subtotal - itemDiscountTotal)
    const saleDiscount = resolveSaleDiscount({ eligible: eligibleAfterItemDiscounts, discount, discountType, discountValue })
    const totalDiscount = round2(itemDiscountTotal + saleDiscount.amount)
    const hasFreeGift = giftUnits > 0
    const discountPercent = subtotal > 0 ? (totalDiscount / subtotal) * 100 : 0
    authorizeDiscountAndGift({ user, hasFreeGift, discountPercent, discountLimitPercent })

    // Single source of truth for the tax breakdown and amount due.
    // computeSaleTaxTotals subtracts ALL discounts from the consideration
    // BEFORE deriving VAT (Proc. 1341/2024: consideration is reduced by
    // discounts/rebates accounted for at the time of supply), in both pricing
    // modes. Withholding never reduces the Total.
    const taxTotals = computeSaleTaxTotals({
      subtotal,
      discount: totalDiscount,
      vatRate,
      vatInclusive,
      withholdingRate,
      withholdingEnabled,
      customerHasTin,
      applyWithholding
    })
    const { vatAmount, withholdingAmount, total } = taxTotals
    // VAT base ("taxable amount"): exclusive mode → discounted consideration;
    // inclusive mode → consideration minus the VAT already inside it.
    const taxableBase = taxTotals.taxableSubtotal
    // Change is derived from the server total, never from the browser.
    const change = computeChange(paid, total)

    // Item consumption pre-check: a required item running short fails the sale
    // BEFORE the sale row is created; authoritative consumption later in this
    // same transaction.
    await validateItemsForSale(tx, { lines: items, locationId })

    const count = await tx.sale.count()
    const saleNumber = 'SALE-' + String(count + 1).padStart(4, '0')

    const sale = await tx.sale.create({
      data: {
        saleNumber,
        status: 'COMPLETED',
        saleType: finalSaleType,
        discount: totalDiscount,
        discountType: saleDiscount.type,
        discountValue: saleDiscount.value,
        taxableAmount: taxableBase,
        paidAmount: paid,
        changeAmount: change,
        notes,
        paymentMethod,
        customerRegistrationNote,
        salesChannel: finalSalesChannel,
        soldAt: soldAt ? new Date(soldAt) : new Date(),
        createdBy,
        customerTin: tinSnapshot.customerTin,
        customerTinName: tinSnapshot.customerTinName,
        customerTinVerified: tinSnapshot.customerTinVerified,
        location: { connect: { id: locationId } },
        ...(customerId ? { customer: { connect: { id: customerId } } } : {})
      }
    })

    for (const line of linePricing) {
      const { item, quantity, ...pricing } = line
      // unitPrice is the server-resolved catalog price; totalPrice is the
      // CHARGED amount (gross − line discount; 0 for free gifts).
      const unitPrice = pricing.unitPrice
      const isGift = pricing.itemType === 'FREE_GIFT'
      const product = await tx.product.findUnique({ where: { id: item.productId } })
      const unitCost = parseFloat(item.unitCost || product?.costPrice || 0)
      const totalPrice = pricing.charged
      // Identify the bottle being sold (ml) so stock is deducted by size
      const soldSize = resolveSoldSize({ product, requested: item.size })
      const soldMl = lineMl({ size: soldSize, quantity })
      const sizeTracked = !!soldSize && sizeBuckets(product).tracked

      await tx.saleItem.create({
        data: {
          saleId: sale.id, productId: item.productId, productName: product?.name || item.productName,
          quantity, unitPrice, unitCost, totalPrice, size: soldSize, sizeMl: sizeMlOf(soldSize),
          // Discount / Free Gift bookkeeping (gift keeps its real price for
          // reporting while charging 0 — the product's own price is untouched).
          itemType: pricing.itemType,
          isFreeGift: isGift,
          regularUnitPrice: unitPrice,
          discountType: pricing.discountAmount > 0 ? String(item.discountType || 'FIXED').toUpperCase() : null,
          discountValue: pricing.discountAmount > 0 ? (parseFloat(item.discountValue) || 0) : 0,
          discountAmount: pricing.discountAmount
        }
      })

      // Deduct inventory (re-read inside transaction for concurrency safety)
      const inv = await tx.inventory.findUnique({ where: { productId_locationId: { productId: item.productId, locationId } } })
      // Product-level stock: per-size boxes for perfumes, grams for oils.
      // Absolute values keep "Stock (bottles)" exactly equal to the sum of boxes.
      const stockPatch = productStockPatch(product, { size: soldSize, quantity, mode: 'decrement' })
      let previousQuantity
      let newQty
      if (inv) {
        // Size-tracked perfumes were already checked against their size box above;
        // the location aggregate follows it and is floored at 0 so a stale
        // location row can never block or corrupt a valid sale.
        if (!sizeTracked && Number(inv.availableQuantity) < quantity) throw new ApiError(400, `Insufficient stock for product ${item.productId}`)
        previousQuantity = Number(inv.quantity)
        newQty = sizeTracked ? Math.max(0, previousQuantity - quantity) : previousQuantity - quantity
        await tx.inventory.update({
          where: { id: inv.id },
          data: { quantity: newQty, availableQuantity: newQty - Number(inv.reservedQuantity) }
        })
      } else {
        // First sale of this product at this location — seed the location record
        // from the product-level stock (Products section) minus the sold amount,
        // so the per-location record stays in sync going forward
        previousQuantity = Number(product?.stockQuantity || 0)
        newQty = Number(stockPatch.stockQuantity ?? previousQuantity - quantity)
        await tx.inventory.create({ data: { productId: item.productId, locationId, quantity: newQty, reservedQuantity: 0, availableQuantity: newQty } })
      }

      // Keep the product-level stock (shown on the Products page) in sync —
      // per-size boxes for perfumes, grams for Oil / Pure Oil products
      await tx.product.update({ where: { id: item.productId }, data: stockPatch })

      // Auditable movement for EVERY unit that leaves stock. Free gifts are
      // recorded as FREE_GIFT (promotion), never as an unexplained reduction —
      // same reference/employee/branch trail as a normal SALE movement.
      await tx.stockMovement.create({
        data: {
          productId: item.productId, locationId, type: isGift ? 'FREE_GIFT' : 'SALE', quantity,
          previousQuantity, resultingQuantity: newQty,
          referenceType: 'SALE', referenceId: sale.id, userId: createdBy,
          notes: isGift
            ? `FREE GIFT — regular value Br ${round2(pricing.gross).toFixed(2)} — ${saleNumber}`
            : (sizeTracked ? `${soldSize} bottle(s) — ${soldMl} ml deducted from ${soldSize} stock` : null)
        }
      })
    }

    // Consume the items configured on the sold products (requirement 12 step
    // 7/8) — same transaction, so any failure rolls the whole sale back.
    await consumeItemsForSale(tx, {
      saleId: sale.id,
      locationId,
      lines: items.map((i) => ({ productId: i.productId, quantity: parseFloat(i.quantity) })),
      userId: createdBy
    })

    // Tax invoice is issued for all taxable supplies by a VAT-registered business,
    // per Ethiopian VAT law — regardless of customer TIN status.
    // The tax invoice number is the seller's invoice series, not dependent on customer.
    // (vatAmount / withholdingAmount / total were computed authoritatively in
    // pass 2 — before anything was written.)
    const invoiceSetting = await tx.setting.findUnique({ where: { key: 'ethiopia_invoice_next_number' } })
    const invoicePrefix = (await tx.setting.findUnique({ where: { key: 'ethiopia_invoice_prefix' } }))?.value || 'INV-'
    const invoiceNumber = vatRegistered && vatRate > 0
      ? `${invoicePrefix}${String(Number(invoiceSetting?.value || 1)).padStart(6, '0')}`
      : null
    if (invoiceNumber) {
      await tx.setting.upsert({ where: { key: 'ethiopia_invoice_next_number' }, update: { value: String(Number(invoiceSetting?.value || 1) + 1), type: 'number' }, create: { key: 'ethiopia_invoice_next_number', value: '2', type: 'number' } })
    }
    // The configured withholding RATE is recorded so the receipt breakdown can
    // print "Withholding (3%)" even when nothing is withheld. The AMOUNT stays
    // 0.00 unless withholding is explicitly applied to this sale — and it never
    // changes the Total either way.
    await tx.sale.update({ where: { id: sale.id }, data: { subtotal, total, taxInvoiceNumber: invoiceNumber, vatRate, vatAmount, withholdingRate: withholdingEnabled ? withholdingRate : 0, withholdingAmount } })

    // ---- Audit trail (existing AuditLog system — nothing new invented) ----
    await createAuditLog({
      db: tx, userId: createdBy, action: 'SALE_CREATED', entity: 'Sale', entityId: sale.id,
      details: {
        saleNumber, total, saleType: finalSaleType, salesChannel: finalSalesChannel,
        subtotal, totalDiscount, itemDiscounts: itemDiscountTotal, saleDiscount: saleDiscount.amount,
        taxableAmount: taxableBase, vatAmount, paidAmount: paid, changeAmount: change,
        freeGiftUnits: giftUnits, freeGiftValue: giftValue, locationId,
        notes: notes || null
      }
    })
    if (totalDiscount > 0) {
      await createAuditLog({
        db: tx, userId: createdBy, action: 'SALE_DISCOUNT_APPLIED', entity: 'Sale', entityId: sale.id,
        details: {
          saleNumber, locationId, grossSubtotal: subtotal,
          itemDiscounts: itemDiscountTotal, saleDiscount: saleDiscount.amount, totalDiscount,
          discountType: saleDiscount.type, discountValue: saleDiscount.value,
          taxableAmount: taxableBase, chargedAmount: total
        }
      })
    }
    for (const line of linePricing) {
      if (line.itemType !== 'FREE_GIFT') continue
      await createAuditLog({
        db: tx, userId: createdBy, action: 'SALE_FREE_GIFT_ISSUED', entity: 'Sale', entityId: sale.id,
        details: {
          saleNumber, locationId,
          productId: line.item.productId, productName: line.product.name, size: line.soldSize || null,
          quantity: line.quantity, originalUnitPrice: line.unitPrice, giftValue: line.gross,
          discount: '100% (FREE_GIFT)', chargedAmount: 0, itemType: 'FREE_GIFT',
          notes: notes || null
        }
      })
    }

    return tx.sale.findUnique({
      where: { id: sale.id },
      include: {
        customer: true,
        location: true,
        items: { include: { product: { select: { id: true, name: true, sku: true, size: true, productType: true } } } }
      }
    })
  }).then(async (created) => {
    // Post the double-entry journal record for the sale (outside the outer
    // transaction so ledger issues never block the business flow).
    try { await postSaleEntry(created) } catch (ledgerError) { console.error('Journal posting failed for sale:', ledgerError.message) }
    return created
  })
}

export async function cancelSale(id, userId) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({ where: { id }, include: { items: true } })
    if (!sale) throw new ApiError(404, 'Sale not found')
    if (sale.status === 'CANCELLED') throw new ApiError(400, 'Sale already cancelled')

    // Restore inventory
    for (const item of sale.items) {
      const inv = await tx.inventory.findUnique({ where: { productId_locationId: { productId: item.productId, locationId: sale.locationId } } })
      if (inv) { await tx.inventory.update({ where: { id: inv.id }, data: { quantity: Number(inv.quantity) + item.quantity, availableQuantity: Number(inv.quantity) + item.quantity - Number(inv.reservedQuantity) } }) }
      // Restore the product-level stock into the same bottle-size box the sale
      // deducted from (grams for Oil / Pure Oil products). Legacy lines without a
      // size fall back to the product's own size so the total stays equal to the
      // sum of the two boxes.
      const product = await tx.product.findUnique({ where: { id: item.productId } })
      if (product) {
        const restoreSize = resolveSoldSize({ product, requested: item.size })
        await tx.product.update({
          where: { id: item.productId },
          data: productStockPatch(product, { size: restoreSize, quantity: item.quantity, mode: 'increment' })
        })
      }
      await tx.stockMovement.create({
        data: {
          productId: item.productId, locationId: sale.locationId, type: 'RETURN_IN', quantity: item.quantity,
          referenceType: 'SALE_CANCEL', referenceId: id,
          notes: item.size ? `Restored to ${item.size} stock (${sizeMlOf(item.size)} ml per bottle)` : null
        }
      })
    }

    // Items consumed by this sale (bottles/boxes/bags) are returned to stock
    // in the same cancelling transaction.
    await restoreItemsForSaleCancel(tx, { saleId: id, locationId: sale.locationId, userId })

    await tx.sale.update({ where: { id }, data: { status: 'CANCELLED' } })
    await createAuditLog({ db: tx, userId, action: 'SALE_CANCELLED', entity: 'Sale', entityId: id, details: { saleNumber: sale.saleNumber } })
    return { success: true }
  }).then(async (result) => {
    // Remove the sale's journal record so reports stay consistent
    try { await deleteJournalEntriesForSource('SALE', id) } catch (ledgerError) { console.error('Journal reversal failed for cancelled sale:', ledgerError.message) }
    return result
  })
}

export default { listSales, getSale, createSale, cancelSale, getDailySalesActivity }