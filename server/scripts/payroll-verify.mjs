/**
 * Payroll / salary-date verification.
 *
 * Runs the backend calculation engine directly (no HTTP) and asserts the
 * month-end payment-date rules, the payroll arithmetic and the payroll-rule
 * resolution. Read-only apart from optional writes performed by the caller.
 *
 * Usage: node scripts/payroll-verify.mjs
 */
import { readFileSync } from 'node:fs'

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}

const { calculateNextSalaryPaymentDate, clampPaymentDay, payrollPeriodKey } = await import('../src/lib/salaryDates.js')
const { calculatePayslip } = await import('../src/services/ethiopianTax.js')
const { resolvePayrollConfig, listPayments, getEmployeeSummary, getPayrollSummary, getPaymentAnnouncements } = await import('../src/services/payrollService.js')
const { default: prisma } = await import('../src/config/prisma.js')

let failures = 0
const check = (label, actual, expected) => {
  const ok = String(actual) === String(expected)
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        expected=${expected}  actual=${actual}`)
}
const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null)
const employee = (day, freq = 'MONTHLY', start = null) => ({ salaryPaymentDay: day, salaryPaymentFrequency: freq, salaryStartDate: start })

console.log('--- Next salary payment date (month-end safety) ---')
check('day 30 from 2026-09-16 -> 2026-09-30', iso(calculateNextSalaryPaymentDate(employee(30), new Date('2026-09-16T00:00:00Z'))), '2026-09-30')
check('day 30 from 2026-10-01 -> 2026-10-30', iso(calculateNextSalaryPaymentDate(employee(30), new Date('2026-10-01T00:00:00Z'))), '2026-10-30')
check('day 30 on payday 2026-09-30 -> same day (due)', iso(calculateNextSalaryPaymentDate(employee(30), new Date('2026-09-30T09:00:00Z'))), '2026-09-30')
check('day 31 in Feb 2026 -> 2026-02-28', iso(calculateNextSalaryPaymentDate(employee(31), new Date('2026-02-01T00:00:00Z'))), '2026-02-28')
check('day 31 in Feb 2028 (leap) -> 2028-02-29', iso(calculateNextSalaryPaymentDate(employee(31), new Date('2028-02-01T00:00:00Z'))), '2028-02-29')
check('no payment day -> last day of month', iso(calculateNextSalaryPaymentDate(employee(null), new Date('2026-09-16T00:00:00Z'))), '2026-09-30')
check('weekly (Mon) from Wed 2026-09-16 -> 2026-09-21', iso(calculateNextSalaryPaymentDate(employee(1, 'WEEKLY'), new Date('2026-09-16T00:00:00Z'))), '2026-09-21')
check('annual anchored 2020-03-15 from 2026-09-16 -> 2027-03-15', iso(calculateNextSalaryPaymentDate(employee(15, 'ANNUAL', '2020-03-15T00:00:00Z'), new Date('2026-09-16T00:00:00Z'))), '2027-03-15')
check('clamp day 31 for Feb 2026', clampPaymentDay(31, 2026, 2), 28)
check('payroll period key', payrollPeriodKey(new Date('2026-09-16T00:00:00Z')), '2026-09')

console.log('\n--- Payroll calculation ---')
// Synthetic test rates only; these are not statutory Ethiopian rates.
const exampleConfig = { tax: { brackets: [{ upTo: null, rate: 0.1 }] }, pensionEmployeeRate: 0.02, pensionEmployerRate: 0.03 }
const slip = calculatePayslip({ baseSalary: 15000, ...exampleConfig })
check('gross 15000', slip.gross, 15000)
check('configured income tax', slip.incomeTax, 1500)
check('configured employee pension', slip.pensionEmployee, 300)
check('configured employer pension', slip.pensionEmployer, 450)
check('net excludes employer pension', slip.netSalary, 13200)
check('no assumed tax without rules', calculatePayslip({ baseSalary: 15000 }).incomeTax, 0)
check('no assumed pension without rules', calculatePayslip({ baseSalary: 15000 }).pensionEmployee, 0)
const withExtras = calculatePayslip({ baseSalary: 10000, overtime: 500, bonus: 1000, allowances: 500, otherEarnings: 200 })
check('gross includes overtime/bonus/allowances', withExtras.gross, 12200)
const tiny = calculatePayslip({ baseSalary: 100 })
check('net never negative (small salary)', tiny.netSalary >= 0, true)
const negative = calculatePayslip({ baseSalary: 1000, otherDeductions: 999999 })
check('net clamped to 0 when deductions exceed gross', negative.netSalary, 0)
check('employer pension does not reduce net', calculatePayslip({ baseSalary: 15000, ...exampleConfig }).netSalary, 13200)

console.log('\n--- Database ---')
const employees = await prisma.employee.count()
console.log(`employees in database: ${employees}`)
const config = await resolvePayrollConfig()
console.log(`payroll rule source: ${config.source}`)
check('payroll config exposes pension rates', typeof config.pensionEmployeeRate === 'number', true)

const summary = await getEmployeeSummary()
console.log('employee summary:', JSON.stringify(summary))
const payrollSummary = await getPayrollSummary()
console.log('payroll summary:', JSON.stringify(payrollSummary))
const announcements = await getPaymentAnnouncements()
console.log('announcement counts:', JSON.stringify(announcements.counts))
const payments = await listPayments({ page: 1, limit: 5 })
console.log(`salary payment records: ${payments.pagination.total}`)

await prisma.$disconnect()
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
