-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateTable
CREATE TABLE "complaints" (
    "id" SERIAL NOT NULL,
    "ticket_number" VARCHAR(50) NOT NULL,
    "port_id" INTEGER NOT NULL,
    "reporter_name" VARCHAR(150) NOT NULL,
    "reporter_phone" VARCHAR(50),
    "reporter_email" VARCHAR(150),
    "category" VARCHAR(80) NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'OPEN',
    "resolution_note" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "complaints_ticket_number_key" ON "complaints"("ticket_number");

-- CreateIndex
CREATE INDEX "complaints_port_id_status_idx" ON "complaints"("port_id", "status");

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_port_id_fkey" FOREIGN KEY ("port_id") REFERENCES "ports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
