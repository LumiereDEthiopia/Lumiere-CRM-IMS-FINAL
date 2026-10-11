import assert from 'node:assert/strict'
import { createRole, updateRole, deleteRole, setRoleControllerPrismaForTests } from '../src/controllers/roleController.js'
import { requirePermission, setAuthorizePrismaForTests } from '../src/middleware/authorize.js'
import { activeSessions } from '../src/services/authService.js'

let passed = 0
async function check(name, fn) {
  try { await fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (error) { console.error(`  FAIL  ${name}\n        ${error.stack || error}`); process.exitCode = 1 }
}

const response = () => ({ statusCode: 200, body: null, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } })
async function callController(handler, req) {
  const res = response()
  let error = null
  await handler(req, res, (value) => { error = value || null })
  return { res, error }
}

console.log('Account roles security acceptance tests\n')

await check('Role create rejects non-Super-Admin even when the request claims setting:manage', async () => {
  let roleLookups = 0
  setRoleControllerPrismaForTests({
    user: { findUnique: async () => ({ isActive: true, role: { name: 'STAFF' } }) },
    permission: { findMany: async () => [] },
    role: { findUnique: async () => { roleLookups++; return null } }
  })
  const { error } = await callController(createRole, { user: { userId: 'u1', role: 'STAFF', permissions: ['setting:manage'] }, body: { name: 'EVIL', permissions: [] } })
  assert.equal(error?.statusCode, 403)
  assert.equal(roleLookups, 0)
})

await check('Role create rejects an attempt to grant setting:manage to a custom role', async () => {
  setRoleControllerPrismaForTests({
    user: { findUnique: async () => ({ isActive: true, role: { name: 'SUPER_ADMIN' } }) },
    permission: { findMany: async () => [{ id: 'p1', name: 'setting:manage' }] },
    role: { findUnique: async () => null, create: async () => { throw new Error('must not create') } }
  })
  const { error } = await callController(createRole, { user: { userId: 'root', role: 'SUPER_ADMIN' }, body: { name: 'Custom', permissions: ['setting:manage'] } })
  assert.equal(error?.statusCode, 403)
})

await check('Built-in ADMIN role cannot be weakened or edited', async () => {
  setRoleControllerPrismaForTests({
    user: { findUnique: async () => ({ isActive: true, role: { name: 'SUPER_ADMIN' } }) },
    role: { findUnique: async () => ({ id: 'admin-id', name: 'ADMIN' }), update: async () => { throw new Error('must not update') } }
  })
  const { error } = await callController(updateRole, { user: { userId: 'root', role: 'SUPER_ADMIN' }, params: { id: 'admin-id' }, body: { permissions: [] } })
  assert.equal(error?.statusCode, 400)
})

await check('Protected role cannot be deleted while assigned, and remains stored', async () => {
  let deleted = false
  setRoleControllerPrismaForTests({
    user: { findUnique: async () => ({ isActive: true, role: { name: 'SUPER_ADMIN' } }) },
    role: { findUnique: async () => ({ id: 'custom-id', name: 'CUSTOM', _count: { users: 2 } }), delete: async () => { deleted = true } }
  })
  const { error } = await callController(deleteRole, { user: { userId: 'root', role: 'SUPER_ADMIN' }, params: { id: 'custom-id' } })
  assert.equal(error?.statusCode, 400)
  assert.equal(deleted, false)
})

await check('Backend permission middleware refreshes stale grants from persisted role', async () => {
  const token = 'test-role-security-token'
  activeSessions.set(token, { userId: 'u2', role: 'SUPER_ADMIN', permissions: ['financial:view'], createdAt: new Date() })
  setAuthorizePrismaForTests({ user: { findUnique: async () => ({ id: 'u2', isActive: true, role: { name: 'SALES', permissions: [{ name: 'sale:view' }] } }) } })
  let error = null
  await requirePermission('financial:view')({ token, user: { role: 'SUPER_ADMIN', permissions: ['*'] } }, {}, (value) => { error = value || null })
  assert.equal(error?.statusCode, 403)
  assert.equal(activeSessions.get(token).role, 'SALES')
  assert.deepEqual(activeSessions.get(token).permissions, ['sale:view'])
  setAuthorizePrismaForTests(null)
  activeSessions.delete(token)
})

setRoleControllerPrismaForTests(null)
setAuthorizePrismaForTests(null)
console.log(`\n${passed} checks passed${process.exitCode ? ' — with failures' : ''}`)
