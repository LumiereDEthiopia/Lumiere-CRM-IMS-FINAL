/**
 * Order Controller
 * Handles all order-related CRUD operations
 */
import prisma from '../config/prisma.js'
import { ApiError } from '../middleware/errorHandler.js'

/**
 * GET /api/orders
 * List all orders with filtering and pagination
 */
export async function listOrders(req, res, next) {
  try {
    const { page = 1, limit = 20, search, status, paymentStatus, sortBy = 'createdAt', sortOrder = 'desc' } = req.query
    const pageNum = Math.max(1, parseInt(page))
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)))
    const skip = (pageNum - 1) * limitNum

    const where = {}
    if (search) {
      where.OR = [
        { orderNumber: { contains: search } },
        { customer: { name: { contains: search } } },
        { customer: { email: { contains: search } } }
      ]
    }
    if (status) where.status = status
    if (paymentStatus) where.paymentStatus = paymentStatus

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, email: true } },
          items: { include: { product: { select: { id: true, name: true, images: true } } } },
          _count: { select: { items: true } }
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limitNum
      }),
      prisma.order.count({ where })
    ])

    res.json({
      success: true,
      data: orders,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) }
    })
  } catch (error) {
    next(error)
  }
}

/**
 * GET /api/orders/:id
 * Get a single order
 */
export async function getOrder(req, res, next) {
  try {
    const { id } = req.params
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        items: { include: { product: { include: { images: true } } } }
      }
    })
    if (!order) throw new ApiError(404, 'Order not found')
    res.json({ success: true, data: order })
  } catch (error) {
    next(error)
  }
}

/**
 * POST /api/orders
 * Create a new order
 */
export async function createOrder(req, res, next) {
  try {
    const { customerId, status, subtotal, deliveryFee, discount, total, paymentStatus, paymentMethod, shippingAddress, notes, items } = req.body

    if (!customerId || !items || !Array.isArray(items) || items.length === 0) {
      throw new ApiError(400, 'Customer ID and at least one order item are required')
    }

    // Generate order number
    const orderCount = await prisma.order.count()
    const orderNumber = `ORD-${String(orderCount + 1).padStart(4, '0')}`

    const order = await prisma.order.create({
      data: {
        orderNumber,
        customerId,
        status: status ?? 'PENDING',
        subtotal: parseFloat(subtotal) || 0,
        deliveryFee: parseFloat(deliveryFee) || 0,
        discount: parseFloat(discount) || 0,
        total: parseFloat(total) || 0,
        paymentStatus: paymentStatus ?? 'UNPAID',
        paymentMethod,
        shippingAddress,
        notes,
        items: {
          create: items.map(item => ({
            productId: item.productId,
            productName: item.productName,
            quantity: parseInt(item.quantity),
            unitPrice: parseFloat(item.unitPrice),
            totalPrice: parseFloat(item.totalPrice)
          }))
        }
      },
      include: {
        customer: { select: { id: true, name: true, email: true } },
        items: { include: { product: { select: { id: true, name: true } } } }
      }
    })

    res.status(201).json({ success: true, data: order })
  } catch (error) {
    next(error)
  }
}

/**
 * PUT /api/orders/:id
 * Update an order
 */
export async function updateOrder(req, res, next) {
  try {
    const { id } = req.params
    const { status, paymentStatus, paymentMethod, shippingAddress, notes, subtotal, deliveryFee, discount, total } = req.body

    const existing = await prisma.order.findUnique({ where: { id } })
    if (!existing) throw new ApiError(404, 'Order not found')

    const order = await prisma.order.update({
      where: { id },
      data: {
        ...(status && { status }),
        ...(paymentStatus && { paymentStatus }),
        ...(paymentMethod !== undefined && { paymentMethod }),
        ...(shippingAddress !== undefined && { shippingAddress }),
        ...(notes !== undefined && { notes }),
        ...(subtotal !== undefined && { subtotal: parseFloat(subtotal) }),
        ...(deliveryFee !== undefined && { deliveryFee: parseFloat(deliveryFee) }),
        ...(discount !== undefined && { discount: parseFloat(discount) }),
        ...(total !== undefined && { total: parseFloat(total) })
      },
      include: {
        customer: { select: { id: true, name: true, email: true } },
        items: { include: { product: { select: { id: true, name: true } } } }
      }
    })
    res.json({ success: true, data: order })
  } catch (error) {
    next(error)
  }
}

/**
 * DELETE /api/orders/:id
 * Delete an order
 */
export async function deleteOrder(req, res, next) {
  try {
    const { id } = req.params
    const existing = await prisma.order.findUnique({ where: { id } })
    if (!existing) throw new ApiError(404, 'Order not found')

    await prisma.order.delete({ where: { id } })
    res.json({ success: true, message: 'Order deleted successfully' })
  } catch (error) {
    next(error)
  }
}