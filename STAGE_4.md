# STAGE 4 — Production Hardening + Business Intelligence

## Implemented features

### Advanced dashboard
- Aggregated business overview (products, inventory values, customers, employees, suppliers)
- Sales periods: today / week / month / year with totals, counts, averages
- Top products, brands, locations
- Purchasing summary and top suppliers
- CRM task/follow-up indicators
- Inventory alerts (out of stock, low stock, overstock)
- Backup health widget

### Business intelligence & reports
- `/admin/reports` — sales, inventory, CRM tabs
- Filters for sales date range and location
- CSV export + print-friendly view
- Product analytics at `/admin/products/:id/analytics`
- Employee analytics at `/admin/employees/analytics` (salary gated by `employee:view_sensitive`)
- CRM analytics API

### Global search
- `GET /api/search` and header search with debounce
- Products, customers, suppliers, employees, brands, categories, sales, purchases, transfers
- Permission-aware result shaping

### Notifications
- Notification model + APIs
- Types: LOW_STOCK, OUT_OF_STOCK, BACKUP_FAILED, BACKUP_OVERDUE, TASK_OVERDUE, etc.
- Header bell with unread count / mark read

### Import / export
- CSV/JSON exports for major entities (`data:export`)
- Controlled CSV import with preview + error blocking (`data:import`)
- Audit logging for import/export

### Inventory intelligence & integrity
- Low / out / overstock alerts (overstock multiplier from Settings)
- `GET /api/inventory/integrity`
- Safe repair for available quantity mismatches
- Stock movements track previous/resulting quantities

### Security hardening
- Helmet, CORS origin control, body size limits
- Auth rate limiting + API rate limiting
- Session TTL, timing-safe password compare
- Backend permission middleware
- Audit sanitization (no passwords/secrets)
- Login / logout / failed login auditing

### Backup monitoring
- Enhanced `GET /api/backups/health`
- Age, overdue, R2 status, verification status
- Failure notifications without deleting live DB
- Windows-safe compression fallback (zlib)

### Settings
- Business / inventory / notifications / backups / security sections
- Default settings seeded on first load
- Setting changes audited

### Frontend performance
- Route-level lazy loading
- Debounced search
- Loading / empty / error states on major Stage 4 pages

## API additions

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/search` | Global search |
| GET | `/api/reports/summary` | BI summary |
| GET | `/api/reports/sales` | Sales report |
| GET | `/api/reports/inventory` | Inventory report |
| GET | `/api/reports/crm` | CRM analytics |
| GET | `/api/reports/employees` | Employee analytics |
| GET | `/api/reports/products/:id` | Product analytics |
| GET | `/api/products/:id/analytics` | Product analytics |
| GET | `/api/employees/analytics` | Employee analytics |
| GET | `/api/inventory/integrity` | Integrity report |
| POST | `/api/inventory/integrity/repair` | Safe availableQty repair |
| GET | `/api/inventory/alerts` | Stock alerts |
| GET | `/api/exports/:type` | Data export |
| POST | `/api/exports/import/preview` | Import preview |
| POST | `/api/exports/import/confirm` | Import confirm |
| GET | `/api/notifications` | List notifications |
| PATCH | `/api/notifications/:id/read` | Mark read |
| PATCH | `/api/notifications/read-all` | Mark all read |
| POST | `/api/notifications/refresh` | Generate alerts |
| GET | `/api/backups/health` | Backup health |
| GET | `/api/health/database` | DB integrity/health |

## Database changes

Additive migration `20260911070000_stage4_notifications`:

- `Notification` table
- `StockMovement.previousQuantity`, `resultingQuantity`
- `AuditLog.ipAddress`
- Indexes for notification and stock movement userId

No destructive table drops.

## New permissions

- `data:export`
- `data:import`
- `notification:view`

## Testing

```bash
cd server
node tests/stage4.test.js
```

Requires server running with seeded admin:

`admin@lumiere.com` / `admin123`

## Documentation

- `DATABASE_PERSISTENCE.md`
- `PRODUCTION_DEPLOYMENT.md`
- `docs/DISASTER_RECOVERY.md`
- `STAGE_4_AUDIT.md`
