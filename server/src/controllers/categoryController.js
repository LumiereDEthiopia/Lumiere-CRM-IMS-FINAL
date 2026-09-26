/**
 * Category Controller
 * Handles all category-related CRUD operations
 */
import prisma from '../config/prisma.js'
import { ApiError } from '../middleware/errorHandler.js'

/**
 * GET /api/categories
 * List all categories (flat or tree)
 */
export async function listCategories(req, res, next) {
  try {
    const { search, isActive, flat } = req.query

    const where = {}
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { slug: { contains: search } }
      ]
    }
    if (isActive !== undefined) where.isActive = isActive === 'true'

    if (flat === 'true') {
      const categories = await prisma.category.findMany({
        where,
        include: { parent: { select: { id: true, name: true } }, _count: { select: { products: true, children: true } } },
        orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }]
      })
      return res.json({ success: true, data: categories })
    }

    // Return tree structure
    const categories = await prisma.category.findMany({
      where: { ...where, parentId: null },
      include: {
        children: {
          where,
          include: { _count: { select: { products: true } } },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
        },
        _count: { select: { products: true } }
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
    })

    res.json({ success: true, data: categories })
  } catch (error) {
    next(error)
  }
}

/**
 * GET /api/categories/:id
 * Get a single category
 */
export async function getCategory(req, res, next) {
  try {
    const { id } = req.params
    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        parent: true,
        children: true,
        products: { include: { images: true } }
      }
    })
    if (!category) throw new ApiError(404, 'Category not found')
    res.json({ success: true, data: category })
  } catch (error) {
    next(error)
  }
}

/**
 * POST /api/categories
 * Create a new category
 */
export async function createCategory(req, res, next) {
  try {
    const { name, slug, description, imageUrl, imageKey, parentId, isActive, sortOrder } = req.body
    if (!name || !slug) throw new ApiError(400, 'Name and slug are required')

    const existing = await prisma.category.findUnique({ where: { slug } })
    if (existing) throw new ApiError(400, 'A category with this slug already exists')

    if (parentId) {
      const parent = await prisma.category.findUnique({ where: { id: parentId } })
      if (!parent) throw new ApiError(404, 'Parent category not found')
    }

    const category = await prisma.category.create({
      data: { name, slug, description, imageUrl, imageKey, parentId, isActive: isActive ?? true, sortOrder: sortOrder ?? 0 }
    })
    res.status(201).json({ success: true, data: category })
  } catch (error) {
    next(error)
  }
}

/**
 * PUT /api/categories/:id
 * Update a category
 */
export async function updateCategory(req, res, next) {
  try {
    const { id } = req.params
    const { name, slug, description, imageUrl, imageKey, parentId, isActive, sortOrder } = req.body

    const existing = await prisma.category.findUnique({ where: { id } })
    if (!existing) throw new ApiError(404, 'Category not found')

    if (slug && slug !== existing.slug) {
      const slugExists = await prisma.category.findUnique({ where: { slug } })
      if (slugExists) throw new ApiError(400, 'A category with this slug already exists')
    }

    // Prevent setting self as parent
    if (parentId === id) throw new ApiError(400, 'Category cannot be its own parent')

    const category = await prisma.category.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(slug && { slug }),
        ...(description !== undefined && { description }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(imageKey !== undefined && { imageKey }),
        ...(parentId !== undefined && { parentId }),
        ...(isActive !== undefined && { isActive }),
        ...(sortOrder !== undefined && { sortOrder })
      }
    })
    res.json({ success: true, data: category })
  } catch (error) {
    next(error)
  }
}

/**
 * DELETE /api/categories/:id
 * Delete a category
 */
export async function deleteCategory(req, res, next) {
  try {
    const { id } = req.params
    const existing = await prisma.category.findUnique({ where: { id } })
    if (!existing) throw new ApiError(404, 'Category not found')

    await prisma.category.delete({ where: { id } })
    res.json({ success: true, message: 'Category deleted successfully' })
  } catch (error) {
    next(error)
  }
}