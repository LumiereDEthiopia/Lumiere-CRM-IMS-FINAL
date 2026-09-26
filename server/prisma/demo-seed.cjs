/**
 * Demo Seed — real-world operational data for a ready-to-use install.
 *
 * Run order (from the `server` directory):
 *   node prisma/seed.js          # catalog: categories, brands, products, accords, notes
 *   node seed-permissions.cjs    # roles, permissions, admin user
 *   node prisma/demo-seed.cjs    # this file: suppliers, customers, employees, sales...
 *
 * Idempotent — safe to re-run at any time.
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const DAY = 24 * 60 * 60 * 1000
const ago = (days) => new Date(Date.now() - Math.round(days * DAY))
const inDays = (days) => new Date(Date.now() + Math.round(days * DAY))

// Deterministic PRNG so re-runs produce the same data
let seedState = 20260912
function rnd(n) {
  seedState = (seedState * 1103515245 + 12345) & 0x7fffffff
  return seedState % n
}

async function ensureSetting(key, value, type = 'text') {
  await prisma.setting.upsert({ where: { key }, update: { value, type }, create: { key, value, type } })
}

async function main() {
  console.log('\n— Lumiere CRM demo seed —\n')

  const adminUser = await prisma.user.findUnique({ where: { email: 'admin@lumiere.com' } })

  // ------------------------------------------------------------------
  // Organization, locations & departments
  // ------------------------------------------------------------------
  const org = await prisma.organization.upsert({
    where: { code: 'LUMIERE' },
    update: {},
    create: { name: 'Lumiere Perfume', code: 'LUMIERE', currency: 'USD', timezone: 'UTC', dateFormat: 'YYYY-MM-DD' }
  })
  // Claim any legacy org-less locations into the Lumiere organization
  await prisma.location.updateMany({ where: { organizationId: null }, data: { organizationId: org.id } })
  const mainLoc = await prisma.location.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'MAIN' } },
    update: {},
    create: { name: 'Main Store', code: 'MAIN', type: 'RETAIL', address: '123 Main St', city: 'New York', country: 'USA', phone: '+1-212-555-0100', email: 'store@lumiere.com', organizationId: org.id }
  })
  const boutiqueLoc = await prisma.location.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'BOUTIQUE' } },
    update: {},
    create: { name: 'Lumiere Boutique', code: 'BOUTIQUE', type: 'RETAIL', address: '10 Rue de la Paix', city: 'Paris', country: 'France', phone: '+33-1-42-00-00-00', email: 'boutique@lumiere.com', organizationId: org.id }
  })
  const deptSales = await prisma.department.upsert({ where: { code: 'SALES' }, update: {}, create: { name: 'Sales', code: 'SALES', description: 'Retail & wholesale sales' } })
  const deptInv = await prisma.department.upsert({ where: { code: 'INVENTORY' }, update: {}, create: { name: 'Inventory', code: 'INVENTORY', description: 'Stock control and logistics' } })
  const deptMgmt = await prisma.department.upsert({ where: { code: 'MGMT' }, update: {}, create: { name: 'Management', code: 'MGMT', description: 'Leadership and oversight' } })

  // ------------------------------------------------------------------
  // Products — set cost price + minimum stock, keep stockQuantity in sync
  // ------------------------------------------------------------------
  const productConfig = [
    { slug: 'midnight-oud', price: 18500, cost: 9200, min: 8, stock: 55 },
    { slug: 'rose-elegante', price: 9500, cost: 4800, min: 10, stock: 50 },
    { slug: 'aqua-fresh', price: 3500, cost: 1750, min: 20, stock: 120 },
    { slug: 'citrus-royale', price: 5500, cost: 2700, min: 15, stock: 75 },
    { slug: 'vanille-noir', price: 12500, cost: 6200, min: 8, stock: 45 },
    { slug: 'fresh-kids', price: 2800, cost: 1400, min: 25, stock: 180 }
  ]
  const products = {}
  for (const cfg of productConfig) {
    const p = await prisma.product.findUnique({ where: { slug: cfg.slug } })
    if (!p) {
      console.error(`Missing product "${cfg.slug}". Run "node prisma/seed.js" first.`)
      process.exit(1)
    }
    await prisma.product.update({
      where: { id: p.id },
      data: { price: cfg.price, costPrice: cfg.cost, minimumStock: cfg.min, stockQuantity: cfg.stock }
    })
    products[cfg.slug] = p
  }

  // ------------------------------------------------------------------
  // Suppliers + supplier-product catalog with cost/lead-time
  // ------------------------------------------------------------------
  const supplierData = [
    { name: 'Fragrance House Paris', contactPerson: 'Claire Dubois', email: 'sales@fragrancehouse.fr', phone: '+33-1-42-00-00-01', city: 'Paris', country: 'France', taxNumber: 'FR-882-001', notes: 'Primary French niche suppliers' },
    { name: 'Aroma Distribution LLC', contactPerson: 'Mike Anderson', email: 'mike@aromadist.com', phone: '+1-212-555-0148', city: 'New York', country: 'USA', taxNumber: 'US-EIN-0001', notes: 'East coast distributor' },
    { name: 'Orient Oud Trading', contactPerson: 'Khalid Al-Rashid', email: 'khalid@orientoud.com', phone: '+971-50-555-0199', city: 'Dubai', country: 'UAE', taxNumber: 'AE-1001', notes: 'Oud and oriental raw materials' },
    { name: 'Perfume Ingredients Co.', contactPerson: 'Sara Bennett', email: 'sara@pic-ingredients.com', phone: '+44-20-7946-0000', city: 'London', country: 'UK', taxNumber: 'GB-999-0001', notes: 'Bulk ingredients and bases' }
  ]
  const suppliers = {}
  for (const s of supplierData) {
    const existing = await prisma.supplier.findFirst({ where: { name: s.name } })
    const sup = existing
      ? await prisma.supplier.update({ where: { id: existing.id }, data: s })
      : await prisma.supplier.create({ data: s })
    suppliers[s.name] = sup
  }

  const supplierLinks = [
    ['Fragrance House Paris', 'vanille-noir', 5],
    ['Fragrance House Paris', 'rose-elegante', 6],
    ['Orient Oud Trading', 'midnight-oud', 5],
    ['Orient Oud Trading', 'citrus-royale', 4],
    ['Perfume Ingredients Co.', 'aqua-fresh', 7],
    ['Perfume Ingredients Co.', 'fresh-kids', 8],
    ['Aroma Distribution LLC', 'midnight-oud', 7],
    ['Aroma Distribution LLC', 'fresh-kids', 8]
  ]
  for (const [supName, slug, lead] of supplierLinks) {
    const supplierId = suppliers[supName].id
    const productId = products[slug].id
    const cost = products[slug].costPrice
    await prisma.supplierProduct.upsert({
      where: { supplierId_productId: { supplierId, productId } },
      update: { costPrice: cost, leadTimeDays: lead },
      create: { supplierId, productId, supplierSku: slug.toUpperCase().replace('-', '') + '/' + lead, costPrice: cost, leadTimeDays: lead, isPreferred: lead <= 6 }
    })
  }
// ------------------------------------------------------------------
  // Employees — departments, locations, hierarchy
  // ------------------------------------------------------------------
  const manager = await prisma.employee.findUnique({ where: { employeeCode: 'EMP-0001' } })
  const empData = [
    { code: 'EMP-0002', first: 'Isabelle', last: 'Laurent', email: 'isabelle@lumiere.com', dept: 'MGMT', title: 'Store Manager', loc: 'MAIN', salary: 5200, hire: 800 },
    { code: 'EMP-0003', first: 'Omar', last: 'Haddad', email: 'omar@lumiere.com', dept: 'SALES', title: 'Sales Associate', loc: 'MAIN', salary: 2100, hire: 420 },
    { code: 'EMP-0004', first: 'Sofia', last: 'Marques', email: 'sofia@lumiere.com', dept: 'SALES', title: 'Sales Associate', loc: 'BOUTIQUE', salary: 2150, hire: 300 },
    { code: 'EMP-0005', first: 'Yuki', last: 'Tanaka', email: 'yuki@lumiere.com', dept: 'INVENTORY', title: 'Inventory Specialist', loc: 'MAIN', salary: 2400, hire: 660 },
    { code: 'EMP-0006', first: 'Lucas', last: 'Moreau', email: 'lucas@lumiere.com', dept: 'MGMT', title: 'Purchasing Manager', loc: 'MAIN', salary: 3800, hire: 520 },
    { code: 'EMP-0007', first: 'Amira', last: 'Bousaid', email: 'amira@lumiere.com', dept: 'SALES', title: 'Sales Associate', loc: 'BOUTIQUE', salary: 2000, hire: 180 }
  ]
  const deptByCode = { SALES: deptSales, INVENTORY: deptInv, MGMT: deptMgmt }
  const locByCode = { MAIN: mainLoc, BOUTIQUE: boutiqueLoc }
  const employees = {}
  for (const e of empData) {
    const phoneSuffix = String(e.code).slice(-2)
    const employee = await prisma.employee.upsert({
      where: { employeeCode: e.code },
      update: {
        firstName: e.first, lastName: e.last, email: e.email,
        departmentId: deptByCode[e.dept].id, locationId: locByCode[e.loc].id,
        jobTitle: e.title, salary: e.salary, employmentStatus: 'ACTIVE',
        managerId: manager?.id
      },
      create: {
        employeeCode: e.code, firstName: e.first, lastName: e.last, email: e.email,
        departmentId: deptByCode[e.dept].id, locationId: locByCode[e.loc].id,
        jobTitle: e.title, salary: e.salary, salaryCurrency: 'USD',
        employmentType: 'FULL_TIME', employmentStatus: 'ACTIVE',
        hireDate: ago(e.hire), phone: '+1-555-01' + phoneSuffix, city: e.loc === 'MAIN' ? 'New York' : 'Paris',
        managerId: manager?.id
      }
    })
    employees[e.code] = employee
  }
  if (manager) {
    await prisma.employee.update({
      where: { id: manager.id },
      data: { departmentId: deptMgmt.id, locationId: mainLoc.id, jobTitle: 'General Manager' }
    })
  }

  // ------------------------------------------------------------------
  // Customers
  // ------------------------------------------------------------------
  const customerData = [
    { code: 'CUST-0001', name: 'John Doe', email: 'john@example.com', phone: '+1-555-0123', city: 'New York', country: 'USA', type: 'INDIVIDUAL', status: 'ACTIVE', source: 'Walk-in', loc: 'MAIN' },
    { code: 'CUST-0002', name: 'Sophia Reynolds', email: 'sophia@example.com', phone: '+1-555-0102', city: 'Los Angeles', country: 'USA', type: 'VIP', status: 'VIP', source: 'Referral', loc: 'BOUTIQUE' },
    { code: 'CUST-0003', name: 'Karim Mansour', email: 'karim@example.com', phone: '+971-50-123-4567', city: 'Dubai', country: 'UAE', type: 'WHOLESALE', status: 'ACTIVE', source: 'Website', loc: 'MAIN' },
    { code: 'CUST-0004', name: 'Elena Petrova', email: 'elena@example.com', phone: '+7-900-123-4567', city: 'Moscow', country: 'Russia', type: 'INDIVIDUAL', status: 'LEAD', source: 'Instagram', loc: 'BOUTIQUE' },
    { code: 'CUST-0005', name: 'Nadia Farouk', email: 'nadia@example.com', phone: '+20-100-123-4567', city: 'Cairo', country: 'Egypt', type: 'INDIVIDUAL', status: 'ACTIVE', source: 'Walk-in', loc: 'MAIN' },
    { code: 'CUST-0006', name: 'James Weston', email: 'james.weston@example.com', phone: '+44-7700-900123', city: 'London', country: 'UK', type: 'VIP', status: 'VIP', source: 'Referral', loc: 'BOUTIQUE' },
    { code: 'CUST-0007', name: 'Fatima Zahra', email: 'fatima@example.com', phone: '+212-6-61-23-45-67', city: 'Casablanca', country: 'Morocco', type: 'WHOLESALE', status: 'ACTIVE', source: 'Trade show', loc: 'MAIN' },
    { code: 'CUST-0008', name: 'Lin Chen', email: 'lin.chen@example.com', phone: '+86-138-0000-0000', city: 'Shanghai', country: 'China', type: 'INDIVIDUAL', status: 'ACTIVE', source: 'Website', loc: 'BOUTIQUE' }
  ]
  const customers = {}
  for (const c of customerData) {
    const customer = await prisma.customer.upsert({
      where: { customerCode: c.code },
      update: { name: c.name, status: c.status, customerType: c.type },
      create: {
        customerCode: c.code, name: c.name, email: c.email, phone: c.phone,
        city: c.city, country: c.country, customerType: c.type,
        status: c.status, source: c.source, locationId: c.loc === 'BOUTIQUE' ? boutiqueLoc.id : mainLoc.id
      }
    })
    customers[c.code] = customer
  }

  console.log('  catalog & people: ok')
// ------------------------------------------------------------------
  // Tasks & interactions
  // ------------------------------------------------------------------
  await prisma.customerTask.deleteMany({ where: { description: { startsWith: 'demo:' } } })
  await prisma.customerInteraction.deleteMany({ where: { description: { startsWith: 'demo:' } } })
  const tasks = [
    { cust: 'CUST-0002', title: 'Notify about Vanille Noir restock', due: -2, priority: 'HIGH', status: 'TODO' },
    { cust: 'CUST-0003', title: 'Wholesale contract renewal call', due: -1, priority: 'HIGH', status: 'IN_PROGRESS' },
    { cust: 'CUST-0001', title: 'Birthday gift offer', due: 5, priority: 'MEDIUM', status: 'TODO' },
    { cust: 'CUST-0004', title: 'Welcome call & fragrance consultation', due: 3, priority: 'LOW', status: 'TODO' },
    { cust: 'CUST-0007', title: 'Send 2026 wholesale catalogue', due: 12, priority: 'MEDIUM', status: 'TODO' },
    { cust: 'CUST-0006', title: 'Follow up on payment plan', due: 8, priority: 'HIGH', status: 'IN_PROGRESS' }
  ]
  for (const t of tasks) {
    await prisma.customerTask.create({
      data: {
        customerId: customers[t.cust].id, title: t.title, description: 'demo: ' + t.title,
        dueDate: t.due < 0 ? ago(-t.due) : inDays(t.due),
        priority: t.priority, status: t.status, assignedTo: adminUser?.id
      }
    })
  }

  const interactions = [
    { cust: 'CUST-0002', type: 'CALL', subject: 'VIP welcome call', when: 20, next: 6, status: 'COMPLETED' },
    { cust: 'CUST-0003', type: 'EMAIL', subject: 'Q4 wholesale quote', when: 9, next: -1, status: 'PENDING' },
    { cust: 'CUST-0004', type: 'WHATSAPP', subject: 'Consultation booking', when: 2, next: 3, status: 'PENDING' },
    { cust: 'CUST-0005', type: 'MEETING', subject: 'Loyalty program intro', when: 35, next: 5, status: 'COMPLETED' }
  ]
  for (const it of interactions) {
    await prisma.customerInteraction.create({
      data: {
        customerId: customers[it.cust].id, userId: adminUser?.id, type: it.type,
        subject: it.subject, description: 'demo: ' + it.subject, interactionDate: ago(it.when),
        nextFollowUpDate: it.next < 0 ? ago(-it.next) : inDays(it.next), status: it.status
      }
    })
  }

  const vipTag = await prisma.customerTag.upsert({ where: { name: 'VIP' }, update: {}, create: { name: 'VIP', color: '#c9a96e' } })
  try {
    await prisma.customer.update({ where: { id: customers['CUST-0002'].id }, data: { tags: { connect: { id: vipTag.id } } } })
  } catch {}

  console.log('  tasks & interactions: ok')
// ------------------------------------------------------------------
  // Sales, purchases, transfers & inventory (with consistent stock movements)
  // ------------------------------------------------------------------
  // --- clean up previous demo operational rows (idempotent re-runs) ---
  const demoSales = await prisma.sale.findMany({ where: { notes: 'Demo' }, select: { id: true } })
  const demoSaleIds = demoSales.map((s) => s.id)
  if (demoSaleIds.length) {
    await prisma.stockMovement.deleteMany({ where: { referenceType: 'SALE', referenceId: { in: demoSaleIds } } })
    await prisma.saleItem.deleteMany({ where: { saleId: { in: demoSaleIds } } })
    await prisma.sale.deleteMany({ where: { id: { in: demoSaleIds } } })
  }
  await prisma.purchaseItem.deleteMany({ where: { purchase: { notes: 'Demo' } } })
  await prisma.purchase.deleteMany({ where: { notes: 'Demo' } })
  const demoTf = await prisma.stockTransfer.findMany({ where: { notes: 'Demo' }, select: { id: true } })
  const demoTfIds = demoTf.map((t) => t.id)
  if (demoTfIds.length) {
    await prisma.stockTransferItem.deleteMany({ where: { transferId: { in: demoTfIds } } })
    await prisma.stockTransfer.deleteMany({ where: { id: { in: demoTfIds } } })
  }
  await prisma.stockMovement.deleteMany({ where: { type: { in: ['RECEIVE', 'TRANSFER_IN', 'TRANSFER_OUT'] } } })
  await prisma.inventory.deleteMany({}) // rebuilt below with final numbers

  // --- starting stock per product/location ---
  const startStock = {
    'midnight-oud': { MAIN: 40, BOUTIQUE: 15 },
    'rose-elegante': { MAIN: 30, BOUTIQUE: 20 },
    'aqua-fresh': { MAIN: 80, BOUTIQUE: 40 },
    'citrus-royale': { MAIN: 50, BOUTIQUE: 25 },
    'vanille-noir': { MAIN: 35, BOUTIQUE: 10 },
    'fresh-kids': { MAIN: 120, BOUTIQUE: 60 }
  }
  const locId = { MAIN: mainLoc.id, BOUTIQUE: boutiqueLoc.id }
  const stock = {}
  for (const [slug, byLoc] of Object.entries(startStock)) {
    for (const [locCode, qty] of Object.entries(byLoc)) stock[`${slug}|${locCode}`] = qty
  }

  async function moveStock({ slug, locCode, type, qty, delta, refType, refId, at, reason, userId }) {
    const key = `${slug}|${locCode}`
    const prev = stock[key]
    const next = prev + delta
    stock[key] = next
    await prisma.stockMovement.create({
      data: {
        productId: products[slug].id, locationId: locId[locCode], type, quantity: qty,
        referenceType: refType, referenceId: refId, reason, notes: 'Demo',
        previousQuantity: prev, resultingQuantity: next, createdAt: at, userId
      }
    })
  }

  const slugList = Object.keys(products)
  const custList = Object.values(customers)
  const spread = [365, 340, 320, 300, 280, 260, 240, 220, 200, 180, 160, 140, 125, 110,
    95, 80, 70, 60, 52, 45, 38, 30, 25, 21, 18, 15, 12, 9, 6, 5, 3, 2, 1, 0, 0, 0]

  const eventList = []

  // --- build sales ---
  const existingSaleCount = await prisma.sale.count()
  const salesData = []
  for (let i = 0; i < spread.length; i++) {
    const at = new Date(Date.now() - Math.round(spread[i] * DAY))
    const locCode = i % 3 === 0 ? 'BOUTIQUE' : 'MAIN'
    const customer = custList[(i * 5 + 2) % custList.length]
    const selected = [{ slug: slugList[(i * 7 + 3) % slugList.length], qty: 1 + rnd(2) }]
    if (rnd(4) === 0) {
      const other = slugList[(i * 7 + 5) % slugList.length]
      if (other !== selected[0].slug) selected.push({ slug: other, qty: 1 })
    }
    const items = selected.map((it) => ({
      slug: it.slug, qty: it.qty,
      unitPrice: Number(products[it.slug].price),
      unitCost: Number(products[it.slug].costPrice || 0)
    }))
    const subtotal = items.reduce((sum, it) => sum + it.unitPrice * it.qty, 0)
    salesData.push({ at, locCode, customer, items, saleNumber: `SALE-${String(existingSaleCount + i + 1).padStart(4, '0')}`, subtotal, total: subtotal })
  }

  // --- build purchases & transfers once (rows created after cleanup) ---
  const purchaseCount = await prisma.purchase.count()
  const purchasesData = [
    {
      purchaseNumber: `PO-${String(purchaseCount + 1).padStart(4, '0')}`, supplier: suppliers['Fragrance House Paris'],
      locCode: 'MAIN', at: ago(12), status: 'RECEIVED', noteIdx: 0,
      items: [
        { slug: 'vanille-noir', qty: 20, unitCost: products['vanille-noir'].costPrice },
        { slug: 'rose-elegante', qty: 10, unitCost: products['rose-elegante'].costPrice }
      ]
    },
    {
      purchaseNumber: `PO-${String(purchaseCount + 2).padStart(4, '0')}`, supplier: suppliers['Orient Oud Trading'],
      locCode: 'BOUTIQUE', at: ago(5), status: 'RECEIVED', noteIdx: 1,
      items: [
        { slug: 'midnight-oud', qty: 12, unitCost: products['midnight-oud'].costPrice },
        { slug: 'citrus-royale', qty: 15, unitCost: products['citrus-royale'].costPrice }
      ]
    },
    {
      purchaseNumber: `PO-${String(purchaseCount + 3).padStart(4, '0')}`, supplier: suppliers['Perfume Ingredients Co.'],
      locCode: 'MAIN', at: ago(1), status: 'DRAFT', noteIdx: 2,
      items: [{ slug: 'aqua-fresh', qty: 40, unitCost: products['aqua-fresh'].costPrice }]
    }
  ]

  const transferCount = await prisma.stockTransfer.count()
  const transfersData = [
    {
      transferNumber: `TR-${String(transferCount + 1).padStart(4, '0')}`, from: 'MAIN', to: 'BOUTIQUE',
      at: ago(18), status: 'COMPLETED', items: [{ slug: 'rose-elegante', qty: 5 }]
    },
    {
      transferNumber: `TR-${String(transferCount + 2).padStart(4, '0')}`, from: 'BOUTIQUE', to: 'MAIN',
      at: ago(45), status: 'COMPLETED', items: [{ slug: 'aqua-fresh', qty: 10 }]
    }
  ]
// --- create rows (sales, purchases, transfers) ---
  const createdSales = []
  for (const sd of salesData) {
    const sale = await prisma.sale.create({
      data: {
        saleNumber: sd.saleNumber, customerId: sd.customer.id, locationId: locId[sd.locCode],
        status: 'COMPLETED', subtotal: sd.subtotal, discount: 0, total: sd.total,
        notes: 'Demo', soldAt: sd.at, createdAt: sd.at, createdBy: adminUser?.id
      }
    })
    for (const it of sd.items) {
      await prisma.saleItem.create({
        data: {
          saleId: sale.id, productId: products[it.slug].id, productName: products[it.slug].name,
          quantity: it.qty, unitPrice: it.unitPrice, unitCost: it.unitCost,
          totalPrice: Math.round(it.unitPrice * it.qty * 100) / 100
        }
      })
    }
    createdSales.push({ sale, ...sd })
  }

  const createdPurchases = []
  for (const pd of purchasesData) {
    let subtotal = 0
    const itemRows = pd.items.map((it) => {
      const line = it.unitCost * it.qty
      subtotal += line
      return { ...it, line }
    })
    const purchase = await prisma.purchase.create({
      data: {
        purchaseNumber: pd.purchaseNumber, supplierId: pd.supplier.id,
        locationId: locId[pd.locCode], status: pd.status,
        subtotal, discount: 0, shippingCost: 0, total: subtotal,
        notes: 'Demo', createdAt: pd.at, updatedAt: pd.at, createdBy: adminUser?.id,
        items: {
          create: itemRows.map((it) => ({
            productId: products[it.slug].id, quantity: it.qty,
            receivedQuantity: pd.status === 'RECEIVED' ? it.qty : 0,
            unitCost: it.unitCost, totalCost: it.line
          }))
        }
      }
    })
    createdPurchases.push({ purchase, ...pd, itemRows })
  }

  const createdTransfers = []
  for (const td of transfersData) {
    const transfer = await prisma.stockTransfer.create({
      data: {
        transferNumber: td.transferNumber, fromLocationId: locId[td.from], toLocationId: locId[td.to],
        status: td.status, notes: 'Demo', createdBy: adminUser?.id, createdAt: td.at, updatedAt: td.at,
        items: { create: td.items.map((it) => ({ productId: products[it.slug].id, quantity: it.qty })) }
      }
    })
    createdTransfers.push({ transfer, ...td })
  }

  // --- process movements in chronological order for a consistent ledger ---
  const events = []
  for (const cs of createdSales) {
    for (const it of cs.items) {
      events.push({ at: cs.at, fn: () => moveStock({ slug: it.slug, locCode: cs.locCode, type: 'SALE', qty: it.qty, delta: -it.qty, refType: 'SALE', refId: cs.sale.id, at: cs.at, reason: `Sale ${cs.saleNumber}`, userId: adminUser?.id }) })
    }
  }
  for (const cp of createdPurchases.filter((p) => p.status === 'RECEIVED')) {
    for (const it of cp.items) {
      events.push({ at: cp.at, fn: () => moveStock({ slug: it.slug, locCode: cp.locCode, type: 'RECEIVE', qty: it.qty, delta: it.qty, refType: 'PURCHASE', refId: cp.purchase.id, at: cp.at, reason: `PO ${cp.purchaseNumber} received`, userId: adminUser?.id }) })
    }
  }
  for (const ct of createdTransfers) {
    for (const it of ct.items) {
      events.push({ at: ct.at, fn: () => moveStock({ slug: it.slug, locCode: ct.from, type: 'TRANSFER_OUT', qty: it.qty, delta: -it.qty, refType: 'TRANSFER', refId: ct.transfer.id, at: ct.at, reason: `Transfer ${ct.transferNumber}`, userId: adminUser?.id }) })
      events.push({ at: ct.at, fn: () => moveStock({ slug: it.slug, locCode: ct.to, type: 'TRANSFER_IN', qty: it.qty, delta: it.qty, refType: 'TRANSFER', refId: ct.transfer.id, at: ct.at, reason: `Transfer ${ct.transferNumber}`, userId: adminUser?.id }) })
    }
  }
  events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
  for (const ev of events) await ev.fn()

  // --- rebuild inventory rows with final numbers ---
  for (const [key, qty] of Object.entries(stock)) {
    const [slug, locCode] = key.split('|')
    await prisma.inventory.create({
      data: { productId: products[slug].id, locationId: locId[locCode], quantity: qty, availableQuantity: qty }
    })
  }

  console.log('  operations & stock: ok')
// ------------------------------------------------------------------
  // Notifications & settings
  // ------------------------------------------------------------------
  await prisma.notification.deleteMany({ where: { type: { in: ['LOW_STOCK', 'TASK_OVERDUE', 'OUT_OF_STOCK', 'INFO'] } } })
  const notifs = [
    { type: 'INFO', title: 'Welcome to Lumiere CRM', message: 'Demo workspace ready — explore the dashboard, reports and analytics.', severity: 'INFO', link: '/admin', priority: 'NORMAL' },
    { type: 'LOW_STOCK', title: 'Low stock: Vanille Noir', message: 'Available stock at Lumiere Boutique is below the minimum.', severity: 'WARNING', link: '/admin/inventory', priority: 'HIGH' },
    { type: 'TASK_OVERDUE', title: 'Overdue follow-up', message: 'Wholesale contract renewal call with Karim Mansour is overdue.', severity: 'WARNING', link: '/admin/customers', priority: 'HIGH' },
    { type: 'LOW_STOCK', title: 'Low stock: Citrus Royale', message: 'Available stock at Lumiere Boutique is below the minimum.', severity: 'WARNING', link: '/admin/inventory', priority: 'HIGH' }
  ]
  for (const n of notifs) {
    await prisma.notification.create({ data: { userId: adminUser?.id, type: n.type, title: n.title, message: n.message, severity: n.severity, link: n.link, priority: n.priority, entityType: n.type === 'LOW_STOCK' ? 'Inventory' : undefined } })
  }

  await ensureSetting('currency', 'ETB', 'text')
  await ensureSetting('overstock_multiplier', '5', 'number')
  await ensureSetting('low_stock_threshold', '5', 'number')
  await ensureSetting('notifications_enabled', 'true', 'boolean')
  await ensureSetting('default_location', mainLoc.id, 'string')

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  const counts = {
    products: await prisma.product.count(),
    inventory: await prisma.inventory.count(),
    customers: await prisma.customer.count(),
    employees: await prisma.employee.count(),
    suppliers: await prisma.supplier.count(),
    sales: await prisma.sale.count(),
    purchases: await prisma.purchase.count(),
    tasks: await prisma.customerTask.count(),
    locations: await prisma.location.count()
  }
  console.log('\n— Demo data ready —')
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(11)} ${v}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect(); console.log('\nDone.') })