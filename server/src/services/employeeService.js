/**
 * Employee Service
 */
import prisma from '../config/prisma.js'
import { ApiError } from '../middleware/errorHandler.js'
import { createAuditLog } from './auditService.js'
import { hashPassword } from './authService.js'
import { getR2Client, getBucketName, getPublicUrl } from '../config/r2.js'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { calculateNextSalaryPaymentDate, normalizeFrequency } from '../lib/salaryDates.js'
import { recordSalaryChange, getEmployeeSalaryInfo } from './payrollService.js'

/**
 * Sensitive fields (salary, TIN, pension id and payroll rates) are only returned
 * to users holding employee:view_sensitive. Authorization is always enforced on
 * the backend — hiding fields in React is never enough.
 */
export const SENSITIVE_EMPLOYEE_FIELDS = ['salary', 'salaryCurrency', 'salaryPaymentFrequency', 'salaryPaymentDay', 'salaryStartDate', 'salaryNotes', 'tinNumber', 'pensionIdNumber', 'employeePensionRate', 'employerPensionRate', 'salaryHistory', 'salaryPayments']

export function maskEmployee(employee, includeSensitive) {
  if (!employee || includeSensitive) return employee
  const clone = { ...employee }
  for (const field of SENSITIVE_EMPLOYEE_FIELDS) delete clone[field]
  clone.hasSalary = employee.salary != null
  clone.hasTin = Boolean(employee.tinNumber)
  clone.hasPensionId = Boolean(employee.pensionIdNumber)
  return clone
}

/** Nothing derived from a salary may reach a user without the sensitive permission. */
export function canViewSensitive(user) {
  return user?.role === 'SUPER_ADMIN' || (user?.permissions || []).includes('employee:view_sensitive') || (user?.permissions || []).includes('*')
}

function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) throw new ApiError(400, 'Salary must be a finite number')
  if (n < 0) throw new ApiError(400, 'Salary can never be negative')
  return n
}

function parsePaymentDay(value) {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1 || n > 31) throw new ApiError(400, 'Payment day must be an integer between 1 and 31')
  return n
}

async function generateEmployeeCode() {
  const last = await prisma.employee.findFirst({ orderBy: { createdAt: 'desc' }, select: { employeeCode: true } })
  if (!last) return 'EMP-0001'
  const num = parseInt(last.employeeCode.replace('EMP-', '')) + 1
  return 'EMP-' + String(num).padStart(4, '0')
}

async function checkCircularManagement(managerId, employeeId) {
  let currentId = managerId
  const visited = new Set()
  while (currentId) {
    if (currentId === employeeId) throw new ApiError(400, 'Circular management relationship detected')
    if (visited.has(currentId)) break
    visited.add(currentId)
    const mgr = await prisma.employee.findUnique({ where: { id: currentId }, select: { managerId: true } })
    if (!mgr) break
    currentId = mgr.managerId
  }
}

export async function listEmployees({ page = 1, limit = 20, search, departmentId, locationId, employmentType, employmentStatus, includeSensitive = false }) {
  page = parseInt(page) || 1
  limit = parseInt(limit) || 20
  const where = {}
  if (search) {
    where.OR = [
      { employeeCode: { contains: search } }, { firstName: { contains: search } },
      { lastName: { contains: search } }, { email: { contains: search } }, { phone: { contains: search } }
    ]
  }
  if (departmentId) where.departmentId = departmentId
  if (locationId) where.locationId = locationId
  if (employmentType) where.employmentType = employmentType
  if (employmentStatus) where.employmentStatus = employmentStatus

  const [employees, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      include: {
        department: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        manager: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
        _count: { select: { subordinates: true, documents: true } }
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.employee.count({ where })
  ])

  // Next payment date is calculated on the backend so the UI never guesses dates.
  const data = employees.map((employee) => maskEmployee({
    ...employee,
    salary: employee.salary == null ? null : Number(employee.salary),
    nextPaymentDate: calculateNextSalaryPaymentDate(employee),
    paymentFrequency: normalizeFrequency(employee.salaryPaymentFrequency),
    hasSalary: employee.salary != null,
    hasTin: Boolean(employee.tinNumber),
    hasPensionId: Boolean(employee.pensionIdNumber)
  }, includeSensitive))

  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
}

export async function getEmployee(id, { includeSensitive = false } = {}) {
  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      department: true, location: true,
      manager: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
      subordinates: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
      user: { select: { id: true, name: true, email: true, isActive: true, role: { select: { name: true } } } },
      documents: { orderBy: { createdAt: 'desc' } },
      salaryHistory: { orderBy: { effectiveFrom: 'desc' }, include: { createdBy: { select: { id: true, name: true, email: true } } } },
      salaryPayments: { orderBy: { scheduledDate: 'desc' }, take: 24 }
    }
  })
  if (!employee) throw new ApiError(404, 'Employee not found')

  const enriched = {
    ...employee,
    salary: employee.salary == null ? null : Number(employee.salary),
    salaryHistory: (employee.salaryHistory || []).map((row) => ({ ...row, salary: Number(row.salary) })),
    salaryPayments: (employee.salaryPayments || []).map((row) => ({ ...row, netSalary: row.netSalary == null ? null : Number(row.netSalary) })),
    paymentFrequency: normalizeFrequency(employee.salaryPaymentFrequency),
    nextPaymentDate: calculateNextSalaryPaymentDate(employee),
    hasSalary: employee.salary != null,
    hasTin: Boolean(employee.tinNumber),
    hasPensionId: Boolean(employee.pensionIdNumber)
  }
  return maskEmployee(enriched, includeSensitive)
}

/** Employee details plus the full salary / payment section for the details page. */
export async function getEmployeeDetails(id, { includeSensitive = false } = {}) {
  const employee = await prisma.employee.findUnique({ where: { id } })
  if (!employee) throw new ApiError(404, 'Employee not found')
  const detail = await getEmployee(id, { includeSensitive })
  if (!includeSensitive) return { ...detail, payroll: null }
  const salary = await getEmployeeSalaryInfo(employee)
  return { ...detail, payroll: salary }
}

export async function createEmployee(data, userId) {
  if (data.managerId && data.managerId === data.id) throw new ApiError(400, 'Employee cannot manage themselves')
  if (data.managerId) await checkCircularManagement(data.managerId, data.id)
  if (data.userId) {
    const existing = await prisma.employee.findUnique({ where: { userId: data.userId } })
    if (existing) throw new ApiError(400, 'User account already linked to another employee')
  }
  if (data.email) {
    const existing = await prisma.employee.findUnique({ where: { email: data.email } })
    if (existing) throw new ApiError(400, 'Email already in use')
  }

  const employeeCode = await generateEmployeeCode()
  let linkedUserId = data.userId
  if (data.accountEmail || data.accountRole) {
    const email = String(data.accountEmail || data.email || '').toLowerCase().trim()
    if (!email || !data.accountPassword) throw new ApiError(400, 'Account email and password are required')
    const role = await prisma.role.findUnique({ where: { name: data.accountRole || 'ADMIN' } })
    if (!role) throw new ApiError(400, 'Selected account role does not exist')
    const user = await prisma.user.create({ data: { name: `${data.firstName} ${data.lastName}`, email, passwordHash: hashPassword(data.accountPassword), phone: data.phone, roleId: role.id } })
    linkedUserId = user.id
  }
  const employee = await prisma.employee.create({
    data: {
      employeeCode,
      firstName: data.firstName, middleName: data.middleName, lastName: data.lastName,
      preferredName: data.preferredName, gender: data.gender,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
      phone: data.phone, alternativePhone: data.alternativePhone, email: data.email,
      address: data.address, city: data.city, country: data.country,
      emergencyContactName: data.emergencyContactName, emergencyContactPhone: data.emergencyContactPhone,
      jobTitle: data.jobTitle, departmentId: data.departmentId,
      employmentType: data.employmentType || 'FULL_TIME',
      employmentStatus: data.employmentStatus || 'ACTIVE',
      hireDate: data.hireDate ? new Date(data.hireDate) : null,
      locationId: data.locationId, managerId: data.managerId,
      salary: parseOptionalNumber(data.salary),
      salaryCurrency: data.salaryCurrency || 'ETB',
      salaryPaymentFrequency: normalizeFrequency(data.salaryPaymentFrequency),
      salaryPaymentDay: parsePaymentDay(data.salaryPaymentDay),
      salaryStartDate: data.salaryStartDate ? new Date(data.salaryStartDate) : null,
      salaryNotes: data.salaryNotes || null,
      tinNumber: data.tinNumber ? String(data.tinNumber).trim() : null,
      pensionIdNumber: data.pensionIdNumber ? String(data.pensionIdNumber).trim() : null,
      notes: data.notes, profileImageUrl: data.profileImageUrl, profileImageKey: data.profileImageKey,
      idFrontUrl: data.idFrontUrl, idBackUrl: data.idBackUrl, pdfDocumentUrl: data.pdfDocumentUrl,
      userId: linkedUserId
    }
  })

  // Initial salary is stored as the first salary-history entry so the full
  // salary timeline is preserved from day one.
  if (employee.salary != null) {
    await recordSalaryChange({
      employeeId: employee.id,
      salary: Number(employee.salary),
      currency: employee.salaryCurrency || 'ETB',
      effectiveFrom: employee.salaryStartDate || new Date(),
      reason: 'Initial salary',
      createdById: userId || null
    })
    await createAuditLog({
      userId, action: 'EMPLOYEE_SALARY_CREATED', entity: 'Employee', entityId: employee.id,
      details: { employeeCode, salary: Number(employee.salary), currency: employee.salaryCurrency || 'ETB' }
    })
  }
  if (employee.tinNumber) {
    await createAuditLog({ userId, action: 'EMPLOYEE_TIN_ADDED', entity: 'Employee', entityId: employee.id, details: { employeeCode } })
  }
  if (employee.pensionIdNumber) {
    await createAuditLog({ userId, action: 'EMPLOYEE_PENSION_ID_ADDED', entity: 'Employee', entityId: employee.id, details: { employeeCode } })
  }

  await createAuditLog({ userId, action: 'EMPLOYEE_CREATED', entity: 'Employee', entityId: employee.id, details: { employeeCode } })
  return getEmployee(employee.id, { includeSensitive: true })
}

export async function updateEmployee(id, data, userId) {
  const existing = await prisma.employee.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'Employee not found')
  if (data.managerId && data.managerId === id) throw new ApiError(400, 'Employee cannot manage themselves')
  if (data.managerId && data.managerId !== existing.managerId) await checkCircularManagement(data.managerId, id)

  const nextSalary = data.salary === undefined ? undefined : parseOptionalNumber(data.salary)
  const salaryChanged = nextSalary !== undefined && Number(existing.salary ?? -1) !== Number(nextSalary ?? -1)
  const tinChanged = data.tinNumber !== undefined && String(data.tinNumber || '').trim() !== String(existing.tinNumber || '')
  const pensionChanged = data.pensionIdNumber !== undefined && String(data.pensionIdNumber || '').trim() !== String(existing.pensionIdNumber || '')

  const employee = await prisma.employee.update({
    where: { id },
    data: {
      ...(data.firstName && { firstName: data.firstName }),
      ...(data.middleName !== undefined && { middleName: data.middleName }),
      ...(data.lastName && { lastName: data.lastName }),
      ...(data.preferredName !== undefined && { preferredName: data.preferredName }),
      ...(data.gender !== undefined && { gender: data.gender }),
      ...(data.phone !== undefined && { phone: data.phone }),
      ...(data.email !== undefined && { email: data.email }),
      ...(data.jobTitle !== undefined && { jobTitle: data.jobTitle }),
      ...(data.departmentId !== undefined && { departmentId: data.departmentId }),
      ...(data.employmentType && { employmentType: data.employmentType }),
      ...(data.employmentStatus && { employmentStatus: data.employmentStatus }),
      ...(data.locationId !== undefined && { locationId: data.locationId }),
      ...(data.managerId !== undefined && { managerId: data.managerId }),
      ...(nextSalary !== undefined && { salary: nextSalary }),
      ...(data.salaryCurrency !== undefined && { salaryCurrency: data.salaryCurrency || 'ETB' }),
      ...(data.salaryPaymentFrequency !== undefined && { salaryPaymentFrequency: normalizeFrequency(data.salaryPaymentFrequency) }),
      ...(data.salaryPaymentDay !== undefined && { salaryPaymentDay: parsePaymentDay(data.salaryPaymentDay) }),
      ...(data.salaryStartDate !== undefined && { salaryStartDate: data.salaryStartDate ? new Date(data.salaryStartDate) : null }),
      ...(data.salaryNotes !== undefined && { salaryNotes: data.salaryNotes || null }),
      ...(data.tinNumber !== undefined && { tinNumber: data.tinNumber ? String(data.tinNumber).trim() : null }),
      ...(data.pensionIdNumber !== undefined && { pensionIdNumber: data.pensionIdNumber ? String(data.pensionIdNumber).trim() : null }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.idFrontUrl !== undefined && { idFrontUrl: data.idFrontUrl }),
      ...(data.idBackUrl !== undefined && { idBackUrl: data.idBackUrl }),
      ...(data.pdfDocumentUrl !== undefined && { pdfDocumentUrl: data.pdfDocumentUrl }),
    }
  })

  // Salary changes never overwrite history — a new effective-dated row is added
  // and the previous one is closed instead.
  if (salaryChanged) {
    await recordSalaryChange({
      employeeId: id,
      salary: Number(nextSalary),
      currency: data.salaryCurrency || existing.salaryCurrency || 'ETB',
      effectiveFrom: data.salaryStartDate ? new Date(data.salaryStartDate) : (data.salaryEffectiveFrom ? new Date(data.salaryEffectiveFrom) : new Date()),
      reason: data.salaryChangeReason || 'Salary updated',
      createdById: userId || null
    })
    await createAuditLog({
      userId, action: 'EMPLOYEE_SALARY_CHANGED', entity: 'Employee', entityId: id,
      details: { employeeCode: employee.employeeCode, previousSalary: existing.salary == null ? null : Number(existing.salary), newSalary: Number(nextSalary) }
    })
  }
  if (tinChanged) {
    await createAuditLog({
      userId, action: 'EMPLOYEE_TIN_CHANGED', entity: 'Employee', entityId: id,
      details: { employeeCode: employee.employeeCode, previous: existing.tinNumber ? 'SET' : 'EMPTY', current: employee.tinNumber ? 'SET' : 'EMPTY' }
    })
  }
  if (pensionChanged) {
    await createAuditLog({
      userId, action: 'EMPLOYEE_PENSION_ID_CHANGED', entity: 'Employee', entityId: id,
      details: { employeeCode: employee.employeeCode, previous: existing.pensionIdNumber ? 'SET' : 'EMPTY', current: employee.pensionIdNumber ? 'SET' : 'EMPTY' }
    })
  }
  if (data.salaryPaymentDay !== undefined && parsePaymentDay(data.salaryPaymentDay) !== existing.salaryPaymentDay) {
    await createAuditLog({
      userId, action: 'EMPLOYEE_PAYMENT_SCHEDULE_CHANGED', entity: 'Employee', entityId: id,
      details: { employeeCode: employee.employeeCode, previousDay: existing.salaryPaymentDay, paymentDay: employee.salaryPaymentDay, frequency: employee.salaryPaymentFrequency }
    })
  }

  if (!employee.userId && (data.accountRole || data.accountEmail)) {
    const email = String(data.accountEmail || data.email || '').toLowerCase().trim()
    if (!email || !data.accountPassword || !data.accountRole) throw new ApiError(400, 'Account role, email, and password are required')
    const role = await prisma.role.findUnique({ where: { name: data.accountRole } })
    if (!role) throw new ApiError(400, 'Selected account role does not exist')
    const user = await prisma.user.create({ data: { name: `${employee.firstName} ${employee.lastName}`, email, passwordHash: hashPassword(data.accountPassword), phone: employee.phone, roleId: role.id } })
    await prisma.employee.update({ where: { id }, data: { userId: user.id } })
  } else if (employee.userId && (data.accountRole || data.accountPassword || data.accountEmail)) {
    const accountData = {}
    if (data.accountEmail) accountData.email = data.accountEmail.toLowerCase().trim()
    if (data.accountPassword) accountData.passwordHash = hashPassword(data.accountPassword)
    if (data.accountRole) {
      const role = await prisma.role.findUnique({ where: { name: data.accountRole } })
      if (!role) throw new ApiError(400, 'Selected account role does not exist')
      accountData.roleId = role.id
    }
    await prisma.user.update({ where: { id: employee.userId }, data: accountData })
  }

  await createAuditLog({ userId, action: 'EMPLOYEE_UPDATED', entity: 'Employee', entityId: id, details: { employeeCode: employee.employeeCode } })
  return getEmployee(id, { includeSensitive: true })
}

/** Add a salary-history entry (effective-dated) without touching the open one. */
export async function addSalaryHistoryEntry(employeeId, data, userId) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } })
  if (!employee) throw new ApiError(404, 'Employee not found')
  const salary = parseOptionalNumber(data?.salary)
  if (salary == null) throw new ApiError(400, 'Salary is required for a salary-history entry')
  const row = await recordSalaryChange({
    employeeId,
    salary,
    currency: data?.currency || employee.salaryCurrency || 'ETB',
    effectiveFrom: data?.effectiveFrom ? new Date(data.effectiveFrom) : new Date(),
    reason: data?.reason || 'Salary history entry',
    createdById: userId || null
  })
  await createAuditLog({
    userId, action: 'EMPLOYEE_SALARY_HISTORY_ADDED', entity: 'Employee', entityId: employeeId,
    details: { employeeCode: employee.employeeCode, salary, effectiveFrom: data?.effectiveFrom || null }
  })
  return { ...row, salary: Number(row.salary) }
}

/** Correct an existing salary-history entry (reason / effective dates only). */
export async function updateSalaryHistoryEntry(employeeId, historyId, data, userId) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } })
  if (!employee) throw new ApiError(404, 'Employee not found')
  const row = await prisma.employeeSalaryHistory.findFirst({ where: { id: historyId, employeeId } })
  if (!row) throw new ApiError(404, 'Salary history entry not found')

  const updated = await prisma.employeeSalaryHistory.update({
    where: { id: historyId },
    data: {
      ...(data?.salary !== undefined && { salary: parseOptionalNumber(data.salary) }),
      ...(data?.currency !== undefined && { currency: data.currency || 'ETB' }),
      ...(data?.effectiveFrom !== undefined && { effectiveFrom: new Date(data.effectiveFrom) }),
      ...(data?.effectiveTo !== undefined && { effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null }),
      ...(data?.reason !== undefined && { reason: data.reason || null })
    }
  })
  await createAuditLog({
    userId, action: 'EMPLOYEE_SALARY_HISTORY_UPDATED', entity: 'Employee', entityId: employeeId,
    details: { employeeCode: employee.employeeCode, historyId, reason: updated.reason }
  })
  return { ...updated, salary: Number(updated.salary) }
}

export async function deactivateEmployee(id, userId) {
  const employee = await prisma.employee.findUnique({ where: { id } })
  if (!employee) throw new ApiError(404, 'Employee not found')
  await prisma.employee.update({ where: { id }, data: { employmentStatus: 'RESIGNED', terminationDate: new Date() } })
  if (employee.userId) {
    await prisma.user.update({ where: { id: employee.userId }, data: { isActive: false } })
  }
  await createAuditLog({ userId, action: 'EMPLOYEE_DEACTIVATED', entity: 'Employee', entityId: id, details: { employeeCode: employee.employeeCode } })
  return { success: true }
}

export async function uploadEmployeeDocument(employeeId, { name, documentType, dataUrl, uploadedBy }) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } })
  if (!employee) throw new ApiError(404, 'Employee not found')
  const match = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,(.+)$/)
  if (!match) throw new ApiError(400, 'Only JPG, PNG, WEBP, and PDF data URLs are supported')
  const [, mimeType, encoded] = match
  const buffer = Buffer.from(encoded, 'base64')
  if (buffer.length > 5 * 1024 * 1024) throw new ApiError(400, 'Document must be 5MB or smaller')
  const r2 = getR2Client()
  if (!r2) throw new ApiError(503, 'File storage is not configured')
  const extension = mimeType === 'application/pdf' ? 'pdf' : mimeType.split('/')[1]
  const objectKey = `employees/${employeeId}/${documentType}-${Date.now()}.${extension}`
  await r2.send(new PutObjectCommand({ Bucket: getBucketName(), Key: objectKey, Body: buffer, ContentType: mimeType }))
  const fileUrl = getPublicUrl() ? `${getPublicUrl().replace(/\/$/, '')}/${objectKey}` : null
  return prisma.employeeDocument.create({ data: { employeeId, name: name || documentType, documentType, objectKey, fileUrl, mimeType, fileSize: buffer.length, uploadedBy } })
}

export default {
  listEmployees, getEmployee, getEmployeeDetails, createEmployee, updateEmployee,
  deactivateEmployee, uploadEmployeeDocument, addSalaryHistoryEntry, updateSalaryHistoryEntry,
  maskEmployee, canViewSensitive, SENSITIVE_EMPLOYEE_FIELDS
}