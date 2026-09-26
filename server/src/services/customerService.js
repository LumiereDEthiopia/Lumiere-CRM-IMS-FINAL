/**
 * Customer Service - CRM
 */
import prisma from '../config/prisma.js'
import { ApiError } from '../middleware/errorHandler.js'
import { createAuditLog } from './auditService.js'
import { sanitizeTin } from './tinVerificationService.js'

async function generateCustomerCode() {
  const last = await prisma.customer.findFirst({ orderBy: { createdAt: 'desc' }, select: { customerCode: true } })
  if (!last) return 'CUST-0001'
  const num = parseInt(last.customerCode.replace('CUST-', '')) + 1
  return 'CUST-' + String(num).padStart(4, '0')
}

/**
 * Ensure no other customer already uses this TIN (duplicate prevention).
 * Returns the cached eTrade verification for the TIN when one exists.
 */
async function guardTin(tinNumber, excludeCustomerId) {
  if (!tinNumber || !String(tinNumber).trim()) return null
  const tin = sanitizeTin(tinNumber)
  if (!tin.ok) throw new ApiError(400, tin.message)
  const duplicate = await prisma.customer.findFirst({
    where: { tinNumber: tin.tin, ...(excludeCustomerId ? { id: { not: excludeCustomerId } } : {}) },
    select: { id: true, customerCode: true, name: true }
  })
  if (duplicate) {
    throw new ApiError(409, `This TIN is already registered to customer ${duplicate.customerCode} (${duplicate.name})`)
  }
  // Reuse the eTrade verification already on file, if any
  return prisma.tinVerificationCache.findUnique({ where: { tin: tin.tin } })
}

/** TIN verification fields derived from the eTrade cache */
function tinFields(cached) {
  if (!cached || !cached.verified) return { tinVerified: false, tinVerifiedAt: null, tinVerificationSource: null }
  return { tinVerified: true, tinVerifiedAt: cached.checkedAt, tinVerificationSource: 'ETRADE' }
}

export async function listCustomers({ page = 1, limit = 20, search, status, customerType }) {
  page = parseInt(page) || 1
  limit = parseInt(limit) || 20
  const where = {}
  if (search) { where.OR = [{ name: { contains: search } }, { email: { contains: search } }, { phone: { contains: search } }, { tinNumber: { contains: search } }, { customerCode: { contains: search } }] }
  if (status) where.status = status
  if (customerType) where.customerType = customerType
  const [customers, total] = await Promise.all([
    prisma.customer.findMany({ where, include: { tags: true, _count: { select: { sales: true, interactions: true, tasks: true } } }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.customer.count({ where })
  ])
  return { data: customers, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
}

export async function getCustomer(id) {
  const customer = await prisma.customer.findUnique({ where: { id }, include: { tags: true, sales: { orderBy: { createdAt: 'desc' }, take: 10 }, interactions: { orderBy: { createdAt: 'desc' }, take: 10 }, tasks: { orderBy: { createdAt: 'desc' } } } })
  if (!customer) throw new ApiError(404, 'Customer not found')
  return customer
}

export async function createCustomer(data) {
  const cachedTin = await guardTin(data.tinNumber)
  const customerCode = await generateCustomerCode()
  const customer = await prisma.customer.create({
    data: {
      customerCode, name: data.name, email: data.email, tinNumber: data.tinNumber, phone: data.phone, alternativePhone: data.alternativePhone,
      address: data.address, city: data.city, country: data.country, dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
      gender: data.gender, customerType: data.customerType || 'INDIVIDUAL', status: data.status || 'LEAD',
      source: data.source, notes: data.notes,
      ...tinFields(cachedTin),
      tags: data.tagIds ? { connect: data.tagIds.map(id => ({ id })) } : undefined
    }, include: { tags: true }
  })
  await createAuditLog({ action: 'CUSTOMER_CREATED', entity: 'Customer', entityId: customer.id, details: { customerCode } })
  return customer
}

export async function updateCustomer(id, data) {
  const existing = await prisma.customer.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'Customer not found')
  const cachedTin = await guardTin(data.tinNumber, id)
  const customer = await prisma.customer.update({
    where: { id },
    data: {
      ...(data.name && { name: data.name }), ...(data.email !== undefined && { email: data.email }),
      ...(data.tinNumber !== undefined && { tinNumber: data.tinNumber || null }),
      ...(data.tinNumber !== undefined && tinFields(cachedTin)),
      ...(data.phone !== undefined && { phone: data.phone }), ...(data.alternativePhone !== undefined && { alternativePhone: data.alternativePhone }),
      ...(data.address !== undefined && { address: data.address }), ...(data.city !== undefined && { city: data.city }),
      ...(data.country !== undefined && { country: data.country }), ...(data.status && { status: data.status }),
      ...(data.customerType && { customerType: data.customerType }), ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.tagIds && { tags: { set: data.tagIds.map(id => ({ id })) } })
    }, include: { tags: true }
  })
  await createAuditLog({ action: 'CUSTOMER_UPDATED', entity: 'Customer', entityId: id, details: { customerCode: customer.customerCode } })
  return customer
}

export async function deleteCustomer(id) {
  const existing = await prisma.customer.findUnique({ where: { id }, include: { _count: { select: { sales: true } } } })
  if (!existing) throw new ApiError(404, 'Customer not found')
  if (existing._count.sales > 0) {
    await prisma.customer.update({ where: { id }, data: { status: 'INACTIVE' } })
    return { id, archived: true }
  }
  await prisma.customer.delete({ where: { id } })
  return { id, archived: false }
}

export async function addInteraction({ customerId, type, subject, description, nextFollowUpDate, userId }) {
  return prisma.customerInteraction.create({ data: { customerId, type, subject, description, nextFollowUpDate: nextFollowUpDate ? new Date(nextFollowUpDate) : null, userId } })
}

export async function createTask({ customerId, title, description, dueDate, priority, assignedTo }) {
  return prisma.customerTask.create({ data: { customerId, title, description, dueDate: dueDate ? new Date(dueDate) : null, priority: priority || 'MEDIUM', assignedTo } })
}

export async function listTags() { return prisma.customerTag.findMany({ orderBy: { name: 'asc' } }) }
export async function createTag({ name, color }) { return prisma.customerTag.create({ data: { name, color } }) }
export async function deleteTag(id) { return prisma.customerTag.delete({ where: { id } }) }

export default { listCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer, addInteraction, createTask, listTags, createTag, deleteTag }