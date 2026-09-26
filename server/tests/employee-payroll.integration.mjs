/** Isolated integration regression: never connects to the business database. */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const dir = mkdtempSync(join(tmpdir(), 'lumiere-payroll-test-'))
process.env.DATABASE_URL = `file:${join(dir, 'test.db').replaceAll('\\', '/')}`
process.env.NODE_ENV = 'test'
const serverDir = fileURLToPath(new URL('../', import.meta.url))
let db
try {
  // Push only into a newly allocated temporary test database. No reset or seed.
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--schema', 'prisma/schema.prisma', '--skip-generate'], { cwd: serverDir, env: process.env, stdio: 'pipe' })
  db = (await import('../src/config/prisma.js')).default
  const employee = await import('../src/controllers/employeeController.js')
  const payroll = await import('../src/controllers/payrollController.js')
  const { requirePermission } = await import('../src/middleware/authorize.js')
  const { calculateNextSalaryPaymentDate } = await import('../src/lib/salaryDates.js')
  const actor = await db.user.create({ data: { name: 'Payroll test operator', email: 'operator@example.invalid', passwordHash: 'not-a-real-password' } })
  const permissions = ['employee:view', 'employee:create', 'employee:edit', 'employee:view_sensitive', 'payroll:view', 'payroll:create', 'payroll:edit', 'payroll:process']
  const user = { userId: actor.id, role: 'TEST', permissions }
  async function invoke(handler, { body = {}, params = {}, query = {}, as = user } = {}) {
    let result, error, status = 200
    const req = { body, params, query, user: as, userId: as.userId }
    const res = { status(code) { status = code; return this }, json(value) { result = JSON.parse(JSON.stringify(value)); return this } }
    await handler(req, res, e => { error = e })
    if (error) throw error
    assert.equal(result.success, true)
    return { ...result, httpStatus: status }
  }
  const basic = { userId: actor.id, role: 'TEST', permissions: ['employee:view', 'employee:edit'] }
  const created = await invoke(employee.createNewEmployee, { body: { firstName: 'Abebe', lastName: 'Test', salary: 15000, salaryStartDate: '2026-08-01', salaryPaymentDay: 31, tinNumber: 'TEST-TIN', pensionIdNumber: 'TEST-PENSION' } })
  assert.equal(created.httpStatus, 201)
  const id = created.data.id
  assert.equal(created.data.salary, 15000)
  await invoke(employee.updateExistingEmployee, { params: { id }, body: { salary: 18000, salaryStartDate: '2026-09-01' } })
  const detail = (await invoke(employee.getEmployeeById, { params: { id } })).data
  assert.equal(detail.payroll.history.length, 2)
  assert.equal(detail.payroll.history[0].createdBy.id, actor.id)
  assert.equal(detail.payroll.history[1].salary, 15000)
  assert.equal(calculateNextSalaryPaymentDate(detail, new Date('2027-02-01')).toISOString().slice(0, 10), '2027-02-28')
  const masked = (await invoke(employee.getEmployeeById, { params: { id }, as: basic })).data
  for (const key of ['salary', 'tinNumber', 'pensionIdNumber', 'salaryHistory', 'salaryPayments']) assert.equal(key in masked, false, key)
  assert.equal(masked.payroll, null)
  await assert.rejects(invoke(employee.updateExistingEmployee, { params: { id }, body: { salary: 1 }, as: basic }), e => e.statusCode === 403)
  let denial
  requirePermission('payroll:process')({ user: basic }, {}, e => { denial = e })
  assert.equal(denial.statusCode, 403)
  const payment = (await invoke(payroll.createPayrollPayment, { body: { employeeId: id, scheduledDate: '2026-08-31', overtime: 500, bonus: 200, allowances: 100, otherEarnings: 50, incomeTax: 1000, employeePension: 300, employerPension: 500, otherDeductions: 100 } })).data
  assert.equal(payment.baseSalary, 15000)
  assert.equal(payment.grossSalary, 15850)
  assert.equal(payment.netSalary, 14450)
  assert.equal(payment.employerPension, 500)
  assert.equal(payment.storedStatus, 'SCHEDULED')
  assert.ok(payment.calculationSnapshot)
  const list = await invoke(payroll.getPayrollPayments, { query: { employeeId: id, limit: 1 } })
  assert.equal(list.data.length, 1)
  assert.equal(list.pagination.total, 1)
  const paid = (await invoke(payroll.payPayrollPayment, { params: { id: payment.id }, body: { paymentMethod: 'BANK_TRANSFER', paymentReference: 'TEST-ONLY' } })).data
  assert.equal(paid.status, 'PAID')
  assert.equal(paid.processedById, actor.id)
  const logs = await db.auditLog.findMany({ where: { entityId: payment.id } })
  for (const action of ['PAYROLL_CREATED', 'PAYROLL_MARKED_PAID']) assert.ok(logs.some(log => log.action === action && log.userId === actor.id), action)
  assert.equal((await invoke(employee.getEmployeeById, { params: { id } })).data.payroll.lastPayment.id, payment.id)
  // Exercise the real Express route and authentication, not only controllers.
  const { default: express } = await import('express')
  const { payrollRouter } = await import('../src/routes/payroll.js')
  const { authenticate } = await import('../src/middleware/authMiddleware.js')
  const { hashPassword, login } = await import('../src/services/authService.js')
  const role = await db.role.create({ data: { name: 'SUPER_ADMIN' } })
  await db.user.update({ where: { id: actor.id }, data: { roleId: role.id, passwordHash: hashPassword('temporary-fixture-only') } })
  const session = await login(actor.email, 'temporary-fixture-only')
  const app = express()
  app.use(express.json(), authenticate)
  app.use('/api/payroll', payrollRouter)
  app.use((error, req, res, next) => res.status(error.statusCode || 500).json({ message: error.message }))
  const listener = app.listen(0, '127.0.0.1')
  await new Promise(resolve => listener.once('listening', resolve))
  try {
    const url = `http://127.0.0.1:${listener.address().port}/api/payroll?employeeId=${id}&limit=1`
    const response = await fetch(url, { headers: { Authorization: `Bearer ${session.token}` }, signal: AbortSignal.timeout(10000) })
    const body = await response.json()
    assert.equal(response.status, 200, JSON.stringify(body))
    assert.equal(body.data[0].id, payment.id)
    assert.equal(body.data[0].netSalary, 14450)
    assert.equal(body.pagination.total, 1)
    const unauthorized = await fetch(url, { signal: AbortSignal.timeout(10000) })
    assert.equal(unauthorized.status, 401)
    console.log('PASS: GET /api/payroll HTTP route, known fixture, pagination, totals and unauthenticated denial')
  } finally { await new Promise(resolve => listener.close(resolve)) }
  console.log('PASS: employee detail, salary history, month-end date, masking, write authorization, payroll arithmetic, pagination, payment confirmation and audit attribution')
} finally {
  if (db) await db.$disconnect()
  rmSync(dir, { recursive: true, force: true })
}
