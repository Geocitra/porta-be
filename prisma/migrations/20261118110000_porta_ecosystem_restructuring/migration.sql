-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'KEPALA_DINAS';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'KEPALA_BIDANG';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'KEPALA_PELABUHAN';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'PETUGAS_PELABUHAN';

-- CreateEnum
CREATE TYPE "TerminalType" AS ENUM ('BARANG', 'PENUMPANG', 'MULTIPURPOSE', 'RORO_FERRY', 'PELRA', 'KHUSUS_TUKS');

-- CreateEnum
CREATE TYPE "ZoneType" AS ENUM ('LAPANGAN_PENUMPUKAN', 'GUDANG_KAWASAN', 'RUANG_TUNGGU', 'AREA_PARKIR', 'AREA_DERMAGA', 'PERAIRAN_KOLAM', 'LAINNYA');

-- CreateEnum
CREATE TYPE "FacilityConditionStatus" AS ENUM ('GOOD', 'MINOR_DAMAGE', 'MAJOR_DAMAGE', 'UNDER_MAINTENANCE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('VESSEL_ARRIVAL_CHECK', 'BERTHING_INSPECTION', 'MANIFEST_CHECK', 'PASSENGER_SERVICE', 'CARGO_HANDLING_CHECK', 'VESSEL_DEPARTURE_CLEARANCE', 'DOCUMENT_VERIFICATION', 'COMPANY_REGISTRATION_CHECK', 'RETRIBUTION_COLLECTION', 'ASSET_MANAGEMENT_CHECK', 'FACILITY_INSPECTION', 'MAINTENANCE_HANDLING', 'SAFETY_INSPECTION', 'GENERAL_OPERATION');

-- CreateEnum
CREATE TYPE "TaskSourceType" AS ENUM ('SHIP_VISIT', 'BERTHING_RECORD', 'MANIFEST', 'CARGO_RECORD', 'DOCUMENT_SUBMISSION', 'COMPANY_ONBOARDING', 'BILLING_INVOICE', 'GATE_HANDOVER', 'ASSET_LEASE', 'MAINTENANCE_TICKET', 'SOP_SCHEDULE', 'MANUAL_ASSIGNMENT');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "TaskExecutionStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'COMPLETED', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskReviewStatus" AS ENUM ('NOT_SUBMITTED', 'WAITING_ADMIN', 'ADMIN_REVIEW', 'ADMIN_RETURNED', 'ADMIN_APPROVED', 'WAITING_HEAD_VERIFICATION', 'HEAD_VERIFIED', 'HEAD_RETURNED', 'HEAD_REJECTED');

-- CreateEnum
CREATE TYPE "TaskReviewStage" AS ENUM ('ADMIN_CHECK', 'HEAD_VERIFICATION');

-- CreateEnum
CREATE TYPE "DailyReportReviewStatus" AS ENUM ('WAITING_ADMIN', 'ADMIN_RETURNED', 'WAITING_HEAD_VERIFICATION', 'HEAD_VERIFIED', 'HEAD_RETURNED');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('INFORMATIONAL', 'WARNING', 'URGENT', 'CRITICAL');

-- AlterTable
ALTER TABLE "ports" ADD COLUMN IF NOT EXISTS "port_classification" VARCHAR(60) NOT NULL DEFAULT 'PENGUMPUL';

-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "division_id" INTEGER;

-- AlterTable
ALTER TABLE "berths" ADD COLUMN IF NOT EXISTS "terminal_id" INTEGER,
ADD COLUMN IF NOT EXISTS "max_gross_tonnage" DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS "allowed_vessel_categories" "VesselCategory"[] DEFAULT ARRAY[]::"VesselCategory"[],
ADD COLUMN IF NOT EXISTS "allowed_ship_types" "ShipType"[] DEFAULT ARRAY[]::"ShipType"[],
ADD COLUMN IF NOT EXISTS "technical_specs" JSONB;

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "actor_role" VARCHAR(60),
ADD COLUMN IF NOT EXISTS "port_id" INTEGER,
ADD COLUMN IF NOT EXISTS "ip_address" VARCHAR(80),
ADD COLUMN IF NOT EXISTS "user_agent" VARCHAR(255);

-- AlterTable
ALTER TABLE "daily_port_reports" ADD COLUMN IF NOT EXISTS "terminal_id" INTEGER,
ADD COLUMN IF NOT EXISTS "review_status" "DailyReportReviewStatus" NOT NULL DEFAULT 'WAITING_ADMIN',
ADD COLUMN IF NOT EXISTS "checked_by_admin_id" INTEGER,
ADD COLUMN IF NOT EXISTS "checked_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "admin_notes" TEXT,
ADD COLUMN IF NOT EXISTS "verified_by_head_id" INTEGER,
ADD COLUMN IF NOT EXISTS "verified_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "head_notes" TEXT,
ADD COLUMN IF NOT EXISTS "summary_snapshot" JSONB;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "port_id" INTEGER,
ADD COLUMN IF NOT EXISTS "category" VARCHAR(60) NOT NULL DEFAULT 'GENERAL',
ADD COLUMN IF NOT EXISTS "priority" "NotificationPriority" NOT NULL DEFAULT 'INFORMATIONAL',
ADD COLUMN IF NOT EXISTS "resource_type" VARCHAR(60),
ADD COLUMN IF NOT EXISTS "resource_id" VARCHAR(60),
ADD COLUMN IF NOT EXISTS "dedup_key" VARCHAR(150),
ADD COLUMN IF NOT EXISTS "read_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "divisions" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "divisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "division_ports" (
    "id" SERIAL NOT NULL,
    "division_id" INTEGER NOT NULL,
    "port_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "division_ports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "module" VARCHAR(60) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" SERIAL NOT NULL,
    "role" "UserRole" NOT NULL,
    "permission_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terminals" (
    "id" SERIAL NOT NULL,
    "port_id" INTEGER NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "terminal_type" "TerminalType" NOT NULL DEFAULT 'MULTIPURPOSE',
    "terminal_class" "TerminalClass" NOT NULL DEFAULT 'KELAS_B',
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terminals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "port_zones" (
    "id" SERIAL NOT NULL,
    "port_id" INTEGER NOT NULL,
    "terminal_id" INTEGER,
    "berth_id" INTEGER,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "zone_type" "ZoneType" NOT NULL DEFAULT 'AREA_DERMAGA',
    "area_sqm" DECIMAL(10,2),
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "port_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "port_facilities" (
    "id" SERIAL NOT NULL,
    "port_id" INTEGER NOT NULL,
    "terminal_id" INTEGER,
    "berth_id" INTEGER,
    "zone_id" INTEGER,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "facility_type" VARCHAR(80) NOT NULL,
    "condition_status" "FacilityConditionStatus" NOT NULL DEFAULT 'GOOD',
    "specifications" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "port_facilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_assignments" (
    "id" SERIAL NOT NULL,
    "assignment_code" VARCHAR(60) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role" "UserRole" NOT NULL,
    "port_id" INTEGER NOT NULL,
    "terminal_id" INTEGER,
    "berth_id" INTEGER,
    "zone_id" INTEGER,
    "task_types" "TaskType"[] DEFAULT ARRAY[]::"TaskType"[],
    "permission_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "assigned_by_id" INTEGER NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_templates" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "task_type" "TaskType" NOT NULL,
    "title_template" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "default_priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "sla_minutes" INTEGER NOT NULL DEFAULT 240,
    "sop_reference" VARCHAR(200),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_template_checklist_items" (
    "id" SERIAL NOT NULL,
    "template_id" INTEGER NOT NULL,
    "item_order" INTEGER NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "label" VARCHAR(255) NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "requires_attachment" BOOLEAN NOT NULL DEFAULT false,
    "applicable_vessel_categories" "VesselCategory"[] DEFAULT ARRAY[]::"VesselCategory"[],

    CONSTRAINT "task_template_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" SERIAL NOT NULL,
    "task_number" VARCHAR(60) NOT NULL,
    "task_type" "TaskType" NOT NULL,
    "template_id" INTEGER,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "source_type" "TaskSourceType" NOT NULL,
    "source_id" VARCHAR(80),
    "port_id" INTEGER NOT NULL,
    "terminal_id" INTEGER,
    "berth_id" INTEGER,
    "zone_id" INTEGER,
    "visit_id" INTEGER,
    "assignee_id" INTEGER,
    "assignment_id" INTEGER,
    "created_by_id" INTEGER,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "obligation_date" DATE NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "execution_status" "TaskExecutionStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "review_status" "TaskReviewStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "is_overdue" BOOLEAN NOT NULL DEFAULT false,
    "has_issue" BOOLEAN NOT NULL DEFAULT false,
    "issue_notes" TEXT,
    "notes" TEXT,
    "started_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "admin_reviewed_by_id" INTEGER,
    "admin_reviewed_at" TIMESTAMP(3),
    "admin_review_notes" TEXT,
    "head_verified_by_id" INTEGER,
    "head_verified_at" TIMESTAMP(3),
    "head_verify_notes" TEXT,
    "rejection_reason" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_checklist_items" (
    "id" SERIAL NOT NULL,
    "task_id" INTEGER NOT NULL,
    "item_order" INTEGER NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "label" VARCHAR(255) NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "is_applicable" BOOLEAN NOT NULL DEFAULT true,
    "requires_attachment" BOOLEAN NOT NULL DEFAULT false,
    "checked_by_officer" BOOLEAN NOT NULL DEFAULT false,
    "officer_notes" TEXT,
    "attachment_path" VARCHAR(255),
    "checked_by_admin" BOOLEAN NOT NULL DEFAULT false,
    "admin_notes" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_attachments" (
    "id" SERIAL NOT NULL,
    "task_id" INTEGER NOT NULL,
    "submission_id" INTEGER,
    "file_name" VARCHAR(255) NOT NULL,
    "file_path" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "uploaded_by_id" INTEGER NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_submissions" (
    "id" SERIAL NOT NULL,
    "task_id" INTEGER NOT NULL,
    "submission_number" INTEGER NOT NULL,
    "submitted_by_id" INTEGER NOT NULL,
    "notes" TEXT,
    "checklist_snapshot" JSONB,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_reviews" (
    "id" SERIAL NOT NULL,
    "task_id" INTEGER NOT NULL,
    "submission_id" INTEGER,
    "review_stage" "TaskReviewStage" NOT NULL,
    "reviewer_id" INTEGER NOT NULL,
    "reviewer_role" "UserRole" NOT NULL,
    "decision" VARCHAR(40) NOT NULL,
    "notes" TEXT,
    "reason" TEXT,
    "evidence_path" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_histories" (
    "id" SERIAL NOT NULL,
    "task_id" INTEGER NOT NULL,
    "actor_id" INTEGER,
    "actor_role" "UserRole",
    "action" VARCHAR(80) NOT NULL,
    "from_execution_status" "TaskExecutionStatus",
    "to_execution_status" "TaskExecutionStatus",
    "from_review_status" "TaskReviewStatus",
    "to_review_status" "TaskReviewStatus",
    "notes" TEXT,
    "reason" TEXT,
    "evidence_path" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "category" VARCHAR(60) NOT NULL,
    "min_priority" "NotificationPriority" NOT NULL DEFAULT 'INFORMATIONAL',
    "in_app_enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "users_division_id_idx" ON "users"("division_id");
CREATE INDEX IF NOT EXISTS "berths_terminal_id_idx" ON "berths"("terminal_id");
CREATE INDEX IF NOT EXISTS "audit_logs_port_id_created_at_idx" ON "audit_logs"("port_id", "created_at");
CREATE INDEX IF NOT EXISTS "daily_port_reports_port_id_review_status_idx" ON "daily_port_reports"("port_id", "review_status");
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_dedup_key_key" ON "notifications"("dedup_key");
CREATE INDEX IF NOT EXISTS "notifications_port_id_priority_idx" ON "notifications"("port_id", "priority");

CREATE UNIQUE INDEX "divisions_code_key" ON "divisions"("code");
CREATE UNIQUE INDEX "division_ports_division_id_port_id_key" ON "division_ports"("division_id", "port_id");
CREATE INDEX "division_ports_port_id_idx" ON "division_ports"("port_id");

CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");
CREATE INDEX "permissions_module_idx" ON "permissions"("module");
CREATE UNIQUE INDEX "role_permissions_role_permission_id_key" ON "role_permissions"("role", "permission_id");
CREATE INDEX "role_permissions_role_idx" ON "role_permissions"("role");

CREATE UNIQUE INDEX "terminals_port_id_code_key" ON "terminals"("port_id", "code");
CREATE UNIQUE INDEX "terminals_port_id_id_key" ON "terminals"("port_id", "id");

CREATE UNIQUE INDEX "port_zones_port_id_code_key" ON "port_zones"("port_id", "code");
CREATE INDEX "port_zones_port_id_berth_id_idx" ON "port_zones"("port_id", "berth_id");

CREATE UNIQUE INDEX "port_facilities_port_id_code_key" ON "port_facilities"("port_id", "code");
CREATE INDEX "port_facilities_port_id_condition_status_idx" ON "port_facilities"("port_id", "condition_status");

CREATE UNIQUE INDEX "user_assignments_assignment_code_key" ON "user_assignments"("assignment_code");
CREATE INDEX "user_assignments_user_id_status_idx" ON "user_assignments"("user_id", "status");
CREATE INDEX "user_assignments_port_id_status_idx" ON "user_assignments"("port_id", "status");
CREATE INDEX "user_assignments_port_id_berth_id_status_idx" ON "user_assignments"("port_id", "berth_id", "status");

CREATE UNIQUE INDEX "task_templates_code_key" ON "task_templates"("code");
CREATE UNIQUE INDEX "task_templates_task_type_key" ON "task_templates"("task_type");
CREATE UNIQUE INDEX "task_template_checklist_items_template_id_code_key" ON "task_template_checklist_items"("template_id", "code");
CREATE INDEX "task_template_checklist_items_template_id_item_order_idx" ON "task_template_checklist_items"("template_id", "item_order");

CREATE UNIQUE INDEX "tasks_task_number_key" ON "tasks"("task_number");
CREATE INDEX "tasks_port_id_execution_status_review_status_idx" ON "tasks"("port_id", "execution_status", "review_status");
CREATE INDEX "tasks_port_id_obligation_date_assignee_id_idx" ON "tasks"("port_id", "obligation_date", "assignee_id");
CREATE INDEX "tasks_port_id_berth_id_idx" ON "tasks"("port_id", "berth_id");
CREATE INDEX "tasks_port_id_due_date_idx" ON "tasks"("port_id", "due_date");
CREATE INDEX "tasks_source_type_source_id_idx" ON "tasks"("source_type", "source_id");

CREATE UNIQUE INDEX "task_checklist_items_task_id_code_key" ON "task_checklist_items"("task_id", "code");
CREATE INDEX "task_checklist_items_task_id_item_order_idx" ON "task_checklist_items"("task_id", "item_order");

CREATE INDEX "task_attachments_task_id_idx" ON "task_attachments"("task_id");
CREATE UNIQUE INDEX "task_submissions_task_id_submission_number_key" ON "task_submissions"("task_id", "submission_number");
CREATE INDEX "task_submissions_task_id_idx" ON "task_submissions"("task_id");

CREATE INDEX "task_reviews_task_id_review_stage_idx" ON "task_reviews"("task_id", "review_stage");
CREATE INDEX "task_reviews_reviewer_id_idx" ON "task_reviews"("reviewer_id");

CREATE INDEX "task_histories_task_id_created_at_idx" ON "task_histories"("task_id", "created_at");

CREATE UNIQUE INDEX "notification_preferences_user_id_category_key" ON "notification_preferences"("user_id", "category");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "berths" ADD CONSTRAINT "berths_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "terminals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_port_id_fkey" FOREIGN KEY ("port_id") REFERENCES "ports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "daily_port_reports" ADD CONSTRAINT "daily_port_reports_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "terminals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "daily_port_reports" ADD CONSTRAINT "daily_port_reports_checked_by_admin_id_fkey" FOREIGN KEY ("checked_by_admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "daily_port_reports" ADD CONSTRAINT "daily_port_reports_verified_by_head_id_fkey" FOREIGN KEY ("verified_by_head_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_port_id_fkey" FOREIGN KEY ("port_id") REFERENCES "ports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "division_ports" ADD CONSTRAINT "division_ports_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "division_ports" ADD CONSTRAINT "division_ports_port_id_fkey" FOREIGN KEY ("port_id") REFERENCES "ports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "terminals" ADD CONSTRAINT "terminals_port_id_fkey" FOREIGN KEY ("port_id") REFERENCES "ports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "port_zones" ADD CONSTRAINT "port_zones_port_id_fkey" FOREIGN KEY ("port_id") REFERENCES "ports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "port_zones" ADD CONSTRAINT "port_zones_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "terminals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "port_zones" ADD CONSTRAINT "port_zones_berth_id_fkey" FOREIGN KEY ("berth_id") REFERENCES "berths"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "port_facilities" ADD CONSTRAINT "port_facilities_port_id_fkey" FOREIGN KEY ("port_id") REFERENCES "ports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "port_facilities" ADD CONSTRAINT "port_facilities_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "terminals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "port_facilities" ADD CONSTRAINT "port_facilities_berth_id_fkey" FOREIGN KEY ("berth_id") REFERENCES "berths"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "port_facilities" ADD CONSTRAINT "port_facilities_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "port_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_assignments" ADD CONSTRAINT "user_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_assignments" ADD CONSTRAINT "user_assignments_port_id_fkey" FOREIGN KEY ("port_id") REFERENCES "ports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_assignments" ADD CONSTRAINT "user_assignments_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "terminals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_assignments" ADD CONSTRAINT "user_assignments_berth_id_fkey" FOREIGN KEY ("berth_id") REFERENCES "berths"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_assignments" ADD CONSTRAINT "user_assignments_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "port_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_assignments" ADD CONSTRAINT "user_assignments_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "task_template_checklist_items" ADD CONSTRAINT "task_template_checklist_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "task_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "task_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_port_id_fkey" FOREIGN KEY ("port_id") REFERENCES "ports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "terminals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_berth_id_fkey" FOREIGN KEY ("berth_id") REFERENCES "berths"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "port_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "ship_visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "user_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_admin_reviewed_by_id_fkey" FOREIGN KEY ("admin_reviewed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_head_verified_by_id_fkey" FOREIGN KEY ("head_verified_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "task_checklist_items" ADD CONSTRAINT "task_checklist_items_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "task_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "task_reviews" ADD CONSTRAINT "task_reviews_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_reviews" ADD CONSTRAINT "task_reviews_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "task_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "task_reviews" ADD CONSTRAINT "task_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "task_histories" ADD CONSTRAINT "task_histories_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_histories" ADD CONSTRAINT "task_histories_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
