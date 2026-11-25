-- AlterEnum
ALTER TYPE "ContractStatus" ADD VALUE IF NOT EXISTS 'WAITING_OPERATOR_SIGNATURE';

-- AlterTable
ALTER TABLE "operator_berthing_contracts"
  ADD COLUMN IF NOT EXISTS "draft_contract_generated_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "signed_file_path" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "signed_file_name" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "signed_uploaded_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "head_signature_data" TEXT,
  ADD COLUMN IF NOT EXISTS "head_signature_hash" VARCHAR(128),
  ADD COLUMN IF NOT EXISTS "head_signed_at" TIMESTAMP(3);
