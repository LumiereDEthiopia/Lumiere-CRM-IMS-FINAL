/**
 * Business Analytics (part 1) — product & financial intelligence
 * Cost/financial data gated by RBAC at controller level.
 */
import prisma from '../config/prisma.js'

function r2(n) { return Math.round((n || 0) * 100) / 100 }

export async function getProductIntelligence(opts = {}) {
  const page = Math.max(1, parseInt(opts.page) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(opts.pageSize) || 25))
  const now = new Date()
  const start = new Date(now)
  start.setDate(start.getDate() - 90)

  const where = {}
  if (opts.categoryId) where.categoryId = opts.categoryId
  if (opts.brandId) where.brandId = opts.brandId

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      select: {
        id: true, name: true, sku: true, costPrice: true, price: true, minimumStock: true,
        isActive: true, isFeatured: true,
        brand: { select: { name: true } }, category: { select: { name: true } }
      },
      skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' }
    }),
    prisma.product.count({ where })
  ])

  const ids = products.map((p) => p.id)
  const saleWhere = { productId: { in: ids }, sale: { status: { not: 'CANCELLED' } } }
  const winWhere = { ...saleWhere, sale: { status: { not: 'CANCELLED' }, soldAt: { gte: start } } }

  const [winAgg, allTimeAgg, stockAgg] = await Promise.all([
    prisma.saleItem.groupBy({ by: ['productId'], where: winWhere, _sum: { quantity: true, totalPrice: true, unitCost: true } }).catch(() => []),
    prisma.saleItem.groupBy({ by: ['productId'], where: saleWhere, _max: { saleId: true } }).catch(() => []),
    prisma.inventory.groupBy({ by: ['productId'], where: { productId: { in: ids } }, _sum: { quantity: true } }).catch(() => [])
  ])

  const winMap = new Map(winAgg.map((s) => [s.productId, s]))
  const stockMap = new Map(stockAgg.map((s) => [s.productId, s._sum.quantity || 0]))

  // last sale dates
  const lastSaleRows = await prisma.saleItem.findMany({
    where: saleWhere,
    orderBy: { sale: { soldAt: 'desc' } },
    select: { productId: true, sale: { select: { soldAt: true } } },
    take: 2000
  }).catch(() => [])
  const lastSaleMap = new Map()
  for (const row of lastSaleRows) {
    if (!lastSaleMap.has(row.productId)) lastSaleMap.set(row.productId, row.sale?.soldAt || null)
  }

  const items = products.map((p) => {
    const s = winMap.get(p.id)
    const unitsSold = s?._sum.quantity || 0
    const revenue = s?._sum.totalPrice || 0
    const cogs = (s?._sum.unitCost || p.costPrice || 0) * unitsSold
    const grossProfit = revenue - cogs
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0
    const stock = stockMap.get(p.id) || 0
    const velocity = unitsSold / 90
    const turnover = stock > 0 ? unitsSold / stock : (unitsSold > 0 ? 99 : 0)

    const classifications = []
    if (unitsSold > 0 && turnover >= 1) classifications.push('BEST_SELLER')
    if (grossMargin > 50 && unitsSold > 0) classifications.push('HIGH_MARGIN')
    if (unitsSold > 0 && turnover > 0.3 && turnover < 1) classifications.push('GROWING')
    if (stock > (p.minimumStock || 0) * 5 && velocity < 0.1) classifications.push('OVERSTOCK')
    if (stock === 0) classifications.push('OUT_OF_STOCK')
    if (stock > 0 && unitsSold === 0) classifications.push('DEAD_STOCK')
    if (stock > 0 && stock <= (p.minimumStock || 0)) classifications.push('LOW_STOCK')
    if (velocity < 0.05 && stock > 0 && !classifications.includes('BEST_SELLER')) classifications.push('SLOW_MOVING')

    return {
      productId: p.id, name: p.name, sku: p.sku,
      brand: p.brand?.name, category: p.category?.name,
      isActive: p.isActive, isFeatured: p.isFeatured,
      currentStock: stock, minimumStock: p.minimumStock,
      unitsSold90d: unitsSold,
      revenue90d: r2(revenue),
      grossProfit90d: r2(grossProfit),
      grossMargin: r2(grossMargin),
      salesVelocityPerDay: r2(velocity),
      inventoryTurnover90d: r2(turnover),
      lastSaleAt: lastSaleMap.get(p.id) || null,
      classifications: classifications.length ? classifications : ['NORMAL']
    }
  })

  return {
    data: items,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    summary: {
      bestSellers: items.filter((i) => i.classifications.includes('BEST_SELLER')).length,
      highMargin: items.filter((i) => i.classifications.includes('HIGH_MARGIN')).length,
      deadStock: items.filter((i) => i.classifications.includes('DEAD_STOCK')).length,
      outOfStock: items.filter((i) => i.classifications.includes('OUT_OF_STOCK')).length
    },
    meta: { periodDays: 90, isEstimate: true, generatedAt: now.toISOString() }
  }
}

// ===== PART 2: profit / location / employee =====

export async function getProfitIntelligence(opts = {}) {
  const now = new Date()
  const days = parseInt(opts.days) || 30
  const start = new Date(now)
  start.setDate(start.getDate() - days)
  const saleWhere = { status: { not: 'CANCELLED' }, soldAt: { gte: start } }
  if (opts.locationId) saleWhere.locationId = opts.locationId

  const [totals, byProduct, byBrand, byCategory] = await Promise.all([
    prisma.saleItem.aggregate({
      where: { sale: saleWhere },
      _sum: { totalPrice: true, quantity: true, unitCost: true }
    }).catch(() => ({ _sum: {} })),
    prisma.saleItem.groupBy({
      by: ['productId'], where: { sale: saleWhere },
      _sum: { totalPrice: true, quantity: true, unitCost: true },
      orderBy: { _sum: { totalPrice: 'desc' } }, take: 20
    }).catch(() => []),
    prisma.$queryRawUnsafe(
      `SELECT b.id AS brandId, b.name AS brandName, SUM(si.totalPrice) AS revenue,
              SUM(si.unitCost * si.quantity) AS cogs, SUM(si.quantity) AS units
       FROM SaleItem si JOIN Sale s ON s.id = si.saleId
       JOIN Product p ON p.id = si.productId LEFT JOIN Brand b ON b.id = p.brandId
       WHERE s.status != 'CANCELLED' AND s.soldAt >= ?
       GROUP BY b.id ORDER BY revenue DESC`, start.toISOString()
    ).catch(() => []),
    prisma.$queryRawUnsafe(
      `SELECT c.id AS categoryId, c.name AS categoryName, SUM(si.totalPrice) AS revenue,
              SUM(si.unitCost * si.quantity) AS cogs, SUM(si.quantity) AS units
       FROM SaleItem si JOIN Sale s ON s.id = si.saleId
       JOIN Product p ON p.id = si.productId LEFT JOIN Category c ON c.id = p.categoryId
       WHERE s.status != 'CANCELLED' AND s.soldAt >= ?
       GROUP BY c.id ORDER BY revenue DESC`, start.toISOString()
    ).catch(() => [])
  ])

  const revenue = totals._sum.totalPrice || 0
  const units = totals._sum.quantity || 0
  const cogs = (totals._sum.unitCost || 0) * units
  const grossProfit = revenue - cogs
  const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0

  return {
    period: { days, start, end: now },
    totals: { revenue: r2(revenue), units, cogs: r2(cogs), grossProfit: r2(grossProfit), grossMargin: r2(grossMargin) },
    byProduct: byProduct.map((p) => {
      const rev = p._sum.totalPrice || 0
      const u = p._sum.quantity || 0
      const c = (p._sum.unitCost || 0) * u
      return { productId: p.productId, revenue: r2(rev), units: u, cogs: r2(c), grossProfit: r2(rev - c), grossMargin: rev > 0 ? r2(((rev - c) / rev) * 100) : 0 }
    }),
    byBrand: (byBrand || []).map((b) => ({ ...b, revenue: r2(b.revenue), cogs: r2(b.cogs), grossProfit: r2((b.revenue || 0) - (b.cogs || 0)) })),
    byCategory: (byCategory || []).map((c) => ({ ...c, revenue: r2(c.revenue), cogs: r2(c.cogs), grossProfit: r2((c.revenue || 0) - (c.cogs || 0)) })),
    meta: { isEstimate: true }
  }
}

export async function getLocationIntelligence(opts = {}) {
  const now = new Date()
  const days = parseInt(opts.days) || 30
  const start = new Date(now)
  start.setDate(start.getDate() - days)

  const locations = await prisma.location.findMany({ where: { isActive: true } })
  const results = []
  for (const loc of locations) {
    const [salesAgg, invAgg, empCount] = await Promise.all([
      prisma.saleItem.aggregate({
        where: { sale: { status: { not: 'CANCELLED' }, locationId: loc.id, soldAt: { gte: start } } },
        _sum: { totalPrice: true, quantity: true, unitCost: true }
      }).catch(() => ({ _sum: {} })),
      prisma.inventory.aggregate({ where: { locationId: loc.id }, _sum: { quantity: true } }).catch(() => ({ _sum: {} })),
      prisma.employee.count({ where: { locationId: loc.id, employmentStatus: 'ACTIVE' } }).catch(() => 0)
    ])
    const revenue = salesAgg._sum.totalPrice || 0
    const units = salesAgg._sum.quantity || 0
    const cogs = (salesAgg._sum.unitCost || 0) * units
    results.push({
      locationId: loc.id, name: loc.name, code: loc.code,
      revenue: r2(revenue), unitsSold: units, cogs: r2(cogs),
      grossProfit: r2(revenue - cogs),
      grossMargin: revenue > 0 ? r2(((revenue - cogs) / revenue) * 100) : 0,
      inventoryUnits: invAgg._sum.quantity || 0,
      activeEmployees: empCount
    })
  }
  results.sort((a, b) => b.revenue - a.revenue)
  return { locations: results, period: { days }, generatedAt: now.toISOString(), isEstimate: true }
}

export async function getEmployeeIntelligence(opts = {}) {
  const now = new Date()
  const days = parseInt(opts.days) || 30
  const start = new Date(now)
  start.setDate(start.getDate() - days)

  const employees = await prisma.employee.findMany({
    where: { employmentStatus: 'ACTIVE' },
    select: {
      id: true, employeeCode: true, firstName: true, lastName: true, jobTitle: true,
      department: { select: { name: true } }, location: { select: { name: true } },
      user: { select: { id: true, name: true, email: true } }
    },
    take: 200
  })

  const results = []
  for (const e of employees) {
    const base = {
      employeeId: e.id, employeeCode: e.employeeCode,
      name: `${e.firstName} ${e.lastName}`.trim(), jobTitle: e.jobTitle,
      department: e.department?.name, location: e.location?.name,
      hasUserAccount: !!e.user
    }
    if (!e.user) {
      results.push({ ...base, salesHandled: 0, tasksAssigned: 0, tasksCompleted: 0, tasksOverdue: 0, crmInteractions: 0 })
      continue
    }
    const userId = e.user.id
    const [salesHandled, tasksAssigned, tasksCompleted, tasksOverdue, crmInteractions] = await Promise.all([
      prisma.sale.count({ where: { createdBy: userId, soldAt: { gte: start }, status: { not: 'CANCELLED' } } }).catch(() => 0),
      prisma.customerTask.count({ where: { assignedTo: userId } }).catch(() => 0),
      prisma.customerTask.count({ where: { assignedTo: userId, status: 'COMPLETED' } }).catch(() => 0),
      prisma.customerTask.count({ where: { assignedTo: userId, status: { in: ['TODO', 'IN_PROGRESS'] }, dueDate: { lt: now } } }).catch(() => 0),
      prisma.customerInteraction.count({ where: { userId, interactionDate: { gte: start } } }).catch(() => 0)
    ])
    results.push({ ...base, salesHandled, tasksAssigned, tasksCompleted, tasksOverdue, crmInteractions })
  }

  return {
    employees: results, period: { days },
    generatedAt: now.toISOString(),
    note: 'Excludes salary and sensitive fields unless employee:view_sensitive granted'
  }
}

export default { getProductIntelligence, getProfitIntelligence, getLocationIntelligence, getEmployeeIntelligence }

