/**
 * Location Service
 */
import prisma from '../config/prisma.js'
import { ApiError } from '../middleware/errorHandler.js'

export async function listLocations() { return prisma.location.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }) }
export async function createLocation(data) { return prisma.location.create({ data: { name: data.name, code: data.code, description: data.description, address: data.address, phone: data.phone } }) }
export async function updateLocation(id, data) { return prisma.location.update({ where: { id }, data: { ...(data.name && { name: data.name }), ...(data.description !== undefined && { description: data.description }), ...(data.address !== undefined && { address: data.address }), ...(data.phone !== undefined && { phone: data.phone }), ...(data.isActive !== undefined && { isActive: data.isActive }) } }) }
export async function deleteLocation(id) { return prisma.location.update({ where: { id }, data: { isActive: false } }) }
export default { listLocations, createLocation, updateLocation, deleteLocation }