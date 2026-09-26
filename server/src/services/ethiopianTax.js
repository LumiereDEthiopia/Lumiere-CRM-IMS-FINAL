/**
 * Payroll arithmetic only — no statutory rates are assumed.
 * Empty configuration means deductions are NOT CONFIGURED, not tax exempt.
 * Legacy export names are retained for existing employee analytics callers.
 * Rates are fractions (0.05 represents 5%); no value is a statement of law.
 */
export const REFERENCE_TAX_BRACKETS = []
export const REFERENCE_PENSION_EMPLOYEE_RATE = 0
export const REFERENCE_PENSION_EMPLOYER_RATE = 0
export const REFERENCE_LEGAL_REFERENCE = null

const round2 = (n) => Math.round(n * 100) / 100

/**
 * Convert a gross monthly salary into an income-tax amount.
 *
 * @param {number} grossMonthly gross monthly salary in Birr
 * @param {object} [config] tax configuration
 * @param {Array}  [config.brackets] bracket rows with a rate and (optionally) a deduction
 */
export function calculateIncomeTax(grossMonthly, config = {}) {
  const gross = Math.max(0, Number(grossMonthly) || 0)
  const brackets = Array.isArray(config.brackets) && config.brackets.length ? config.brackets : REFERENCE_TAX_BRACKETS
  const sorted = [...brackets].sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity))
  const bracket = sorted.find((b) => gross <= (b.upTo ?? Infinity)) || sorted[sorted.length - 1]
  if (!bracket) return 0
  const rate = Math.max(0, Number(bracket.rate) || 0)
  const deduction = Math.max(0, Number(bracket.deduction) || 0)

  // Published-style schedule: tax = gross x rate - fixed deduction for the band.
  let tax
  if (sorted.some((b) => Number(b.deduction) > 0)) {
    tax = sorted[0] === bracket && rate === 0 ? 0 : gross * rate - deduction
  } else {
    // Progressive slices when no deduction constants are configured.
    tax = 0
    let lower = 0
    for (const b of sorted) {
      const upper = b.upTo ?? Infinity
      const slice = Math.max(0, Math.min(gross, upper) - lower)
      tax += slice * Math.max(0, Number(b.rate) || 0)
      lower = upper
      if (gross <= upper) break
    }
  }
  return round2(Math.max(0, tax))
}

/** Resolve the tax rate that applies to a gross salary (display helper). */
export function effectiveTaxRate(grossMonthly, config = {}) {
  const gross = Math.max(0, Number(grossMonthly) || 0)
  const brackets = Array.isArray(config.brackets) && config.brackets.length ? config.brackets : REFERENCE_TAX_BRACKETS
  const sorted = [...brackets].sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity))
  const bracket = sorted.find((b) => gross <= (b.upTo ?? Infinity)) || sorted[sorted.length - 1]
  return Math.max(0, Number(bracket?.rate) || 0)
}

/** Ethiopian income tax on a gross monthly salary (reference schedule by default). */
export function ethiopianIncomeTax(grossMonthly, config = {}) {
  return calculateIncomeTax(grossMonthly, config)
}

/**
 * Monthly payslip breakdown.
 *
 * gross  = base + overtime + bonus + allowances + other earnings
 * net    = gross − income tax − employee pension − other deductions  (never < 0)
 * Employer pension is a company cost and NEVER reduces the employee net pay.
 */
export function calculatePayslip({
  baseSalary = 0,
  overtime = 0,
  bonus = 0,
  allowances = 0,
  otherEarnings = 0,
  otherDeductions = 0,
  includePension = true,
  pensionEmployeeRate = REFERENCE_PENSION_EMPLOYEE_RATE,
  pensionEmployerRate = REFERENCE_PENSION_EMPLOYER_RATE,
  tax = {}
} = {}) {
  const num = (v) => Math.max(0, Number(v) || 0)
  const gross = round2(num(baseSalary) + num(overtime) + num(bonus) + num(allowances) + num(otherEarnings))
  const incomeTax = calculateIncomeTax(gross, tax)
  const employeePension = includePension ? round2(gross * Math.max(0, Number(pensionEmployeeRate) || 0)) : 0
  const employerPension = includePension ? round2(gross * Math.max(0, Number(pensionEmployerRate) || 0)) : 0
  const deductions = round2(num(otherDeductions) + incomeTax + employeePension)
  return {
    baseSalary: round2(num(baseSalary)),
    overtime: round2(num(overtime)),
    bonus: round2(num(bonus)),
    allowances: round2(num(allowances)),
    otherEarnings: round2(num(otherEarnings)),
    gross,
    incomeTax,
    taxRate: effectiveTaxRate(gross, tax),
    pensionEmployee: employeePension,
    pensionEmployer: employerPension,
    otherDeductions: round2(num(otherDeductions)),
    totalDeductions: deductions,
    netSalary: round2(Math.max(0, gross - deductions))
  }
}

/** Backwards-compatible payslip helper used by the analytics pages. */
export function ethiopianPayslip({ grossMonthly, includePension = true, pensionEmployeeRate, pensionEmployerRate, tax } = {}) {
  return calculatePayslip({ baseSalary: grossMonthly, includePension, pensionEmployeeRate, pensionEmployerRate, tax })
}

export default {
  calculatePayslip,
  calculateIncomeTax,
  effectiveTaxRate,
  ethiopianIncomeTax,
  ethiopianPayslip,
  REFERENCE_TAX_BRACKETS,
  REFERENCE_PENSION_EMPLOYEE_RATE,
  REFERENCE_PENSION_EMPLOYER_RATE,
  PENSION_EMPLOYEE_RATE: REFERENCE_PENSION_EMPLOYEE_RATE,
  PENSION_EMPLOYER_RATE: REFERENCE_PENSION_EMPLOYER_RATE
}