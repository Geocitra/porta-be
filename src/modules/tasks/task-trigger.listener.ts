import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  MaintenanceSeverity,
  TaskPriority,
  TaskSourceType,
  TaskType,
  VesselCategory,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  COMPANY_ONBOARDED_EVENT,
  CompanyOnboardedEvent,
} from '../auth/auth.service';
import {
  CARGO_RECORD_CREATED_EVENT,
  CargoRecordCreatedEvent,
} from '../cargo-utility/cargo-utility.service';
import {
  GATE_HANDOVER_OPENED_EVENT,
  GateHandoverOpenedEvent,
  MANIFEST_CREATED_EVENT,
  ManifestCreatedEvent,
} from '../gate-ticketing/gate-ticketing.service';
import {
  MAINTENANCE_REPORTED_EVENT,
  MaintenanceReportedEvent,
} from '../maintenance/maintenance.service';
import {
  DOCUMENT_UPLOADED_EVENT,
  DocumentUploadedEvent,
} from '../vessels/vessels.service';
import {
  BERTHING_STARTED_EVENT,
  VISIT_ANCHORED_EVENT,
  VISIT_APPROVED_EVENT,
  VISIT_CREATED_EVENT,
  VISIT_DEPARTED_EVENT,
  VisitDepartedEvent,
  VisitLifecycleEvent,
} from '../visits/visits.service';
import { TasksService } from './tasks.service';

@Injectable()
export class TaskTriggerListener {
  constructor(
    private readonly tasksService: TasksService,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent(VISIT_CREATED_EVENT)
  @OnEvent(VISIT_APPROVED_EVENT)
  async handleVisitScheduledOrApproved(event: VisitLifecycleEvent): Promise<void> {
    const dueArrival = new Date(event.eta.getTime() + 4 * 60 * 60 * 1000);
    const obligationDate = event.eta.toISOString().slice(0, 10);

    // 1. Pemeriksaan Kedatangan Kapal
    await this.tasksService.createTask({
      taskType: TaskType.VESSEL_ARRIVAL_CHECK,
      title: `Pemeriksaan Kedatangan Kapal ${event.vesselName} (${event.visitNumber})`,
      description: `Lakukan pemeriksaan identitas kapal, waktu labuh/kedatangan, dan dokumen warta kedatangan untuk ${event.vesselName}.`,
      sourceType: TaskSourceType.SHIP_VISIT,
      sourceId: String(event.visitId),
      portId: event.portId,
      visitId: event.visitId,
      priority: TaskPriority.HIGH,
      obligationDate,
      dueDate: dueArrival.toISOString(),
    });

    // 2. Pemeriksaan Manifest Kapal
    await this.tasksService.createTask({
      taskType: TaskType.MANIFEST_CHECK,
      title: `Pemeriksaan Manifest Kapal ${event.vesselName} (${event.visitNumber})`,
      description: `Periksa kelengkapan manifest muatan/penumpang untuk kunjungan ${event.visitNumber}.`,
      sourceType: TaskSourceType.SHIP_VISIT,
      sourceId: String(event.visitId),
      portId: event.portId,
      visitId: event.visitId,
      priority: TaskPriority.HIGH,
      obligationDate,
      dueDate: dueArrival.toISOString(),
    });

    // 3. Pelayanan Penumpang (jika kapal PENUMPANG atau CAMPURAN)
    if (
      event.vesselCategory === VesselCategory.PENUMPANG ||
      event.vesselCategory === VesselCategory.CAMPURAN
    ) {
      await this.tasksService.createTask({
        taskType: TaskType.PASSENGER_SERVICE,
        title: `Pelayanan Penumpang ${event.vesselName} (${event.visitNumber})`,
        description: `Catat embarkasi/debarkasi penumpang dan pastikan ketertiban terminal penumpang.`,
        sourceType: TaskSourceType.SHIP_VISIT,
        sourceId: String(event.visitId),
        portId: event.portId,
        visitId: event.visitId,
        priority: TaskPriority.MEDIUM,
        obligationDate,
        dueDate: event.etd.toISOString(),
      });
    }

    // 4. Pemeriksaan Bongkar Muat Barang (jika kapal BARANG atau CAMPURAN)
    if (
      event.vesselCategory === VesselCategory.BARANG ||
      event.vesselCategory === VesselCategory.CAMPURAN
    ) {
      await this.tasksService.createTask({
        taskType: TaskType.CARGO_HANDLING_CHECK,
        title: `Pengawasan Bongkar Muat ${event.vesselName} (${event.visitNumber})`,
        description: `Verifikasi tally bongkar muat dan penempatan barang pada area penumpukan.`,
        sourceType: TaskSourceType.SHIP_VISIT,
        sourceId: String(event.visitId),
        portId: event.portId,
        visitId: event.visitId,
        priority: TaskPriority.MEDIUM,
        obligationDate,
        dueDate: event.etd.toISOString(),
      });
    }
  }

  @OnEvent(VISIT_ANCHORED_EVENT)
  async handleVisitAnchored(event: VisitLifecycleEvent): Promise<void> {
    await this.handleVisitScheduledOrApproved(event);
  }

  @OnEvent(BERTHING_STARTED_EVENT)
  async handleBerthingStarted(event: VisitLifecycleEvent): Promise<void> {
    const now = new Date();
    const due = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    await this.tasksService.createTask({
      taskType: TaskType.BERTHING_INSPECTION,
      title: `Inspeksi Sandar & Tambat ${event.vesselName} (${event.visitNumber})`,
      description: `Periksa kesesuaian sandar dermaga, checklist keselamatan tambat, dan dokumentasi foto sandar.`,
      sourceType: TaskSourceType.BERTHING_RECORD,
      sourceId: `${event.visitId}-${event.berthId ?? 0}`,
      portId: event.portId,
      terminalId: event.terminalId ?? undefined,
      berthId: event.berthId ?? undefined,
      visitId: event.visitId,
      priority: TaskPriority.HIGH,
      obligationDate: now.toISOString().slice(0, 10),
      dueDate: due.toISOString(),
    });
  }

  @OnEvent(VISIT_DEPARTED_EVENT)
  async handleVisitDeparted(event: VisitDepartedEvent): Promise<void> {
    const visit = await this.prisma.shipVisit.findUnique({
      where: { id: event.visitId },
      include: { vessel: { select: { name: true } } },
    });
    if (!visit) return;

    const now = new Date();
    const due = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    await this.tasksService.createTask({
      taskType: TaskType.VESSEL_DEPARTURE_CLEARANCE,
      title: `Pemeriksaan Keberangkatan ${visit.vessel.name} (${visit.visitNumber})`,
      description: `Pastikan seluruh catatan tambat ditutup, manifest keberangkatan lengkap, dan tagihan SKRD tercatat.`,
      sourceType: TaskSourceType.SHIP_VISIT,
      sourceId: String(visit.id),
      portId: visit.portId,
      visitId: visit.id,
      priority: TaskPriority.HIGH,
      obligationDate: now.toISOString().slice(0, 10),
      dueDate: due.toISOString(),
    });
  }

  @OnEvent(MANIFEST_CREATED_EVENT)
  async handleManifestCreated(event: ManifestCreatedEvent): Promise<void> {
    const now = new Date();
    const due = new Date(now.getTime() + 4 * 60 * 60 * 1000);
    await this.tasksService.createTask({
      taskType: TaskType.MANIFEST_CHECK,
      title: `Pemeriksaan Manifest ${event.vesselName} (${event.manifestNumber})`,
      description: `Periksa kelengkapan manifest muatan/penumpang (${event.manifestNumber}).`,
      sourceType: TaskSourceType.MANIFEST,
      sourceId: String(event.manifestId),
      portId: event.portId,
      visitId: event.visitId,
      priority: TaskPriority.HIGH,
      obligationDate: now.toISOString().slice(0, 10),
      dueDate: due.toISOString(),
    });
  }

  @OnEvent(CARGO_RECORD_CREATED_EVENT)
  async handleCargoRecordCreated(event: CargoRecordCreatedEvent): Promise<void> {
    const now = new Date();
    const due = new Date(now.getTime() + 6 * 60 * 60 * 1000);
    await this.tasksService.createTask({
      taskType: TaskType.CARGO_HANDLING_CHECK,
      title: `Pemeriksaan Bongkar Muat (${event.recordNumber})`,
      description: `Verifikasi pencatatan bongkar muat: ${event.description}.`,
      sourceType: TaskSourceType.CARGO_RECORD,
      sourceId: String(event.recordId),
      portId: event.portId,
      visitId: event.visitId ?? undefined,
      priority: TaskPriority.MEDIUM,
      obligationDate: now.toISOString().slice(0, 10),
      dueDate: due.toISOString(),
    });
  }

  @OnEvent(GATE_HANDOVER_OPENED_EVENT)
  async handleGateHandoverOpened(event: GateHandoverOpenedEvent): Promise<void> {
    const now = new Date();
    const due = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    await this.tasksService.createTask({
      taskType: TaskType.RETRIBUTION_COLLECTION,
      title: `Pertanggungjawaban Karcis Pas Masuk (${event.bookCode} - ${event.wardenName})`,
      description: `Verifikasi hasil penjualan karcis pas masuk buku ${event.bookCode} dengan kebijakan Zero Discrepancy.`,
      sourceType: TaskSourceType.GATE_HANDOVER,
      sourceId: String(event.handoverId),
      portId: event.portId,
      priority: TaskPriority.HIGH,
      obligationDate: now.toISOString().slice(0, 10),
      dueDate: due.toISOString(),
    });
  }

  @OnEvent(MAINTENANCE_REPORTED_EVENT)
  async handleMaintenanceReported(event: MaintenanceReportedEvent): Promise<void> {
    const now = new Date();
    const due = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    const priority =
      event.severity === MaintenanceSeverity.CRITICAL
        ? TaskPriority.CRITICAL
        : event.severity === MaintenanceSeverity.HIGH
          ? TaskPriority.HIGH
          : TaskPriority.MEDIUM;

    await this.tasksService.createTask({
      taskType: TaskType.MAINTENANCE_HANDLING,
      title: `Penanganan Pemeliharaan: ${event.title} (${event.ticketNumber})`,
      description: event.description,
      sourceType: TaskSourceType.MAINTENANCE_TICKET,
      sourceId: String(event.ticketId),
      portId: event.portId,
      berthId: event.berthId ?? undefined,
      priority,
      obligationDate: now.toISOString().slice(0, 10),
      dueDate: due.toISOString(),
    });
  }

  @OnEvent(COMPANY_ONBOARDED_EVENT)
  async handleCompanyOnboarded(event: CompanyOnboardedEvent): Promise<void> {
    const defaultPort = await this.prisma.port.findFirst({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    });
    if (!defaultPort) return;

    const now = new Date();
    const due = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    await this.tasksService.createTask({
      taskType: TaskType.COMPANY_REGISTRATION_CHECK,
      title: `Pemeriksaan Pendaftaran ${event.entityType}: ${event.companyName}`,
      description: `Periksa kelengkapan profil perusahaan dan dokumen legalitas pendaftaran ${event.companyName}.`,
      sourceType: TaskSourceType.COMPANY_ONBOARDING,
      sourceId: `${event.entityType}-${event.entityId}`,
      portId: defaultPort.id,
      priority: TaskPriority.MEDIUM,
      obligationDate: now.toISOString().slice(0, 10),
      dueDate: due.toISOString(),
    });
  }

  @OnEvent(DOCUMENT_UPLOADED_EVENT)
  async handleDocumentUploaded(event: DocumentUploadedEvent): Promise<void> {
    let portId = event.portId;
    if (!portId) {
      const defaultPort = await this.prisma.port.findFirst({
        where: { isActive: true },
        orderBy: { id: 'asc' },
      });
      portId = defaultPort?.id ?? null;
    }
    if (!portId) return;

    const now = new Date();
    const due = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    await this.tasksService.createTask({
      taskType: TaskType.DOCUMENT_VERIFICATION,
      title: `Pemeriksaan Dokumen ${event.category} (#${event.documentId})`,
      description: `Periksa keaslian, keterbacaan, dan masa berlaku dokumen ${event.category}.`,
      sourceType: TaskSourceType.DOCUMENT_SUBMISSION,
      sourceId: String(event.documentId),
      portId,
      priority: TaskPriority.MEDIUM,
      obligationDate: now.toISOString().slice(0, 10),
      dueDate: due.toISOString(),
    });
  }
}
