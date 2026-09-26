const { PrismaClient } = require('@prisma/client')
const { createHash, randomBytes } = require('crypto')
const p = new PrismaClient()

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = createHash('sha256').update(salt + password).digest('hex')
  return `${salt}:${hash}`
}

async function seed() {
  const perms = [
    'employee:view', 'employee:create', 'employee:edit', 'employee:delete', 'employee:view_sensitive',
    'inventory:view', 'inventory:adjust', 'inventory:transfer',
    'sale:view', 'sale:create', 'sale:cancel',
    'purchase:view', 'purchase:create', 'purchase:receive',
    'customer:view', 'customer:create', 'customer:edit',
    'product:view', 'product:create', 'product:edit',
    'report:view', 'backup:manage', 'setting:manage',
    'data:export', 'data:import', 'notification:view',
    // Stage 5/6
    'intelligence:view', 'financial:view', 'system:view', 'system:maintenance', 'backups:restore',
    'recommendations:manage',
    // Items module — bottles, packaging and consumables
    'items:view', 'items:create', 'items:edit', 'items:delete', 'items:adjust', 'items:transfer',
    'items:view_movements', 'items:view_cost', 'items:purchase', 'items:receive', 'items:export',
    'products:manage_items'
  ]

  for (const name of perms) {
    await p.permission.upsert({ where: { name }, update: {}, create: { name } })
  }

  const superAdmin = await p.role.upsert({
    where: { name: 'SUPER_ADMIN' },
    update: {},
    create: { name: 'SUPER_ADMIN', description: 'Full system access' }
  })

  const allPerms = await p.permission.findMany()
  await p.role.update({
    where: { id: superAdmin.id },
    data: { permissions: { connect: allPerms.map(perm => ({ id: perm.id })) } }
  })

  // Create admin user
  const adminUser = await p.user.upsert({
    where: { email: 'admin@lumiere.com' },
    update: {},
    create: {
      name: 'Admin',
      email: 'admin@lumiere.com',
      passwordHash: hashPassword('admin123'),
      roleId: superAdmin.id,
      isActive: true
    }
  })

  const mainLocation = await p.location.findFirst({ where: { code: 'MAIN' } })
  if (!mainLocation) await p.location.create({ data: { name: 'Main Store', code: 'MAIN', address: '123 Main St' } })
  await p.department.upsert({ where: { code: 'SALES' }, update: {}, create: { name: 'Sales', code: 'SALES' } })
  await p.department.upsert({ where: { code: 'INVENTORY' }, update: {}, create: { name: 'Inventory', code: 'INVENTORY' } })
  await p.department.upsert({ where: { code: 'MGMT' }, update: {}, create: { name: 'Management', code: 'MGMT' } })

  console.log('Seed completed!')
  console.log('  Admin user: admin@lumiere.com / admin123')
  // Stage 5/6: operational roles for RBAC matrix
  const manager = await p.role.upsert({
    where: { name: 'MANAGER' }, update: {},
    create: { name: 'MANAGER', description: 'Business operations management' }
  })
  const staff = await p.role.upsert({
    where: { name: 'STAFF' }, update: {},
    create: { name: 'STAFF', description: 'Limited operational access' }
  })
  const mgrPerms = ['product:view', 'inventory:view', 'inventory:adjust', 'sale:view', 'sale:create',
    'purchase:view', 'purchase:create', 'purchase:receive', 'customer:view', 'customer:create',
    'customer:edit', 'employee:view', 'report:view', 'intelligence:view', 'notification:view', 'data:export',
    'recommendations:manage', 'items:view', 'items:view_movements', 'items:adjust', 'items:transfer',
    'items:view_cost', 'products:manage_items']
  for (const name of mgrPerms) {
    const perm = await p.permission.findUnique({ where: { name } })
    if (perm) await p.role.update({ where: { id: manager.id }, data: { permissions: { connect: { id: perm.id } } } })
  }
  const staffPerms = ['product:view', 'inventory:view', 'sale:view', 'sale:create',
    'customer:view', 'customer:create', 'notification:view', 'items:view']
  for (const name of staffPerms) {
    const perm = await p.permission.findUnique({ where: { name } })
    if (perm) await p.role.update({ where: { id: staff.id }, data: { permissions: { connect: { id: perm.id } } } })
  }

  const roleMatrix = {
    ADMIN: perms.filter((name) => name !== 'backups:restore'),
    SALES: ['product:view', 'sale:view', 'sale:create', 'customer:view', 'customer:create', 'customer:edit', 'notification:view', 'report:view'],
    ACCOUNTANT: ['sale:view', 'purchase:view', 'report:view', 'financial:view', 'data:export', 'customer:view', 'notification:view'],
    FREELANCER: ['product:view', 'sale:view', 'customer:view', 'notification:view']
  }
  for (const [roleName, rolePermissions] of Object.entries(roleMatrix)) {
    const role = await p.role.upsert({ where: { name: roleName }, update: {}, create: { name: roleName, description: `${roleName} system role` } })
    const permissions = await p.permission.findMany({ where: { name: { in: rolePermissions } } })
    await p.role.update({ where: { id: role.id }, data: { permissions: { set: permissions.map((permission) => ({ id: permission.id })) } } })
  }

  const existingMainLocation = await p.location.findFirst({ where: { code: 'MAIN' } })
  if (!existingMainLocation) await p.location.create({ data: { name: 'Main Store', code: 'MAIN', address: '123 Main St' } })
  console.log('  Permissions: ' + perms.length)
  console.log('  Roles: SUPER_ADMIN, ADMIN, SALES, ACCOUNTANT, FREELANCER')
  console.log('  Locations: MAIN')
  console.log('  Departments: SALES, INVENTORY, MGMT')
}

seed().catch(e => { console.error(e); process.exit(1) }).finally(() => p.$disconnect())