/**
 * Script to check users
 */
import prisma from '../src/config/prisma.js'

async function checkUsers() {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true }
  })
  console.log('Users:')
  users.forEach(u => console.log(`- ${u.name} (${u.email})`))
  await prisma.$disconnect()
}

checkUsers().catch(console.error)
