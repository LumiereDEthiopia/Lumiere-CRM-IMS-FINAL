/**
 * Script to manually link an employee to a user
 * Usage: node scripts/manual-link-employee.js <employeeId> <userId>
 */
import prisma from '../src/config/prisma.js'

const employeeId = process.argv[2]
const userId = process.argv[3]

if (!employeeId || !userId) {
  console.log('Usage: node scripts/manual-link-employee.js <employeeId> <userId>')
  console.log('\nAvailable employees and users:')
  await prisma.$disconnect()
  process.exit(1)
}

async function linkEmployee() {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, firstName: true, lastName: true, email: true, userId: true }
    })

    if (!employee) {
      console.log(`Employee not found with ID: ${employeeId}`)
      await prisma.$disconnect()
      process.exit(1)
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true }
    })

    if (!user) {
      console.log(`User not found with ID: ${userId}`)
      await prisma.$disconnect()
      process.exit(1)
    }

    if (employee.userId) {
      console.log(`Employee ${employee.firstName} ${employee.lastName} is already linked to user ${employee.userId}`)
      await prisma.$disconnect()
      process.exit(1)
    }

    await prisma.employee.update({
      where: { id: employeeId },
      data: { userId }
    })

    console.log(`✓ Linked ${employee.firstName} ${employee.lastName} (${employee.email}) to user ${user.name} (${user.email})`)
  } catch (error) {
    console.error('Error:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

linkEmployee()
