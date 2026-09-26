/**
 * Global Search Service — permission-aware, server-side only
 */
import prisma from '../config/prisma.js'

export async function globalSearch(query, { limit = 10, permissions = [], role } = {}) {
  if (!query || String(query).trim().length < 2) {
    return { products: [], customers: [], suppliers: [], employees: [], brands: [], categories: [], sales: [], purchases: [], transfers: [] }
  }

  const q = String(query).trim()
  const take = Math.min(Math.max(1, limit), 25)
  const isSuper = role === 'SUPER_ADMIN' || permissions.includes('*')
  const can = (perm) => isSuper || permissions.includes(perm)

  const tasks = []

  tasks.push(
    can('product:view') || isSuper || permissions.length === 0
      ? prisma.product.findMany({
          where: { OR: [{ name: { contains: q } }, { sku: { contains: q } }, { barcode: { contains: q } }] },
          take,
          include: { brand: { select: { name: true } }, category: { select: { name: true } } }
        })
      : Promise.resolve([])
  )

  tasks.push(
    can('customer:view') || permissions.length === 0
      ? prisma.customer.findMany({
          where: { OR: [{ name: { contains: q } }, { email: { contains: q } }, { phone: { contains: q } }, { customerCode: { contains: q } }] },
          take
        })
      : Promise.resolve([])
  )

  tasks.push(
    prisma.supplier.findMany({
      where: { OR: [{ name: { contains: q } }, { contactPerson: { contains: q } }, { email: { contains: q } }, { phone: { contains: q } }] },
      take
    })
  )

  tasks.push(
    can('employee:view')
      ? prisma.employee.findMany({
          where: {
            OR: [
              { firstName: { contains: q } },
              { lastName: { contains: q } },
              { email: { contains: q } },
              { phone: { contains: q } },
              { employeeCode: { contains: q } },
              { jobTitle: { contains: q } }
            ]
          },
          take,
          include: { department: { select: { name: true } }, location: { select: { name: true } } }
        })
      : Promise.resolve([])
  )

  tasks.push(
    prisma.brand.findMany({ where: { OR: [{ name: { contains: q } }, { slug: { contains: q } }] }, take })
  )

  tasks.push(
    prisma.category.findMany({ where: { OR: [{ name: { contains: q } }, { slug: { contains: q } }] }, take })
  )

  tasks.push(
    can('sale:view') || permissions.length === 0
      ? prisma.sale.findMany({
          where: { OR: [{ saleNumber: { contains: q } }, { customer: { name: { contains: q } } }] },
          take,
          include: { customer: { select: { name: true } } }
        })
      : Promise.resolve([])
  )

  tasks.push(
    can('purchase:view') || permissions.length === 0
      ? prisma.purchase.findMany({
          where: { OR: [{ purchaseNumber: { contains: q } }, { supplier: { name: { contains: q } } }] },
          take,
          include: { supplier: { select: { name: true } } }
        })
      : Promise.resolve([])
  )

  tasks.push(
    can('inventory:view') || permissions.length === 0
      ? prisma.stockTransfer.findMany({
          where: { transferNumber: { contains: q } },
          take,
          include: { fromLocation: { select: { name: true } }, toLocation: { select: { name: true } } }
        })
      : Promise.resolve([])
  )

  const [products, customers, suppliers, employees, brands, categories, sales, purchases, transfers] = await Promise.all(tasks)
  const includeSensitive = can('employee:view_sensitive')

  return {
    products: products.map((p) => ({ id: p.id, name: p.name, sku: p.sku, brand: p.brand?.name, category: p.category?.name, type: 'product', link: `/admin/products` })),
    customers: customers.map((c) => ({ id: c.id, name: c.name, email: c.email, phone: c.phone, code: c.customerCode, type: 'customer', link: `/admin/customers` })),
    suppliers: suppliers.map((s) => ({ id: s.id, name: s.name, contactPerson: s.contactPerson, email: s.email, type: 'supplier', link: `/admin/suppliers` })),
    employees: employees.map((e) => ({
      id: e.id,
      name: `${e.firstName} ${e.lastName}`,
      employeeCode: e.employeeCode,
      department: e.department?.name,
      jobTitle: e.jobTitle,
      email: includeSensitive ? e.email : undefined,
      type: 'employee',
      link: `/admin/employees`
    })),
    brands: brands.map((b) => ({ id: b.id, name: b.name, type: 'brand', link: `/admin/brands` })),
    categories: categories.map((c) => ({ id: c.id, name: c.name, type: 'category', link: `/admin/categories` })),
    sales: sales.map((s) => ({ id: s.id, name: s.saleNumber, customer: s.customer?.name, total: s.total, type: 'sale', link: `/admin/sales` })),
    purchases: purchases.map((p) => ({ id: p.id, name: p.purchaseNumber, supplier: p.supplier?.name, total: p.total, type: 'purchase', link: `/admin/purchases` })),
    transfers: transfers.map((t) => ({
      id: t.id,
      name: t.transferNumber,
      from: t.fromLocation?.name,
      to: t.toLocation?.name,
      status: t.status,
      type: 'transfer',
      link: `/admin/inventory`
    }))
  }
}

export default { globalSearch }
