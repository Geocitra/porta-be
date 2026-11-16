-- CreateEnum
CREATE TYPE "GateTicketBookStatus" AS ENUM ('STOK', 'ACTIVE', 'HABIS');

-- CreateEnum
CREATE TYPE "HandoverStatus" AS ENUM ('DISTRIBUTED', 'SETTLED');

-- CreateTable
CREATE TABLE "gate_ticket_books" (
    "id" SERIAL NOT NULL,
    "port_id" INTEGER NOT NULL,
    "book_code" VARCHAR(60) NOT NULL,
    "ticket_category" VARCHAR(100) NOT NULL,
    "serial_start" INTEGER NOT NULL,
    "serial_end" INTEGER NOT NULL,
    "nominal_per_ticket" DECIMAL(14,2) NOT NULL,
    "status" "GateTicketBookStatus" NOT NULL DEFAULT 'STOK',
    "legal_basis" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gate_ticket_books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gate_warden_handovers" (
    "id" SERIAL NOT NULL,
    "port_id" INTEGER NOT NULL,
    "book_id" INTEGER NOT NULL,
    "warden_name" VARCHAR(120) NOT NULL,
    "dispatched_serial_start" INTEGER NOT NULL,
    "dispatched_serial_end" INTEGER NOT NULL,
    "last_returned_serial" INTEGER,
    "sold_qty" INTEGER,
    "expected_amount_idr" DECIMAL(16,2),
    "actual_cash_settled_idr" DECIMAL(16,2),
    "unmatched_amount_idr" DECIMAL(16,2),
    "status" "HandoverStatus" NOT NULL DEFAULT 'DISTRIBUTED',
    "notes" TEXT,
    "dispatch_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settle_time" TIMESTAMP(3),

    CONSTRAINT "gate_warden_handovers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ferry_routes" (
    "id" SERIAL NOT NULL,
    "port_id" INTEGER NOT NULL,
    "destination_name" VARCHAR(150) NOT NULL,
    "distance_miles" INTEGER NOT NULL,
    "adult_fare_idr" DECIMAL(12,2) NOT NULL,
    "child_fare_idr" DECIMAL(12,2) NOT NULL,
    "infant_fare_idr" DECIMAL(12,2) NOT NULL,
    "cargo_per_ton_idr" DECIMAL(12,2) NOT NULL,
    "legal_basis" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ferry_routes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gate_ticket_books_book_code_key" ON "gate_ticket_books"("book_code");

-- CreateIndex
CREATE INDEX "gate_ticket_books_port_id_status_idx" ON "gate_ticket_books"("port_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "gate_ticket_books_port_id_id_key" ON "gate_ticket_books"("port_id", "id");

-- CreateIndex
CREATE INDEX "gate_warden_handovers_port_id_status_idx" ON "gate_warden_handovers"("port_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ferry_routes_port_id_destination_name_key" ON "ferry_routes"("port_id", "destination_name");

-- AddForeignKey
ALTER TABLE "gate_ticket_books" ADD CONSTRAINT "gate_ticket_books_port_id_fkey" FOREIGN KEY ("port_id") REFERENCES "ports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_warden_handovers" ADD CONSTRAINT "gate_warden_handovers_port_id_fkey" FOREIGN KEY ("port_id") REFERENCES "ports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_warden_handovers" ADD CONSTRAINT "gate_warden_handovers_port_id_book_id_fkey" FOREIGN KEY ("port_id", "book_id") REFERENCES "gate_ticket_books"("port_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ferry_routes" ADD CONSTRAINT "ferry_routes_port_id_fkey" FOREIGN KEY ("port_id") REFERENCES "ports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
