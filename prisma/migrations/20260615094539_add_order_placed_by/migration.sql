-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "placedById" TEXT,
ADD COLUMN     "placedByRole" "Role";

-- CreateIndex
CREATE INDEX "Order_placedById_createdAt_idx" ON "Order"("placedById", "createdAt");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_placedById_fkey" FOREIGN KEY ("placedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
