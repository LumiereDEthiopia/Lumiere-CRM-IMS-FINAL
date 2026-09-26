-- Direct Sales, Discounts & Free Gifts — smallest safe additive migration.
-- Rules honoured here (see DATABASE_PERSISTENCE.md / PRODUCTION_DEPLOYMENT.md):
--   * ADD COLUMN only — nothing is dropped, renamed, truncated or rewritten.
--   * Every new column has a DEFAULT (or is nullable), so ALL existing rows
--     remain valid and untouched: saleType='DIRECT', itemType='NORMAL',
--     isFreeGift=false, discount counters 0, taxable/paid/change = NULL.
--   * No existing production data is modified in any way.

-- AlterTable (Sale)
ALTER TABLE "Sale" ADD COLUMN "saleType" TEXT NOT NULL DEFAULT 'DIRECT';
ALTER TABLE "Sale" ADD COLUMN "discountType" TEXT;
ALTER TABLE "Sale" ADD COLUMN "discountValue" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "Sale" ADD COLUMN "taxableAmount" DECIMAL(65,30);
ALTER TABLE "Sale" ADD COLUMN "paidAmount" DECIMAL(65,30);
ALTER TABLE "Sale" ADD COLUMN "changeAmount" DECIMAL(65,30);

-- AlterTable (saleitem — table name mapped via @@map("saleitem"))
ALTER TABLE "saleitem" ADD COLUMN "itemType" TEXT NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "saleitem" ADD COLUMN "isFreeGift" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "saleitem" ADD COLUMN "regularUnitPrice" DECIMAL(65,30);
ALTER TABLE "saleitem" ADD COLUMN "discountType" TEXT;
ALTER TABLE "saleitem" ADD COLUMN "discountValue" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "saleitem" ADD COLUMN "discountAmount" DECIMAL(65,30) NOT NULL DEFAULT 0;
