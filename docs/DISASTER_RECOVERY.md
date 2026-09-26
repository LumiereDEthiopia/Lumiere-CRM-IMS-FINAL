# Disaster Recovery

## Overview

This document describes the backup and recovery procedures for the Lumière business management system.

## Architecture

- **Live Database**: SQLite stored on persistent volume (`/data/perfume.db` in production)
- **Cloud Storage**: Cloudflare R2 for encrypted database backups
- **Backup Encryption**: AES-256-GCM with SHA-256 checksums

## Backup Process

### Automated Backups

1. **Integrity Check**: SQLite PRAGMA integrity_check
2. **Consistent Snapshot**: VACUUM INTO for consistent copy
3. **Compression**: gzip compression
4. **Encryption**: AES-256-GCM encryption
5. **Checksum**: SHA-256 hash verification
6. **Upload**: Encrypted backup uploaded to R2
7. **Verification**: R2 object verification
8. **Metadata**: Backup metadata saved to database
9. **Retention**: Old backups cleaned up per retention policy

### Backup Configuration

```env
BACKUP_ENABLED=true
BACKUP_INTERVAL_HOURS=6
BACKUP_RETENTION_DAYS=30
BACKUP_PREFIX=backups/database/
BACKUP_ENCRYPTION_KEY=<secure-key>
```

### Backup API Endpoints

- `POST /api/backups` - Create a new backup
- `GET /api/backups` - List all backups
- `GET /api/backups/health` - Check backup system health

## Restore Process

### Pre-Restore

1. Select backup from list
2. Verify backup metadata (checksum, size, status)
3. Create pre-restore backup of current database
4. If pre-restore backup fails: **ABORT**

### Restore Steps

1. Download encrypted backup from R2
2. Verify SHA-256 checksum
3. Decrypt with AES-256-GCM
4. Decompress with gunzip
5. Run integrity check on restored database
6. Validate schema compatibility
7. Enable maintenance mode
8. Atomically replace live database
9. Reconnect Prisma
10. Verify application functionality
11. Exit maintenance mode
12. Audit log the restore

### If Validation Fails

- DO NOT replace live database
- Keep previous valid backups
- Report failure for manual intervention

## Retention Policy

- Default: 30 days
- Never delete the newest valid backup
- If a new backup fails: keep previous valid backups
- Pre-restore backups stored separately

## Railway Production Setup

### Persistent Volume

```
/data -> persistent volume mount
DATABASE_URL=file:/data/perfume.db
```

### R2 Configuration

R2 stores:
- Product images
- Brand images
- Category images
- Employee images and documents
- Encrypted database backups

## Health Monitoring

- `GET /api/health` - Application health
- `GET /api/health/database` - Database integrity
- `GET /api/backups/health` - Backup system status

## Recovery Time Objective (RTO)

- Database restore: ~5-15 minutes (depending on size)
- Full system recovery: ~30 minutes

## Recovery Point Objective (RPO)

- Maximum data loss: 6 hours (with default backup interval)
- Recommended: 6 hours for production