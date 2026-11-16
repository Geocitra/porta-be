-- CreateEnum
CREATE TYPE "PortAssetType" AS ENUM ('KIOS', 'GUDANG', 'LAHAN_GALANGAN', 'PERAIRAN_ATAS_AIR', 'RUANG_IKLAN');

-- CreateEnum
CREATE TYPE "PortAssetStatus" AS ENUM ('AVAILABLE', 'LEASED', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "LeaseStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "MaintenanceSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('REPORTED', 'ASSIGNED', 'IN_PROGRESS', 'VERIFIED_FIXED');

-- CreateTable
CREATE TABLE "port_assets" (
    "id" SERIAL NOT NULL,
    "port_id" INTEGER NOT NULL,
    "asset_code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "asset_type" "PortAssetType" NOT NULL,
    "area_sqm" DECIMAL(10,2) NOT NULL,
    "annual_rate_per_sqm_idr" DECIMAL(14,2) NOT NULL,
    "billing_eligibility" "BillingEligibility" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "status" "PortAssetStatus" NOT NULL DEFAULT 'AVAILABLE',
    "gis_coordinates" VARCHAR(100),
    "legal_basis" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "port_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_leases" (
    "id" SERIAL NOT NULL,
    "contract_number" VARCHAR(60) NOT NULL,
    "port_id" INTEGER NOT NULL,
    "asset_id" INTEGER NOT NULL,
    "tenant_name" VARCHAR(150) NOT NULL,
    "tenant_npwp" VARCHAR(50),
    "tenant_phone" VARCHAR(50),
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "total_annual_amount_idr" DECIMAL(16,2) NOT NULL,
    "status" "LeaseStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_leases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_lease_payments" (
    "id" SERIAL NOT NULL,
    "lease_id" INTEGER NOT NULL,
    "idempotency_key" VARCHAR(100) NOT NULL,
    "period_year" INTEGER NOT NULL,
    "amount_idr" DECIMAL(16,2) NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "verified_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_lease_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_tickets" (
    "id" SERIAL NOT NULL,
    "ticket_number" VARCHAR(60) NOT NULL,
    "port_id" INTEGER NOT NULL,
    "berth_id" INTEGER,
    "asset_id" INTEGER,
    "severity" "MaintenanceSeverity" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "evidence_photo" VARCHAR(255),
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'REPORTED',
    "reported_by_id" INTEGER NOT NULL,
    "assigned_technician" VARCHAR(150),
    "resolution_note" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "port_assets_asset_code_key" ON "port_assets"("asset_code");

-- CreateIndex
CREATE INDEX "port_assets_port_id_status_idx" ON "port_assets"("port_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "port_assets_port_id_id_key" ON "port_assets"("port_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_leases_contract_number_key" ON "asset_leases"("contract_number");

-- CreateIndex
CREATE INDEX "asset_leases_port_id_status_idx" ON "asset_leases"("port_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "asset_lease_payments_idempotency_key_key" ON "asset_lease_payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "asset_lease_payments_lease_id_period_year_idx" ON "asset_lease_payments"("lease_id", "period_year");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_tickets_ticket_number_key" ON "maintenance_tickets"("ticket_number");

-- CreateIndex
CREATE INDEX "maintenance_tickets_port_id_status_idx" ON "maintenance_tickets"("port_id", "status");

-- AddForeignKey
ALTER TABLE "port_assets" ADD CONSTRAINT "port_assets_port_id_fkey" FOREIGN KEY ("port_id") REFERENCES "ports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_leases" ADD CONSTRAINT "asset_leases_port_id_fkey" FOREIGN KEY ("port_id") REFERENCES "ports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_leases" ADD CONSTRAINT "asset_leases_port_id_asset_id_fkey" FOREIGN KEY ("port_id", "asset_id") REFERENCES "port_assets"("port_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_leases" ADD CONSTRAINT "asset_leases_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_lease_payments" ADD CONSTRAINT "asset_lease_payments_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "asset_leases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_lease_payments" ADD CONSTRAINT "asset_lease_payments_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_port_id_fkey" FOREIGN KEY ("port_id") REFERENCES "ports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_port_id_berth_id_fkey" FOREIGN KEY ("port_id", "berth_id") REFERENCES "berths"("port_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_port_id_asset_id_fkey" FOREIGN KEY ("port_id", "asset_id") REFERENCES "port_assets"("port_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_reported_by_id_fkey" FOREIGN KEY ("reported_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
