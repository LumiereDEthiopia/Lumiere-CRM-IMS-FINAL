/**
 * Report Service — Business Intelligence aggregations
 */
import prisma from '../config/prisma.js'
import { ethiopianPayslip } from './ethiopianTax.js'

function dateRange(startDate, endDate) {
  const where = {}
  if (startDate || endDate) {
    where.soldAt = {}
    if (startDate) where.soldAt.gte = new Date(startDate)
    if (endDate) where.soldAt.lte = new Date(endDate)
  }
  return where
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

/**
 * Aggregate free-gift sale items by an arbitrary key (employee, branch…).
 * Gift VALUE uses the preserved regularUnitPrice — gifts are reported for
 * promotion/inventory analysis and never inflate revenue.
 */
function groupGifts(items, keyFn, nameFn = (k) => k) {
  const map = new Map()
  for (const g of items) {
    const key = keyFn(g) || 'unknown'
    if (!map.has(key)) map.set(key, { id: key, name: nameFn(key), quantity: 0, value: 0 })
    const row = map.get(key)
    row.quantity += Number(g.quantity || 0)
    row.value += Number(g.regularUnitPrice ?? g.unitPrice ?? 0) * Number(g.quantity || 0)
  }
  return [...map.values()].map((r) => ({ ...r, value: round2(r.value) }))
}

export async function getDashboardSummary() {
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfYear = new Date(now.getFullYear(), 0, 1)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const [
    totalProducts, activeProducts, totalInventoryUnits,
    lowStockRaw, outOfStockCount, totalCustomers, activeCustomers, totalSuppliers,
    totalEmployees, activeEmployees,
    todaySales, weekSales, monthSales, yearSales,
    todaySalesCount, weekSalesCount, monthSalesCount, yearSalesCount,
    totalPurchases, outstandingPurchases, recentPurchases,
    customersByStatus, customersByType, employeesByDept, employeesByStatus, employeesByLocation,
    topProducts, topBrands, salesByLocation, recentSales,
    newCustomers, followUpsDue, overdueTasks, upcomingTasks, vipCustomers,
    topSuppliers, todayGiftItems
  ] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { isActive: true } }),
    prisma.inventory.aggregate({ _sum: { quantity: true } }),
    prisma.$queryRawUnsafe(`
  SELECT COUNT(*) AS cnt
  FROM "inventory" i
  JOIN "product" p ON i."productId" = p.id
  WHERE i."availableQuantity" > 0
    AND i."availableQuantity" <= p."minimumStock"
    AND p."minimumStock" > 0
`),
    prisma.inventory.count({ where: { availableQuantity: { lte: 0 } } }),
    prisma.customer.count(),
    prisma.customer.count({ where: { status: 'ACTIVE' } }),
    prisma.supplier.count(),
    prisma.employee.count(),
    prisma.employee.count({ where: { employmentStatus: 'ACTIVE' } }),
    prisma.sale.aggregate({ where: { soldAt: { gte: startOfDay }, status: { not: 'CANCELLED' } }, _sum: { total: true, subtotal: true, discount: true, vatAmount: true }, _avg: { total: true } }),
    prisma.sale.aggregate({ where: { soldAt: { gte: startOfWeek }, status: { not: 'CANCELLED' } }, _sum: { total: true, subtotal: true, discount: true, vatAmount: true }, _avg: { total: true } }),
    prisma.sale.aggregate({ where: { soldAt: { gte: startOfMonth }, status: { not: 'CANCELLED' } }, _sum: { total: true, subtotal: true, discount: true, vatAmount: true }, _avg: { total: true } }),
    prisma.sale.aggregate({ where: { soldAt: { gte: startOfYear }, status: { not: 'CANCELLED' } }, _sum: { total: true, subtotal: true, discount: true, vatAmount: true }, _avg: { total: true } }),
    prisma.sale.count({ where: { soldAt: { gte: startOfDay }, status: { not: 'CANCELLED' } } }),
    prisma.sale.count({ where: { soldAt: { gte: startOfWeek }, status: { not: 'CANCELLED' } } }),
    prisma.sale.count({ where: { soldAt: { gte: startOfMonth }, status: { not: 'CANCELLED' } } }),
    prisma.sale.count({ where: { soldAt: { gte: startOfYear }, status: { not: 'CANCELLED' } } }),
    prisma.purchase.aggregate({ _sum: { total: true }, _count: true }),
    prisma.purchase.count({ where: { status: { in: ['ORDERED', 'PARTIALLY_RECEIVED', 'PENDING'] } } }),
    prisma.purchase.findMany({ take: 5, orderBy: { createdAt: 'desc' }, include: { supplier: { select: { name: true } } } }),
    prisma.customer.groupBy({ by: ['status'], _count: true }),
    prisma.customer.groupBy({ by: ['customerType'], _count: true }),
    prisma.employee.groupBy({ by: ['departmentId'], _count: true }),
    prisma.employee.groupBy({ by: ['employmentStatus'], _count: true }),
    prisma.employee.groupBy({ by: ['locationId'], _count: true }),
    prisma.saleItem.groupBy({ by: ['productId', 'productName'], _sum: { quantity: true, totalPrice: true }, orderBy: { _sum: { quantity: 'desc' } }, take: 5 }),
    prisma.$queryRawUnsafe(`
  SELECT
    b.name AS "brandName",
    SUM(CAST(si.quantity AS NUMERIC)) AS units,
    SUM(CAST(si."totalPrice" AS NUMERIC)) AS revenue
  FROM "saleitem" si
  JOIN "product" p ON si."productId" = p.id
  JOIN "Brand" b ON p."brandId" = b.id
  JOIN "Sale" s ON si."saleId" = s.id
  WHERE s.status != 'CANCELLED'
  GROUP BY b.name
  ORDER BY revenue DESC
  LIMIT 5
`),
    prisma.sale.groupBy({ by: ['locationId'], where: { status: { not: 'CANCELLED' } }, _sum: { total: true }, _count: true }),
    prisma.sale.findMany({ take: 8, orderBy: { soldAt: 'desc' }, include: { customer: { select: { name: true } }, location: { select: { name: true } } } }),
    prisma.customer.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.customerInteraction.count({ where: { nextFollowUpDate: { lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) }, status: { not: 'COMPLETED' } } }),
    prisma.customerTask.count({ where: { dueDate: { lt: now }, status: { notIn: ['DONE', 'COMPLETED', 'CANCELLED'] } } }),
    prisma.customerTask.count({ where: { dueDate: { gte: now, lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) }, status: { notIn: ['DONE', 'COMPLETED', 'CANCELLED'] } } }),
    prisma.customer.count({ where: { OR: [{ status: 'VIP' }, { customerType: 'VIP' }, { tags: { some: { name: { contains: 'VIP' } } } }] } }),
    prisma.purchase.groupBy({ by: ['supplierId'], _sum: { total: true }, _count: true, orderBy: { _sum: { total: 'desc' } }, take: 5 }),
    // Today's free-gift lines (rare — fetched as rows to value them at their
    // preserved regular price). Additive KPI data for the dashboard.
    prisma.saleItem.findMany({
      where: { isFreeGift: true, sale: { soldAt: { gte: startOfDay }, status: { not: 'CANCELLED' } } },
      select: { quantity: true, regularUnitPrice: true, unitPrice: true }
    })
  ])

  const [inventoryValueCost, inventoryValueRetail] = await Promise.all([
    prisma.$queryRawUnsafe(`
  SELECT COALESCE(SUM(i.quantity * p."costPrice"), 0) AS val
  FROM "inventory" i
  JOIN "product" p ON i."productId" = p.id
`),

prisma.$queryRawUnsafe(`
  SELECT COALESCE(SUM(i.quantity * p.price), 0) AS val
  FROM "inventory" i
  JOIN "product" p ON i."productId" = p.id
`),
  ])

  const locations = await prisma.location.findMany({ select: { id: true, name: true } })
  const locMap = Object.fromEntries(locations.map((l) => [l.id, l.name]))
  const departments = await prisma.department.findMany({ select: { id: true, name: true } })
  const deptMap = Object.fromEntries(departments.map((d) => [d.id, d.name]))
  const suppliers = await prisma.supplier.findMany({
    where: { id: { in: topSuppliers.map((s) => s.supplierId) } },
    select: { id: true, name: true }
  })
  const supplierMap = Object.fromEntries(suppliers.map((s) => [s.id, s.name]))

  const period = (agg, count) => {
    const revenue = Number(agg._sum.total || 0)
    const discounts = Number(agg._sum.discount || 0)
    const vat = Number(agg._sum.vatAmount || 0)
    const gross = Number(agg._sum.subtotal ?? NaN) || round2(revenue + discounts)
    return {
      total: revenue, // net sales as charged (existing key — unchanged meaning)
      count,
      average: Number(agg._avg?.total || (count ? revenue / count : 0)),
      gross,                                   // Gross Sales (before discounts)
      discounts,                               // Total Discounts
      vat,                                     // VAT collected
      netTaxable: round2(revenue - vat)        // Net Taxable Sales (VAT-exclusive)
    }
  }

  return {
    overview: {
      totalProducts,
      activeProducts,
      totalInventoryUnits: totalInventoryUnits._sum.quantity || 0,
      inventoryValueCost: Number(inventoryValueCost[0]?.val || 0),
      inventoryValueRetail: Number(inventoryValueRetail[0]?.val || 0),
      lowStockCount: Number(lowStockRaw[0]?.cnt || 0),
      outOfStockCount,
      totalCustomers,
      activeCustomers,
      totalSuppliers,
      totalEmployees,
      activeEmployees
    },
    sales: {
      today: period(todaySales, todaySalesCount),
      week: period(weekSales, weekSalesCount),
      month: period(monthSales, monthSalesCount),
      year: period(yearSales, yearSalesCount),
      topProducts: topProducts.map((p) => ({
        productId: p.productId,
        name: p.productName,
        quantity: p._sum.quantity,
        revenue: Number(p._sum.totalPrice || 0)
      })),
      topBrands: (topBrands || []).map((b) => ({
        name: b.brandName,
        units: Number(b.units || 0),
        revenue: Number(b.revenue || 0)
      })),
      byLocation: salesByLocation.map((l) => ({
        locationId: l.locationId,
        name: locMap[l.locationId] || l.locationId,
        total: Number(l._sum.total || 0),
        count: l._count
      })),
      recent: recentSales,
      // Free gifts reported SEPARATELY — they never inflate revenue.
      freeGifts: {
        count: todayGiftItems.reduce((s, g) => s + Number(g.quantity || 0), 0),
        value: round2(todayGiftItems.reduce((s, g) => s + Number(g.regularUnitPrice ?? g.unitPrice ?? 0) * Number(g.quantity || 0), 0))
      }
    },
    purchasing: {
      totalCount: totalPurchases._count,
      totalValue: Number(totalPurchases._sum.total || 0),
      outstandingCount: outstandingPurchases,
      recent: recentPurchases,
      topSuppliers: topSuppliers.map((s) => ({
        supplierId: s.supplierId,
        name: supplierMap[s.supplierId] || s.supplierId,
        total: Number(s._sum.total || 0),
        count: s._count
      }))
    },
    crm: {
      newCustomers,
      activeCustomers,
      leads: customersByStatus.find((s) => s.status === 'LEAD')?._count || 0,
      vipCustomers,
      followUpsDue,
      overdueTasks,
      upcomingTasks,
      byStatus: customersByStatus.map((s) => ({ status: s.status, count: s._count })),
      byType: customersByType.map((t) => ({ type: t.customerType, count: t._count }))
    },
    employees: {
      total: totalEmployees,
      active: activeEmployees,
      byDepartment: employeesByDept.map((d) => ({ departmentId: d.departmentId, name: deptMap[d.departmentId] || 'Unassigned', count: d._count })),
      byLocation: employeesByLocation.map((l) => ({ locationId: l.locationId, name: locMap[l.locationId] || 'Unassigned', count: l._count })),
      byStatus: employeesByStatus.map((s) => ({ status: s.employmentStatus, count: s._count }))
    }
  }
}

export async function getSalesReport({ startDate, endDate, locationId, customerId, productId, brandId, categoryId }) {
  const where = { status: { not: 'CANCELLED' }, ...dateRange(startDate, endDate) }
  if (locationId) where.locationId = locationId
  if (customerId) where.customerId = customerId

  let productFilter = null
  if (productId || brandId || categoryId) {
    productFilter = {}
    if (productId) productFilter.id = productId
    if (brandId) productFilter.brandId = brandId
    if (categoryId) productFilter.categoryId = categoryId
  }

  const [summary, recentSales, byLocation, discountByEmployeeRaw, discountByBranchRaw, giftItems] = await Promise.all([
    prisma.sale.aggregate({ where, _sum: { total: true, discount: true, subtotal: true, vatAmount: true }, _count: true, _avg: { total: true } }),
    prisma.sale.findMany({
      where,
      include: { customer: { select: { name: true } }, location: { select: { name: true } }, items: true },
      orderBy: { soldAt: 'desc' },
      take: 50
    }),
    prisma.sale.groupBy({ by: ['locationId'], where, _sum: { total: true }, _count: true }),
    // Discount & free-gift breakdowns by employee/branch (read-only reporting).
    prisma.sale.groupBy({ by: ['createdBy'], where: { ...where, discount: { gt: 0 } }, _sum: { discount: true }, _count: true }),
    prisma.sale.groupBy({ by: ['locationId'], where: { ...where, discount: { gt: 0 } }, _sum: { discount: true }, _count: true }),
    prisma.saleItem.findMany({
      where: { ...(productFilter ? { product: productFilter } : {}), isFreeGift: true, sale: where },
      select: {
        productId: true, productName: true, quantity: true, regularUnitPrice: true, unitPrice: true,
        sale: { select: { createdBy: true, locationId: true } }
      }
    })
  ])

  const itemWhere = { sale: where }
  if (productFilter) itemWhere.product = productFilter

  const [byProduct, byBrand, byCategory, unitsSold] = await Promise.all([
  prisma.saleItem.groupBy({
    by: ['productId', 'productName'],
    where: itemWhere,
    _sum: { quantity: true, totalPrice: true },
    _count: true,
    orderBy: { _sum: { totalPrice: 'desc' } },
    take: 20
  }),

  prisma.$queryRawUnsafe(`
    SELECT
      b.id AS "brandId",
      b.name AS name,
      SUM(CAST(si.quantity AS NUMERIC)) AS units,
      SUM(CAST(si."totalPrice" AS NUMERIC)) AS revenue
    FROM "saleitem" si
    JOIN "product" p ON si."productId" = p.id
    JOIN "Brand" b ON p."brandId" = b.id
    JOIN "Sale" s ON si."saleId" = s.id
    WHERE s.status != 'CANCELLED'
    ${startDate ? `AND s."soldAt" >= '${new Date(startDate).toISOString()}'::timestamptz` : ''}
    ${endDate ? `AND s."soldAt" <= '${new Date(endDate).toISOString()}'::timestamptz` : ''}
    ${brandId ? `AND b.id = '${String(brandId).replace(/'/g, "''")}'` : ''}
    GROUP BY b.id, b.name
    ORDER BY revenue DESC
    LIMIT 20
  `),

  prisma.$queryRawUnsafe(`
    SELECT
      c.id AS "categoryId",
      c.name AS name,
      SUM(CAST(si.quantity AS NUMERIC)) AS units,
      SUM(CAST(si."totalPrice" AS NUMERIC)) AS revenue
    FROM "saleitem" si
    JOIN "product" p ON si."productId" = p.id
    LEFT JOIN "Category" c ON p."categoryId" = c.id
    JOIN "Sale" s ON si."saleId" = s.id
    WHERE s.status != 'CANCELLED'
    ${startDate ? `AND s."soldAt" >= '${new Date(startDate).toISOString()}'::timestamptz` : ''}
    ${endDate ? `AND s."soldAt" <= '${new Date(endDate).toISOString()}'::timestamptz` : ''}
    GROUP BY c.id, c.name
    ORDER BY revenue DESC
    LIMIT 20
  `),

  prisma.saleItem.aggregate({
    where: itemWhere,
    _sum: { quantity: true }
  })
])

  // Sales over time (by day)
  const overTime = await prisma.$queryRawUnsafe(`
  SELECT
    DATE("soldAt") AS day,
    COUNT(*) AS transactions,
    SUM(CAST(total AS NUMERIC)) AS revenue
  FROM "Sale"
  WHERE status != 'CANCELLED'
  ${startDate ? `AND "soldAt" >= '${new Date(startDate).toISOString()}'::timestamptz` : ''}
  ${endDate ? `AND "soldAt" <= '${new Date(endDate).toISOString()}'::timestamptz` : ''}
  GROUP BY DATE("soldAt")
  ORDER BY day ASC
  LIMIT 90
`)

  const locations = await prisma.location.findMany({ select: { id: true, name: true } })
  const locMap = Object.fromEntries(locations.map((l) => [l.id, l.name]))
  const users = await prisma.user.findMany({ select: { id: true, name: true } })
  const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]))

  return {
    summary: {
      revenue: Number(summary._sum.total || 0),        // total collected (existing key)
      discount: Number(summary._sum.discount || 0),    // total discounts (existing key)
      transactions: summary._count,
      averageTransactionValue: Number(summary._avg.total || 0),
      unitsSold: unitsSold._sum.quantity || 0,
      // --- Direct Sale / Discount / Free Gift additions (spec §14) ---
      // Gross = sum of paid-line prices BEFORE any discount (Sale.subtotal).
      grossSales: Number(summary._sum.subtotal) || round2(Number(summary._sum.total || 0) + Number(summary._sum.discount || 0)),
      totalDiscounts: Number(summary._sum.discount || 0),
      // Net taxable = VAT-exclusive base of the actual consideration
      // (total − VAT is correct in BOTH VAT pricing modes).
      netTaxableSales: round2(Number(summary._sum.total || 0) - Number(summary._sum.vatAmount || 0)),
      vatTotal: Number(summary._sum.vatAmount || 0),
      totalCollected: Number(summary._sum.total || 0),
      // Free gifts — reported separately so they NEVER inflate revenue.
      freeGiftCount: giftItems.reduce((s, g) => s + Number(g.quantity || 0), 0),
      freeGiftValue: round2(giftItems.reduce((s, g) => s + Number(g.regularUnitPrice ?? g.unitPrice ?? 0) * Number(g.quantity || 0), 0)),
      freeGiftProducts: Object.values(giftItems.reduce((acc, g) => {
        const key = g.productId
        if (!acc[key]) acc[key] = { productId: key, name: g.productName, quantity: 0, value: 0 }
        acc[key].quantity += Number(g.quantity || 0)
        acc[key].value += Number(g.regularUnitPrice ?? g.unitPrice ?? 0) * Number(g.quantity || 0)
        return acc
      }, {})).map((p) => ({ ...p, value: round2(p.value) })),
      discountByEmployee: discountByEmployeeRaw.map((e) => ({ userId: e.createdBy, name: userMap[e.createdBy] || e.createdBy || 'Unassigned', discount: Number(e._sum.discount || 0), transactions: e._count })),
      discountByBranch: discountByBranchRaw.map((l) => ({ locationId: l.locationId, name: locMap[l.locationId] || l.locationId, discount: Number(l._sum.discount || 0), transactions: l._count })),
      freeGiftByEmployee: groupGifts(giftItems, (g) => g.sale?.createdBy, (id) => (id === 'unknown' ? 'Unassigned' : userMap[id] || id)),
      freeGiftByBranch: groupGifts(giftItems, (g) => g.sale?.locationId, (id) => (id === 'unknown' ? 'Unassigned' : locMap[id] || id))
    },
    overTime: (overTime || []).map((r) => ({ day: r.day, transactions: Number(r.transactions), revenue: Number(r.revenue || 0) })),
    byProduct: byProduct.map((p) => ({
      productId: p.productId,
      name: p.productName,
      quantity: p._sum.quantity,
      revenue: Number(p._sum.totalPrice || 0),
      transactions: p._count
    })),
    byBrand: (byBrand || []).map((b) => ({ brandId: b.brandId, name: b.name, units: Number(b.units || 0), revenue: Number(b.revenue || 0) })),
    byCategory: (byCategory || []).map((c) => ({ categoryId: c.categoryId, name: c.name || 'Uncategorized', units: Number(c.units || 0), revenue: Number(c.revenue || 0) })),
    byLocation: byLocation.map((l) => ({ locationId: l.locationId, name: locMap[l.locationId] || l.locationId, total: Number(l._sum.total || 0), count: l._count })),
    recentSales
  }
}

export async function getInventoryReport() {
  const validProductIds = (await prisma.product.findMany({ select: { id: true } })).map((product) => product.id)
  const [products, valuation, byLocation, movements, lowStock, outOfStock] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      include: { brand: { select: { name: true } }, category: { select: { name: true } }, inventory: { include: { location: { select: { name: true } } } } },
      take: 500
    }),
prisma.$queryRawUnsafe(`
  SELECT
    COALESCE(SUM(i.quantity * p."costPrice"), 0) AS "costVal",
    COALESCE(SUM(i.quantity * p.price), 0) AS "retailVal",
    COALESCE(SUM(i.quantity), 0) AS "totalUnits"
  FROM "inventory" i
  JOIN "product" p ON i."productId" = p.id
`),    prisma.inventory.groupBy({ by: ['locationId'], _sum: { quantity: true, availableQuantity: true } }),
    prisma.stockMovement.findMany({ where: { productId: { in: validProductIds } }, take: 50, orderBy: { createdAt: 'desc' }, include: { product: { select: { name: true, sku: true } } } }),
    prisma.$queryRawUnsafe(`
  SELECT
    i.*,
    p.name AS "productName",
    p.sku,
    p."minimumStock",
    l.name AS "locationName"
  FROM "inventory" i
  JOIN "product" p ON i."productId" = p.id
  JOIN "Location" l ON i."locationId" = l.id
  WHERE i."availableQuantity" > 0
    AND i."availableQuantity" <= p."minimumStock"
    AND p."minimumStock" > 0
  LIMIT 100
`),
    prisma.inventory.findMany({
      where: { availableQuantity: { lte: 0 } },
      include: { product: { select: { name: true, sku: true } }, location: { select: { name: true } } },
      take: 100
    })
  ])

  const locations = await prisma.location.findMany({ select: { id: true, name: true } })
  const locMap = Object.fromEntries(locations.map((l) => [l.id, l.name]))

  return {
    valuation: {
      costValue: Number(valuation[0]?.costVal || 0),
      retailValue: Number(valuation[0]?.retailVal || 0),
      totalUnits: Number(valuation[0]?.totalUnits || 0)
    },
    byLocation: byLocation.map((l) => ({
      locationId: l.locationId,
      name: locMap[l.locationId] || l.locationId,
      units: l._sum.quantity,
      available: l._sum.availableQuantity
    })),
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      brand: p.brand?.name,
      category: p.category?.name,
      costPrice: Number(p.costPrice),
      sellingPrice: Number(p.price),
      minimumStock: p.minimumStock,
      totalStock: p.inventory.reduce((sum, i) => sum + Number(i.quantity), 0),
      costValue: p.inventory.reduce((sum, i) => sum + Number(i.quantity) * Number(p.costPrice), 0),
      retailValue: p.inventory.reduce((sum, i) => sum + Number(i.quantity) * Number(p.price), 0),
      locations: p.inventory.map((i) => ({ location: i.location?.name, quantity: i.quantity, available: i.availableQuantity }))
    })),
    lowStock,
    outOfStock,
    recentMovements: movements
  }
}

export async function getCrmAnalytics() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const [
    total, newCustomers, active, inactive, leads, lost, vip, wholesale,
    byStatus, byType, bySource, growth
  ] = await Promise.all([
    prisma.customer.count(),
    prisma.customer.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.customer.count({ where: { status: 'ACTIVE' } }),
    prisma.customer.count({ where: { status: 'INACTIVE' } }),
    prisma.customer.count({ where: { status: 'LEAD' } }),
    prisma.customer.count({ where: { status: 'LOST' } }),
    prisma.customer.count({ where: { OR: [{ status: 'VIP' }, { customerType: 'VIP' }] } }),
    prisma.customer.count({ where: { customerType: 'WHOLESALE' } }),
    prisma.customer.groupBy({ by: ['status'], _count: true }),
    prisma.customer.groupBy({ by: ['customerType'], _count: true }),
    prisma.customer.groupBy({ by: ['source'], _count: true }),
    prisma.$queryRawUnsafe(`
  SELECT
    DATE("createdAt") AS day,
    COUNT(*) AS count
  FROM "Customer"
  WHERE "createdAt" >= NOW() - INTERVAL '90 days'
  GROUP BY DATE("createdAt")
  ORDER BY day ASC
`),
  ])

  const topCustomers = await prisma.sale.groupBy({
    by: ['customerId'],
    where: { status: { not: 'CANCELLED' } },
    _sum: { total: true },
    _count: true,
    _avg: { total: true },
    orderBy: { _sum: { total: 'desc' } },
    take: 20
  })

  const customerIds = topCustomers.map((c) => c.customerId).filter(Boolean)
  const customers = await prisma.customer.findMany({
    where: { id: { in: customerIds } },
    select: { id: true, name: true, customerCode: true, status: true, customerType: true }
  })
  const cmap = Object.fromEntries(customers.map((c) => [c.id, c]))

  const lastPurchases = await prisma.sale.findMany({
    where: { customerId: { in: customerIds }, status: { not: 'CANCELLED' } },
    orderBy: { soldAt: 'desc' },
    distinct: ['customerId'],
    select: { customerId: true, soldAt: true, total: true }
  })
  const lastMap = Object.fromEntries(lastPurchases.map((s) => [s.customerId, s]))

  return {
    overview: { total, newCustomers, active, inactive, leads, lost, vip, wholesale },
    charts: {
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count })),
      byType: byType.map((t) => ({ type: t.customerType, count: t._count })),
      bySource: bySource.map((s) => ({ source: s.source || 'Unknown', count: s._count })),
      growth: (growth || []).map((g) => ({ day: g.day, count: Number(g.count) }))
    },
    customerValue: topCustomers.map((c) => ({
      customerId: c.customerId,
      name: cmap[c.customerId]?.name,
      code: cmap[c.customerId]?.customerCode,
      status: cmap[c.customerId]?.status,
      type: cmap[c.customerId]?.customerType,
      totalValue: Number(c._sum.total || 0),
      purchaseCount: c._count,
      averageTransaction: Number(c._avg.total || 0),
      lastPurchase: lastMap[c.customerId]?.soldAt || null
    }))
  }
}

export async function getEmployeeAnalytics({ includeSensitive = false } = {}) {
  const [
    total, active, inactive, terminated,
    byDept, byLocation, byType, byStatus
  ] = await Promise.all([
    prisma.employee.count(),
    prisma.employee.count({ where: { employmentStatus: 'ACTIVE' } }),
    prisma.employee.count({ where: { employmentStatus: 'INACTIVE' } }),
    prisma.employee.count({ where: { employmentStatus: 'TERMINATED' } }),
    prisma.employee.groupBy({ by: ['departmentId'], _count: true }),
    prisma.employee.groupBy({ by: ['locationId'], _count: true }),
    prisma.employee.groupBy({ by: ['employmentType'], _count: true }),
    prisma.employee.groupBy({ by: ['employmentStatus'], _count: true })
  ])

  const departments = await prisma.department.findMany({ select: { id: true, name: true } })
  const locations = await prisma.location.findMany({ select: { id: true, name: true } })
  const deptMap = Object.fromEntries(departments.map((d) => [d.id, d.name]))
  const locMap = Object.fromEntries(locations.map((l) => [l.id, l.name]))

  const result = {
    overview: { total, active, inactive, terminated },
    byDepartment: byDept.map((d) => ({ departmentId: d.departmentId, name: deptMap[d.departmentId] || 'Unassigned', count: d._count })),
    byLocation: byLocation.map((l) => ({ locationId: l.locationId, name: locMap[l.locationId] || 'Unassigned', count: l._count })),
    byEmploymentType: byType.map((t) => ({ type: t.employmentType, count: t._count })),
    byStatus: byStatus.map((s) => ({ status: s.employmentStatus, count: s._count }))
  }

  if (includeSensitive) {
    const salaryAgg = await prisma.employee.aggregate({
      where: { salary: { not: null }, employmentStatus: 'ACTIVE' },
      _avg: { salary: true },
      _sum: { salary: true },
      _count: true
    })
    result.sensitive = {
      averageSalary: Number(salaryAgg._avg.salary || 0),
      totalSalary: Number(salaryAgg._sum.salary || 0),
      employeesWithSalary: salaryAgg._count
    }

    // Ethiopian payroll (income tax Procl. 979/2016 + pension Procl. 715/2011)
    const withSalary = await prisma.employee.findMany({
      where: { salary: { not: null }, employmentStatus: 'ACTIVE' },
      select: {
        id: true, employeeCode: true, firstName: true, lastName: true, jobTitle: true, salary: true,
        department: { select: { name: true } }, location: { select: { name: true } }
      },
      orderBy: { salary: 'desc' }
    })
    const payroll = withSalary.map((e) => {
      const gross = Number(e.salary || 0)
      const slip = ethiopianPayslip({ grossMonthly: gross })
      return {
        id: e.id,
        employeeCode: e.employeeCode,
        name: `${e.firstName} ${e.lastName}`,
        jobTitle: e.jobTitle,
        department: e.department?.name,
        location: e.location?.name,
        gross: slip.gross,
        incomeTax: slip.incomeTax,
        taxRate: slip.taxRate,
        pensionEmployee: slip.pensionEmployee,
        pensionEmployer: slip.pensionEmployer,
        totalDeductions: slip.totalDeductions,
        netSalary: slip.netSalary
      }
    })
    const totals = payroll.reduce(
      (acc, p) => ({
        gross: acc.gross + p.gross,
        incomeTax: acc.incomeTax + p.incomeTax,
        pensionEmployee: acc.pensionEmployee + p.pensionEmployee,
        pensionEmployer: acc.pensionEmployer + p.pensionEmployer,
        netSalary: acc.netSalary + p.netSalary
      }),
      { gross: 0, incomeTax: 0, pensionEmployee: 0, pensionEmployer: 0, netSalary: 0 }
    )
    for (const k of Object.keys(totals)) totals[k] = Math.round(totals[k] * 100) / 100
    result.payroll = {
      currency: 'ETB',
      employees: payroll,
      totals: { ...totals, employees: payroll.length }
    }
  }

  return result
}

export async function getProductAnalytics(productId) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      brand: { select: { name: true } },
      category: { select: { name: true } },
      inventory: { include: { location: { select: { id: true, name: true, code: true } } } }
    }
  })
  if (!product) throw Object.assign(new Error('Product not found'), { statusCode: 404 })

  const [salesAgg, purchaseAgg, movementCount, lastSale, lastPurchase, lastAdjustment] = await Promise.all([
    prisma.saleItem.aggregate({
      where: { productId, sale: { status: { not: 'CANCELLED' } } },
      _sum: { quantity: true, totalPrice: true }
    }),
    prisma.purchaseItem.aggregate({
      where: { productId },
      _sum: { quantity: true, totalCost: true, receivedQuantity: true }
    }),
    prisma.stockMovement.count({ where: { productId } }),
    prisma.saleItem.findFirst({
      where: { productId, sale: { status: { not: 'CANCELLED' } } },
      orderBy: { createdAt: 'desc' },
      include: { sale: { select: { soldAt: true, saleNumber: true } } }
    }),
    prisma.purchaseItem.findFirst({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      include: { purchase: { select: { createdAt: true, purchaseNumber: true } } }
    }),
    prisma.stockMovement.findFirst({
      where: { productId, type: { in: ['ADJUSTMENT_IN', 'ADJUSTMENT_OUT'] } },
      orderBy: { createdAt: 'desc' }
    })
  ])

  const currentStock = product.inventory.reduce((s, i) => s + i.quantity, 0)

  return {
    product: {
      id: product.id,
      name: product.name,
      sku: product.sku,
      brand: product.brand?.name,
      category: product.category?.name,
      costPrice: Number(product.costPrice),
      sellingPrice: Number(product.price)
    },
    currentStock,
    salesQuantity: salesAgg._sum.quantity || 0,
    salesValue: Number(salesAgg._sum.totalPrice || 0),
    purchaseQuantity: purchaseAgg._sum.quantity || 0,
    purchaseValue: Number(purchaseAgg._sum.totalCost || 0),
    receivedQuantity: purchaseAgg._sum.receivedQuantity || 0,
    stockMovementCount: movementCount,
    lastSale: lastSale ? { date: lastSale.sale?.soldAt, saleNumber: lastSale.sale?.saleNumber, quantity: lastSale.quantity } : null,
    lastPurchase: lastPurchase ? { date: lastPurchase.purchase?.createdAt, purchaseNumber: lastPurchase.purchase?.purchaseNumber, quantity: lastPurchase.quantity } : null,
    lastAdjustment: lastAdjustment,
    locationDistribution: product.inventory.map((i) => ({
      locationId: i.locationId,
      location: i.location?.name,
      quantity: i.quantity,
      available: i.availableQuantity,
      reserved: i.reservedQuantity
    }))
  }
}

export default {
  getDashboardSummary,
  getSalesReport,
  getInventoryReport,
  getCrmAnalytics,
  getEmployeeAnalytics,
  getProductAnalytics
}
