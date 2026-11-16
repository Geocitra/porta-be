-- CreateEnum
CREATE TYPE "TerminalClass" AS ENUM ('KELAS_A', 'KELAS_B', 'KELAS_C');

-- CreateTable
CREATE TABLE "vessel_manifests" (
    "id" SERIAL NOT NULL,
    "manifest_number" VARCHAR(60) NOT NULL,
    "port_id" INTEGER NOT NULL,
    "visit_id" INTEGER NOT NULL,
    "ferry_route_id" INTEGER,
    "terminal_class" "TerminalClass" NOT NULL DEFAULT 'KELAS_B',
    "adult_count" INTEGER NOT NULL DEFAULT 0,
    "child_count" INTEGER NOT NULL DEFAULT 0,
    "infant_count" INTEGER NOT NULL DEFAULT 0,
    "greeter_count" INTEGER NOT NULL DEFAULT 0,
    "vehicle_count" INTEGER NOT NULL DEFAULT 0,
    "cargo_tons" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "terminal_fee_idr" DECIMAL(16,2) NOT NULL,
    "notes" TEXT,
    "recorded_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vessel_manifests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vessel_manifests_manifest_number_key" ON "vessel_manifests"("manifest_number");

-- CreateIndex
CREATE UNIQUE INDEX "vessel_manifests_visit_id_key" ON "vessel_manifests"("visit_id");

-- CreateIndex
CREATE INDEX "vessel_manifests_port_id_idx" ON "vessel_manifests"("port_id");

-- CreateIndex
CREATE UNIQUE INDEX "ferry_routes_port_id_id_key" ON "ferry_routes"("port_id", "id");

-- AddForeignKey
ALTER TABLE "vessel_manifests" ADD CONSTRAINT "vessel_manifests_port_id_fkey" FOREIGN KEY ("port_id") REFERENCES "ports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vessel_manifests" ADD CONSTRAINT "vessel_manifests_port_id_visit_id_fkey" FOREIGN KEY ("port_id", "visit_id") REFERENCES "ship_visits"("port_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vessel_manifests" ADD CONSTRAINT "vessel_manifests_port_id_ferry_route_id_fkey" FOREIGN KEY ("port_id", "ferry_route_id") REFERENCES "ferry_routes"("port_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vessel_manifests" ADD CONSTRAINT "vessel_manifests_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

