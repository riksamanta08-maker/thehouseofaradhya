DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'OrderStatus' AND e.enumlabel = 'CANCELLED'
  ) THEN
    ALTER TYPE "OrderStatus" ADD VALUE 'CANCELLED';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'OrderRequestType' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "OrderRequestType" AS ENUM ('CANCEL', 'RETURN', 'EXCHANGE');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'OrderRequestStatus' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "OrderRequestStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "OrderRequest" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "OrderRequestType" NOT NULL,
    "status" "OrderRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "items" JSONB,
    "reason" TEXT,
    "comments" TEXT,
    "attachments" JSONB,
    "bankDetails" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "OrderRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OrderRequest_orderId_idx" ON "OrderRequest"("orderId");

CREATE INDEX IF NOT EXISTS "OrderRequest_userId_type_idx" ON "OrderRequest"("userId", "type");

CREATE INDEX IF NOT EXISTS "OrderRequest_status_idx" ON "OrderRequest"("status");

DO $$
BEGIN
  IF to_regclass('public."Order"') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'OrderRequest_orderId_fkey'
    ) THEN
      ALTER TABLE "OrderRequest"
      ADD CONSTRAINT "OrderRequest_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public."User"') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'OrderRequest_userId_fkey'
    ) THEN
      ALTER TABLE "OrderRequest"
      ADD CONSTRAINT "OrderRequest_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END IF;
END $$;
