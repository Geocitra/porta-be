-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'PETUGAS_RUANGAN';

-- AlterEnum
ALTER TYPE "LeaseStatus" ADD VALUE IF NOT EXISTS 'PENDING_ROOM_OFFICER';
ALTER TYPE "LeaseStatus" ADD VALUE IF NOT EXISTS 'PENDING_HEAD_OF_PORT';

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ContractStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'REJECTED', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "asset_leases" ADD COLUMN IF NOT EXISTS "operator_id" INTEGER,
ADD COLUMN IF NOT EXISTS "verified_by_room_officer_id" INTEGER,
ADD COLUMN IF NOT EXISTS "verified_by_room_officer_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "verified_by_head_of_port_id" INTEGER,
ADD COLUMN IF NOT EXISTS "verified_by_head_of_port_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "operator_berthing_contracts" (
    "id" SERIAL NOT NULL,
    "contract_number" VARCHAR(60) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "operator_id" INTEGER NOT NULL,
    "port_id" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "monthly_quota" INTEGER NOT NULL DEFAULT 30,
    "used_quota" INTEGER NOT NULL DEFAULT 0,
    "dock_allocation" VARCHAR(200),
    "file_path" VARCHAR(255),
    "file_name" VARCHAR(255),
    "status" "ContractStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "rejection_reason" TEXT,
    "verified_by_id" INTEGER,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operator_berthing_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "asset_leases_operator_id_idx" ON "asset_leases"("operator_id");
CREATE UNIQUE INDEX IF NOT EXISTS "operator_berthing_contracts_contract_number_key" ON "operator_berthing_contracts"("contract_number");
CREATE INDEX IF NOT EXISTS "operator_berthing_contracts_operator_id_status_idx" ON "operator_berthing_contracts"("operator_id", "status");
CREATE INDEX IF NOT EXISTS "operator_berthing_contracts_port_id_status_idx" ON "operator_berthing_contracts"("port_id", "status");

-- AddForeignKey
ALTER TABLE "asset_leases" DROP CONSTRAINT IF EXISTS "asset_leases_operator_id_fkey";
ALTER TABLE "asset_leases" ADD CONSTRAINT "asset_leases_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "ship_operators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "asset_leases" DROP CONSTRAINT IF EXISTS "asset_leases_verified_by_room_officer_id_fkey";
ALTER TABLE "asset_leases" ADD CONSTRAINT "asset_leases_verified_by_room_officer_id_fkey" FOREIGN KEY ("verified_by_room_officer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "asset_leases" DROP CONSTRAINT IF EXISTS "asset_leases_verified_by_head_of_port_id_fkey";
ALTER TABLE "asset_leases" ADD CONSTRAINT "asset_leases_verified_by_head_of_port_id_fkey" FOREIGN KEY ("verified_by_head_of_port_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operator_berthing_contracts" DROP CONSTRAINT IF EXISTS "operator_berthing_contracts_operator_id_fkey";
ALTER TABLE "operator_berthing_contracts" ADD CONSTRAINT "operator_berthing_contracts_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "ship_operators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operator_berthing_contracts" DROP CONSTRAINT IF EXISTS "operator_berthing_contracts_port_id_fkey";
ALTER TABLE "operator_berthing_contracts" ADD CONSTRAINT "operator_berthing_contracts_port_id_fkey" FOREIGN KEY ("port_id") REFERENCES "ports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operator_berthing_contracts" DROP CONSTRAINT IF EXISTS "operator_berthing_contracts_verified_by_id_fkey";
ALTER TABLE "operator_berthing_contracts" ADD CONSTRAINT "operator_berthing_contracts_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
