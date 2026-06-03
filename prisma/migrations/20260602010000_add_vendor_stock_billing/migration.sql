-- CreateEnum
CREATE TYPE "VendorStockEntryType" AS ENUM ('INITIAL', 'PURCHASE_BILL', 'MANUAL_UPDATE', 'ORDER_SOLD', 'ORDER_CANCELLED', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "VendorStockBill" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "companyId" TEXT,
    "billNo" TEXT NOT NULL,
    "billDate" TIMESTAMP(3) NOT NULL,
    "billAmount" DOUBLE PRECISION,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorStockBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorStockEntry" (
    "id" TEXT NOT NULL,
    "billId" TEXT,
    "productId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "companyId" TEXT,
    "orderId" TEXT,
    "type" "VendorStockEntryType" NOT NULL,
    "oldStock" INTEGER NOT NULL,
    "changeQty" INTEGER NOT NULL,
    "newStock" INTEGER NOT NULL,
    "previousRate" DOUBLE PRECISION,
    "rate" DOUBLE PRECISION,
    "notes" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorStockEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorStockBill_vendorId_billDate_idx" ON "VendorStockBill"("vendorId", "billDate");

-- CreateIndex
CREATE INDEX "VendorStockBill_companyId_billDate_idx" ON "VendorStockBill"("companyId", "billDate");

-- CreateIndex
CREATE UNIQUE INDEX "VendorStockBill_vendorId_billNo_billDate_key" ON "VendorStockBill"("vendorId", "billNo", "billDate");

-- CreateIndex
CREATE INDEX "VendorStockEntry_productId_vendorId_createdAt_idx" ON "VendorStockEntry"("productId", "vendorId", "createdAt");

-- CreateIndex
CREATE INDEX "VendorStockEntry_vendorId_createdAt_idx" ON "VendorStockEntry"("vendorId", "createdAt");

-- CreateIndex
CREATE INDEX "VendorStockEntry_billId_idx" ON "VendorStockEntry"("billId");

-- CreateIndex
CREATE INDEX "VendorStockEntry_orderId_idx" ON "VendorStockEntry"("orderId");

-- AddForeignKey
ALTER TABLE "VendorStockBill" ADD CONSTRAINT "VendorStockBill_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorStockBill" ADD CONSTRAINT "VendorStockBill_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorStockBill" ADD CONSTRAINT "VendorStockBill_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorStockEntry" ADD CONSTRAINT "VendorStockEntry_billId_fkey" FOREIGN KEY ("billId") REFERENCES "VendorStockBill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorStockEntry" ADD CONSTRAINT "VendorStockEntry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorStockEntry" ADD CONSTRAINT "VendorStockEntry_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorStockEntry" ADD CONSTRAINT "VendorStockEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorStockEntry" ADD CONSTRAINT "VendorStockEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorStockEntry" ADD CONSTRAINT "VendorStockEntry_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
