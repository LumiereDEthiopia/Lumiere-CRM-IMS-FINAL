# Production Deployment Guide

## 1. Environment variables

### Server

| Variable | Purpose |
|---|---|
| `PORT` | API port — the host injects this automatically |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | PostgreSQL connection string. Already configured in the host — **treat it as read-only: never repoint or recreate the live database to "test" a deploy.** |
| `CORS_ORIGIN` | Frontend origin(s), comma separated (only for a separately hosted client) |
| `SERVE_CLIENT` | `true` (default) — this service also serves the built client |
| `CLIENT_DIST` | Optional override for the client build folder |
| `PUBLIC_URL` | Optional — startup logs only |
| `TRUST_PROXY` | `false` to stop trusting `X-Forwarded-For` |
| `R2_ACCOUNT_ID` | Cloudflare account |
| `R2_ACCESS_KEY_ID` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret |
| `R2_BUCKET_NAME` | Bucket name |
| `R2_ENDPOINT` | S3-compatible endpoint |
| `R2_PUBLIC_URL` | Public CDN/base URL for public assets |
| `BACKUP_ENABLED` | `true` / `false` |
| `BACKUP_INTERVAL_HOURS` | e.g. `6` |
| `BACKUP_RETENTION_DAYS` | e.g. `30` |
| `BACKUP_PREFIX` | e.g. `backups/database/` |
| `BACKUP_ENCRYPTION_KEY` | min 32 chars |

### Client

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Backend public URL |

Never commit `.env` files or secrets.

## 2. Database (PostgreSQL)

The application runs on PostgreSQL (Prisma provider `postgresql`). The connection
string lives in the host's environment as `DATABASE_URL` and is already provisioned.

- No volume/mount is required — this is not the SQLite setup anymore.
- **Do not** repoint `DATABASE_URL`, run `migrate reset`, or seed over the live data
  to "make a deploy work". A deploy never needs to touch the database.
- Deploys only generate the Prisma *client* (`prisma generate`) — that writes code
  inside `node_modules`, never rows or schema.

Historical SQLite notes are kept in `DATABASE_PERSISTENCE.md` for reference only.

## 3. Prisma client & migrations

What happens on every deploy (automatic, database-safe):

```bash
npm install                      # root → installs server + client (see root postinstall)
# server postinstall runs:  prisma generate     (client code only — no DB access)
npm run build                    # builds client/dist, served by the API
npm start                        # → server: node src/app.js
```

What is **never** run automatically, and must be run deliberately by you when you
actually intend a schema change:

```bash
cd server
npx prisma validate
npx prisma migrate deploy        # manual step, only for a reviewed migration
node seed-permissions.cjs        # only when roles/permissions are missing
```

Do **not** run `migrate reset` or `db push` against production.

## 4. R2 setup

1. Create Cloudflare R2 bucket
2. Create API token with object read/write
3. Configure env vars above
4. Public images use public URL / signed access as designed
5. Employee documents remain private object keys

## 5. Backup configuration

```env
BACKUP_ENABLED=true
BACKUP_INTERVAL_HOURS=6
BACKUP_RETENTION_DAYS=30
BACKUP_ENCRYPTION_KEY=<long-random-secret>
```

Health check:

```bash
GET /api/backups/health
```

Does not expose credentials or encryption keys.

## 6. Deploy on git push

### Option A — one service (recommended, and what `railway.json` configures)

The API server also serves the built React client, so the app and the API share
one URL. Nothing in the client needs to know the server's address.

1. Connect the repository (root directory = repo root) to the service.
2. Build: `npm run build` → installs `server/` + `client/`, runs `prisma generate`
   inside `server/`, and produces `client/dist`.
3. Start: `npm start` → `npm --prefix server start` → `node src/app.js`.
4. Health check path: `/api/health`.
5. `DATABASE_URL` — already set in the host. Do not change it.
6. Optional: `NODE_ENV=production`.
7. Open the service URL — the app loads and calls `/api` on the same origin.

`railway.json` in the repo root already contains items 2–4, so a plain `git push`
redeploys correctly.

### Option B — split (client on Vercel + API elsewhere)

1. Deploy the API as in Option A but with `SERVE_CLIENT=false` (API only).
2. In the client host's build settings set the root directory to `client`
   (`client/vercel.json` already defines Vite + SPA routing).
3. Set the build-time variable `VITE_API_URL=https://<your-api-host>` **before**
   building. Without it the client calls `/api` on the frontend origin and every
   request fails.
4. On the API set `CORS_ORIGIN` to the frontend origin(s), e.g.
   `CORS_ORIGIN=https://lumiere-crm.vercel.app,https://*.vercel.app`.

### If you still see `502 Bad Gateway` after a push

502 means the platform could not reach a healthy process — it is never a database
problem and never fixed by touching data. Check, in order:

1. **Deploy logs** for a crash on boot (usually `@prisma/client did not initialize
   yet` → the client was not generated, or a missing env var).
2. **Start command** — `npm start` from the repo root must exist (`node src/app.js`
   under `server/`); a `Missing script: start` error produces exactly this 502.
3. **Port binding** — the server must listen on `process.env.PORT` (it does).
4. **Health check path** — `/api/health` (liveness), not `/api/health/database`.

## 7. Health checks

- `GET /api/health` — liveness; use this as the platform health check path
- `GET /api/health/database` — database diagnostics (read-only, returns `503` when
  the connection itself fails; it may report legacy file details on SQLite-era code)
- `GET /api/backups/health` (authenticated)

## 8. Rollback procedure

1. Stop new deploys
2. Redeploy previous application release
3. If schema migration was applied and incompatible, restore DB from latest verified R2 backup into a staging path first
4. Validate with `/api/health/database`
5. Cut over only after integrity checks pass

## 9. Disaster recovery

Follow `docs/DISASTER_RECOVERY.md`:

1. Create backup
2. Upload R2
3. Verify checksum
4. Download / decrypt / decompress on staging
5. SQLite integrity check
6. Restore into separate test database
7. Verify products, inventory, customers, employees, sales, purchases, audit logs

Never experiment on the live production database file.
