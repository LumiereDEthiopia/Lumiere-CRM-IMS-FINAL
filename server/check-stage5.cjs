const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
async function main() {
  const integ = await p.$queryRawUnsafe('PRAGMA integrity_check')
  console.log('Integrity:', integ[0].integrity_check)
  console.log('ScheduledJob rows:', await p.scheduledJob.count())
  console.log('IntelligenceRecommendation rows:', await p.intelligenceRecommendation.count())
  console.log('Products preserved:', await p.product.count())
  console.log('Customers preserved:', await p.customer.count())
  console.log('Employees preserved:', await p.employee.count())
  await p.$disconnect()
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1) })