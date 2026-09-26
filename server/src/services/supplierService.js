/**
 * Supplier Service
 */
import prisma from '../config/prisma.js'
import { ApiError } from '../middleware/errorHandler.js'

export async function listSuppliers({ page = 1, limit = 20, search }) {
  page = parseInt(page) || 1
  limit = parseInt(limit) || 20
  const where = {}
  if (search) { where.OR = [{ name: { contains: search } }, { contactPerson: { contains: search } }, { email: { contains: search } }] }
  const [suppliers, total] = await Promise.all([prisma.supplier.findMany({ where, orderBy: { name: 'asc' }, skip: (page - 1) * limit, take: limit }), prisma.supplier.count({ where })])
  return { data: suppliers, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
}
export async function createSupplier(data) { return prisma.supplier.create({ data: { name: data.name, contactPerson: data.contactPerson, email: data.email, phone: data.phone, address: data.address, city: data.city, country: data.country, taxNumber: data.taxNumber, notes: data.notes } }) }
export async function updateSupplier(id, data) {
  const existing = await prisma.supplier.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'Supplier not found')
  return prisma.supplier.update({ where: { id }, data: { ...(data.name && { name: data.name }), ...(data.contactPerson !== undefined && { contactPerson: data.contactPerson }), ...(data.email !== undefined && { email: data.email }), ...(data.phone !== undefined && { phone: data.phone }), ...(data.address !== undefined && { address: data.address }), ...(data.city !== undefined && { city: data.city }), ...(data.country !== undefined && { country: data.country }), ...(data.taxNumber !== undefined && { taxNumber: data.taxNumber }), ...(data.notes !== undefined && { notes: data.notes }) } })
}
export async function deleteSupplier(id) { return prisma.supplier.update({ where: { id }, data: { isActive: false } }) }
export default { listSuppliers, createSupplier, updateSupplier, deleteSupplier }