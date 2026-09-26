/**
 * Product Controller - Part 1: List & Get
 */
import prisma from '../config/prisma.js'
import { ApiError } from '../middleware/errorHandler.js'
import { isPerfume, offeredSizes } from '../services/sizeStockService.js'
import { normalizeProductPayload } from '../lib/normalizers.js'
import { setProductItems } from '../services/itemService.js'

// Size comparison helper — treats null / '' as the same ("no size set")
function normalizeSize(size) {
  return String(size || '').trim().toLowerCase()
}

/**
 * Stock fields for a product from a create/update payload.
 *
 * Perfumes are stocked per bottle size: the two boxes (stock50ml / stock100ml)
 * are the source of truth and `stockQuantity` — shown as "Stock (bottles)" — is
 * their sum. Oil / Pure Oil products are sold by gram and only use
 * `stockQuantity`. Legacy payloads that only send `stockQuantity` (Excel import,
 * API clients) keep working: the amount is placed in the box that matches the
 * product's size so no stock is lost.
 */
function resolveProductStock({ productType, size, stockQuantity, stock50ml, stock100ml }) {
  const num = (value) => {
    const parsed = parseFloat(value)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
  }
  if (!isPerfume(productType)) {
    return { stockQuantity: num(stockQuantity), stock50ml: 0, stock100ml: 0 }
  }
  if (stock50ml !== undefined || stock100ml !== undefined) {
    const s50 = num(stock50ml)
    const s100 = num(stock100ml)
    return { stock50ml: s50, stock100ml: s100, stockQuantity: s50 + s100 }
  }
  const total = num(stockQuantity)
  const sizes = offeredSizes(size)
  const only100ml = sizes.includes('100ml') && !sizes.includes('50ml')
  return only100ml
    ? { stock50ml: 0, stock100ml: total, stockQuantity: total }
    : { stock50ml: total, stock100ml: 0, stockQuantity: total }
}

async function generateProductCode({ productType, gender }) {
  const key = productType === 'OIL' ? 'product_code_prefix_oil'
    : productType === 'PURE_OIL' ? 'product_code_prefix_pure_oil'
    : `product_code_prefix_${String(gender || 'unisex').toLowerCase()}`
  const setting = await prisma.setting.findUnique({ where: { key } })
  const nextSetting = await prisma.setting.findUnique({ where: { key: 'product_code_next_number' } })
  const fallback = productType === 'OIL' ? 'O' : productType === 'PURE_OIL' ? 'PO' : 'U'
  const prefix = String(setting?.value || fallback).trim().toUpperCase() || fallback
  let next = Number(nextSetting?.value || 1)
  if (!Number.isInteger(next) || next < 1) next = 1
  const existing = await prisma.product.findMany({ where: { sku: { startsWith: prefix } }, select: { sku: true } })
  const used = existing.map((item) => Number(String(item.sku).slice(prefix.length))).filter(Number.isInteger)
  next = Math.max(next, ...(used.length ? used.map((value) => value + 1) : [1]))
  await prisma.setting.upsert({ where: { key: 'product_code_next_number' }, update: { value: String(next + 1), type: 'number' }, create: { key: 'product_code_next_number', value: String(next + 1), type: 'number' } })
  return `${prefix}${String(next).padStart(3, '0')}`
}

export async function listProducts(req, res, next) {
  try {
    const {
      page = 1, limit = 20, search, brandId, categoryId,
      gender, productType, isActive, isFeatured, isNew, isLuxury,
      sortBy = 'createdAt', sortOrder = 'desc'
    } = req.query

    const pageNum = Math.max(1, parseInt(page))
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)))
    const skip = (pageNum - 1) * limitNum

    const where = {}
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { slug: { contains: search } },
        { sku: { contains: search } }
      ]
    }
    if (brandId) where.brandId = brandId
    if (categoryId) where.categoryId = categoryId
    if (gender) where.gender = gender
    if (productType) where.productType = productType
    if (isActive !== undefined) where.isActive = isActive === 'true'
    if (isFeatured !== undefined) where.isFeatured = isFeatured === 'true'
    if (isNew !== undefined) where.isNew = isNew === 'true'
    if (isLuxury !== undefined) where.isLuxury = isLuxury === 'true'

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          brand: { select: { id: true, name: true, slug: true } },
          category: { select: { id: true, name: true, slug: true } },
          images: { orderBy: { sortOrder: 'asc' } },
          inventory: { select: { locationId: true, quantity: true, availableQuantity: true } },
          _count: { select: { saleItems: true } }
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limitNum
      }),
      prisma.product.count({ where })
    ])

    res.json({
      success: true,
      data: products,
      pagination: {
        page: pageNum, limit: limitNum, total,
        totalPages: Math.ceil(total / limitNum),
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1
      }
    })
  } catch (error) {
    next(error)
  }
}

export async function getProduct(req, res, next) {
  try {
    const { id } = req.params
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        brand: true,
        category: true,
        images: { orderBy: { sortOrder: 'asc' } },
        accords: { include: { accord: true }, orderBy: { sortOrder: 'asc' } },
        notes: { include: { fragranceNote: true }, orderBy: { sortOrder: 'asc' } },
        productItems: {
          include: {
            item: { select: { id: true, itemCode: true, name: true, size: true, color: true, unit: true, isActive: true, category: { select: { id: true, name: true } } } }
          }
        }
      }
    })
    if (!product) throw new ApiError(404, 'Product not found')
    res.json({ success: true, data: product })
  } catch (error) {
    next(error)
  }
}

export async function createProduct(req, res, next) {
  try {
    const normalized = normalizeProductPayload(req.body || {})

    const {
      name, slug, description, shortDescription,
      brandId, categoryId,
      gender, productType, price, price100ml, compareAtPrice,
      stockQuantity, stock50ml, stock100ml,
      sku, size,
      concentration, year, country,
      isActive = true, isFeatured = false,
      isNew = false, isLuxury = false,
      images = [], accords = [], notes = []
    } = normalized

    if (!name || !slug || !brandId) {
      throw new ApiError(400, 'Name, slug, and brandId are required')
    }

    // Auto-uniquify the slug so the same perfume can be entered twice —
    // e.g. one entry per bottle size (50ml / 100ml) sharing the same code
    let finalSlug = slug
    let slugSuffix = 2
    while (await prisma.product.findUnique({ where: { slug: finalSlug } })) {
      finalSlug = `${slug}-${slugSuffix++}`
    }

    // Same product code (SKU) may be reused only with a different Size (ml) —
    // perfumes sharing a code are identified by size (50ml vs 100ml)
    if (sku) {
      const sameCode = await prisma.product.findMany({ where: { sku }, select: { size: true } })
      if (sameCode.some((p) => normalizeSize(p.size) === normalizeSize(size))) {
        throw new ApiError(400, `Code "${sku}" is already used with the same size. The same code can only be reused with a different Size (ml) — e.g. one product with 50ml and another with 100ml.`)
      }
    }

    const product = await prisma.product.create({
      data: {
        name,
        slug: finalSlug,
        description,
        shortDescription,
        brandId,
        categoryId: categoryId === '' ? null : categoryId,
        gender: gender === '' ? null : gender,
        productType: productType === '' ? 'PERFUME' : productType,
        price: parseFloat(price) || 0,
        price100ml: price100ml != null && price100ml !== '' ? parseFloat(price100ml) : null,
        compareAtPrice: compareAtPrice ? parseFloat(compareAtPrice) : null,
        ...resolveProductStock({ productType: productType === '' ? 'PERFUME' : productType, size, stockQuantity, stock50ml, stock100ml }),
        sku: sku || await generateProductCode({ productType: productType === '' ? 'PERFUME' : productType, gender }),
        size: size === '' ? null : size,
        concentration: concentration === '' ? null : concentration,
        year: year ? parseInt(year) : null,
        country: country === '' ? null : country,
        isActive: isActive ?? true,
        isFeatured: isFeatured ?? false,
        isNew: isNew ?? false,
        isLuxury: isLuxury ?? false,
        images: images?.length ? {
          create: images.map((img, i) => ({
            imageUrl: img.imageUrl, objectKey: img.objectKey,
            altText: img.altText, sortOrder: img.sortOrder ?? i,
            isPrimary: img.isPrimary ?? (i === 0)
          }))
        } : undefined,
        accords: accords?.length ? {
          create: accords.map((a, i) => ({
            accordId: a.accordId, intensity: a.intensity ?? 50,
            sortOrder: a.sortOrder ?? i
          }))
        } : undefined,
        notes: notes?.length ? {
          create: notes.map((n, i) => ({
            fragranceNoteId: n.fragranceNoteId, noteType: n.noteType,
            sortOrder: n.sortOrder ?? i
          }))
        } : undefined
      },
      include: {
        brand: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        images: true,
        accords: { include: { accord: true } },
        notes: { include: { fragranceNote: true } }
      }
    })

    if (Array.isArray(normalized.productItems)) {
      await setProductItems(product.id, normalized.productItems, req.user?.id)
    }

    res.status(201).json({ success: true, data: product })
  } catch (error) {
    next(error)
  }
}

export async function updateProduct(req, res, next) {
  try {
    const { id } = req.params
    const body = req.body
    const existing = await prisma.product.findUnique({ where: { id } })
    if (!existing) throw new ApiError(404, 'Product not found')

    if (body.slug && body.slug !== existing.slug) {
      const slugExists = await prisma.product.findUnique({ where: { slug: body.slug } })
      if (slugExists) throw new ApiError(400, 'A product with this slug already exists')
    }

    const nextSku = body.sku !== undefined ? body.sku : existing.sku
    const nextSize = body.size !== undefined ? body.size : existing.size
    if (nextSku) {
      const sameCode = await prisma.product.findMany({ where: { sku: nextSku, id: { not: id } }, select: { size: true } })
      if (sameCode.some((p) => normalizeSize(p.size) === normalizeSize(nextSize))) {
        throw new ApiError(400, `Code "${nextSku}" is already used by another product with the same size. Products sharing a code must differ by Size (ml) — e.g. 50ml vs 100ml.`)
      }
    }

    // Stock boxes: the per-size values are the source of truth and the total
    // ("Stock (bottles)") is recomputed from them. A payload that only sends
    // `stockQuantity` keeps working — it lands in the box for the product size.
    const normalized = normalizeProductPayload(body, existing)
    const stockTouched = normalized.stockQuantity !== undefined || normalized.stock50ml !== undefined || normalized.stock100ml !== undefined
    const stockFields = stockTouched
      ? resolveProductStock({
          productType: normalized.productType !== undefined ? normalized.productType : existing.productType,
          size: normalized.size !== undefined ? normalized.size : existing.size,
          stockQuantity: normalized.stockQuantity,
          stock50ml: normalized.stock50ml,
          stock100ml: normalized.stock100ml
        })
      : null

    // Delete related records if they're being updated
    if (normalized.images !== undefined) await prisma.productImage.deleteMany({ where: { productId: id } })
    if (normalized.accords !== undefined) await prisma.productAccord.deleteMany({ where: { productId: id } })
    if (normalized.notes !== undefined) await prisma.productNote.deleteMany({ where: { productId: id } })

    const product = await prisma.product.update({
      where: { id },
      data: {
        ...(normalized.name !== undefined && normalized.name !== '' && { name: normalized.name }),
        ...(normalized.slug !== undefined && normalized.slug !== '' && { slug: normalized.slug }),
        ...(normalized.description !== undefined && { description: normalized.description }),
        ...(normalized.shortDescription !== undefined && { shortDescription: normalized.shortDescription }),
        ...(normalized.brandId !== undefined && normalized.brandId !== '' && { brandId: normalized.brandId }),
        ...(normalized.categoryId !== undefined && { categoryId: normalized.categoryId === '' ? null : normalized.categoryId }),
        ...(normalized.gender !== undefined && { gender: normalized.gender === '' ? null : normalized.gender }),
        ...(normalized.productType !== undefined && { productType: normalized.productType === '' ? 'PERFUME' : normalized.productType }),
        ...(normalized.price !== undefined && { price: parseFloat(normalized.price) || 0 }),
        ...(normalized.price100ml !== undefined && { price100ml: normalized.price100ml != null && normalized.price100ml !== '' ? parseFloat(normalized.price100ml) : null }),
        ...(normalized.compareAtPrice !== undefined && { compareAtPrice: normalized.compareAtPrice ? parseFloat(normalized.compareAtPrice) : null }),
        ...(stockFields || {}),
        ...(normalized.sku !== undefined && { sku: normalized.sku }),
        ...(normalized.size !== undefined && { size: normalized.size === '' ? null : normalized.size }),
        ...(normalized.concentration !== undefined && { concentration: normalized.concentration === '' ? null : normalized.concentration }),
        ...(normalized.year !== undefined && { year: normalized.year ? parseInt(normalized.year) : null }),
        ...(normalized.country !== undefined && { country: normalized.country === '' ? null : normalized.country }),
        ...(normalized.isActive !== undefined && { isActive: normalized.isActive }),
        ...(normalized.isFeatured !== undefined && { isFeatured: normalized.isFeatured }),
        ...(normalized.isNew !== undefined && { isNew: normalized.isNew }),
        ...(normalized.isLuxury !== undefined && { isLuxury: normalized.isLuxury })
      },
      include: {
        brand: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        images: true,
        accords: { include: { accord: true } },
        notes: { include: { fragranceNote: true } }
      }
    })

    if (Array.isArray(normalized.productItems)) {
      await setProductItems(id, normalized.productItems, req.user?.id)
    }

    const withItems = await prisma.product.findUnique({
      where: { id },
      include: {
        brand: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        images: true,
        accords: { include: { accord: true } },
        notes: { include: { fragranceNote: true } },
        productItems: {
          include: {
            item: { select: { id: true, itemCode: true, name: true, size: true, color: true, unit: true, isActive: true, category: { select: { id: true, name: true } } } }
          }
        }
      }
    })

    res.json({ success: true, data: withItems })
  } catch (error) {
    next(error)
  }
}

export async function deleteProduct(req, res, next) {
  try {
    const { id } = req.params
    const existing = await prisma.product.findUnique({ where: { id } })
    if (!existing) throw new ApiError(404, 'Product not found')
    await prisma.product.update({ where: { id }, data: { isActive: false } })
    res.json({ success: true, message: 'Product archived successfully' })
  } catch (error) {
    next(error)
  }
}

export async function bulkDeleteProducts(req, res, next) {
  try {
    const { ids } = req.body
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new ApiError(400, 'Array of product IDs is required')
    }
    const result = await prisma.product.updateMany({ where: { id: { in: ids } }, data: { isActive: false } })
    res.json({ success: true, message: `${result.count} products archived` })
  } catch (error) {
    next(error)
  }
}