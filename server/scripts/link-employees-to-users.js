/**
 * Script to link employees to users by email
 * Run this with: node scripts/link-employees-to-users.js
 */
import prisma from '../src/config/prisma.js'

async function linkEmployeesToUsers() {
  console.log('Linking employees to users by email...')

  const employees = await prisma.employee.findMany({
    where: {
      userId: null,
      email: { not: null }
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true
    }
  })

  console.log(`Found ${employees.length} employees without userId`)

  let linked = 0
  for (const employee of employees) {
    const user = await prisma.user.findUnique({
      where: { email: employee.email },
      select: { id: true, name: true }
    })

    if (user) {
      await prisma.employee.update({
        where: { id: employee.id },
        data: { userId: user.id }
      })
      console.log(`✓ Linked ${employee.firstName} ${employee.lastName} (${employee.email}) to user ${user.name}`)
      linked++
    } else {
      console.log(`✗ No user found for ${employee.firstName} ${employee.lastName} (${employee.email})`)
    }
  }

  console.log(`\nLinked ${linked} employees to users`)
  await prisma.$disconnect()
}

linkEmployeesToUsers().catch(console.error)
