import prisma from '../src/config/prisma.js'

// Add only employee/payroll permissions; never reset roles, users or passwords.
const names = ['employee:view', 'employee:create', 'employee:edit', 'employee:delete', 'employee:view_sensitive', 'payroll:view', 'payroll:create', 'payroll:edit', 'payroll:process']
try {
  await prisma.$transaction(async db => {
    for (const name of names) await db.permission.upsert({ where: { name }, update: {}, create: { name } })
    const role = await db.role.findUnique({ where: { name: 'SUPER_ADMIN' } })
    if (role) await db.role.update({ where: { id: role.id }, data: { permissions: { connect: names.map(name => ({ name })) } } })
  })
  console.log('Employee/payroll permissions added; existing role assignments preserved.')
} finally { await prisma.$disconnect() }
