/**
 * Role & Permission Controller — Professional ERP role management
 * Provides the role/permission catalog, job-role templates, and CRUD used by
 * Settings → Account Roles. Only the trusted Super Admin session can grant
 * or revoke permissions through the checkbox permission matrix.
 */
import prismaClient from '../config/prisma.js'
import { ApiError } from '../middleware/errorHandler.js'
import { createAuditLog } from '../services/auditService.js'
import { activeSessions } from '../services/authService.js'

let prisma = prismaClient
export function setRoleControllerPrismaForTests(client) { prisma = client || prismaClient }

/**
 * Permission catalog grouped by business module.
 * Each entry: [permissionName, human description]
 */
const PERMISSION_CATALOG = {
  Products: [
    ['product:view', 'View products'],
    ['product:create', 'Create products'],
    ['product:edit', 'Edit products']
  ],
  Sales: [
    ['sale:view', 'View sales'],
    ['sale:create', 'Create sales'],
    ['sale:cancel', 'Cancel / return sales'],
    ['sale:discount', 'Approve discounts above the configured POS limit'],
    ['sale:free_gift', 'Issue free-gift (promotional) items at the POS']
  ],
  Purchases: [
    ['purchase:view', 'View purchases'],
    ['purchase:create', 'Create purchase orders'],
    ['purchase:receive', 'Receive purchase stock']
  ],
  Inventory: [
    ['inventory:view', 'View inventory'],
    ['inventory:adjust', 'Adjust stock'],
    ['inventory:transfer', 'Transfer stock between locations']
  ],
  Customers: [
    ['customer:view', 'View customers'],
    ['customer:create', 'Create customers'],
    ['customer:edit', 'Edit customers']
  ],
  Employees: [
    ['employee:view', 'View employees'],
    ['employee:create', 'Create employees'],
    ['employee:edit', 'Edit employees'],
    ['employee:delete', 'Delete employees'],
    ['employee:view_sensitive', 'View sensitive employee data']
  ],
  Payroll: [
    ['payroll:view', 'View payroll & salary payments'],
    ['payroll:create', 'Create payroll payment records'],
    ['payroll:edit', 'Edit payroll payment records'],
    ['payroll:process', 'Confirm salary payments as paid & manage payroll rules']
  ],
  'Reports & Finance': [
    ['report:view', 'View reports & analytics'],
    ['financial:view', 'View financial / cost data'],
    ['intelligence:view', 'View executive intelligence']
  ],
  Settings: [
    ['setting:manage', 'Manage system settings & roles'],
    ['recommendations:manage', 'Manage recommendations']
  ],
  Backups: [
    ['backup:manage', 'Create & manage backups'],
    ['backups:restore', 'Restore backups']
  ],
  'Data Tools': [
    ['data:export', 'Export data'],
    ['data:import', 'Import data']
  ],
  Notifications: [
    ['notification:view', 'View notifications']
  ],
  System: [
    ['system:view', 'View system status'],
    ['system:maintenance', 'Run system maintenance']
  ]
}

const ALL_PERMISSIONS = Object.values(PERMISSION_CATALOG).flat().map(([name]) => name)

/**
 * Built-in job-role templates (professional ERP role hierarchy).
 * `builtin` roles cannot be deleted; SUPER_ADMIN cannot be modified.
 */
const ROLE_TEMPLATES = {
  SUPER_ADMIN: {
    description: 'Full system access — owns every module including settings, roles, backups, restore and maintenance.',
    permissions: ALL_PERMISSIONS
  },
  ADMIN: {
    description: 'Administrator — manages products, sales, purchases, customers, employees, reports and settings, but cannot restore backups.',
    permissions: ALL_PERMISSIONS.filter((p) => p !== 'backups:restore')
  },
  CEO: {
    description: 'Chief Executive Officer — full executive oversight across every business area for decision-making.',
    permissions: ALL_PERMISSIONS
  },
  GENERAL_MANAGER: {
    description: 'General Manager — runs day-to-day operations across sales, purchasing, inventory, customers and reporting.',
    permissions: [
      'product:view', 'product:create', 'product:edit',
      'sale:view', 'sale:create', 'sale:cancel',
      'purchase:view', 'purchase:create', 'purchase:receive',
      'inventory:view', 'inventory:adjust', 'inventory:transfer',
      'customer:view', 'customer:create', 'customer:edit',
      'employee:view', 'employee:view_sensitive',
      'payroll:view', 'payroll:create', 'payroll:edit', 'payroll:process',
      'report:view', 'financial:view', 'intelligence:view',
      'notification:view', 'data:export', 'recommendations:manage'
    ]
  },
  ACCOUNTING_FINANCE: {
    description: 'Accounting & Finance — manages the books: sales, purchases, financial reports, cost data and exports.',
    permissions: [
      'sale:view', 'purchase:view',
      'customer:view', 'employee:view', 'employee:view_sensitive',
      'payroll:view', 'payroll:create', 'payroll:edit', 'payroll:process',
      'report:view', 'financial:view',
      'data:export', 'notification:view'
    ]
  },
  PURCHASING_STORE: {
    description: 'Purchasing & Store Manager — controls purchases, receiving and store stock levels.',
    permissions: [
      'product:view', 'product:create', 'product:edit',
      'purchase:view', 'purchase:create', 'purchase:receive',
      'inventory:view', 'inventory:adjust', 'inventory:transfer',
      'customer:view', 'notification:view', 'data:export'
    ]
  },
  SALES: {
    description: 'Sales — front counter sales, customer management and day-to-day selling.',
    permissions: [
      'product:view', 'sale:view', 'sale:create',
      'customer:view', 'customer:create', 'customer:edit',
      'report:view', 'notification:view'
    ]
  },
  INVENTORY: {
    description: 'Inventory / Warehouse — stock counts, adjustments and transfers.',
    permissions: [
      'product:view', 'inventory:view', 'inventory:adjust', 'inventory:transfer',
      'purchase:view', 'notification:view'
    ]
  },
  FREELANCER: {
    description: 'Freelancer / Guest — view-only access to products, sales, customers and notifications.',
    permissions: ['product:view', 'sale:view', 'customer:view', 'notification:view']
  }
}

const TEMPLATE_ORDER = Object.keys(ROLE_TEMPLATES)
/** Add missing permission catalog entries without modifying existing role access. */
async function ensurePermissionCatalog() {
  const permRows = await prisma.permission.findMany({ select: { id: true, name: true } })
  const existing = new Set(permRows.map((p) => p.name))
  for (const name of ALL_PERMISSIONS) {
    if (!existing.has(name)) {
      await prisma.permission.create({ data: { name } })
      existing.add(name)
    }
  }
}

async function requireSuperAdmin(req) {
  const tokenRole = req.user?.role
  const dbUser = req.user?.userId
    ? await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { isActive: true, role: { select: { name: true } } }
    })
    : null
  if (!dbUser?.isActive || dbUser.role?.name !== 'SUPER_ADMIN' || tokenRole !== 'SUPER_ADMIN') {
    throw new ApiError(403, 'Only an active Super Admin can manage account roles')
  }
}

function titleName(name) {
  const n = String(name || '')
  if (!n.includes('_') && n.length <= 4 && n === n.toUpperCase()) return n
  return n.toLowerCase().split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}
export async function listRoles(req, res, next) {
  try {
    if (!req.user?.userId) throw new ApiError(401, 'Authentication required')
    await ensurePermissionCatalog()
    const roles = await prisma.role.findMany({
      include: {
        permissions: { select: { name: true } },
        users: { select: { id: true, name: true, isActive: true }, orderBy: { name: 'asc' } },
        _count: { select: { users: true } }
      },
      orderBy: { name: 'asc' }
    })
    const data = roles
      .map((r) => ({
        id: r.id,
        name: r.name,
        label: titleName(r.name),
        description: r.description || '',
        permissions: r.permissions.map((p) => p.name).sort(),
        isBuiltin: TEMPLATE_ORDER.includes(r.name),
        sortOrder: TEMPLATE_ORDER.includes(r.name) ? TEMPLATE_ORDER.indexOf(r.name) : 999,
        userCount: r._count.users,
        users: r.users
      }))
      .sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name))
    res.json({ success: true, data })
  } catch (e) { next(e) }
}

export async function listRolePermissions(req, res, next) {
  try {
    if (!req.user?.userId) throw new ApiError(401, 'Authentication required')
    const exist = await prisma.permission.findMany({ select: { name: true } })
    const names = new Set(exist.map((p) => p.name))
    const modules = Object.entries(PERMISSION_CATALOG).map(([module, perms]) => ({
      module,
      permissions: perms.filter(([name]) => names.has(name)).map(([name, description]) => ({ name, description, exists: true }))
    }))
    res.json({ success: true, data: { modules } })
  } catch (e) { next(e) }
}
export async function createRole(req, res, next) {
  try {
    await requireSuperAdmin(req)
    const existingPermissionNames = new Set((await prisma.permission.findMany({ select: { name: true } })).map((permission) => permission.name))
    const name = String(req.body?.name || '').trim().toUpperCase().replace(/\s+/g, '_')
    if (name.length < 3) throw new ApiError(400, 'Role name is required (min 3 characters)')
    if (TEMPLATE_ORDER.includes(name)) throw new ApiError(409, `"${name}" is a built-in role`)
    const exists = await prisma.role.findUnique({ where: { name } })
    if (exists) throw new ApiError(409, `A role named "${titleName(name)}" already exists`)

    const permNames = Array.isArray(req.body?.permissions) ? [...new Set(req.body.permissions)] : []
    if (permNames.some((permission) => !existingPermissionNames.has(permission))) throw new ApiError(400, 'One or more permissions are not recognized')
    const perms = await prisma.permission.findMany({ where: { name: { in: permNames } }, select: { id: true, name: true } })
    if (perms.length !== permNames.length) throw new ApiError(400, 'One or more permissions are not recognized')
    if (perms.some((permission) => permission.name === 'setting:manage' || permission.name === 'backups:restore')) {
      throw new ApiError(403, 'Custom roles cannot receive Super Admin-only permissions')
    }
    const role = await prisma.role.create({
      data: {
        name,
        description: String(req.body?.description || '').trim() || `${titleName(name)} system role`,
        permissions: { connect: perms.map((p) => ({ id: p.id })) }
      }
    })
    await createAuditLog({
      userId: req.user?.userId, action: 'ROLE_CREATE', entity: 'Role', entityId: role.id,
      details: { name: role.name, permissions: permNames }
    }).catch(() => {})
    res.status(201).json({ success: true, data: role })
  } catch (e) { next(e) }
}

export async function updateRole(req, res, next) {
  try {
    await requireSuperAdmin(req)
    const role = await prisma.role.findUnique({ where: { id: req.params.id } })
    if (!role) throw new ApiError(404, 'Role not found')
    if (TEMPLATE_ORDER.includes(role.name)) throw new ApiError(400, `The protected ${titleName(role.name)} role cannot be modified`)

    const data = {}
    if (req.body?.description !== undefined) data.description = String(req.body.description).trim()
    if (Array.isArray(req.body?.permissions)) {
      const permNames = [...new Set(req.body.permissions)]
      const perms = await prisma.permission.findMany({ where: { name: { in: permNames } }, select: { id: true, name: true } })
      if (perms.length !== permNames.length) throw new ApiError(400, 'One or more permissions are not recognized')
      if (perms.some((permission) => permission.name === 'setting:manage' || permission.name === 'backups:restore')) throw new ApiError(403, 'Only protected system roles may hold these elevated permissions')
      data.permissions = { set: perms.map((p) => ({ id: p.id })) }
    }
    const updated = await prisma.role.update({
      where: { id: role.id },
      data,
      include: { permissions: { select: { name: true } } }
    })

    // Refresh sessions from the persisted assignment; changing role access
    // must affect existing sessions immediately, including revocations.
    for (const session of activeSessions.values()) {
      const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { roleId: true } })
      if (user?.roleId === role.id) session.permissions = updated.permissions.map((permission) => permission.name)
    }

    await createAuditLog({
      userId: req.user?.userId, action: 'ROLE_PERMISSIONS_UPDATE', entity: 'Role', entityId: role.id,
      details: { name: role.name, permissions: updated.permissions.map((p) => p.name) }
    }).catch(() => {})
    res.json({ success: true, data: updated })
  } catch (e) { next(e) }
}

export async function deleteRole(req, res, next) {
  try {
    await requireSuperAdmin(req)
    const role = await prisma.role.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { users: true } } }
    })
    if (!role) throw new ApiError(404, 'Role not found')
    if (TEMPLATE_ORDER.includes(role.name)) throw new ApiError(400, `The "${titleName(role.name)}" role is built-in and cannot be deleted`)
    if (role._count.users > 0) throw new ApiError(400, `Role is assigned to ${role._count.users} account(s) and cannot be deleted`)
    await prisma.role.delete({ where: { id: role.id } })
    await createAuditLog({
      userId: req.user?.userId, action: 'ROLE_DELETE', entity: 'Role', entityId: role.id,
      details: { name: role.name }
    }).catch(() => {})
    res.json({ success: true, data: { id: role.id } })
  } catch (e) { next(e) }
}
