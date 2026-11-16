-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPERADMIN', 'ADMIN_PELABUHAN', 'PETUGAS_DERMAGA', 'BENDAHARA', 'OPERATOR_KAPAL', 'DISHUB_EKSEKUTIF');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('SIUPAL_NIB', 'NPWP', 'SURAT_UKUR', 'PAS_BESAR_KECIL', 'LAINNYA');

-- CreateEnum
CREATE TYPE "BerthType" AS ENUM ('DERMAGA_BESI_BETON_KAYU', 'BRESSING_DOLPHIN_PELAMPUNG', 'PINGGIRAN_TALUD');

-- CreateEnum
CREATE TYPE "AuthorityType" AS ENUM ('PEMDA_DISHUB', 'UPP_KEMENHUB', 'TUKS_TERSUS');

-- CreateEnum
CREATE TYPE "BillingEligibility" AS ENUM ('BILLABLE', 'NOT_BILLABLE', 'PENDING_VERIFICATION');

-- CreateEnum
CREATE TYPE "OperatorProfile" AS ENUM ('REGULAR_SCHEDULED', 'INCIDENTAL');

-- CreateEnum
CREATE TYPE "ShipType" AS ENUM ('NIAGA', 'NON_NIAGA');

-- CreateEnum
CREATE TYPE "ShippingCategory" AS ENUM ('LUAR_NEGERI', 'DALAM_NEGERI', 'PELRA_PERINTIS');

-- CreateEnum
CREATE TYPE "ServiceCode" AS ENUM ('JASA_LABUH', 'KEGIATAN_TUKS_TERSUS', 'JASA_TAMBAT_UMUM', 'JASA_TAMBAT_KHUSUS');

-- CreateEnum
CREATE TYPE "ActivityMode" AS ENUM ('NORMAL', 'FIXED_ACTIVITY');

-- CreateEnum
CREATE TYPE "TariffUnitType" AS ENUM ('GT_PER_15_DAYS', 'GT_PER_MONTH', 'GT_PER_ETMAL');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('IDR', 'USD');

-- CreateEnum
CREATE TYPE "VisitOrigin" AS ENUM ('OPERATOR_REQUEST', 'OFFICER_INCIDENTAL');

-- CreateEnum
CREATE TYPE "VisitActivityMode" AS ENUM ('NORMAL', 'FIXED_ACTIVITY', 'TUKS_TERSUS');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('REQUESTED', 'APPROVED', 'ANCHORED', 'BERTHED', 'DEPARTED', 'BILLED', 'SETTLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BerthCategory" AS ENUM ('UMUM', 'KHUSUS_TUKS');

-- CreateEnum
CREATE TYPE "BillingStage" AS ENUM ('ESTIMATE', 'ADVANCE_SKRD', 'FINAL_SKRD', 'ADJUSTMENT_SKRD');

-- CreateEnum
CREATE TYPE "CollectionInstrument" AS ENUM ('KARCIS', 'SKRD');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIAL', 'PAID', 'OVERPAID', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH_TREASURER', 'BANK_TRANSFER', 'VA', 'QRIS');

-- CreateEnum
CREATE TYPE "DailyReportStatus" AS ENUM ('SUBMITTED', 'ACKNOWLEDGED');

-- CreateEnum
CREATE TYPE "WarningLevel" AS ENUM ('TEGURAN_1', 'TEGURAN_2', 'TEGURAN_3');

-- CreateEnum
CREATE TYPE "WarningStatus" AS ENUM ('SENT', 'RESOLVED');

-- CreateTable
CREATE TABLE "ports" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "location" VARCHAR(200),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(150) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "role" "UserRole" NOT NULL,
    "port_id" INTEGER,
    "operator_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "berths" (
    "id" SERIAL NOT NULL,
    "port_id" INTEGER NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "berth_type" "BerthType" NOT NULL,
    "authority_type" "AuthorityType" NOT NULL,
    "billing_eligibility" "BillingEligibility" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "legal_basis" VARCHAR(255),
    "management_evidence" VARCHAR(255),
    "max_length_meters" DECIMAL(8,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "berths_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ship_operators" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "npwp" VARCHAR(50),
    "phone" VARCHAR(50),
    "email" VARCHAR(150),
    "address" TEXT,
    "operator_profile" "OperatorProfile" NOT NULL DEFAULT 'REGULAR_SCHEDULED',
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "rejection_reason" TEXT,
    "verified_at" TIMESTAMP(3),
    "verified_by_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ship_operators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vessels" (
    "id" SERIAL NOT NULL,
    "operator_id" INTEGER NOT NULL,
    "registration_number" VARCHAR(60) NOT NULL,
    "imo_number" VARCHAR(30),
    "name" VARCHAR(150) NOT NULL,
    "flag" VARCHAR(80) NOT NULL DEFAULT 'Indonesia',
    "gross_tonnage" DECIMAL(12,2) NOT NULL,
    "ship_type" "ShipType" NOT NULL,
    "shipping_category" "ShippingCategory" NOT NULL,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "rejection_reason" TEXT,
    "verified_at" TIMESTAMP(3),
    "verified_by_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vessels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" SERIAL NOT NULL,
    "operator_id" INTEGER NOT NULL,
    "vessel_id" INTEGER,
    "category" "DocumentCategory" NOT NULL,
    "document_number" VARCHAR(100),
    "file_path" VARCHAR(255) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "uploaded_by_id" INTEGER NOT NULL,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "port_tariffs" (
    "id" SERIAL NOT NULL,
    "tariff_code" VARCHAR(60) NOT NULL,
    "service_code" "ServiceCode" NOT NULL,
    "shipping_category" "ShippingCategory" NOT NULL,
    "ship_type" "ShipType",
    "activity_mode" "ActivityMode",
    "berth_type" "BerthType",
    "unit_type" "TariffUnitType" NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'IDR',
    "amount" DECIMAL(14,4) NOT NULL,
    "legal_basis" VARCHAR(255) NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "port_tariffs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ship_visits" (
    "id" SERIAL NOT NULL,
    "visit_number" VARCHAR(50) NOT NULL,
    "port_id" INTEGER NOT NULL,
    "vessel_id" INTEGER NOT NULL,
    "operator_id" INTEGER NOT NULL,
    "visit_origin" "VisitOrigin" NOT NULL DEFAULT 'OPERATOR_REQUEST',
    "activity_mode" "VisitActivityMode" NOT NULL DEFAULT 'NORMAL',
    "is_transit_only" BOOLEAN NOT NULL DEFAULT false,
    "origin_port" VARCHAR(150),
    "destination_port" VARCHAR(150),
    "eta" TIMESTAMP(3) NOT NULL,
    "etd" TIMESTAMP(3) NOT NULL,
    "ata_anchorage" TIMESTAMP(3),
    "atd_port" TIMESTAMP(3),
    "status" "VisitStatus" NOT NULL DEFAULT 'REQUESTED',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ship_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "berthing_records" (
    "id" SERIAL NOT NULL,
    "port_id" INTEGER NOT NULL,
    "visit_id" INTEGER NOT NULL,
    "berth_id" INTEGER NOT NULL,
    "berth_category" "BerthCategory" NOT NULL DEFAULT 'UMUM',
    "planned_start_at" TIMESTAMP(3),
    "planned_end_at" TIMESTAMP(3),
    "actual_start_at" TIMESTAMP(3),
    "actual_end_at" TIMESTAMP(3),
    "calculated_hours" DECIMAL(10,2),
    "billable_etmal" DECIMAL(10,2),
    "evidence_photo" VARCHAR(255),
    "is_overstay" BOOLEAN NOT NULL DEFAULT false,
    "overstay_hours" DECIMAL(10,2),
    "recorded_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "berthing_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" SERIAL NOT NULL,
    "invoice_number" VARCHAR(60) NOT NULL,
    "ssrd_number" VARCHAR(60),
    "collection_instrument" "CollectionInstrument" NOT NULL DEFAULT 'KARCIS',
    "port_id" INTEGER NOT NULL,
    "visit_id" INTEGER NOT NULL,
    "operator_id" INTEGER NOT NULL,
    "parent_invoice_id" INTEGER,
    "billing_stage" "BillingStage" NOT NULL,
    "exchange_rate_usd" DECIMAL(12,2) NOT NULL DEFAULT 16000,
    "total_amount_idr" DECIMAL(16,2) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issued_at" TIMESTAMP(3),
    "due_date" TIMESTAMP(3),
    "void_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" SERIAL NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "tariff_id" INTEGER,
    "service_code" "ServiceCode" NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "gt_snapshot" DECIMAL(12,2) NOT NULL,
    "units_charged" DECIMAL(10,2) NOT NULL,
    "unit_type" "TariffUnitType" NOT NULL,
    "tariff_amount_snapshot" DECIMAL(14,4) NOT NULL,
    "currency" "Currency" NOT NULL,
    "subtotal_original" DECIMAL(16,4) NOT NULL,
    "subtotal_idr" DECIMAL(16,2) NOT NULL,
    "formula_note" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" SERIAL NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "idempotency_key" VARCHAR(100) NOT NULL,
    "amount_idr" DECIMAL(16,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference_no" VARCHAR(100),
    "proof_file_path" VARCHAR(255),
    "paid_at" TIMESTAMP(3) NOT NULL,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_by_id" INTEGER,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "actor_id" INTEGER,
    "action" VARCHAR(80) NOT NULL,
    "entity_name" VARCHAR(80) NOT NULL,
    "entity_id" VARCHAR(80) NOT NULL,
    "before_data" JSONB,
    "after_data" JSONB,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_port_reports" (
    "id" SERIAL NOT NULL,
    "port_id" INTEGER NOT NULL,
    "report_date" DATE NOT NULL,
    "officer_id" INTEGER NOT NULL,
    "total_vessels_staying" INTEGER NOT NULL DEFAULT 0,
    "general_notes" TEXT,
    "status" "DailyReportStatus" NOT NULL DEFAULT 'SUBMITTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_port_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_port_report_items" (
    "id" SERIAL NOT NULL,
    "report_id" INTEGER NOT NULL,
    "port_id" INTEGER NOT NULL,
    "visit_id" INTEGER,
    "berth_id" INTEGER,
    "vessel_name_snapshot" VARCHAR(150) NOT NULL,
    "registration_number_snapshot" VARCHAR(60) NOT NULL,
    "evidence_photo" VARCHAR(255),
    "is_adhoc" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_port_report_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warnings" (
    "id" SERIAL NOT NULL,
    "warning_number" VARCHAR(60) NOT NULL,
    "port_id" INTEGER NOT NULL,
    "operator_id" INTEGER NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "warning_level" "WarningLevel" NOT NULL,
    "message" TEXT NOT NULL,
    "issued_by_id" INTEGER NOT NULL,
    "status" "WarningStatus" NOT NULL DEFAULT 'SENT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "message" TEXT NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "link_url" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ports_code_key" ON "ports"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_port_id_idx" ON "users"("port_id");

-- CreateIndex
CREATE INDEX "users_operator_id_idx" ON "users"("operator_id");

-- CreateIndex
CREATE UNIQUE INDEX "berths_port_id_code_key" ON "berths"("port_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "berths_port_id_id_key" ON "berths"("port_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "vessels_registration_number_key" ON "vessels"("registration_number");

-- CreateIndex
CREATE UNIQUE INDEX "vessels_imo_number_key" ON "vessels"("imo_number");

-- CreateIndex
CREATE INDEX "vessels_operator_id_idx" ON "vessels"("operator_id");

-- CreateIndex
CREATE INDEX "documents_operator_id_idx" ON "documents"("operator_id");

-- CreateIndex
CREATE INDEX "documents_vessel_id_idx" ON "documents"("vessel_id");

-- CreateIndex
CREATE UNIQUE INDEX "port_tariffs_tariff_code_key" ON "port_tariffs"("tariff_code");

-- CreateIndex
CREATE INDEX "port_tariffs_service_code_shipping_category_is_active_idx" ON "port_tariffs"("service_code", "shipping_category", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "ship_visits_visit_number_key" ON "ship_visits"("visit_number");

-- CreateIndex
CREATE INDEX "ship_visits_port_id_status_idx" ON "ship_visits"("port_id", "status");

-- CreateIndex
CREATE INDEX "ship_visits_operator_id_idx" ON "ship_visits"("operator_id");

-- CreateIndex
CREATE UNIQUE INDEX "ship_visits_port_id_id_key" ON "ship_visits"("port_id", "id");

-- CreateIndex
CREATE INDEX "berthing_records_visit_id_idx" ON "berthing_records"("visit_id");

-- CreateIndex
CREATE INDEX "berthing_records_berth_id_idx" ON "berthing_records"("berth_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_ssrd_number_key" ON "invoices"("ssrd_number");

-- CreateIndex
CREATE INDEX "invoices_port_id_status_idx" ON "invoices"("port_id", "status");

-- CreateIndex
CREATE INDEX "invoices_visit_id_billing_stage_idx" ON "invoices"("visit_id", "billing_stage");

-- CreateIndex
CREATE INDEX "invoice_items_invoice_id_idx" ON "invoice_items"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_invoice_id_is_verified_idx" ON "payments"("invoice_id", "is_verified");

-- CreateIndex
CREATE INDEX "audit_logs_entity_name_entity_id_idx" ON "audit_logs"("entity_name", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "daily_port_reports_port_id_report_date_idx" ON "daily_port_reports"("port_id", "report_date");

-- CreateIndex
CREATE INDEX "daily_port_report_items_report_id_idx" ON "daily_port_report_items"("report_id");

-- CreateIndex
CREATE UNIQUE INDEX "warnings_warning_number_key" ON "warnings"("warning_number");

-- CreateIndex
CREATE INDEX "warnings_port_id_status_idx" ON "warnings"("port_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "warnings_invoice_id_warning_level_key" ON "warnings"("invoice_id", "warning_level");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_idx" ON "notifications"("user_id", "is_read");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_port_id_fkey" FOREIGN KEY ("port_id") REFERENCES "ports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "ship_operators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "berths" ADD CONSTRAINT "berths_port_id_fkey" FOREIGN KEY ("port_id") REFERENCES "ports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ship_operators" ADD CONSTRAINT "ship_operators_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vessels" ADD CONSTRAINT "vessels_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "ship_operators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vessels" ADD CONSTRAINT "vessels_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "ship_operators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_vessel_id_fkey" FOREIGN KEY ("vessel_id") REFERENCES "vessels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ship_visits" ADD CONSTRAINT "ship_visits_port_id_fkey" FOREIGN KEY ("port_id") REFERENCES "ports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ship_visits" ADD CONSTRAINT "ship_visits_vessel_id_fkey" FOREIGN KEY ("vessel_id") REFERENCES "vessels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ship_visits" ADD CONSTRAINT "ship_visits_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "ship_operators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "berthing_records" ADD CONSTRAINT "berthing_records_port_id_visit_id_fkey" FOREIGN KEY ("port_id", "visit_id") REFERENCES "ship_visits"("port_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "berthing_records" ADD CONSTRAINT "berthing_records_port_id_berth_id_fkey" FOREIGN KEY ("port_id", "berth_id") REFERENCES "berths"("port_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "berthing_records" ADD CONSTRAINT "berthing_records_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "ship_visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "ship_operators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_parent_invoice_id_fkey" FOREIGN KEY ("parent_invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_tariff_id_fkey" FOREIGN KEY ("tariff_id") REFERENCES "port_tariffs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_port_reports" ADD CONSTRAINT "daily_port_reports_port_id_fkey" FOREIGN KEY ("port_id") REFERENCES "ports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_port_reports" ADD CONSTRAINT "daily_port_reports_officer_id_fkey" FOREIGN KEY ("officer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_port_report_items" ADD CONSTRAINT "daily_port_report_items_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "daily_port_reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_port_report_items" ADD CONSTRAINT "daily_port_report_items_port_id_visit_id_fkey" FOREIGN KEY ("port_id", "visit_id") REFERENCES "ship_visits"("port_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_port_report_items" ADD CONSTRAINT "daily_port_report_items_port_id_berth_id_fkey" FOREIGN KEY ("port_id", "berth_id") REFERENCES "berths"("port_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warnings" ADD CONSTRAINT "warnings_port_id_fkey" FOREIGN KEY ("port_id") REFERENCES "ports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warnings" ADD CONSTRAINT "warnings_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "ship_operators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warnings" ADD CONSTRAINT "warnings_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warnings" ADD CONSTRAINT "warnings_issued_by_id_fkey" FOREIGN KEY ("issued_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
