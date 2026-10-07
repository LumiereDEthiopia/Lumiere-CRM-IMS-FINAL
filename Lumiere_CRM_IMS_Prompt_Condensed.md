# LUMIERE CRM & IMS — IMPLEMENTATION PROMPT

Enhance the EXISTING **Lumiere CRM & Inventory Management System** (`https://github.com/LumiereDEthiopia/Lumiere-CRM-IMS-FINAL-1.git`). Do NOT rebuild it, create a second CRM/inventory/POS, or redesign the UI. Extend the existing architecture, components, tables, forms, API patterns, validation, and design system.

## 1. Production Safety (non-negotiable)

This is the live production database with real data. Changes must be additive only.

- NEVER run `prisma migrate reset`, `prisma db push --force-reset`, `DROP DATABASE`, `DROP TABLE`, `TRUNCATE`, or destructive seeds (`deleteMany`). Never recreate the DB or seed it with fake data (use dev/staging for test data).
- NEVER delete or overwrite existing products, customers, employees, sales, purchases, inventory, stock movements, payments, invoices, users, permissions, settings, reports, or historical transactions.
- Before applying any migration: inspect the SQL, confirm no DROP/TRUNCATE/destructive rewrite, test on dev/staging first. If anything is uncertain, STOP and don't run it.
- Git: check branch, working tree, and recent commits first. Don't reset the branch, force-push, or delete unrelated code.
- Don't touch unrelated modules (CRM, customers, purchasing, finance, auth, permissions, settings).

## 2. Start by Inspecting

Before coding, inspect: repo structure, package.json, framework, DB config, schema/migrations, Product/inventory/sales/sales-item/employee/customer models, reports, receipts/invoices, product forms and lists, direct-sales workflow, inventory movement logic, API routes/server actions, validation. Don't assume the schema matches this prompt; adapt to the real one. Reuse equivalent existing fields instead of adding duplicates.

## 3. Product Types

Existing: Perfume, Pure Oil. Add **Musk** and **Cream/Jelly** by extending the existing Product model (no duplicate product tables). Conceptual types: `PERFUME`, `PURE_OIL`, `MUSK`, `CREAM`; Cream vs Jelly is a `form` field (`CREAM`/`JELLY`), not separate models.

Likely fields (adapt names): `productType, flavor, form, volumeMl, pureOilProductId, soldByEmployeeId`.

Product-management page: show category cards **PERFUME / PURE OIL / MUSK / CREAM/JELLY**, each filtering the list in the existing UI style. Don't break existing Perfume/Pure Oil filtering.

## 4. Musk

- Fields: name, SKU, flavor, volume, cost, selling price, quantity (plus stock value/status, timestamps).
- Volume is always **3 ml**: auto-displayed, not editable, enforced in the backend.
- **Flavor is a required free-text input** (not a fixed dropdown), saved to DB, editable, searchable, filterable, and shown in product lists/details, sales, receipts, and reports.
- Editing flavor must not delete/duplicate the product or rewrite historical transactions.
- Real stock via the existing inventory mechanism (e.g., 50 − sale of 2 = 48).
- Sales UI shows product, flavor, 3 ml, quantity, price, total (flavor comes from the selected product; use the real Product ID).

## 5. Cream/Jelly Registration

Staff enter: name, **form** (radio: Cream | Jelly), **size** (radio: 30 ml | 50 ml, backend-enforced), **Pure Oil**, cost, selling price, quantity.

- **Pure Oil selector**: searchable by code or name, pulling from the real Pure Oil products (no hardcoding, never create a new Pure Oil). After selection show code, name, and current stock from the DB.
- Store the stable `pureOilProductId`, not a name string.
- Show read-only consumption: 30 ml → "4 ml per unit", 50 ml → "6 ml per unit". Staff can't enter or override it.
- Suggested form order: type → name → form → size → Pure Oil → current stock → consumption → cost → price → quantity.
- Cannot save without a linked Pure Oil.

## 6. Automatic Pure Oil Consumption

Centralize the rule in backend/service logic only (**30 ml = 4 ml/unit, 50 ml = 6 ml/unit**); never scatter the numbers in frontend components. Total = quantity × rate (e.g., 5 × 30 ml = 20 ml; 5 × 50 ml = 30 ml).

On a Cream/Jelly sale, staff select only the product and quantity (never Pure Oil). The backend must:
1. Load the Cream/Jelly product → read size and linked Pure Oil ID → calculate consumption.
2. Validate Pure Oil stock.
3. In **one DB transaction**: create sale + sale item, update Cream/Jelly stock, deduct Pure Oil, create Pure Oil inventory movement, create audit record. Roll back on any failure.

Rules:
- Different Creams map to their own Pure Oils with no cross-deduction (2 × Cream A [30 ml → PO-001] + 3 × Cream B [50 ml → PO-002] = PO-001 −8 ml, PO-002 −18 ml).
- **Insufficient stock** (e.g., need 4 ml, have 3 ml): reject with a clear error showing required vs available; create no sale, no partial deduction, no stock update, no movement. No negative stock unless the existing system explicitly allows it.
- No double deduction: the frontend only sends the sale request; the backend is the single source of calculation.
- Each consumption creates a real inventory movement (where supported): product ID, quantity, type `CREAM_CONSUMPTION`, reason, related Cream product ID, related sale ID, user ID, timestamp. The audit trail must answer which oil, how much, why, which Cream/sale, when, and who.
- Pure Oil consumed by Cream/Jelly is **inventory consumption, not Pure Oil revenue**. It's part of the Cream/Jelly COGS.
- Cream/Jelly unit cost = base cost + cost of consumed Pure Oil (using the existing Pure Oil costing method; don't invent costs). Profit = revenue − actual COGS.

## 7. Sold By (Direct Sales)

Add a **Sold By** employee selector in New Sales → Direct Sales → Customer, pulling from the existing Employee module (prefer active employees). Store `soldByEmployeeId` (not just a name). Authorized admins may pick another employee as the salesperson; don't force the logged-in user. Don't rewrite or invent Sold By for historical sales.

## 8. Receipts

Add "Sold By: Employee Name" without breaking existing formatting.
- Musk: product name, flavor, 3 ml, quantity, unit price, total.
- Cream/Jelly: product name, form, size, quantity, unit price, total, Sold By (don't expose Pure Oil consumption unless the existing design requires it).

## 9. Reporting (real DB data only, no mock/hardcoded/frontend-only values)

Use proper DB aggregation/joins/grouping (avoid N+1 and loading huge datasets into the browser).

- **Sales**: totals, count, quantity, revenue, cost, profit, with date/customer/employee/product/type/payment method.
- **Inventory**: quantity, stock value, status, type, movements, adjustments (existing methodology).
- **Pure Oil**: separate direct Pure Oil sales (revenue) from Cream/Jelly consumption. Reconcile: Opening + Purchases + Stock In + Adjustments − Direct Sales − Cream/Jelly Consumption − Other Stock Outs/Adjustments = Current Stock (where supported).
- **Cream/Jelly consumption**: product, form, size, linked Pure Oil, units, rate per unit, total consumption.
- **Musk**: units, revenue, cost, profit, sales by flavor, stock by flavor, best-selling flavor.
- **Cream/Jelly**: Cream vs Jelly and 30 vs 50 ml sales, revenue, cost, profit, quantity, Pure Oil consumption.
- **Product type performance**: Perfume, Pure Oil, Musk, Cream, Jelly (keep Jelly as a form under Cream if that's the existing structure, but make it distinguishable). No double counting.
- **Salesperson**: employee, sales count, quantity, revenue, cost, profit.
- **Filters** (existing UI pattern): date range, product type, product, Musk flavor, Cream/Jelly form, size, Sold By, customer, payment method.
- **Search**: Musk by name/SKU/flavor/stock status; Cream/Jelly by name/SKU/form/size/linked Pure Oil/stock status; Pure Oil selector by code/name.

## 10. Data Model & Validation

- Use IDs (Product ID, Employee ID, Sale ID) for relationships, never display names.
- Historical transactions are never rewritten when configuration changes (e.g., Cream A relinked from PO-001 to PO-002 affects only future sales).
- **Backend validation**: Musk (name, flavor required, volume = 3, valid prices/quantity); Cream/Jelly (form CREAM|JELLY, volume 30|50, `pureOilProductId` required, valid prices/quantity); Pure Oil link (product exists, is actually Pure Oil, not Perfume/Musk/Cream; load real stock).
- Don't trust the frontend for price, product type, Pure Oil relationship, consumption amount, employee, or stock availability.
- Clear errors, e.g.: "Flavor is required for Musk products." / "Please select a Pure Oil product." / "Cream/Jelly size must be 30 ml or 50 ml." / "Insufficient Pure Oil stock. Required: 20 ml, Available: 12 ml." / "Selected product is not a valid Pure Oil product."

## 11. Quality Requirements

- Follow the existing design system; no unrelated redesign. Responsive on desktop, tablet, and mobile (no broken tables/forms).
- Respect existing authentication, authorization, and role permissions.
- Use the existing inventory architecture only; no second stock-calculation system. Stock, movements, sales, COGS, and reports must stay consistent.
- Pure Oil selector: server-side search/pagination per existing patterns.
- Must work end-to-end (UI → validation → API → business logic → DB → inventory → sales → reports → receipt), not just look right.

## 12. Implementation Order

1. Discovery → 2. Additive schema → 3. Product management (Musk, Cream/Jelly, cards, registration, edit, search/filter) → 4. Pure Oil relationship (selector, consumption rules) → 5. Inventory automation (calculation, validation, movements, transaction) → 6. Sales (Sold By, Musk, Cream/Jelly) → 7. Receipts → 8. Reporting → 9. Testing → 10. Build validation (use the project's real commands, e.g., lint, typecheck, test, build; don't invent any).

## 13. Tests (dev/staging only)

- **Musk**: create "Premium Musk / Oud Rose / 3 ml / qty 50"; verify saved, listed, flavor shown, edit works; sell 2 → stock 48; check movement, receipt, report, flavor filter.
- **Cream 30 ml**: PO-001 at 100 ml; sell 5 → consumption 20 ml, remaining 80 ml; verify sale, Cream stock, oil stock, movement, no double deduction, report.
- **Cream/Jelly 50 ml**: PO-001 at 100 ml; sell 5 → 30 ml consumed, 70 ml remaining.
- **Multiple oils**: 2 × Cream A (30 ml → PO-001) + 3 × Cream B (50 ml → PO-002) → −8 / −18, no cross-deduction.
- **Insufficient stock**: PO-001 at 3 ml, sell 1 × 30 ml → rejected, stock still 3 ml, no sale, no movement.
- **Sold By**: employee ID saved, name on receipt, appears in salesperson report, customer link intact.
- **Reports/revenue/cost**: 5 × 30 ml Cream shows exactly 20 ml consumption (not duplicated); consumption doesn't raise Pure Oil revenue; Cream/Jelly COGS includes oil cost.
- **Regression**: historical transactions unchanged; existing Perfume and Pure Oil creation, editing, sales, inventory, reports, and receipts still work.

## 14. Final Report Required

Don't just say "Done." Provide:
1. Files changed
2. Schema changes (fields, relations, enums, indexes, migration name)
3. Why the migration is safe (no records deleted)
4. How Cream/Jelly registration, Pure Oil mapping, and automatic deduction (30 → 4 ml, 50 → 6 ml, and where it's calculated) work
5. Musk (flavor, 3 ml, inventory, sales, reports, receipts)
6. Sold By (lookup, ID storage, receipt, reporting)
7. Inventory (deduction, movements, atomicity, insufficient-stock handling)
8. Reporting
9. Tests performed and results
10. Build checks (typecheck/lint/tests/build: PASS/FAIL, with failures explained)
11. Explicit confirmation: production data preserved; no reset, drops, truncates, or destructive seeds; Perfume/Pure Oil records and historical transactions preserved
12. Remaining issues (be honest; don't claim completion if anything required is broken)

## Final Instruction

Work carefully and incrementally. **Preserve first, extend second.** Inspect the real codebase, then make the smallest safe changes that satisfy this spec. Never reset or destroy the production database.
