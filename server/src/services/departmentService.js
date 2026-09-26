/**
 * Department Service
 */
import prisma from '../config/prisma.js'

export async function listDepartments() { return prisma.department.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }) }
export async function createDepartment(data) { return prisma.department.create({ data: { name: data.name, code: data.code, description: data.description } }) }
export async function updateDepartment(id, data) { return prisma.department.update({ where: { id }, data: { ...(data.name && { name: data.name }), ...(data.code && { code: data.code }), ...(data.description !== undefined && { description: data.description }), ...(data.isActive !== undefined && { isActive: data.isActive }) } }) }
export async function deleteDepartment(id) { return prisma.department.update({ where: { id }, data: { isActive: false } }) }
export default { listDepartments, createDepartment, updateDepartment, deleteDepartment }