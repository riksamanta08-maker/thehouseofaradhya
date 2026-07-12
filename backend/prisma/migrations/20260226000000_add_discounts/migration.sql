DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'DiscountType' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "DiscountType" AS ENUM ('FLAT', 'PERCENTAGE');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Discount" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "type" "DiscountType" NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "minSubtotal" DECIMAL(10,2),
    "maxDiscount" DECIMAL(10,2),
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Discount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Discount_code_key" ON "Discount"("code");
CREATE INDEX IF NOT EXISTS "Discount_code_idx" ON "Discount"("code");
CREATE INDEX IF NOT EXISTS "Discount_isActive_idx" ON "Discount"("isActive");
CREATE INDEX IF NOT EXISTS "Discount_startsAt_endsAt_idx" ON "Discount"("startsAt", "endsAt");
