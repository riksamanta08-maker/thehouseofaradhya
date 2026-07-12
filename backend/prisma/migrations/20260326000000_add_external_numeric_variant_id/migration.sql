CREATE SEQUENCE IF NOT EXISTS "ProductVariant_externalNumericId_seq";

ALTER TABLE "ProductVariant"
ADD COLUMN IF NOT EXISTS "externalNumericId" BIGINT;

ALTER TABLE "ProductVariant"
ALTER COLUMN "externalNumericId" SET DEFAULT nextval('"ProductVariant_externalNumericId_seq"');

ALTER SEQUENCE "ProductVariant_externalNumericId_seq"
OWNED BY "ProductVariant"."externalNumericId";

WITH missing_ids AS (
  SELECT "id", nextval('"ProductVariant_externalNumericId_seq"') AS next_id
  FROM "ProductVariant"
  WHERE "externalNumericId" IS NULL
)
UPDATE "ProductVariant" AS variant
SET "externalNumericId" = missing_ids.next_id
FROM missing_ids
WHERE variant."id" = missing_ids."id";

SELECT setval(
  '"ProductVariant_externalNumericId_seq"',
  COALESCE((SELECT MAX("externalNumericId") FROM "ProductVariant"), 1),
  true
);

ALTER TABLE "ProductVariant"
ALTER COLUMN "externalNumericId" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "ProductVariant_externalNumericId_key"
ON "ProductVariant"("externalNumericId");
