/**
 * Employee Controller
 */
import {
  listEmployees, getEmployee, getEmployeeDetails, createEmployee, updateEmployee,
  deactivateEmployee, uploadEmployeeDocument, addSalaryHistoryEntry, updateSalaryHistoryEntry,
  canViewSensitive, maskEmployee, SENSITIVE_EMPLOYEE_FIELDS
} from '../services/employeeService.js'
import { getEmployeePayroll, getEmployeeNextPayment } from '../services/payrollService.js'

export async function getEmployees(req, res, next) {
  try { res.json({ success: true, ...(await listEmployees({ ...req.query, includeSensitive: canViewSensitive(req.user) })) }) } catch (e) { next(e) }
}
export async function getEmployeeById(req, res, next) {
  try { res.json({ success: true, data: await getEmployeeDetails(req.params.id, { includeSensitive: canViewSensitive(req.user) }) }) } catch (e) { next(e) }
}
function checkSensitiveWrite(req) {
  if (!canViewSensitive(req.user) && SENSITIVE_EMPLOYEE_FIELDS.some((key) => Object.hasOwn(req.body || {}, key))) {
    const error = new Error('employee:view_sensitive is required to edit salary or identification')
    error.statusCode = 403
    throw error
  }
}
export async function createNewEmployee(req, res, next) {
  try {
    checkSensitiveWrite(req)
    const employee = await createEmployee(req.body, req.user?.userId || (req.userId || req.user?.userId || req.user?.id))
    res.status(201).json({ success: true, data: maskEmployee(employee, canViewSensitive(req.user)) })
  } catch (e) { next(e) }
}
export async function updateExistingEmployee(req, res, next) {
  try {
    checkSensitiveWrite(req)
    const employee = await updateEmployee(req.params.id, req.body, req.user?.userId || (req.userId || req.user?.userId || req.user?.id))
    res.json({ success: true, data: maskEmployee(employee, canViewSensitive(req.user)) })
  } catch (e) { next(e) }
}
export async function deactivateExistingEmployee(req, res, next) {
  try { res.json({ success: true, ...(await deactivateEmployee(req.params.id, (req.userId || req.user?.userId || req.user?.id))) }) } catch (e) { next(e) }
}
export async function uploadEmployeeFile(req, res, next) {
  try { res.status(201).json({ success: true, data: await uploadEmployeeDocument(req.params.id, { ...req.body, uploadedBy: (req.userId || req.user?.userId || req.user?.id) }) }) } catch (e) { next(e) }
}

/** Salary history of an employee (sensitive — permission enforced by the route). */
export async function getEmployeeSalaryHistory(req, res, next) {
  try {
    const employee = await getEmployee(req.params.id, { includeSensitive: true })
    res.json({ success: true, data: employee.salaryHistory || [] })
  } catch (e) { next(e) }
}
export async function addEmployeeSalaryHistory(req, res, next) {
  try { res.status(201).json({ success: true, data: await addSalaryHistoryEntry(req.params.id, req.body, (req.userId || req.user?.userId || req.user?.id)) }) } catch (e) { next(e) }
}
export async function updateEmployeeSalaryHistory(req, res, next) {
  try { res.json({ success: true, data: await updateSalaryHistoryEntry(req.params.id, req.params.historyId, req.body, (req.userId || req.user?.userId || req.user?.id)) }) } catch (e) { next(e) }
}

/** Salary payment history for one employee (paginated). */
export async function getEmployeePayrollPayments(req, res, next) {
  try { res.json({ success: true, ...(await getEmployeePayroll(req.params.id, req.query)) }) } catch (e) { next(e) }
}

/** Next salary payment date (calculated on the backend). */
export async function getEmployeePayrollNext(req, res, next) {
  try { res.json({ success: true, data: await getEmployeeNextPayment(req.params.id) }) } catch (e) { next(e) }
}