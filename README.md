# Lumière Perfume — Business Management System

Internal perfume business management platform (inventory, CRM, employees, sales, purchasing, analytics).

This is **not** an e-commerce storefront. There is no shopping cart, checkout, or online payment gateway.

## Stack

- **Frontend:** React 18 + Vite + React Router
- **Backend:** Node.js + Express
- **Database:** SQLite + Prisma
- **Storage:** Cloudflare R2 (S3-compatible)
- **Auth:** Session tokens + RBAC permissions

## Architecture

```
INVENTORY          CRM              EMPLOYEES
Products           Customers        Employees
Brands             Interactions     Departments
Categories         Tasks            Locations
Accords / Notes    Tags / History   Documents
Suppliers / Purchases / Sales / Transfers / Adjustments
                │
         MANAGEMENT SYSTEM
    Dashboard · Reports · Analytics
         Auth + RBAC + Audit
           Backup + R2
```

## Stages

| Stage | Focus |
|------|------|
| 1 | Foundation & product catalog |
| 2 | Inventory + CRM + employees |
| 3 | Production frontend + authentication |
| 4 | Hardening + BI + export/import + notifications + backup monitoring |
| 5–7 | Automation, deployment scaling, enterprise (planned) |

## Quick start

### Server

```bash
cd server
npm install
npx prisma generate
npx prisma migrate deploy
node seed-permissions.cjs   # roles/permissions + admin user + MAIN location
npm run seed                # catalog: categories, brands, products, accords, notes
npm run seed:demo           # demo operations: suppliers, customers, employees, sales...
npm run dev
```

Default admin (after permission seed): `admin@lumiere.com` / `admin123`

`npm run seed:demo` is idempotent and safe to re-run — it resets the demo
operational data (sales, purchases, transfers, inventory, tasks, notifications)
to a consistent state with fully reconciled stock movements.

### Client

```bash
cd client
npm install
npm run dev
```

Set `VITE_API_URL` only if the API is served from a **different origin** than the
client (e.g. a separate production domain). By default the client calls `/api`
on its own origin: in development the Vite dev server proxies `/api` to
`http://localhost:3001`, so the app also works from phones/tablets on the same
network (e.g. `http://<PC-IP>:5173`).

## Deploy (on `git push`)

A push to `main` deploys one Node service that serves **both** the API and the built
client (see [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) and `railway.json`):

```bash
npm run build   # installs server/ + client/, runs prisma generate, builds client/dist
npm start       # -> node server/src/app.js   (listens on $PORT)
```

- Platform health check path: `/api/health`
- `DATABASE_URL` is provided by the host — deploys **never** migrate, seed, reset or
  repoint the database.
- The client needs no configuration: it calls `/api` on its own origin, exactly like
  the Vite dev proxy does locally. Set `VITE_API_URL` only when the client is hosted
  on a **different** origin than the API (see `client/.env.example`).

## Key docs

- [STAGE_4.md](./STAGE_4.md) — Stage 4 features & APIs
- [STAGE_4_AUDIT.md](./STAGE_4_AUDIT.md) — pre-implementation audit
- [DATABASE_PERSISTENCE.md](./DATABASE_PERSISTENCE.md) — SQLite production volume rules
- [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) — deploy / rollback / DR
- [docs/DISASTER_RECOVERY.md](./docs/DISASTER_RECOVERY.md)
- [docs/EMPLOYEE_MANAGEMENT.md](./docs/EMPLOYEE_MANAGEMENT.md)
- [docs/TIN_VERIFICATION.md](./docs/TIN_VERIFICATION.md) — Ethiopian eTrade customer TIN verification

## Health

- `GET /api/health`
- `GET /api/health/database`
- `GET /api/backups/health` (authenticated)

## Tests

```bash
cd server
npm start   # terminal 1
npm test    # terminal 2
```
