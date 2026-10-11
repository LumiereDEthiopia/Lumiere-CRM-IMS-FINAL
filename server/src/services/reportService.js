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

export async function getSalesReport({
  startDate, endDate, locationId, customerId, productId, brandId, categoryId,
  productType, form, flavor, size, paymentMethod, soldByEmployeeId
}) {
  const where = { status: { not: 'CANCELLED' }, ...dateRange(startDate, endDate) }
  if (locationId) where.locationId = locationId
  if (customerId) where.customerId = customerId
  if (paymentMethod) where.paymentMethod = paymentMethod
  // Sold By / Employee filter (spec §13) — restricts the whole report to one salesperson.
  if (soldByEmployeeId) where.soldByEmployeeId = soldByEmployeeId

  let productFilter = null
  if (productId || brandId || categoryId || productType || form || flavor || size) {
    productFilter = {}
    if (productId) productFilter.id = productId
    if (brandId) productFilter.brandId = brandId
    if (categoryId) productFilter.categoryId = categoryId
    // Product type / Cream-Jelly form / Musk flavor filters (spec §13/§14).
    if (productType) productFilter.productType = productType
    if (form) productFilter.form = form
    if (flavor) productFilter.flavor = { contains: flavor, mode: 'insensitive' }
    if (size) productFilter.size = { contains: size, mode: 'insensitive' }
  }

  const [summary, recentSales, byLocation, discountByEmployeeRaw, discountByBranchRaw, giftItems] = await Promise.all([
    prisma.sale.aggregate({ where, _sum: { total: true, discount: true, subtotal: true, vatAmount: true }, _count: true, _avg: { total: true } }),
    prisma.sale.findMany({
      where,
      include: {
        customer: { select: { name: true } },
        location: { select: { name: true } },
        soldByEmployee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        items: true
      },
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

  // Pure Oil CONSUMED by Cream/Jelly sales (spec §8/§12). This is a COST /
  // inventory movement — NOT Pure Oil sales revenue — so it is tracked
  // separately from direct Pure Oil sales. Written at sale time by
  // saleService.js as CREAM_PURE_OIL_CONSUMPTION.
  const creamWhere = { type: 'CREAM_PURE_OIL_CONSUMPTION' }
  if (startDate || endDate) {
    creamWhere.createdAt = {}
    if (startDate) creamWhere.createdAt.gte = new Date(startDate)
    if (endDate) creamWhere.createdAt.lte = new Date(endDate + 'T23:59:59')
  }
  if (locationId) creamWhere.locationId = locationId
  let creamProductIds = null
  if (productFilter) {
    creamProductIds = (await prisma.product.findMany({ where: productFilter, select: { id: true } })).map((product) => product.id)
    if (productId) {
      const consumedSales = await prisma.saleItem.findMany({ where: { productId, sale: where }, select: { saleId: true } })
      creamWhere.referenceId = { in: consumedSales.map((line) => line.saleId) }
    } else if (creamProductIds.length) {
      const consumedSales = await prisma.saleItem.findMany({ where: { productId: { in: creamProductIds }, sale: where }, select: { saleId: true } })
      creamWhere.referenceId = { in: consumedSales.map((line) => line.saleId) }
    } else {
      creamWhere.productId = '__no_matching_consumption__'
    }
  }
  if (productType && productType !== 'CREAM' && productType !== 'PURE_OIL') creamWhere.productId = '__no_matching_consumption__'
  if (productType === 'PURE_OIL' && productId) creamWhere.productId = productId
  if (soldByEmployeeId || customerId || paymentMethod) {
    const matchingSales = await prisma.sale.findMany({ where, select: { id: true } })
    creamWhere.referenceId = { in: matchingSales.map((sale) => sale.id) }
  }
  const matchingSaleIds = (await prisma.sale.findMany({ where, select: { id: true } })).map((sale) => sale.id)
  creamWhere.referenceId = creamWhere.referenceId?.in
    ? { in: creamWhere.referenceId.in.filter((id) => matchingSaleIds.includes(id)) }
    : { in: matchingSaleIds }
  creamWhere.referenceType = 'SALE'

  const [byProduct, byBrand, byCategory, unitsSold, byProductType, byEmployee, employeeSalesLog, rawCreamConsumption, costLines] = await Promise.all([
  prisma.saleItem.groupBy({
    by: ['productId', 'productName'],
    where: itemWhere,
    _sum: { quantity: true, totalPrice: true, unitCost: true },
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
  }),

  // Sales by product type (including Musk and Cream/Jelly). Respects the
  // product-type / form / employee filters so the breakdown matches the rest
  // of the report.
  prisma.$queryRawUnsafe(`
    SELECT
      p."productType",
      p.form,
      SUM(CAST(si.quantity AS NUMERIC)) AS units,
      SUM(CAST(si."totalPrice" AS NUMERIC)) AS revenue
    FROM "saleitem" si
    JOIN "product" p ON si."productId" = p.id
    JOIN "Sale" s ON si."saleId" = s.id
    WHERE s.status != 'CANCELLED'
    ${startDate ? `AND s."soldAt" >= '${new Date(startDate).toISOString()}'::timestamptz` : ''}
    ${endDate ? `AND s."soldAt" <= '${new Date(endDate).toISOString()}'::timestamptz` : ''}
    ${locationId ? `AND s."locationId" = '${String(locationId).replace(/'/g, "''")}'` : ''}
    ${soldByEmployeeId ? `AND s."soldByEmployeeId" = '${String(soldByEmployeeId).replace(/'/g, "''")}'` : ''}
    ${productType ? `AND p."productType" = '${String(productType).replace(/'/g, "''")}'` : ''}
    ${form ? `AND p.form = '${String(form).replace(/'/g, "''")}'` : ''}
    GROUP BY p."productType", p.form
    ORDER BY revenue DESC
  `),

  // Sales by employee (Sold By)
  prisma.sale.groupBy({
    by: ['soldByEmployeeId'],
    where,
    _sum: { total: true, discount: true },
    _count: true
  }),

  // Employee sales by count (from SalesLog for more accurate tracking)
  prisma.saleLog.groupBy({
    by: ['employeeId'],
    where: where.soldAt ? { soldAt: where.soldAt } : {},
    _sum: { totalAmount: true },
    _count: true
  }),

  // Pure Oil consumption from Cream/Jelly sales
  prisma.stockMovement.findMany({
    where: creamWhere,
    select: {
      productId: true,
      quantity: true,
      notes: true,
      createdAt: true,
      referenceId: true
    }
  }),
  prisma.saleItem.findMany({
    where: itemWhere,
    select: { productId: true, productName: true, quantity: true, totalPrice: true, unitCost: true }
  })
])

  const costByProduct = new Map()
  for (const line of costLines) {
    const row = costByProduct.get(line.productId) || { cost: 0, revenue: 0 }
    row.cost += Number(line.unitCost || 0) * Number(line.quantity || 0)
    row.revenue += Number(line.totalPrice || 0)
    costByProduct.set(line.productId, row)
  }
  const totalCogs = round2([...costByProduct.values()].reduce((sum, row) => sum + row.cost, 0))

  const validConsumptionSaleIds = [...new Set(rawCreamConsumption.map((movement) => movement.referenceId).filter(Boolean))]
  const validConsumptionSales = validConsumptionSaleIds.length
    ? await prisma.sale.findMany({
      where: {
        id: { in: validConsumptionSaleIds },
        status: { not: 'CANCELLED' },
        ...(productType === 'CREAM' ? { items: { some: { product: { productType: 'CREAM', ...(form ? { form } : {}), ...(size ? { size: { contains: size, mode: 'insensitive' } } : {}), ...(flavor ? { flavor: { contains: flavor, mode: 'insensitive' } } : {}) } } } } : {}),
        ...(productType && productType !== 'CREAM' && productType !== 'PURE_OIL' ? { id: '__no_matching_consumption__' } : {})
      },
      select: { id: true }
    })
    : []
  const validConsumptionIds = new Set(validConsumptionSales.map((sale) => sale.id))
  const creamConsumption = rawCreamConsumption.filter((movement) => validConsumptionIds.has(movement.referenceId) && (!creamProductIds || creamProductIds.includes(movement.productId)))

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
  const employees = await prisma.employee.findMany({ select: { id: true, firstName: true, lastName: true } })
  const employeeMap = Object.fromEntries(employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`]))
  const products = await prisma.product.findMany({ select: { id: true, name: true } })
  const productMap = Object.fromEntries(products.map((p) => [p.id, p.name]))
  const consumedSaleIds = [...new Set(creamConsumption.map((movement) => movement.referenceId).filter(Boolean))]
  const consumedSaleLines = consumedSaleIds.length
    ? await prisma.saleItem.findMany({
      where: { saleId: { in: consumedSaleIds }, product: { productType: 'CREAM' } },
      select: { saleId: true, productName: true }
    })
    : []
  const creamNameBySale = Object.fromEntries(consumedSaleLines.map((line) => [line.saleId, line.productName]))

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
      freeGiftByBranch: groupGifts(giftItems, (g) => g.sale?.locationId, (id) => (id === 'unknown' ? 'Unassigned' : locMap[id] || id)),
      // Total Pure Oil CONSUMED by Cream/Jelly sales in this report window.
      // A cost/inventory movement — deliberately NOT added to revenue.
      pureOilConsumedMl: round2(creamConsumption.reduce((s, cm) => s + Number(cm.quantity || 0), 0)),
      cost: totalCogs,
      profit: round2(Number(summary._sum.total || 0) - totalCogs)
    },
    overTime: (overTime || []).map((r) => ({ day: r.day, transactions: Number(r.transactions), revenue: Number(r.revenue || 0) })),
    byProduct: byProduct.map((p) => ({
      productId: p.productId,
      name: p.productName,
      quantity: p._sum.quantity,
      revenue: Number(p._sum.totalPrice || 0),
      cost: round2(costByProduct.get(p.productId)?.cost || 0),
      profit: round2((costByProduct.get(p.productId)?.revenue || 0) - (costByProduct.get(p.productId)?.cost || 0)),
      transactions: p._count
    })),
    byBrand: (byBrand || []).map((b) => ({ brandId: b.brandId, name: b.name, units: Number(b.units || 0), revenue: Number(b.revenue || 0) })),
    byCategory: (byCategory || []).map((c) => ({ categoryId: c.categoryId, name: c.name || 'Uncategorized', units: Number(c.units || 0), revenue: Number(c.revenue || 0) })),
    byLocation: byLocation.map((l) => ({ locationId: l.locationId, name: locMap[l.locationId] || l.locationId, total: Number(l._sum.total || 0), count: l._count })),
    byProductType: (byProductType || []).map((pt) => ({
      productType: pt.productType,
      form: pt.form,
      units: Number(pt.units || 0),
      revenue: Number(pt.revenue || 0)
    })),
    byEmployee: byEmployee.map((e) => ({
      employeeId: e.soldByEmployeeId,
      name: e.soldByEmployeeId ? employeeMap[e.soldByEmployeeId] || 'Unassigned' : 'Unassigned',
      total: Number(e._sum.total || 0),
      discount: Number(e._sum.discount || 0),
      transactions: e._count
    })),
    employeePerformance: (employeeSalesLog || []).map((e) => ({
      employeeId: e.employeeId,
      name: e.employeeId ? employeeMap[e.employeeId] || 'Unassigned' : 'Unassigned',
      totalRevenue: Number(e._sum.totalAmount || 0),
      salesCount: e._count
    })).sort((a, b) => b.salesCount - a.salesCount),
    creamConsumption: creamConsumption.map((cm) => ({
      productId: cm.productId,
      productName: productMap[cm.productId] || 'Unknown',
      quantity: Number(cm.quantity || 0),
      notes: cm.notes,
      creamProductName: creamNameBySale[cm.referenceId] || null,
      saleId: cm.referenceId,
      createdAt: cm.createdAt
    })),
    recentSales
  }
}

export async function getSalesLogs({ startDate, endDate, locationId, employeeId, page = 1, limit = 50 }) {
  const where = {}
  if (startDate || endDate) {
    where.soldAt = {}
    if (startDate) where.soldAt.gte = new Date(startDate)
    if (endDate) where.soldAt.lte = new Date(endDate + 'T23:59:59')
  }
  if (locationId) where.locationId = locationId
  if (employeeId) where.employeeId = employeeId

  page = parseInt(page) || 1
  limit = parseInt(limit) || 50

  const [logs, total] = await Promise.all([
    prisma.saleLog.findMany({
      where,
      orderBy: { soldAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.saleLog.count({ where })
  ])

  return {
    data: logs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
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
      productType: p.productType,
      form: p.form,
      flavor: p.flavor,
      size: p.size,
      costPrice: Number(p.costPrice),
      sellingPrice: Number(p.price),
      minimumStock: p.minimumStock,
      stockQuantity: Number(p.stockQuantity),
      stock50ml: Number(p.stock50ml || 0),
      stock100ml: Number(p.stock100ml || 0),
      totalStock: p.inventory.reduce((sum, i) => sum + Number(i.quantity), 0),
      costValue: p.inventory.reduce((sum, i) => sum + Number(i.quantity) * Number(p.costPrice), 0),
      retailValue: p.inventory.reduce((sum, i) => sum + Number(i.quantity) * Number(p.price), 0),
      stockStatus: (() => {
        const total = p.inventory.reduce((sum, i) => sum + Number(i.quantity), 0)
        if (total <= 0) return 'OUT_OF_STOCK'
        if (Number(p.minimumStock) > 0 && total <= Number(p.minimumStock)) return 'LOW_STOCK'
        return 'IN_STOCK'
      })(),
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
