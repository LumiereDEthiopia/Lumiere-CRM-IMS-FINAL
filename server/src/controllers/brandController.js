/**
 * Brand Controller
 * Handles all brand-related CRUD operations
 */
import prisma from '../config/prisma.js'
import { ApiError } from '../middleware/errorHandler.js'

/**
 * GET /api/brands
 * List all brands with pagination and search
 */
export async function listBrands(req, res, next) {
  try {
    const { page = 1, limit = 50, search, isActive, sortBy = 'name', sortOrder = 'asc' } = req.query
    const pageNum = Math.max(1, parseInt(page))
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)))
    const skip = (pageNum - 1) * limitNum

    const where = {}
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { slug: { contains: search } },
        { country: { contains: search } }
      ]
    }
    if (isActive !== undefined) where.isActive = isActive === 'true'

    const [brands, total] = await Promise.all([
      prisma.brand.findMany({
        where,
        include: {
          _count: { select: { products: true } }
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limitNum
      }),
      prisma.brand.count({ where })
    ])

    res.json({
      success: true,
      data: brands,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) }
    })
  } catch (error) {
    next(error)
  }
}

/**
 * GET /api/brands/:id
 * Get a single brand
 */
export async function getBrand(req, res, next) {
  try {
    const { id } = req.params
    const brand = await prisma.brand.findUnique({
      where: { id },
      include: { products: { include: { images: true } } }
    })
    if (!brand) throw new ApiError(404, 'Brand not found')
    res.json({ success: true, data: brand })
  } catch (error) {
    next(error)
  }
}

/**
 * POST /api/brands
 * Create a new brand
 */
export async function createBrand(req, res, next) {
  try {
    const { name, slug, description, logoUrl, logoKey, country, website, isActive } = req.body
    if (!name || !slug) throw new ApiError(400, 'Name and slug are required')

    const existing = await prisma.brand.findUnique({ where: { slug } })
    if (existing) throw new ApiError(400, 'A brand with this slug already exists')

    const brand = await prisma.brand.create({
      data: { name, slug, description, logoUrl, logoKey, country, website, isActive: isActive ?? true }
    })
    res.status(201).json({ success: true, data: brand })
  } catch (error) {
    next(error)
  }
}

/**
 * PUT /api/brands/:id
 * Update a brand
 */
export async function updateBrand(req, res, next) {
  try {
    const { id } = req.params
    const { name, slug, description, logoUrl, logoKey, country, website, isActive } = req.body

    const existing = await prisma.brand.findUnique({ where: { id } })
    if (!existing) throw new ApiError(404, 'Brand not found')

    if (slug && slug !== existing.slug) {
      const slugExists = await prisma.brand.findUnique({ where: { slug } })
      if (slugExists) throw new ApiError(400, 'A brand with this slug already exists')
    }

    const brand = await prisma.brand.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(slug && { slug }),
        ...(description !== undefined && { description }),
        ...(logoUrl !== undefined && { logoUrl }),
        ...(logoKey !== undefined && { logoKey }),
        ...(country !== undefined && { country }),
        ...(website !== undefined && { website }),
        ...(isActive !== undefined && { isActive })
      }
    })
    res.json({ success: true, data: brand })
  } catch (error) {
    next(error)
  }
}

/**
 * DELETE /api/brands/:id
 * Delete a brand
 */
export async function deleteBrand(req, res, next) {
  try {
    const { id } = req.params
    const existing = await prisma.brand.findUnique({ where: { id } })
    if (!existing) throw new ApiError(404, 'Brand not found')

    await prisma.brand.delete({ where: { id } })
    res.json({ success: true, message: 'Brand deleted successfully' })
  } catch (error) {
    next(error)
  }
}