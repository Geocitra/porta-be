-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'PETUGAS_REGISTRASI_KONTRAK';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'PETUGAS_DERMAGA_BARANG';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'PETUGAS_DERMAGA_PENUMPANG';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'PETUGAS_TAGIHAN';

-- AlterEnum
ALTER TYPE "ContractStatus" ADD VALUE IF NOT EXISTS 'PENDING_HEAD_OF_PORT';

-- AlterTable: ship_visits
ALTER TABLE "ship_visits"
  ADD COLUMN IF NOT EXISTS "berthing_contract_id" INTEGER;

-- AlterTable: operator_berthing_contracts
ALTER TABLE "operator_berthing_contracts"
  ADD COLUMN IF NOT EXISTS "reviewed_by_officer_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "reviewed_by_officer_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "officer_review_notes" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ship_visits_berthing_contract_id_idx" ON "ship_visits"("berthing_contract_id");

-- AddForeignKey
ALTER TABLE "ship_visits"
  ADD CONSTRAINT "ship_visits_berthing_contract_id_fkey"
  FOREIGN KEY ("berthing_contract_id") REFERENCES "operator_berthing_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operator_berthing_contracts"
  ADD CONSTRAINT "operator_berthing_contracts_reviewed_by_officer_id_fkey"
  FOREIGN KEY ("reviewed_by_officer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
