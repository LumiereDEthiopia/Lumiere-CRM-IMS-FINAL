# Database Persistence (legacy SQLite notes)

> **The project now runs on PostgreSQL.** The connection string is provided by the
> host as `DATABASE_URL`; there is no database file and no volume to mount. Nothing
> in this document should be applied to the live database — deploys never migrate,
> seed, reset or repoint it. See [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md).

## Rule

SQLite must live on **persistent storage** in production. Never place the database on ephemeral/temporary filesystems.

## Recommended production DATABASE_URL

```env
DATABASE_URL=file:/data/perfume.db
```

On Railway / Render / Docker:

- Mount a persistent volume at `/data`
- Point `DATABASE_URL` to a file on that volume
- Do **not** use `/tmp`, container-local ephemeral disks, or paths that reset on redeploy

## Development

```env
DATABASE_URL="file:./dev.db"
```

## Safety checklist

- [ ] No startup script deletes the database
- [ ] No `prisma migrate reset` in production
- [ ] No destructive seed that wipes business data
- [ ] No automatic table recreation that drops existing tables
- [ ] Backups run to R2 before major migrations
- [ ] Health endpoint `/api/health/database` reports file existence + integrity

## Migrations

Safe production migration:

```bash
npx prisma migrate deploy
```

Never in production:

```bash
npx prisma migrate reset
```

## Backup interaction

If R2 backup upload fails:

- The live database must remain untouched
- Failure is recorded in `BackupMetadata`
- A `BACKUP_FAILED` notification is created

## Verification

```bash
curl http://localhost:3001/api/health/database
```

Expect `data.status: "healthy"` and `data.integrity: "ok"`.
