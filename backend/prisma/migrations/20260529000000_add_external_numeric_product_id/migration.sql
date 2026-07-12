CREATE SEQUENCE IF NOT EXISTS "Product_externalNumericId_seq";

ALTER TABLE "Product"
ADD COLUMN IF NOT EXISTS "externalNumericId" BIGINT;

ALTER TABLE "Product"
ALTER COLUMN "externalNumericId" SET DEFAULT nextval('"Product_externalNumericId_seq"');

ALTER SEQUENCE "Product_externalNumericId_seq"
OWNED BY "Product"."externalNumericId";

WITH missing_ids AS (
  SELECT "id", nextval('"Product_externalNumericId_seq"') AS next_id
  FROM "Product"
  WHERE "externalNumericId" IS NULL
  ORDER BY "createdAt", "id"
)
UPDATE "Product" AS product
SET "externalNumericId" = missing_ids.next_id
FROM missing_ids
WHERE product."id" = missing_ids."id";

SELECT setval(
  '"Product_externalNumericId_seq"',
  COALESCE((SELECT MAX("externalNumericId") FROM "Product"), 1),
  true
);

ALTER TABLE "Product"
ALTER COLUMN "externalNumericId" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Product_externalNumericId_key"
ON "Product"("externalNumericId");
