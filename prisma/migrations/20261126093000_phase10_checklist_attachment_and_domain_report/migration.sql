-- AlterTable
ALTER TABLE "daily_port_reports" ADD COLUMN     "domain_summary_json" JSONB;

-- AlterTable
ALTER TABLE "operator_vessels" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "task_attachments" ADD COLUMN     "checklist_item_id" INTEGER;

-- CreateIndex
CREATE INDEX "task_attachments_checklist_item_id_idx" ON "task_attachments"("checklist_item_id");

-- AddForeignKey
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_checklist_item_id_fkey" FOREIGN KEY ("checklist_item_id") REFERENCES "task_checklist_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
