CREATE TYPE "OrderStatus_new" AS ENUM ('PLACED', 'CANCELLED');
ALTER TABLE "Order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Order"
  ALTER COLUMN "status" TYPE "OrderStatus_new"
  USING (
    CASE
      WHEN "status"::text IN ('PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED') THEN 'PLACED'
      ELSE 'CANCELLED'
    END::"OrderStatus_new"
  );
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'PLACED';
DROP TYPE "OrderStatus";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";

CREATE TYPE "PaymentStatus_new" AS ENUM ('UNPAID', 'PAID');
ALTER TABLE "Payment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Payment"
  ALTER COLUMN "status" TYPE "PaymentStatus_new"
  USING (
    CASE
      WHEN "status"::text = 'COMPLETED' THEN 'PAID'
      ELSE 'UNPAID'
    END::"PaymentStatus_new"
  );
ALTER TABLE "Payment" ALTER COLUMN "status" SET DEFAULT 'UNPAID';
DROP TYPE "PaymentStatus";
ALTER TYPE "PaymentStatus_new" RENAME TO "PaymentStatus";

DROP INDEX IF EXISTS "Payment_razorpayOrderId_key";
DROP INDEX IF EXISTS "Payment_transactionId_key";

ALTER TABLE "Payment"
  DROP COLUMN IF EXISTS "method",
  DROP COLUMN IF EXISTS "razorpayOrderId",
  DROP COLUMN IF EXISTS "transactionId";

DROP TYPE IF EXISTS "PaymentMethod";
