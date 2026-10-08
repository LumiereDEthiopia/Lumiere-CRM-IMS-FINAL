/**
 * Script to list employees and users for manual linking
 */
import prisma from '../src/config/prisma.js'

async function listEmployeesAndUsers() {
  console.log('\n=== EMPLOYEES (without userId) ===\n')
  const employees = await prisma.employee.findMany({
    where: { userId: null },
    select: { id: true, firstName: true, lastName: true, email: true, employeeCode: true }
  })
  employees.forEach(e => {
    console.log(`ID: ${e.id}`)
    console.log(`  Name: ${e.firstName} ${e.lastName}`)
    console.log(`  Code: ${e.employeeCode}`)
    console.log(`  Email: ${e.email}`)
    console.log('')
  })

  console.log('\n=== USERS ===\n')
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true }
  })
  users.forEach(u => {
    console.log(`ID: ${u.id}`)
    console.log(`  Name: ${u.name}`)
    console.log(`  Email: ${u.email}`)
    console.log('')
  })

  console.log('\nTo link an employee to a user, run:')
  console.log('node scripts/manual-link-employee.js <employeeId> <userId>')

  await prisma.$disconnect()
}

listEmployeesAndUsers().catch(console.error)
