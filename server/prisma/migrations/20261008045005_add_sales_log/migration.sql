-- CreateTable
CREATE TABLE "SaleLog" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "saleNumber" TEXT NOT NULL,
    "employeeId" TEXT,
    "employeeName" TEXT,
    "employeeCode" TEXT,
    "userId" TEXT,
    "userName" TEXT,
    "locationId" TEXT,
    "locationName" TEXT,
    "customerName" TEXT,
    "customerTin" TEXT,
    "totalAmount" DECIMAL(65,30) NOT NULL,
    "soldAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SaleLog_saleId_key" ON "SaleLog"("saleId");

-- CreateIndex
CREATE INDEX "SaleLog_saleId_idx" ON "SaleLog"("saleId");

-- CreateIndex
CREATE INDEX "SaleLog_employeeId_idx" ON "SaleLog"("employeeId");

-- CreateIndex
CREATE INDEX "SaleLog_locationId_idx" ON "SaleLog"("locationId");

-- CreateIndex
CREATE INDEX "SaleLog_soldAt_idx" ON "SaleLog"("soldAt");

-- CreateIndex
CREATE INDEX "SaleLog_createdAt_idx" ON "SaleLog"("createdAt");

-- AddForeignKey
ALTER TABLE "SaleLog" ADD CONSTRAINT "SaleLog_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
