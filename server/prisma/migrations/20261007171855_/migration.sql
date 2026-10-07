-- DropForeignKey
ALTER TABLE "PerfumeNoteSubGroup" DROP CONSTRAINT "PerfumeNoteSubGroup_groupId_fkey";

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "soldByEmployeeId" TEXT;

-- AlterTable
ALTER TABLE "product" ADD COLUMN     "flavor" TEXT,
ADD COLUMN     "form" TEXT,
ADD COLUMN     "pureOilProductId" TEXT;

-- CreateIndex
CREATE INDEX "FragranceNote_status_idx" ON "FragranceNote"("status");

-- CreateIndex
CREATE INDEX "PerfumeNoteGroup_groupCode_idx" ON "PerfumeNoteGroup"("groupCode");

-- CreateIndex
CREATE INDEX "PerfumeNoteGroup_sortOrder_idx" ON "PerfumeNoteGroup"("sortOrder");

-- CreateIndex
CREATE INDEX "PerfumeNoteSubGroup_subGroupCode_idx" ON "PerfumeNoteSubGroup"("subGroupCode");

-- CreateIndex
CREATE INDEX "PerfumeNoteSubGroup_sortOrder_idx" ON "PerfumeNoteSubGroup"("sortOrder");

-- CreateIndex
CREATE INDEX "Sale_soldByEmployeeId_idx" ON "Sale"("soldByEmployeeId");

-- CreateIndex
CREATE INDEX "product_productType_idx" ON "product"("productType");

-- CreateIndex
CREATE INDEX "product_flavor_idx" ON "product"("flavor");

-- CreateIndex
CREATE INDEX "product_form_idx" ON "product"("form");

-- CreateIndex
CREATE INDEX "product_pureOilProductId_idx" ON "product"("pureOilProductId");

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_pureOilProductId_fkey" FOREIGN KEY ("pureOilProductId") REFERENCES "product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_soldByEmployeeId_fkey" FOREIGN KEY ("soldByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerfumeNoteSubGroup" ADD CONSTRAINT "PerfumeNoteSubGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PerfumeNoteGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
