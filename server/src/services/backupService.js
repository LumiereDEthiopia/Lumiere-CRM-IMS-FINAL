/**
 * Backup Service — create, list, health monitoring
 */
import { createReadStream, createWriteStream, unlinkSync, existsSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createHash, randomBytes, createCipheriv } from 'crypto'
import { promisify } from 'util'
import { pipeline } from 'stream'
import { execSync } from 'child_process'
import prisma from '../config/prisma.js'
import { createAuditLog } from './auditService.js'
import { createNotification } from './notificationService.js'

const pipelineAsync = promisify(pipeline)
const IV_LENGTH = 16

function getEncryptionKey() {
  const key = process.env.BACKUP_ENCRYPTION_KEY
  if (!key) return null
  return createHash('sha256').update(key).digest()
}

export { getEncryptionKey }

export async function createBackup() {
  const backupId = 'bak_' + Date.now() + '_' + randomBytes(4).toString('hex')
  const dbPath = process.env.DATABASE_URL?.replace('file:', '') || './prisma/dev.db'
  const absoluteDbPath = dbPath.startsWith('./') ? join(process.cwd(), dbPath) : dbPath
  const timestamp = new Date()

  let r2Mod
  try { r2Mod = await import('../config/r2.js') } catch { r2Mod = { isR2Ready: () => false, getR2Client: () => null, getBucketName: () => null } }

  if (!r2Mod.isR2Ready || !r2Mod.isR2Ready()) {
    await prisma.backupMetadata.create({ data: { backupId, status: 'FAILED', notes: 'R2 not configured', timestamp } })
    await createNotification({
      type: 'BACKUP_FAILED',
      title: 'Backup failed',
      message: 'R2 not configured',
      severity: 'CRITICAL',
      link: '/admin/backups'
    }).catch(() => {})
    return { success: false, message: 'R2 not configured', backupId }
  }

  const encKey = getEncryptionKey()
  if (!encKey) {
    await prisma.backupMetadata.create({ data: { backupId, status: 'FAILED', notes: 'No encryption key', timestamp } })
    await createNotification({
      type: 'BACKUP_FAILED',
      title: 'Backup failed',
      message: 'Encryption key not configured',
      severity: 'CRITICAL',
      link: '/admin/backups'
    }).catch(() => {})
    return { success: false, message: 'Encryption key not configured', backupId }
  }

  if (!existsSync(absoluteDbPath)) {
    await prisma.backupMetadata.create({ data: { backupId, status: 'FAILED', notes: 'Database file missing', timestamp } })
    return { success: false, message: 'Database file not found', backupId }
  }

  const dbSize = statSync(absoluteDbPath).size
  const tmpSnapshot = join(tmpdir(), backupId + '.db')
  const tmpCompressed = join(tmpdir(), backupId + '.db.gz')
  const tmpEncrypted = join(tmpdir(), backupId + '.db.gz.enc')

  try {
    const integrity = await prisma.$queryRawUnsafe('PRAGMA integrity_check')
    if (integrity[0]?.integrity_check !== 'ok') {
      await prisma.backupMetadata.create({ data: { backupId, status: 'FAILED', integrityStatus: 'FAILED', databaseSize: dbSize, timestamp } })
      return { success: false, message: 'Integrity check failed', backupId }
    }

    await prisma.$executeRawUnsafe("VACUUM INTO '" + tmpSnapshot.replace(/'/g, "''") + "'")

    // Prefer Node zlib if gzip CLI unavailable (Windows)
    try {
      execSync('gzip -c "' + tmpSnapshot + '" > "' + tmpCompressed + '"', { shell: true })
    } catch {
      const { createGzip } = await import('zlib')
      await pipelineAsync(createReadStream(tmpSnapshot), createGzip(), createWriteStream(tmpCompressed))
    }
    const compressedSize = statSync(tmpCompressed).size

    const iv = randomBytes(IV_LENGTH)
    const cipher = createCipheriv('aes-256-gcm', encKey, iv)
    await pipelineAsync(createReadStream(tmpCompressed), cipher, createWriteStream(tmpEncrypted))
    const authTag = cipher.getAuthTag()

    const finalPath = tmpEncrypted + '.final'
    const finalOut = createWriteStream(finalPath)
    finalOut.write(iv); finalOut.write(authTag)
    await pipelineAsync(createReadStream(tmpEncrypted), finalOut)
    const finalSize = statSync(finalPath).size

    const sha256 = createHash('sha256')
    await pipelineAsync(createReadStream(finalPath), sha256)
    const checksum = sha256.digest('hex')

    const { PutObjectCommand } = await import('@aws-sdk/client-s3')
    const r2Client = r2Mod.getR2Client()
    const bucketName = r2Mod.getBucketName()
    const objectKey = (process.env.BACKUP_PREFIX || 'backups/database/') + backupId + '.db.gz.enc'
    const fileBuffer = await new Promise((resolve, reject) => {
      const chunks = []
      createReadStream(finalPath).on('data', c => chunks.push(c)).on('end', () => resolve(Buffer.concat(chunks))).on('error', reject)
    })
    await r2Client.send(new PutObjectCommand({ Bucket: bucketName, Key: objectKey, Body: fileBuffer }))

    await prisma.backupMetadata.create({
      data: {
        backupId, status: 'SUCCESS', integrityStatus: 'PASSED', verificationStatus: 'VERIFIED',
        databaseSize: dbSize, compressedSize, encryptedSize: finalSize, sha256: checksum, objectKey, timestamp
      }
    })

    await createAuditLog({ action: 'BACKUP_CREATED', entity: 'Backup', entityId: backupId, details: { objectKey, size: finalSize } })
    return { success: true, backupId, objectKey, size: finalSize, sha256: checksum }
  } catch (error) {
    await prisma.backupMetadata.create({ data: { backupId, status: 'FAILED', databaseSize: dbSize, notes: error.message, timestamp } }).catch(() => {})
    await createNotification({
      type: 'BACKUP_FAILED',
      title: 'Backup failed',
      message: error.message,
      severity: 'CRITICAL',
      link: '/admin/backups'
    }).catch(() => {})
    return { success: false, message: error.message, backupId }
  } finally {
    for (const f of [tmpSnapshot, tmpCompressed, tmpEncrypted, tmpEncrypted + '.final']) {
      if (existsSync(f)) { try { unlinkSync(f) } catch {} }
    }
  }
}

export async function listBackups() {
  return prisma.backupMetadata.findMany({ orderBy: { timestamp: 'desc' }, take: 50 })
}

export async function getBackupHealth() {
  const [lastSuccess, lastFailed, totalSuccess, totalFailed] = await Promise.all([
    prisma.backupMetadata.findFirst({ where: { status: 'SUCCESS' }, orderBy: { timestamp: 'desc' } }),
    prisma.backupMetadata.findFirst({ where: { status: 'FAILED' }, orderBy: { timestamp: 'desc' } }),
    prisma.backupMetadata.count({ where: { status: 'SUCCESS' } }),
    prisma.backupMetadata.count({ where: { status: 'FAILED' } })
  ])

  let r2Ready = false
  try { const m = await import('../config/r2.js'); r2Ready = m.isR2Ready && m.isR2Ready() } catch {}

  const enabled = process.env.BACKUP_ENABLED === 'true'
  const intervalHours = parseInt(process.env.BACKUP_INTERVAL_HOURS || '6')
  const backupAgeMs = lastSuccess ? Date.now() - new Date(lastSuccess.timestamp).getTime() : null
  const backupAgeHours = backupAgeMs != null ? Math.round(backupAgeMs / 3600000 * 10) / 10 : null
  const nextBackup = lastSuccess
    ? new Date(new Date(lastSuccess.timestamp).getTime() + intervalHours * 3600000)
    : (enabled ? new Date() : null)

  const overdue = enabled && (!lastSuccess || (backupAgeMs != null && backupAgeMs > intervalHours * 3600000 * 1.5))
  const healthy = enabled
    ? !!(r2Ready && getEncryptionKey() && lastSuccess && !overdue && lastSuccess.verificationStatus !== 'FAILED')
    : true

  return {
    enabled,
    lastSuccess: lastSuccess?.timestamp || null,
    lastFailure: lastFailed?.timestamp || null,
    nextBackup,
    backupAge: backupAgeHours,
    backupCount: totalSuccess,
    failedCount: totalFailed,
    healthy,
    overdue,
    r2Status: r2Ready ? 'available' : 'unavailable',
    verificationStatus: lastSuccess?.verificationStatus || 'UNKNOWN',
    integrityStatus: lastSuccess?.integrityStatus || 'UNKNOWN',
    lastSuccessfulSize: lastSuccess?.encryptedSize || null,
    encryptionConfigured: !!getEncryptionKey()
  }
}

export async function createPreRestoreBackup() {
  const backupId = 'pre_' + Date.now() + '_' + randomBytes(4).toString('hex')
  const dbPath = process.env.DATABASE_URL?.replace('file:', '') || './prisma/dev.db'
  const absoluteDbPath = dbPath.startsWith('./') ? join(process.cwd(), dbPath) : dbPath
  const timestamp = new Date()

  let r2Mod
  try { r2Mod = await import('../config/r2.js') } catch { r2Mod = { isR2Ready: () => false, getR2Client: () => null, getBucketName: () => null } }

  if (!r2Mod.isR2Ready || !r2Mod.isR2Ready()) {
    await prisma.backupMetadata.create({ data: { backupId, status: 'FAILED', notes: 'R2 not configured for pre-restore backup', timestamp } })
    return { success: false, message: 'R2 not configured — cannot create pre-restore safety backup', backupId }
  }

  const encKey = getEncryptionKey()
  if (!encKey) {
    await prisma.backupMetadata.create({ data: { backupId, status: 'FAILED', notes: 'No encryption key for pre-restore backup', timestamp } })
    return { success: false, message: 'Encryption key not configured — cannot create pre-restore safety backup', backupId }
  }

  if (!existsSync(absoluteDbPath)) {
    await prisma.backupMetadata.create({ data: { backupId, status: 'FAILED', notes: 'Database file missing for pre-restore backup', timestamp } })
    return { success: false, message: 'Database file not found', backupId }
  }

  const dbSize = statSync(absoluteDbPath).size
  const tmpSnapshot = join(tmpdir(), backupId + '.db')
  const tmpCompressed = join(tmpdir(), backupId + '.db.gz')
  const tmpEncrypted = join(tmpdir(), backupId + '.db.gz.enc')

  try {
    const integrity = await prisma.$queryRawUnsafe('PRAGMA integrity_check')
    if (integrity[0]?.integrity_check !== 'ok') {
      await prisma.backupMetadata.create({ data: { backupId, status: 'FAILED', integrityStatus: 'FAILED', databaseSize: dbSize, timestamp, notes: 'Pre-restore: integrity check failed' } })
      return { success: false, message: 'Integrity check failed — aborting pre-restore backup', backupId }
    }

    await prisma.$executeRawUnsafe("VACUUM INTO '" + tmpSnapshot.replace(/'/g, "''") + "'")

    try {
      execSync('gzip -c "' + tmpSnapshot + '" > "' + tmpCompressed + '"', { shell: true })
    } catch {
      const { createGzip } = await import('zlib')
      await pipelineAsync(createReadStream(tmpSnapshot), createGzip(), createWriteStream(tmpCompressed))
    }

    const compressedSize = statSync(tmpCompressed).size
    const iv = randomBytes(IV_LENGTH)
    const cipher = createCipheriv('aes-256-gcm', encKey, iv)
    const readStream = createReadStream(tmpCompressed)
    const writeStream = createWriteStream(tmpEncrypted)
    const cipherChunks = []
    readStream.on('data', c => cipherChunks.push(c))
    await new Promise((resolve, reject) => {
      readStream.on('end', () => {
        const encrypted = Buffer.concat(cipherChunks)
        const out = Buffer.alloc(encrypted.length + cipher.final.length + iv.length + 16)
        iv.copy(out, 0)
        cipher.update(encrypted).copy(out, iv.length)
        cipher.final().copy(out, iv.length + encrypted.length)
        cipher.getAuthTag().copy(out, iv.length + encrypted.length + cipher.final.length)
        require('fs').writeFileSync(tmpEncrypted, out)
        resolve()
      })
      readStream.on('error', reject)
    })

    const finalSize = statSync(tmpEncrypted).size
    const fileBuffer = await new Promise((resolve, reject) => {
      const chunks = []
      createReadStream(tmpEncrypted).on('data', c => chunks.push(c)).on('end', () => resolve(Buffer.concat(chunks))).on('error', reject)
    })

    const bucketName = r2Mod.getBucketName()
    const r2Client = r2Mod.getR2Client()
    const objectKey = process.env.BACKUP_PREFIX + 'pre-restore/' + backupId + '.db.gz.enc'

    const { PutObjectCommand } = await import('@aws-sdk/client-s3')
    await r2Client.send(new PutObjectCommand({ Bucket: bucketName, Key: objectKey, Body: fileBuffer }))

    const checksum = createHash('sha256').update(fileBuffer).digest('hex')

    await prisma.backupMetadata.create({
      data: {
        backupId, status: 'SUCCESS', integrityStatus: 'PASSED', verificationStatus: 'VERIFIED',
        databaseSize: dbSize, compressedSize, encryptedSize: finalSize, sha256: checksum, objectKey, timestamp,
        notes: 'Pre-restore safety backup'
      }
    })

    await createAuditLog({ action: 'BACKUP_PRE_RESTORE', entity: 'Backup', entityId: backupId, details: { objectKey, size: finalSize, purpose: 'pre-restore-safety' } })

    return { success: true, backupId, objectKey, size: finalSize, sha256: checksum, message: 'Pre-restore safety backup created' }
  } catch (error) {
    await prisma.backupMetadata.create({ data: { backupId, status: 'FAILED', databaseSize: dbSize, notes: error.message, timestamp } }).catch(() => {})
    await createNotification({
      type: 'BACKUP_FAILED',
      title: 'Pre-restore backup failed',
      message: error.message,
      severity: 'CRITICAL',
      link: '/admin/backups'
    }).catch(() => {})
    return { success: false, message: error.message, backupId }
  } finally {
    for (const f of [tmpSnapshot, tmpCompressed, tmpEncrypted]) {
      if (existsSync(f)) { try { unlinkSync(f) } catch {} }
    }
  }
}

export async function restoreBackup(backupId, userId, ipAddress) {
  const metadata = await prisma.backupMetadata.findUnique({ where: { backupId } })
  if (!metadata) throw new Error('Backup not found: ' + backupId)
  if (metadata.status !== 'SUCCESS') throw new Error('Backup is not in SUCCESS state: ' + metadata.status)
  if (metadata.verificationStatus === 'FAILED') throw new Error('Backup verification failed — cannot restore')

  const dbPath = process.env.DATABASE_URL?.replace('file:', '') || './prisma/dev.db'
  const absoluteDbPath = dbPath.startsWith('./') ? join(process.cwd(), dbPath) : dbPath

  let r2Mod
  try { r2Mod = await import('../config/r2.js') } catch { r2Mod = { isR2Ready: () => false, getR2Client: () => null, getBucketName: () => null } }

  if (!r2Mod.isR2Ready || !r2Mod.isR2Ready()) {
    throw new Error('R2 not configured — cannot download backup')
  }

  const encKey = getEncryptionKey()
  if (!encKey) throw new Error('Encryption key not configured — cannot decrypt backup')

  const r2Client = r2Mod.getR2Client()
  const bucketName = r2Mod.getBucketName()
  const objectKey = metadata.objectKey
  if (!objectKey) throw new Error('Backup has no object key — cannot download')

  const tmpDownloaded = join(tmpdir(), backupId + '.db.gz.enc')
  const tmpDecrypted = join(tmpdir(), backupId + '.db.gz')
  const tmpDecompressed = join(tmpdir(), backupId + '.db')

  try {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3')
    const response = await r2Client.send(new GetObjectCommand({ Bucket: bucketName, Key: objectKey }))
    const chunks = []
    for await (const chunk of response.Body) {
      chunks.push(Buffer.from(chunk))
    }
    const downloadedBuffer = Buffer.concat(chunks)

    const downloadedHash = createHash('sha256').update(downloadedBuffer).digest('hex')
    if (downloadedHash !== metadata.sha256) {
      await prisma.backupMetadata.update({ where: { backupId }, data: { verificationStatus: 'FAILED' } }).catch(() => {})
      throw new Error('Checksum mismatch: expected ' + metadata.sha256 + ', got ' + downloadedHash)
    }

    require('fs').writeFileSync(tmpDownloaded, downloadedBuffer)

    const encryptedBuffer = require('fs').readFileSync(tmpDownloaded)
    const iv = encryptedBuffer.subarray(0, IV_LENGTH)
    const authTag = encryptedBuffer.subarray(encryptedBuffer.length - 16)
    const ciphertext = encryptedBuffer.subarray(IV_LENGTH, encryptedBuffer.length - 16)
    const decipher = createCipheriv('aes-256-gcm', encKey, iv)
    decipher.setAuthTag(authTag)
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    require('fs').writeFileSync(tmpDecrypted, decrypted)

    const { createGunzip } = await import('zlib')
    await pipelineAsync(createReadStream(tmpDecrypted), createGunzip(), createWriteStream(tmpDecompressed))

    const integrity = await prisma.$queryRawUnsafe('PRAGMA integrity_check')
    if (integrity[0]?.integrity_check !== 'ok') {
      throw new Error('Integrity check failed on restored database')
    }

    const { PrismaClient } = await import('@prisma/client')
    const verifyPrisma = new PrismaClient()
    await verifyPrisma.$connect()
    const tableCheck = await verifyPrisma.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table' AND name='BackupMetadata'")
    if (!tableCheck || tableCheck.length === 0) {
      await verifyPrisma.$disconnect()
      throw new Error('Schema validation failed — BackupMetadata table missing')
    }
    await verifyPrisma.$disconnect()

    await prisma.setting.upsert({
      where: { key: 'maintenance_mode' },
      update: { value: 'true' },
      create: { key: 'maintenance_mode', value: 'true', type: 'boolean' }
    })

    const currentDbBackup = absoluteDbPath + '.pre-restore-' + Date.now() + '.bak'
    if (existsSync(absoluteDbPath)) {
      require('fs').copyFileSync(absoluteDbPath, currentDbBackup)
    }
    require('fs').copyFileSync(tmpDecompressed, absoluteDbPath)

    await prisma.$disconnect()
    const newPrisma = new PrismaClient()
    await newPrisma.$connect()

    const verify = await newPrisma.$queryRawUnsafe('SELECT 1')
    if (!verify || verify[0]?.['1'] !== 1) {
      await newPrisma.$disconnect()
      throw new Error('Post-restore verification failed — database not accessible')
    }

    await newPrisma.setting.update({ where: { key: 'maintenance_mode' }, data: { value: 'false' } })

    await newPrisma.auditLog.create({
      data: {
        userId: userId || null,
        action: 'DATABASE_RESTORED',
        entity: 'Database',
        entityId: backupId,
        details: JSON.stringify({
          backupId,
          objectKey,
          restoredSize: statSync(tmpDecompressed).size,
          checksum: downloadedHash,
          previousDbBackup: currentDbBackup
        }),
        ipAddress: ipAddress || null
      }
    })

    await createNotification({
      type: 'BACKUP_RESTORED',
      title: 'Database restored successfully',
      message: 'Database restored from backup ' + backupId,
      severity: 'INFO',
      link: '/admin/backups'
    }).catch(() => {})

    for (const f of [tmpDownloaded, tmpDecrypted, tmpDecompressed]) {
      if (existsSync(f)) { try { unlinkSync(f) } catch {} }
    }

    await newPrisma.backupMetadata.update({
      where: { backupId },
      data: { verificationStatus: 'RESTORED', notes: 'Database restored successfully' }
    })

    await newPrisma.$disconnect()

    return {
      success: true,
      message: 'Database restored successfully',
      backupId,
      restoredSize: statSync(tmpDecompressed).size,
      checksum: downloadedHash,
      previousBackupPath: currentDbBackup
    }
  } catch (error) {
    try {
      await prisma.setting.update({ where: { key: 'maintenance_mode' }, data: { value: 'false' } }).catch(() => {})
    } catch {}

    await createNotification({
      type: 'BACKUP_RESTORE_FAILED',
      title: 'Database restore failed',
      message: error.message,
      severity: 'CRITICAL',
      link: '/admin/backups'
    }).catch(() => {})

    await createAuditLog({
      action: 'DATABASE_RESTORE_FAILED',
      entity: 'Database',
      entityId: backupId,
      details: { error: error.message },
      ipAddress: ipAddress || null
    })

    for (const f of [tmpDownloaded, tmpDecrypted, tmpDecompressed]) {
      if (existsSync(f)) { try { unlinkSync(f) } catch {} }
    }

    throw error
  }
}

export async function getMaintenanceMode() {
  const setting = await prisma.setting.findUnique({ where: { key: 'maintenance_mode' } })
  return { enabled: setting?.value === 'true', updatedAt: setting?.updatedAt || null }
}

export async function setMaintenanceMode(enabled, userId, ipAddress) {
  const value = enabled ? 'true' : 'false'
  const setting = await prisma.setting.upsert({
    where: { key: 'maintenance_mode' },
    update: { value },
    create: { key: 'maintenance_mode', value, type: 'boolean' }
  })
  await createAuditLog({
    action: enabled ? 'MAINTENANCE_ENABLED' : 'MAINTENANCE_DISABLED',
    entity: 'System',
    entityId: 'maintenance_mode',
    details: { enabled },
    userId: userId || null,
    ipAddress: ipAddress || null
  })
  return { enabled, updatedAt: setting.updatedAt }
}

export default { createBackup, listBackups, getBackupHealth, createPreRestoreBackup, restoreBackup, getMaintenanceMode, setMaintenanceMode }
