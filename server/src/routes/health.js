/**
 * Health Check Routes
 */
import { Router } from 'express'
import { existsSync, accessSync, constants, statSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import prisma from '../config/prisma.js'

// Prisma resolves relative SQLite paths (e.g. "file:./dev.db") against the
// directory that contains schema.prisma — so resolve the health check the same way.
const PRISMA_DIR = fileURLToPath(new URL('../../prisma/', import.meta.url))

const router = Router()

router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  })
})

router.get('/database', async (req, res) => {
  try {
    const dbUrl = process.env.DATABASE_URL || ''
    const dbPath = dbUrl.replace(/^file:/, '')
    const absolutePath = dbPath.startsWith('./') || dbPath.startsWith('.\\')
      ? join(PRISMA_DIR, dbPath)
      : dbPath

    let fileExists = false
    let writable = false
    let fileSize = null
    try {
      fileExists = existsSync(absolutePath)
      if (fileExists) {
        fileSize = statSync(absolutePath).size
        accessSync(absolutePath, constants.R_OK | constants.W_OK)
        writable = true
      }
    } catch {
      writable = false
    }

    await prisma.$queryRawUnsafe('SELECT 1')
    const integrity = await prisma.$queryRawUnsafe('PRAGMA integrity_check')
    const tables = await prisma.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    )
    const migrations = await prisma.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type='table' AND name = '_prisma_migrations'"
    ).catch(() => [])

    const requiredTables = ['User', 'Product', 'Inventory', 'Customer', 'Employee', 'Sale', 'Purchase', 'AuditLog', 'Setting']
    const tableNames = tables.map((t) => t.name)
    const missingTables = requiredTables.filter((t) => !tableNames.includes(t))

    const integrityOk = integrity[0]?.integrity_check === 'ok'
    const healthy = integrityOk && missingTables.length === 0 && fileExists

    // Persistence warning for production ephemeral paths
    const ephemeral =
      /\/tmp\//i.test(absolutePath) ||
      /\\Temp\\/i.test(absolutePath) ||
      absolutePath.includes('ephemeral')

    res.json({
      success: true,
      data: {
        status: healthy ? 'healthy' : 'unhealthy',
        connection: 'ok',
        prisma: 'ok',
        integrity: integrityOk ? 'ok' : integrity,
        tables: tableNames.length,
        missingTables,
        migrationsTable: migrations.length > 0,
        databaseFile: {
          configured: !!dbUrl,
          exists: fileExists,
          writable,
          size: fileSize,
          pathHint: process.env.NODE_ENV === 'production' ? absolutePath : undefined,
          ephemeralWarning: ephemeral
        },
        timestamp: new Date().toISOString()
      }
    })
  } catch (e) {
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      message: process.env.NODE_ENV === 'production' ? 'Database health check failed' : e.message
    })
  }
})

export { router as healthRouter }
