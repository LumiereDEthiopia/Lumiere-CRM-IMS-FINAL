/**
 * Fragrance Note Controller
 * Handles all fragrance note CRUD operations with Group/Sub-Group support
 */
import prisma from '../config/prisma.js'
import { ApiError } from '../middleware/errorHandler.js'

/** 
 * GET /api/notes/groups
 * List all fragrance note groups
 */
export async function listGroups(req, res, next) {
  try {
    const groups = await prisma.perfumeNoteGroup.findMany({
      where: { active: true },
      include: {
        _count: { select: { subGroups: true, notes: true } },
        subGroups: {
          where: { active: true },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, subGroupCode: true, subGroupName: true, _count: { select: { notes: true } } }
        }
      },
      orderBy: { sortOrder: 'asc' }
    })
    res.json({ success: true, data: groups })
  } catch (error) {
    next(error)
  }
}

/** 
 * GET /api/notes/groups/:groupId/subgroups
 * Get sub-groups for a specific group
 */
export async function getSubGroupsByGroup(req, res, next) {
  try {
    const { groupId } = req.params
    const subGroups = await prisma.perfumeNoteSubGroup.findMany({
      where: { groupId, active: true },
      include: { _count: { select: { notes: true } } },
      orderBy: { sortOrder: 'asc' }
    })
    res.json({ success: true, data: subGroups })
  } catch (error) {
    next(error)
  }
}

/** 
 * GET /api/notes/groups/:groupId
 * Get a single group with its sub-groups
 */
export async function getGroup(req, res, next) {
  try {
    const { groupId } = req.params
    const group = await prisma.perfumeNoteGroup.findUnique({
      where: { id: groupId },
      include: {
        subGroups: {
          where: { active: true },
          orderBy: { sortOrder: 'asc' },
          include: { _count: { select: { notes: true } } }
        },
        _count: { select: { subGroups: true, notes: true } }
      }
    })
    if (!group) throw new ApiError(404, 'Group not found')
    res.json({ success: true, data: group })
  } catch (error) {
    next(error)
  }
}

/**
 * GET /api/notes
 * List all fragrance notes with enhanced filtering
 */
export async function listNotes(req, res, next) {
  try {
    const { search, group, subGroup, status, sortBy = 'name', sortOrder = 'asc' } = req.query
    const where = {}
    
    // Status filter
    if (status) {
      where.status = status === 'true' ? true : status === 'false' ? false : status
    }
    
    // Group filter
    if (group) {
      where.groupId = group
    }
    
    // Sub-Group filter
    if (subGroup) {
      where.subGroupId = subGroup
    }
    
    // Enhanced search across multiple fields
    if (search) {
      const searchTerms = [
        { name: { contains: search } },
        { slug: { contains: search } },
        { examples: { contains: search } },
        { keywords: { contains: search } },
        { description: { contains: search } }
      ]
      
      // Search in group name and code
      searchTerms.push({
        group: {
          OR: [
            { groupName: { contains: search } },
            { groupCode: { contains: search } }
          ]
        }
      })
      
      // Search in sub-group name and code
      searchTerms.push({
        subGroup: {
          OR: [
            { subGroupName: { contains: search } },
            { subGroupCode: { contains: search } }
          ]
        }
      })
      
      where.OR = searchTerms
    }
    
    const notes = await prisma.fragranceNote.findMany({
      where,
      include: { 
        _count: { select: { productNotes: true } },
        group: { select: { id: true, groupCode: true, groupName: true } },
        subGroup: { select: { id: true, subGroupCode: true, subGroupName: true } }
      },
      orderBy: { [sortBy]: sortOrder }
    })
    res.json({ success: true, data: notes })
  } catch (error) {
    next(error)
  }
}

/**
 * GET /api/notes/:id
 * Get a single note
 */
export async function getNote(req, res, next) {
  try {
    const { id } = req.params
    const note = await prisma.fragranceNote.findUnique({
      where: { id },
      include: { productNotes: { include: { product: { select: { id: true, name: true } } } } }
    })
    if (!note) throw new ApiError(404, 'Fragrance note not found')
    res.json({ success: true, data: note })
  } catch (error) {
    next(error)
  }
}

/**
 * POST /api/notes
 * Create a new fragrance note with Group/Sub-Group support
 */
export async function createNote(req, res, next) {
  try {
    const { name, slug, description, imageUrl, imageKey, groupId, subGroupId, examples, color, status, keywords } = req.body
    if (!name || !slug) throw new ApiError(400, 'Name and slug are required')

    // Check for duplicate slug
    const existingSlug = await prisma.fragranceNote.findUnique({ where: { slug } })
    if (existingSlug) throw new ApiError(400, 'A note with this slug already exists')
    
    // Check for duplicate name (case-insensitive)
    const existingName = await prisma.fragranceNote.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } }
    })
    if (existingName) throw new ApiError(400, 'A note with this name already exists')

    // Validate group/sub-group relationship if both provided
    if (groupId && subGroupId) {
      const subGroup = await prisma.perfumeNoteSubGroup.findUnique({
        where: { id: subGroupId }
      })
      if (!subGroup) throw new ApiError(400, 'Sub-group not found')
      if (subGroup.groupId !== groupId) throw new ApiError(400, 'Sub-group does not belong to the selected group')
    }

    const note = await prisma.fragranceNote.create({
      data: { 
        name, 
        slug, 
        description, 
        imageUrl, 
        imageKey,
        groupId: groupId || null,
        subGroupId: subGroupId || null,
        examples: examples || null,
        color: color || null,
        status: status || 'active',
        keywords: keywords || null
      },
      include: {
        group: { select: { id: true, groupCode: true, groupName: true } },
        subGroup: { select: { id: true, subGroupCode: true, subGroupName: true } }
      }
    })
    res.status(201).json({ success: true, data: note })
  } catch (error) {
    next(error)
  }
}

/**
 * PUT /api/notes/:id
 * Update a fragrance note with Group/Sub-Group support
 */
export async function updateNote(req, res, next) {
  try {
    const { id } = req.params
    const { 
      name, slug, description, imageUrl, imageKey, 
      groupId, subGroupId, examples, color, status, keywords 
    } = req.body

    const existing = await prisma.fragranceNote.findUnique({ 
      where: { id },
      include: { group: true, subGroup: true }
    })
    if (!existing) throw new ApiError(404, 'Fragrance note not found')

    // Check slug uniqueness if changing
    if (slug && slug !== existing.slug) {
      const slugExists = await prisma.fragranceNote.findUnique({ where: { slug } })
      if (slugExists) throw new ApiError(400, 'A note with this slug already exists')
    }
    
    // Check name uniqueness if changing (case-insensitive)
    if (name && name !== existing.name) {
      const nameExists = await prisma.fragranceNote.findFirst({
        where: { 
          id: { not: id },
          name: { equals: name, mode: 'insensitive' }
        }
      })
      if (nameExists) throw new ApiError(400, 'A note with this name already exists')
    }
    
    // Validate group/sub-group relationship if both provided
    if (groupId && subGroupId && subGroupId !== existing.subGroupId) {
      const subGroup = await prisma.perfumeNoteSubGroup.findUnique({
        where: { id: subGroupId }
      })
      if (!subGroup) throw new ApiError(400, 'Sub-group not found')
      if (subGroup.groupId !== groupId) throw new ApiError(400, 'Sub-group does not belong to the selected group')
    }
    
    // If subGroupId changed but groupId not provided, get subGroup's group
    let finalGroupId = groupId
    if (subGroupId && !groupId && subGroupId !== existing?.subGroupId) {
      const subGroup = await prisma.perfumeNoteSubGroup.findUnique({
        where: { id: subGroupId }
      })
      if (subGroup) finalGroupId = subGroup.groupId
    }

    const note = await prisma.fragranceNote.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(slug && { slug }),
        ...(description !== undefined && { description }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(imageKey !== undefined && { imageKey }),
        ...(groupId !== undefined && { groupId: groupId || null }),
        ...(subGroupId !== undefined && { subGroupId: subGroupId || null }),
        ...(examples !== undefined && { examples }),
        ...(color !== undefined && { color }),
        ...(status !== undefined && { status }),
        ...(keywords !== undefined && { keywords })
      },
      include: {
        group: { select: { id: true, groupCode: true, groupName: true } },
        subGroup: { select: { id: true, subGroupCode: true, subGroupName: true } }
      }
    })
    res.json({ success: true, data: note })
  } catch (error) {
    next(error)
  }
}

/**
 * DELETE /api/notes/:id
 * Delete a fragrance note
 */
export async function deleteNote(req, res, next) {
  try {
    const { id } = req.params
    const existing = await prisma.fragranceNote.findUnique({ where: { id } })
    if (!existing) throw new ApiError(404, 'Fragrance note not found')

    await prisma.fragranceNote.delete({ where: { id } })
    res.json({ success: true, message: 'Fragrance note deleted successfully' })
  } catch (error) {
    next(error)
  }
}