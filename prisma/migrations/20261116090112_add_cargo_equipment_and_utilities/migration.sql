-- CreateEnum
CREATE TYPE "CargoCategory" AS ENUM ('BARANG_IMPOR_EKSPOR', 'BARANG_BULOG_PUPUK', 'BARANG_ANTAR_PULAU', 'HEWAN_TERNAK', 'PETI_KEMAS_20FT', 'PETI_KEMAS_40FT', 'PETI_KEMAS_OVER_40FT', 'SHIP_TO_SHIP');

-- CreateEnum
CREATE TYPE "StorageLocationType" AS ENUM ('GUDANG_TERTUTUP', 'LAPANGAN_TERBUKA');

-- CreateEnum
CREATE TYPE "PortEquipmentType" AS ENUM ('FORKLIFT', 'CRANE_DEREK', 'MOTOR_LONG_BOAT', 'GEROBAK_DORONG');

-- CreateEnum
CREATE TYPE "UtilityType" AS ENUM ('AIR_BERSIH', 'LISTRIK');

-- CreateEnum
CREATE TYPE "ChargePaymentStatus" AS ENUM ('UNPAID', 'PAID', 'VOID');

-- CreateTable
CREATE TABLE "cargo_handling_records" (
    "id" SERIAL NOT NULL,
    "record_number" VARCHAR(60) NOT NULL,
    "port_id" INTEGER NOT NULL,
    "visit_id" INTEGER,
    "cargo_category" "CargoCategory" NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unit_label" VARCHAR(30) NOT NULL,
    "storage_location" "StorageLocationType",
    "duration_days" INTEGER NOT NULL DEFAULT 1,
    "rate_per_unit_idr" DECIMAL(14,2) NOT NULL,
    "total_amount_idr" DECIMAL(16,2) NOT NULL,
    "payment_status" "ChargePaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "idempotency_key" VARCHAR(100),
    "paid_at" TIMESTAMP(3),
    "recorded_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cargo_handling_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_rental_records" (
    "id" SERIAL NOT NULL,
    "rental_number" VARCHAR(60) NOT NULL,
    "port_id" INTEGER NOT NULL,
    "visit_id" INTEGER,
    "equipment_type" "PortEquipmentType" NOT NULL,
    "capacity_label" VARCHAR(80) NOT NULL,
    "unit_count" INTEGER NOT NULL DEFAULT 1,
    "duration_hours" DECIMAL(10,2) NOT NULL,
    "rate_per_hour_idr" DECIMAL(14,2) NOT NULL,
    "total_amount_idr" DECIMAL(16,2) NOT NULL,
    "payment_status" "ChargePaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "idempotency_key" VARCHAR(100),
    "paid_at" TIMESTAMP(3),
    "recorded_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_rental_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "utility_meter_readings" (
    "id" SERIAL NOT NULL,
    "reading_number" VARCHAR(60) NOT NULL,
    "port_id" INTEGER NOT NULL,
    "visit_id" INTEGER,
    "asset_id" INTEGER,
    "utility_type" "UtilityType" NOT NULL,
    "meter_start" DECIMAL(14,2) NOT NULL,
    "meter_end" DECIMAL(14,2) NOT NULL,
    "volume_consumed" DECIMAL(14,2) NOT NULL,
    "unit_label" VARCHAR(20) NOT NULL,
    "rate_per_unit_idr" DECIMAL(14,2) NOT NULL,
    "total_amount_idr" DECIMAL(16,2) NOT NULL,
    "payment_status" "ChargePaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "idempotency_key" VARCHAR(100),
    "paid_at" TIMESTAMP(3),
    "recorded_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "utility_meter_readings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cargo_handling_records_record_number_key" ON "cargo_handling_records"("record_number");

-- CreateIndex
CREATE UNIQUE INDEX "cargo_handling_records_idempotency_key_key" ON "cargo_handling_records"("idempotency_key");

-- CreateIndex
CREATE INDEX "cargo_handling_records_port_id_payment_status_idx" ON "cargo_handling_records"("port_id", "payment_status");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_rental_records_rental_number_key" ON "equipment_rental_records"("rental_number");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_rental_records_idempotency_key_key" ON "equipment_rental_records"("idempotency_key");

-- CreateIndex
CREATE INDEX "equipment_rental_records_port_id_payment_status_idx" ON "equipment_rental_records"("port_id", "payment_status");

-- CreateIndex
CREATE UNIQUE INDEX "utility_meter_readings_reading_number_key" ON "utility_meter_readings"("reading_number");

-- CreateIndex
CREATE UNIQUE INDEX "utility_meter_readings_idempotency_key_key" ON "utility_meter_readings"("idempotency_key");

-- CreateIndex
CREATE INDEX "utility_meter_readings_port_id_payment_status_idx" ON "utility_meter_readings"("port_id", "payment_status");

-- AddForeignKey
ALTER TABLE "cargo_handling_records" ADD CONSTRAINT "cargo_handling_records_port_id_fkey" FOREIGN KEY ("port_id") REFERENCES "ports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargo_handling_records" ADD CONSTRAINT "cargo_handling_records_port_id_visit_id_fkey" FOREIGN KEY ("port_id", "visit_id") REFERENCES "ship_visits"("port_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargo_handling_records" ADD CONSTRAINT "cargo_handling_records_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_rental_records" ADD CONSTRAINT "equipment_rental_records_port_id_fkey" FOREIGN KEY ("port_id") REFERENCES "ports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_rental_records" ADD CONSTRAINT "equipment_rental_records_port_id_visit_id_fkey" FOREIGN KEY ("port_id", "visit_id") REFERENCES "ship_visits"("port_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_rental_records" ADD CONSTRAINT "equipment_rental_records_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utility_meter_readings" ADD CONSTRAINT "utility_meter_readings_port_id_fkey" FOREIGN KEY ("port_id") REFERENCES "ports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utility_meter_readings" ADD CONSTRAINT "utility_meter_readings_port_id_visit_id_fkey" FOREIGN KEY ("port_id", "visit_id") REFERENCES "ship_visits"("port_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utility_meter_readings" ADD CONSTRAINT "utility_meter_readings_port_id_asset_id_fkey" FOREIGN KEY ("port_id", "asset_id") REFERENCES "port_assets"("port_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utility_meter_readings" ADD CONSTRAINT "utility_meter_readings_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
