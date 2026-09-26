# Customer TIN Verification (Ethiopian eTrade)

## Overview

Cashiers can type an Ethiopian Tax Identification Number (TIN) and have the
registered business name retrieved automatically from the official Ministry of
Trade & Regional Integration system:

**https://etrade.gov.et/business-license-checker**

The verified name is filled into the customer name field, a **✓ TIN Verified**
status is shown, and the TIN + verified name are stored on the customer and on
the sale/invoice.

## How the integration talks to eTrade

The checker page is a single-page app that loads its results from a public JSON
endpoint. We call that same endpoint **server-side**:

```
GET {ETRADE_BASE_URL}/api/Registration/GetRegistrationInfoByTin/{tin}/{lang}
```

| Aspect | Behaviour |
| --- | --- |
| Method | Plain HTTPS `GET`, no credentials, no cookies, no API key |
| Referer | The request sends the checker page as `Referer`. eTrade rejects other referers with **HTTP 417**, so this mirrors exactly what the official page sends |
| Authentication | None required — this is the public license-checker API |
| CAPTCHA / access controls | **Never bypassed.** There is no CAPTCHA on this endpoint, and no anti-bot protection is circumvented. Only the public data the government page itself displays is read |
| Scraping | None. We parse the documented JSON response, not the HTML page |
| Rate | Deliberately low volume, one lookup per TIN, cached (see below) |

### TLS note

`etrade.gov.et` serves an **incomplete certificate chain** (the intermediate CA
is omitted), which makes Node/OpenSSL fail with
`UNABLE_TO_VERIFY_LEAF_SIGNATURE`. TLS verification is **not** disabled — the
official issuing CA is pinned in `server/certs/etrade-chain.pem` and merged with
Node's bundled trust store. Refresh it whenever eTrade renews its certificate:

```bash
cd server
node scripts/refresh-etrade-cert.mjs
```

## Architecture

```
Cashier Browser (React)
      │  POST /api/tin/verify   (session token, existing auth system)
      ▼
CRM Backend (Express)  ── rate limit + cache + circuit breaker (any signed-in role)
      │  GET .../GetRegistrationInfoByTin/{tin}/en   (Referer: checker page)
      ▼
Official eTrade Business License Checker (etrade.gov.et)
      │  JSON payload (found) / empty body (not registered)
      ▼
CRM Backend  ── strips base64 photos, caches result, writes audit log
      ▼
Cashier Browser  ── shows ✓ TIN Verified + registered name
```

The browser never contacts eTrade directly, and no upstream host name, TLS
detail or raw error message is returned to it.

## API contract

`POST /api/tin/verify`

```json
{ "tin": "0092183201", "customerId": "optional-customer-id", "forceRefresh": false }
```

Verified:

```json
{
  "success": true, "verified": true, "tin": "0092183201",
  "name": "BLUESKILL TECHNOLOGY PLC",
  "license": { "licenseNumber": "KK/AA/14/706/11560537/2017", "renewedTo": "7/7/2025" },
  "source": "ETRADE", "cached": false, "message": null,
  "existingCustomer": { "id": "...", "customerCode": "CUST-0013", "name": "BLUESKILL TECHNOLOGY PLC" },
  "linkedCustomer": null
}
```

Not registered:

```json
{ "success": true, "verified": false, "tin": "0092183201", "name": null, "message": "TIN not found" }
```

eTrade unreachable (HTTP error, timeout, connection reset, unexpected payload):

```json
{ "success": false, "verified": false, "tin": "0092183201", "name": null,
  "retryable": true, "message": "Unable to verify TIN right now. Please try again." }
```

Other status codes:

| Code | Meaning |
| --- | --- |
| `400` | TIN missing or not exactly 10 digits (validated before any lookup) |
| `401` | No/invalid session token |
| `403` | Signed in, but the role lacks `sale:create` / `customer:create` / `customer:edit` |
| `429` | Rate limit exceeded (`TIN_VERIFY_RATE_LIMIT_MAX` per minute per IP, default 12) |

## Security & safety

- Endpoint sits behind the application's existing `authenticate` middleware
  (`server/src/routes/index.js`) plus `requireAnyPermission(...)` so only
  staff who sell or maintain customers can spend the shared government service.
- Per-IP, per-minute rate limiting keeps one cashier from flooding eTrade.
- All input is sanitized server-side (`sanitizeTin` strips non-digits) and the
  format is validated **before** any upstream request.
- 10 second request timeout, plus a circuit breaker: after
  `ETRADE_MAX_CONSECUTIVE_FAILURES` consecutive upstream failures the service is
  skipped for `ETRADE_CIRCUIT_OPEN_MS` so cashiers keep working.
- eTrade's payload contains base64 manager photos (`AssociateShortInfos`); these
  are never stored, returned or logged.
- Audit log entries (`TIN_VERIFIED`, `TIN_NOT_FOUND`, `TIN_VERIFY_UNAVAILABLE`,
  `CUSTOMER_TIN_VERIFIED`) record the TIN, the outcome, the source and the
  duration — no upstream payloads, credentials or photos.

## Customer & sales integration

### Customer records (`server/src/services/customerService.js`)

- `Customer.tinNumber` already existed — it is reused, not duplicated.
- On create/update the TIN is validated and checked against existing customers.
  If another customer already holds the TIN the API returns **409** naming that
  customer, so duplicate records are never created.
- If a cached eTrade verification exists for the TIN, the new/updated customer is
  marked verified immediately (`tinVerified`, `tinVerifiedAt`, `tinVerificationSource`).
- `markCustomerVerified()` stores the government name as the authoritative
  verified name and logs the previous name to the audit trail, so an admin can
  still correct customer details afterwards.

### Sales / invoices (`server/src/services/saleService.js`)

- `POST /api/sales` accepts an optional `customerTin`.
- `resolveSaleTin()` validates it and resolves the authoritative name **only** from
  the verified customer record or the verification cache — never from the client
  payload, so a cashier cannot type a fake "verified" name.
- The sale stores `customerTin`, `customerTinName`, `customerTinVerified`.
- When a customer is selected the sale links to that existing customer
  (`customerId`); a walk-in sale with a verified TIN keeps the TIN + name snapshot
  without creating a customer.
- The receipt (`client/src/components/Receipt.jsx`) and sale detail page print the
  TIN with a ✓ Verified marker and the verified name.

## Database

Migration: `server/prisma/migrations/20260915120000_add_tin_verification/migration.sql`

| Model | Field | Purpose |
| --- | --- | --- |
| `Customer` | `tinNumber` *(existing)* | The TIN itself |
| `Customer` | `tinVerified` | Verified against eTrade |
| `Customer` | `tinVerifiedAt` | When it was verified |
| `Customer` | `tinVerificationSource` | `ETRADE` |
| `Sale` | `customerTin` | TIN snapshot on the invoice |
| `Sale` | `customerTinName` | Verified name snapshot |
| `Sale` | `customerTinVerified` | Whether the TIN was verified |
| `TinVerificationCache` | `tin`, `verified`, `name`, `licenseNumber`, `licenseValidTo`, `source`, `checkedAt`, `lookupCount` | Result cache; positive entries live `ETRADE_CACHE_TTL_HOURS` (default 72 h), negative entries 1 h. Unique on `tin` |

Apply it with:

```bash
npm run db:migrate          # development (prisma migrate dev)
npm run db:deploy           # production (prisma migrate deploy)
npm run db:generate         # regenerate the Prisma client
```

## Configuration

All variables are optional; defaults live in `server/src/config/index.js`
(documented in `server/.env.example`).

| Variable | Default | Purpose |
| --- | --- | --- |
| `ETRADE_BASE_URL` | `https://etrade.gov.et` | Government host |
| `ETRADE_CHECKER_PATH` | `/api/Registration/GetRegistrationInfoByTin` | Public lookup endpoint |
| `ETRADE_CHECKER_REFERER` | `https://etrade.gov.et/business-license-checker` | Required Referer (HTTP 417 otherwise) |
| `ETRADE_LANGUAGE` | `en` | Response language |
| `ETRADE_TIMEOUT_MS` | `10000` | Hard upstream timeout |
| `ETRADE_CACHE_TTL_HOURS` | `72` | Positive cache lifetime |
| `ETRADE_MAX_CONSECUTIVE_FAILURES` | `3` | Failures before the circuit opens |
| `ETRADE_CIRCUIT_OPEN_MS` | `30000` | How long the circuit stays open |
| `ETRADE_EXTRA_CA_FILE` | `./certs/etrade-chain.pem` | Pinned issuing CA |
| `TIN_VERIFY_RATE_LIMIT_MAX` | `12` | Verifications per minute per IP |

No secrets are required and nothing is exposed to the browser.

## Frontend

- `client/src/components/TinVerifier.jsx` — reusable widget: **Verify TIN**
  button, optional auto-verify at 10 digits, loading state, green ✓ success, red
  not-found, orange "unable to verify" with a **Retry** button, disabled button
  while a request is running, and cashier-friendly messages only.
- `client/src/pages/admin/NewSalePage.jsx` — verification in the Customer card
  and in the "Add Customer" modal; a verified TIN auto-fills the registered name,
  selects an existing customer holding the same TIN instead of duplicating it,
  and is sent with the sale.
- `client/src/pages/admin/CustomersPage.jsx` — verification inside the customer
  form plus a **TIN Status** column.

## Testing

```bash
cd server
npm run test:tin        # 44 assertions, boots a mock of the eTrade API
npm test                # stage 4 regression suite
```

The TIN suite covers: unauthenticated / invalid token / insufficient permission,
format validation, a valid TIN, caching (no duplicate upstream call), not found
(204 / empty body / missing business name), non-JSON response, HTTP 500,
connection reset, timeout (and that the timeout is actually honoured), duplicate
TIN rejection (409), verification linked to a customer, sales with a verified TIN
(customer + walk-in), unverified TIN snapshots, invalid TIN on a sale, and rate
limiting.

Live smoke test against the **real** government service (same code path the API
uses):

```bash
cd server
node scripts/live-verify-tin.mjs 0092183201            # uses the cache if fresh
node scripts/live-verify-tin.mjs 0092183201 --force    # always calls eTrade
```

Clear cached results (dev utility) — e.g. after a business updates its eTrade record:

```bash
cd server
node scripts/clear-tin-cache.mjs               # wipe the whole cache
node scripts/clear-tin-cache.mjs 0092183201    # or specific TINs
```

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `eTrade responded HTTP 417` | The `Referer` header is missing/incorrect (`ETRADE_CHECKER_REFERER`) |
| `UNABLE_TO_VERIFY_LEAF_SIGNATURE` | eTrade renewed its certificate — run `node scripts/refresh-etrade-cert.mjs`, then restart the API |
| "Unable to verify TIN right now" | Upstream slow/unavailable; the cashier can retry. Check `ETRADE_TIMEOUT_MS` and the circuit-breaker logs |
| `403 Insufficient permissions` | No longer expected — TIN verification is open to every signed-in role. If you still see it, an old server build is running: restart the API |
| `429` | Rate limit — wait a minute (`TIN_VERIFY_RATE_LIMIT_MAX`) |
| A correct TIN returns "not found" | The business is not registered/updated in eTrade; a TIN alone is not proof of registration |

## Limitations

- eTrade is the single source of truth: if a business is not registered there the
  app reports "TIN not found" and never invents a name.
- Availability depends entirely on the government service; the app degrades to a
  friendly retry message instead of breaking the sale.
- A registration without an active trade licence is reported as verified with a
  note ("no active trade license on record").
- No scraping, CAPTCHA or access-control circumvention is performed. If eTrade
  changes its public endpoint or requires credentials, the `ETRADE_*` settings and
  the service layer must be updated — and any non-public access would require
  written permission from the Ministry of Trade & Regional Integration.

