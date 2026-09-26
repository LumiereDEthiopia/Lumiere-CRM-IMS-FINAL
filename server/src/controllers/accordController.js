/**
 * Accord Controller
 * Handles all accord (fragrance family) CRUD operations
 */
import prisma from '../config/prisma.js'
import { ApiError } from '../middleware/errorHandler.js'

/**
 * GET /api/accords
 * List all accords
 */
export async function listAccords(req, res, next) {
  try {
    const { search, isActive, sortBy = 'name', sortOrder = 'asc' } = req.query
    const where = {}
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { slug: { contains: search } }
      ]
    }
    if (isActive !== undefined) where.isActive = isActive === 'true'

    const accords = await prisma.accord.findMany({
      where,
      include: { _count: { select: { productAccords: true } } },
      orderBy: { [sortBy]: sortOrder }
    })
    res.json({ success: true, data: accords })
  } catch (error) {
    next(error)
  }
}

/**
 * GET /api/accords/:id
 * Get a single accord
 */
export async function getAccord(req, res, next) {
  try {
    const { id } = req.params
    const accord = await prisma.accord.findUnique({
      where: { id },
      include: { productAccords: { include: { product: { select: { id: true, name: true } } } } }
    })
    if (!accord) throw new ApiError(404, 'Accord not found')
    res.json({ success: true, data: accord })
  } catch (error) {
    next(error)
  }
}

/**
 * POST /api/accords
 * Create a new accord
 */
export async function createAccord(req, res, next) {
  try {
    const { name, slug, color, isActive } = req.body
    if (!name || !slug) throw new ApiError(400, 'Name and slug are required')

    const existing = await prisma.accord.findUnique({ where: { slug } })
    if (existing) throw new ApiError(400, 'An accord with this slug already exists')

    const accord = await prisma.accord.create({
      data: { name, slug, color, isActive: isActive ?? true }
    })
    res.status(201).json({ success: true, data: accord })
  } catch (error) {
    next(error)
  }
}

/**
 * PUT /api/accords/:id
 * Update an accord
 */
export async function updateAccord(req, res, next) {
  try {
    const { id } = req.params
    const { name, slug, color, isActive } = req.body

    const existing = await prisma.accord.findUnique({ where: { id } })
    if (!existing) throw new ApiError(404, 'Accord not found')

    if (slug && slug !== existing.slug) {
      const slugExists = await prisma.accord.findUnique({ where: { slug } })
      if (slugExists) throw new ApiError(400, 'An accord with this slug already exists')
    }

    const accord = await prisma.accord.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(slug && { slug }),
        ...(color !== undefined && { color }),
        ...(isActive !== undefined && { isActive })
      }
    })
    res.json({ success: true, data: accord })
  } catch (error) {
    next(error)
  }
}

/**
 * DELETE /api/accords/:id
 * Delete an accord
 */
export async function deleteAccord(req, res, next) {
  try {
    const { id } = req.params
    const existing = await prisma.accord.findUnique({ where: { id } })
    if (!existing) throw new ApiError(404, 'Accord not found')

    await prisma.accord.delete({ where: { id } })
    res.json({ success: true, message: 'Accord deleted successfully' })
  } catch (error) {
    next(error)
  }
}