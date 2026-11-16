-- CreateEnum
CREATE TYPE "GeneralTariffDomain" AS ENUM ('CARGO', 'EQUIPMENT', 'UTILITY', 'TERMINAL_PASSENGER');

-- CreateEnum
CREATE TYPE "BillingAdjustmentType" AS ENUM ('INSTALLMENT_PLAN', 'PAYMENT_DEFERRAL', 'OVERPAYMENT_REFUND', 'CREDIT_TRANSFER');

-- CreateEnum
CREATE TYPE "AdjustmentApprovalStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "gate_ticket_books" ADD COLUMN     "porporasi_date" DATE,
ADD COLUMN     "porporasi_number" VARCHAR(80);

-- CreateTable
CREATE TABLE "general_tariffs" (
    "id" SERIAL NOT NULL,
    "tariff_code" VARCHAR(60) NOT NULL,
    "domain" "GeneralTariffDomain" NOT NULL,
    "item_key" VARCHAR(80) NOT NULL,
    "unit_label" VARCHAR(40) NOT NULL,
    "amount_idr" DECIMAL(14,2) NOT NULL,
    "legal_basis" VARCHAR(255) NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "general_tariffs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_adjustments" (
    "id" SERIAL NOT NULL,
    "request_number" VARCHAR(60) NOT NULL,
    "port_id" INTEGER NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "adjustment_type" "BillingAdjustmentType" NOT NULL,
    "requested_amount_idr" DECIMAL(16,2) NOT NULL,
    "installment_count" INTEGER,
    "deferred_until" DATE,
    "reason" TEXT NOT NULL,
    "status" "AdjustmentApprovalStatus" NOT NULL DEFAULT 'REQUESTED',
    "requested_by_id" INTEGER NOT NULL,
    "approved_by_id" INTEGER,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "general_tariffs_tariff_code_key" ON "general_tariffs"("tariff_code");

-- CreateIndex
CREATE INDEX "general_tariffs_domain_item_key_is_active_idx" ON "general_tariffs"("domain", "item_key", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "billing_adjustments_request_number_key" ON "billing_adjustments"("request_number");

-- CreateIndex
CREATE INDEX "billing_adjustments_port_id_status_idx" ON "billing_adjustments"("port_id", "status");

-- CreateIndex
CREATE INDEX "billing_adjustments_invoice_id_idx" ON "billing_adjustments"("invoice_id");

-- AddForeignKey
ALTER TABLE "billing_adjustments" ADD CONSTRAINT "billing_adjustments_port_id_fkey" FOREIGN KEY ("port_id") REFERENCES "ports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_adjustments" ADD CONSTRAINT "billing_adjustments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_adjustments" ADD CONSTRAINT "billing_adjustments_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_adjustments" ADD CONSTRAINT "billing_adjustments_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
