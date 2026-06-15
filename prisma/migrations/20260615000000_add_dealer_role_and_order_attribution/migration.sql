ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'DEALER';

ALTER TABLE "Order" ADD COLUMN "dealerId" TEXT;

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_dealerId_fkey"
  FOREIGN KEY ("dealerId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Order_dealerId_createdAt_idx" ON "Order"("dealerId", "createdAt");
