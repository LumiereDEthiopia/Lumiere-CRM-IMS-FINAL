/**
 * Payroll + Employee integration smoke test.
 * Runs on a THROWAWAY COPY of dev.db — the real database is never touched.
 * DATABASE_URL is overridden below before Prisma is imported.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const testDb = path.join(__dirname, '..', 'prisma', 'dev-payroll-test.db')
const sourceDb = path.join(__dirname, '..', 'prisma', 'dev.db')

if (!fs.existsSync(sourceDb)) { console.error('FATAL: dev.db not found'); process.exit(1) }
fs.copyFileSync(sourceDb, testDb)
process.env.DATABASE_URL = `file:${testDb.replace(/\\/g, '/')}`

const { PrismaClient } = await import('@prisma/client')
const prisma = new PrismaClient()
const results = []
const check = (name, pass, extra = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`) }

try {
  const { createEmployee, updateEmployee, getEmployeeDetails, canViewSensitive, maskEmployee, SENSITIVE_EMPLOYEE_FIELDS } =
    await import('../src/services/employeeService.js')
  const { createPayment, markPaymentPaid, calculateEmployeePayroll, getEmployeeNextPayment, resolvePayrollConfig, getPaymentAnnouncements } =
    await import('../src/services/payrollService.js')
  const { calculateNextSalaryPaymentDate } = await import('../src/lib/salaryDates.js')

  const baseline = await prisma.employee.count()
  check('DB reachable + employees preserved', true, `${baseline} existing employees`)

  // 1) Create employee with salary + payment schedule
  const emp = await createEmployee({
    firstName: 'PayrollTest', lastName: 'Verify', email: `payroll.verify.${Date.now()}@test.local`,
    employmentType: 'FULL_TIME', employmentStatus: 'ACTIVE',
    salary: 15000, salaryCurrency: 'ETB', salaryPaymentFrequency: 'MONTHLY',
    salaryPaymentDay: 30, salaryStartDate: '2026-09-01', salaryNotes: 'integration test',
    tinNumber: '0098765432', pensionIdNumber: 'PEN-TEST-1'
  }, null)
  check('createEmployee with salary + TIN + pension id', Boolean(emp?.id), emp?.employeeCode)
  check('salary persisted as 15000', Number(emp?.salary) === 15000)
  check('initial salary history row created', (emp?.salaryHistory || []).length >= 1)

  const detail = await getEmployeeDetails(emp.id, { includeSensitive: true })
  const restricted = await getEmployeeDetails(emp.id)
  check('sensitive detail includes payroll and identification', detail.tinNumber === '0098765432' && !!detail.payroll)
  check('restricted detail excludes payroll and identification', restricted.payroll === null && restricted.salary === undefined && restricted.tinNumber === undefined)
  check('sensitive permission denied by default', !canViewSensitive({ permissions: [] }))
  await updateEmployee(emp.id, { salary: 18000, salaryEffectiveFrom: '2026-10-01' }, null)
  const history = await prisma.employeeSalaryHistory.findMany({ where: { employeeId: emp.id }, orderBy: { effectiveFrom: 'asc' } })
  check('both salary history records preserved', history.length === 2 && Number(history[0].salary) === 15000 && Number(history[1].salary) === 18000)
  const config = { source: 'UNCONFIGURED', tax: { brackets: [] }, pensionEmployeeRate: 0, pensionEmployerRate: 0, legalReferences: [] }
  const old = await calculateEmployeePayroll(emp, { at: new Date('2026-09-10'), config })
  const current = await calculateEmployeePayroll(emp, { at: new Date('2026-10-10'), config })
  check('historical salary selected by date', old.baseSalary === 15000 && current.baseSalary === 18000)
  check('unconfigured calculation invents no deductions', old.incomeTax === 0 && old.pensionEmployee === 0 && old.pensionEmployer === 0)
  for (const [date, expected] of [['2026-02-01', '2026-02-28'], ['2028-02-01', '2028-02-29'], ['2026-09-30', '2026-09-30'], ['2026-10-01', '2026-10-31']]) {
    const next = calculateNextSalaryPaymentDate({ ...emp, salaryPaymentDay: 31 }, new Date(date))
    check(`calendar safety ${date}`, next.toISOString().slice(0, 10) === expected)
  }
  const payment = await createPayment({ employeeId: emp.id, scheduledDate: '2026-09-30', overtime: 100, bonus: 200, allowances: 300, otherEarnings: 400, incomeTax: 500, employeePension: 600, employerPension: 700, otherDeductions: 100 }, null)
  check('gross includes all earnings', payment.grossSalary === 16000)
  check('net excludes employer pension', payment.netSalary === 14800)
  check('record not automatically paid', payment.storedStatus === 'SCHEDULED' && !payment.paidDate)
  const paid = await markPaymentPaid(payment.id, { paidDate: '2026-09-30', paymentMethod: 'BANK_TRANSFER', paymentReference: 'TEST' }, null)
  check('explicit confirmation marks paid', paid.status === 'PAID' && !!paid.paidDate)
  const audits = await prisma.auditLog.findMany({ where: { entityId: payment.id } })
  check('creation and confirmation audited', audits.some(a => a.action === 'PAYROLL_CREATED') && audits.some(a => a.action === 'PAYROLL_MARKED_PAID'))
  check('existing employees retained', await prisma.employee.count() === baseline + 1)
} catch (error) {
  console.error(error)
  check('integration completed without errors', false)
} finally {
  await prisma.$disconnect()
  const { default: shared } = await import('../src/config/prisma.js')
  await shared.$disconnect()
  fs.rmSync(testDb, { force: true })
}
const failed = results.filter(r => !r.pass)
console.log(`${results.length - failed.length}/${results.length} checks passed`)
process.exitCode = failed.length ? 1 : 0
