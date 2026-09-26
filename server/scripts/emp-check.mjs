import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
async function go() {
  const r = await p.$queryRaw`SELECT COUNT(*) AS c FROM "Employee"`
  console.log('employeeRows', r)
  await p.$disconnect()
}
go().catch(e => { console.error(e); process.exit(1) })

