-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "VesselRelationshipType" AS ENUM ('OWNER', 'AGENT', 'CHARTERER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable vessels: add canonical normalization columns & make operator_id nullable
ALTER TABLE "vessels"
  ALTER COLUMN "operator_id" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "normalized_reg_number" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "normalized_imo_number" VARCHAR(40),
  ADD COLUMN IF NOT EXISTS "normalized_name" VARCHAR(160);

-- Backfill canonical columns for existing vessels (zero data loss)
UPDATE "vessels"
SET
  "normalized_reg_number" = UPPER(REGEXP_REPLACE(COALESCE("registration_number", ''), '[^A-Za-z0-9]', '', 'g')),
  "normalized_imo_number" = CASE
    WHEN "imo_number" IS NOT NULL AND TRIM("imo_number") <> ''
    THEN UPPER(REGEXP_REPLACE("imo_number", '[^A-Za-z0-9]', '', 'g'))
    ELSE NULL
  END,
  "normalized_name" = TRIM(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        UPPER(COALESCE("name", '')),
        '^(KM|KMP|MV|MT|TB|BG|SPOB|LCT|KLM|KN|KRI|MS)\.?\s+',
        '',
        'g'
      ),
      '[^A-Z0-9\s]',
      ' ',
      'g'
    )
  )
WHERE "normalized_reg_number" IS NULL OR "normalized_name" IS NULL;

-- Enforce NOT NULL after backfill
ALTER TABLE "vessels"
  ALTER COLUMN "normalized_reg_number" SET NOT NULL,
  ALTER COLUMN "normalized_name" SET NOT NULL;

-- Drop old FK on vessels.operator_id and re-add with ON DELETE SET NULL
ALTER TABLE "vessels" DROP CONSTRAINT IF EXISTS "vessels_operator_id_fkey";
ALTER TABLE "vessels"
  ADD CONSTRAINT "vessels_operator_id_fkey"
  FOREIGN KEY ("operator_id") REFERENCES "ship_operators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex on canonical columns
CREATE UNIQUE INDEX IF NOT EXISTS "vessels_normalized_reg_number_key" ON "vessels"("normalized_reg_number");
CREATE UNIQUE INDEX IF NOT EXISTS "vessels_normalized_imo_number_key" ON "vessels"("normalized_imo_number");
CREATE INDEX IF NOT EXISTS "vessels_normalized_name_idx" ON "vessels"("normalized_name");

-- CreateTable operator_vessels (Many-to-Many ShipOperator <-> Vessel)
CREATE TABLE IF NOT EXISTS "operator_vessels" (
  "id" SERIAL NOT NULL,
  "operator_id" INTEGER NOT NULL,
  "vessel_id" INTEGER NOT NULL,
  "relationship_type" "VesselRelationshipType" NOT NULL DEFAULT 'AGENT',
  "verification_status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
  "rejection_reason" TEXT,
  "authorization_doc_path" VARCHAR(255),
  "notes" TEXT,
  "verified_by_id" INTEGER,
  "verified_at" TIMESTAMP(3),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "operator_vessels_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "operator_vessels_operator_id_vessel_id_key" ON "operator_vessels"("operator_id", "vessel_id");
CREATE INDEX IF NOT EXISTS "operator_vessels_vessel_id_is_active_idx" ON "operator_vessels"("vessel_id", "is_active");
CREATE INDEX IF NOT EXISTS "operator_vessels_operator_id_verification_status_idx" ON "operator_vessels"("operator_id", "verification_status");

ALTER TABLE "operator_vessels"
  ADD CONSTRAINT "operator_vessels_operator_id_fkey"
  FOREIGN KEY ("operator_id") REFERENCES "ship_operators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operator_vessels"
  ADD CONSTRAINT "operator_vessels_vessel_id_fkey"
  FOREIGN KEY ("vessel_id") REFERENCES "vessels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operator_vessels"
  ADD CONSTRAINT "operator_vessels_verified_by_id_fkey"
  FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill existing 1:N vessel ownerships into operator_vessels as OWNER (zero data loss)
INSERT INTO "operator_vessels" (
  "operator_id",
  "vessel_id",
  "relationship_type",
  "verification_status",
  "verified_by_id",
  "verified_at",
  "is_active",
  "created_at",
  "updated_at"
)
SELECT
  v."operator_id",
  v."id",
  'OWNER'::"VesselRelationshipType",
  v."verification_status",
  v."verified_by_id",
  v."verified_at",
  v."is_active",
  v."created_at",
  CURRENT_TIMESTAMP
FROM "vessels" v
WHERE v."operator_id" IS NOT NULL
ON CONFLICT ("operator_id", "vessel_id") DO NOTHING;
