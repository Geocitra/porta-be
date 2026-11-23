import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AssignmentStatus,
  Prisma,
  TaskExecutionStatus,
  TaskPriority,
  TaskReviewStage,
  TaskReviewStatus,
  TaskSourceType,
  TaskType,
  UserRole,
  VesselCategory,
} from '@prisma/client';
import { ROLE_GROUPS } from '../../common/authz/role-taxonomy';
import {
  AuthenticatedUser,
  isPetugasRole,
} from '../../common/decorators/current-user.decorator';
import { ScopeFilter } from '../../common/guards/port-scope.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/utils/audit-log.service';
import { DocNumberUtil } from '../../common/utils/doc-number.util';
import { StorageService, UploadedFilePayload } from '../../common/utils/storage.service';
import { AssignmentsService } from '../assignments/assignments.service';
import {
  AdminApproveTaskDto,
  CreateTaskDto,
  CreateTaskTemplateDto,
  HeadVerifyTaskDto,
  ReturnOrRejectTaskDto,
  SubmitTaskDto,
  UpdateAdminTaskChecklistDto,
  UpdateOfficerTaskChecklistDto,
} from './dto/tasks.dto';
import { evaluateTaskStateTransition } from './task-state-machine';

export const TASK_WORKFLOW_EVENT = 'task.workflow_transition';

export interface TaskWorkflowEvent {
  taskId: number;
  taskNumber: string;
  taskType: TaskType;
  title: string;
  portId: number;
  berthId?: number | null;
  assigneeId?: number | null;
  actorId: number;
  actorRole: UserRole;
  action: string;
  executionStatus: TaskExecutionStatus;
  reviewStatus: TaskReviewStatus;
  reason?: string;
}

export interface DefaultChecklistSeedItem {
  itemOrder: number;
  code: string;
  label: string;
  isRequired: boolean;
  requiresAttachment: boolean;
  applicableVesselCategories: VesselCategory[];
}

export const DEFAULT_SOP_CHECKLISTS: Record<TaskType, DefaultChecklistSeedItem[]> = {
  [TaskType.MANIFEST_CHECK]: [
    {
      itemOrder: 1,
      code: 'VESSEL_DATA_AVAILABLE',
      label: 'Data kapal tersedia dan sesuai Surat Ukur',
      isRequired: true,
      requiresAttachment: false,
      applicableVesselCategories: [],
    },
    {
      itemOrder: 2,
      code: 'OPERATOR_DATA_AVAILABLE',
      label: 'Data perusahaan pelayaran / operator tersedia dan terverifikasi',
      isRequired: true,
      requiresAttachment: false,
      applicableVesselCategories: [],
    },
    {
      itemOrder: 3,
      code: 'MANIFEST_DOC_AVAILABLE',
      label: 'Dokumen manifest resmi tersedia',
      isRequired: true,
      requiresAttachment: true,
      applicableVesselCategories: [],
    },
    {
      itemOrder: 4,
      code: 'CARGO_VOLUME_RECORDED',
      label: 'Jumlah muatan barang tercatat sesuai manifest',
      isRequired: true,
      requiresAttachment: false,
      applicableVesselCategories: [VesselCategory.BARANG, VesselCategory.CAMPURAN],
    },
    {
      itemOrder: 5,
      code: 'PASSENGER_COUNT_RECORDED',
      label: 'Data jumlah penumpang dan kendaraan tercatat sesuai manifest',
      isRequired: true,
      requiresAttachment: false,
      applicableVesselCategories: [VesselCategory.PENUMPANG, VesselCategory.CAMPURAN],
    },
    {
      itemOrder: 6,
      code: 'MANDATORY_ATTACHMENT_UPLOADED',
      label: 'Lampiran wajib bukti pemeriksaan manifest tersedia',
      isRequired: true,
      requiresAttachment: true,
      applicableVesselCategories: [],
    },
  ],
  [TaskType.VESSEL_ARRIVAL_CHECK]: [
    {
      itemOrder: 1,
      code: 'VESSEL_IDENTITY_VERIFIED',
      label: 'Identitas kapal, GT, LOA, dan Draft telah diperiksa',
      isRequired: true,
      requiresAttachment: false,
      applicableVesselCategories: [],
    },
    {
      itemOrder: 2,
      code: 'ATA_ANCHORAGE_RECORDED',
      label: 'Waktu kedatangan (ATA Labuh) telah tercatat akurat',
      isRequired: true,
      requiresAttachment: false,
      applicableVesselCategories: [],
    },
    {
      itemOrder: 3,
      code: 'ARRIVAL_CLEARANCE_DOC',
      label: 'Dokumen warta kedatangan kapal telah diperiksa',
      isRequired: true,
      requiresAttachment: false,
      applicableVesselCategories: [],
    },
  ],
  [TaskType.BERTHING_INSPECTION]: [
    {
      itemOrder: 1,
      code: 'BERTH_COMPATIBILITY_CHECKED',
      label: 'Kesesuaian spesifikasi teknis kapal terhadap dermaga telah diperiksa',
      isRequired: true,
      requiresAttachment: false,
      applicableVesselCategories: [],
    },
    {
      itemOrder: 2,
      code: 'SAFETY_MOORING_VERIFIED',
      label: 'Checklist keselamatan tambat (bollard/fender/tali tambat) telah terverifikasi',
      isRequired: true,
      requiresAttachment: false,
      applicableVesselCategories: [],
    },
    {
      itemOrder: 3,
      code: 'BERTHING_PHOTO_ATTACHED',
      label: 'Foto bukti kapal bersandar di dermaga telah dilampirkan',
      isRequired: true,
      requiresAttachment: true,
      applicableVesselCategories: [],
    },
  ],
  [TaskType.PASSENGER_SERVICE]: [
    {
      itemOrder: 1,
      code: 'PASSENGER_EMBARK_DEBARK_COUNTED',
      label: 'Jumlah penumpang naik/turun dan pengantar telah dihitung',
      isRequired: true,
      requiresAttachment: false,
      applicableVesselCategories: [VesselCategory.PENUMPANG, VesselCategory.CAMPURAN],
    },
    {
      itemOrder: 2,
      code: 'TERMINAL_PASSENGER_FLOW_SAFE',
      label: 'Ketertiban dan keselamatan alur terminal penumpang terjaga',
      isRequired: true,
      requiresAttachment: false,
      applicableVesselCategories: [VesselCategory.PENUMPANG, VesselCategory.CAMPURAN],
    },
  ],
  [TaskType.CARGO_HANDLING_CHECK]: [
    {
      itemOrder: 1,
      code: 'CARGO_TALLY_VERIFIED',
      label: 'Data kategori dan tonase/unit bongkar muat telah diverifikasi',
      isRequired: true,
      requiresAttachment: false,
      applicableVesselCategories: [VesselCategory.BARANG, VesselCategory.CAMPURAN],
    },
    {
      itemOrder: 2,
      code: 'STORAGE_YARD_CHECKED',
      label: 'Penempatan barang di gudang/lapangan penumpukan sesuai zona',
      isRequired: true,
      requiresAttachment: false,
      applicableVesselCategories: [VesselCategory.BARANG, VesselCategory.CAMPURAN],
    },
  ],
  [TaskType.VESSEL_DEPARTURE_CLEARANCE]: [
    {
      itemOrder: 1,
      code: 'BERTHING_CLOSED_CHECK',
      label: 'Seluruh catatan waktu tambat (actualEndAt) telah ditutup',
      isRequired: true,
      requiresAttachment: false,
      applicableVesselCategories: [],
    },
    {
      itemOrder: 2,
      code: 'BILLING_SKRD_CHECKED',
      label: 'Status kewajiban retribusi/SKRD kunjungan telah diperiksa',
      isRequired: true,
      requiresAttachment: false,
      applicableVesselCategories: [],
    },
    {
      itemOrder: 3,
      code: 'ATD_RECORDED',
      label: 'Waktu keberangkatan aktual (ATD) kapal tercatat',
      isRequired: true,
      requiresAttachment: false,
      applicableVesselCategories: [],
    },
  ],
  [TaskType.DOCUMENT_VERIFICATION]: [
    {
      itemOrder: 1,
      code: 'DOC_READABILITY_CHECK',
      label: 'File dokumen dapat dibuka dan terbaca dengan jelas',
      isRequired: true,
      requiresAttachment: false,
      applicableVesselCategories: [],
    },
    {
      itemOrder: 2,
      code: 'DOC_NUMBER_VALIDITY',
      label: 'Nomor dokumen dan masa berlaku sesuai ketentuan',
      isRequired: true,
      requiresAttachment: false,
      applicableVesselCategories: [],
    },
  ],
  [TaskType.COMPANY_REGISTRATION_CHECK]: [
    {
      itemOrder: 1,
      code: 'COMPANY_IDENTITY_CHECK',
      label: 'Nama perusahaan, alamat, dan kontak telah diperiksa',
      isRequired: true,
      requiresAttachment: false,
      applicableVesselCategories: [],
    },
    {
      itemOrder: 2,
      code: 'LEGAL_NIB_NPWP_CHECK',
      label: 'Kelengkapan NPWP dan SIUPAL/NIB perusahaan telah diperiksa',
      isRequired: true,
      requiresAttachment: false,
      applicableVesselCategories: [],
    },
  ],
  [TaskType.RETRIBUTION_COLLECTION]: [
    {
      itemOrder: 1,
      code: 'TARIFF_CALCULATION_CHECK',
      label: 'Perhitungan tarif retribusi sesuai Perda Mimika No. 4/2023',
      isRequired: true,
      requiresAttachment: false,
      applicableVesselCategories: [],
    },
    {
      itemOrder: 2,
      code: 'PAYMENT_PROOF_CHECK',
      label: 'Bukti pembayaran / setoran tunai sesuai nominal tagihan',
      isRequired: true,
      requiresAttachment: false,
      applicableVesselCategories: [],
    },
  ],
  [TaskType.ASSET_MANAGEMENT_CHECK]: [
    {
      itemOrder: 1,
      code: 'ASSET_STATUS_CHECK',
      label: 'Status ketersediaan dan luasan aset telah diperiksa',
      isRequired: true,
      requiresAttachment: false,
      applicableVesselCategories: [],
    },
    {
      itemOrder: 2,
      code: 'TENANT_ELIGIBILITY_CHECK',
      label: 'Kelengkapan profil dan dokumen penyewa (Tenant) sesuai',
      isRequired: true,
      requiresAttachment: false,
      applicableVesselCategories: [],
    },
  ],
  [TaskType.FACILITY_INSPECTION]: [
    {
      itemOrder: 1,
      code: 'PHYSICAL_CONDITION_CHECK',
      label: 'Kondisi fisik dermaga, bollard, fender, dan lantai diperiksa',
      isRequired: true,
      requiresAttachment: false,
      applicableVesselCategories: [],
    },
    {
      itemOrder: 2,
      code: 'INSPECTION_PHOTO_ATTACHED',
      label: 'Foto hasil inspeksi fasilitas dilampirkan',
      isRequired: true,
      requiresAttachment: true,
      applicableVesselCategories: [],
    },
  ],
  [TaskType.MAINTENANCE_HANDLING]: [
    {
      itemOrder: 1,
      code: 'DAMAGE_ASSESSMENT_DONE',
      label: 'Pemeriksaan tingkat kerusakan dan kebutuhan perbaikan telah dilakukan',
      isRequired: true,
      requiresAttachment: false,
      applicableVesselCategories: [],
    },
    {
      itemOrder: 2,
      code: 'REPAIR_ACTION_RECORDED',
      label: 'Tindakan penanganan/perbaikan telah dicatat',
      isRequired: true,
      requiresAttachment: false,
      applicableVesselCategories: [],
    },
  ],
  [TaskType.SAFETY_INSPECTION]: [
    {
      itemOrder: 1,
      code: 'SAFETY_EQUIPMENT_READY',
      label: 'Peralatan keselamatan kerja dan navigasi dermaga siap pakai',
      isRequired: true,
      requiresAttachment: false,
      applicableVesselCategories: [],
    },
    {
      itemOrder: 2,
      code: 'HAZARD_MITIGATION_VERIFIED',
      label: 'Mitigasi risiko operasional telah diverifikasi',
      isRequired: true,
      requiresAttachment: false,
      applicableVesselCategories: [],
    },
  ],
  [TaskType.GENERAL_OPERATION]: [
    {
      itemOrder: 1,
      code: 'OPERATION_EXECUTED',
      label: 'Pelaksanaan tugas operasional telah diselesaikan sesuai instruksi',
      isRequired: true,
      requiresAttachment: false,
      applicableVesselCategories: [],
    },
  ],
};

const TASK_DETAIL_INCLUDE = {
  port: { select: { id: true, code: true, name: true, portCategory: true } },
  terminal: { select: { id: true, code: true, name: true, terminalType: true } },
  berth: { select: { id: true, code: true, name: true, berthServiceCategory: true } },
  zone: { select: { id: true, code: true, name: true, zoneType: true } },
  visit: {
    select: {
      id: true,
      visitNumber: true,
      status: true,
      eta: true,
      etd: true,
      vessel: { select: { id: true, name: true, registrationNumber: true, vesselCategory: true } },
      operator: { select: { id: true, name: true } },
    },
  },
  assignee: { select: { id: true, fullName: true, email: true, role: true } },
  assignment: {
    select: {
      id: true,
      assignmentCode: true,
      portId: true,
      terminalId: true,
      berthId: true,
      taskTypes: true,
      permissionCodes: true,
    },
  },
  createdBy: { select: { id: true, fullName: true, role: true } },
  adminReviewedBy: { select: { id: true, fullName: true, role: true } },
  headVerifiedBy: { select: { id: true, fullName: true, role: true } },
  checklistItems: { orderBy: { itemOrder: 'asc' as const } },
  attachments: { orderBy: { createdAt: 'desc' as const } },
  submissions: {
    include: { submittedBy: { select: { id: true, fullName: true } } },
    orderBy: { submissionNumber: 'desc' as const },
  },
  reviews: {
    include: { reviewer: { select: { id: true, fullName: true, role: true } } },
    orderBy: { createdAt: 'desc' as const },
  },
  histories: {
    include: { actor: { select: { id: true, fullName: true, role: true } } },
    orderBy: { createdAt: 'desc' as const },
  },
} as const;

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly storage: StorageService,
    private readonly assignmentsService: AssignmentsService,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  /**
   * Synchronizes overdue status for tasks whose dueDate has passed while not yet completed or cancelled.
   */
  async syncOverdueTasks(portId?: number): Promise<number> {
    const now = new Date();
    const updated = await this.prisma.task.updateMany({
      where: {
        ...(portId ? { portId } : {}),
        dueDate: { lt: now },
        isOverdue: false,
        executionStatus: {
          notIn: [TaskExecutionStatus.COMPLETED, TaskExecutionStatus.CANCELLED],
        },
      },
      data: {
        isOverdue: true,
      },
    });

    await this.prisma.task.updateMany({
      where: {
        ...(portId ? { portId } : {}),
        dueDate: { lt: now },
        executionStatus: TaskExecutionStatus.NOT_STARTED,
      },
      data: {
        executionStatus: TaskExecutionStatus.OVERDUE,
        isOverdue: true,
      },
    });

    return updated.count;
  }

  async findTemplates() {
    return this.prisma.taskTemplate.findMany({
      where: { isActive: true },
      include: { checklistItems: { orderBy: { itemOrder: 'asc' } } },
      orderBy: { code: 'asc' },
    });
  }

  async createOrUpdateTemplate(dto: CreateTaskTemplateDto, actor: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.taskTemplate.findUnique({
        where: { taskType: dto.taskType },
      });

      if (existing) {
        await tx.taskTemplateChecklistItem.deleteMany({
          where: { templateId: existing.id },
        });
        const updated = await tx.taskTemplate.update({
          where: { id: existing.id },
          data: {
            code: dto.code,
            titleTemplate: dto.titleTemplate,
            description: dto.description,
            defaultPriority: dto.defaultPriority ?? TaskPriority.MEDIUM,
            slaMinutes: dto.slaMinutes ?? 240,
            sopReference: dto.sopReference,
            checklistItems: {
              create: dto.checklistItems.map((item) => ({
                itemOrder: item.itemOrder,
                code: item.code,
                label: item.label,
                isRequired: item.isRequired ?? true,
                requiresAttachment: item.requiresAttachment ?? false,
                applicableVesselCategories: item.applicableVesselCategories ?? [],
              })),
            },
          },
          include: { checklistItems: { orderBy: { itemOrder: 'asc' } } },
        });

        await this.auditLog.record({
          actorId: actor.id,
          actorRole: actor.role,
          action: 'TASK_TEMPLATE_UPDATED',
          entityName: 'task_templates',
          entityId: updated.id,
          afterData: updated,
          tx,
        });

        return updated;
      }

      const created = await tx.taskTemplate.create({
        data: {
          code: dto.code,
          taskType: dto.taskType,
          titleTemplate: dto.titleTemplate,
          description: dto.description,
          defaultPriority: dto.defaultPriority ?? TaskPriority.MEDIUM,
          slaMinutes: dto.slaMinutes ?? 240,
          sopReference: dto.sopReference,
          checklistItems: {
            create: dto.checklistItems.map((item) => ({
              itemOrder: item.itemOrder,
              code: item.code,
              label: item.label,
              isRequired: item.isRequired ?? true,
              requiresAttachment: item.requiresAttachment ?? false,
              applicableVesselCategories: item.applicableVesselCategories ?? [],
            })),
          },
        },
        include: { checklistItems: { orderBy: { itemOrder: 'asc' } } },
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'TASK_TEMPLATE_CREATED',
        entityName: 'task_templates',
        entityId: created.id,
        afterData: created,
        tx,
      });

      return created;
    });
  }

  async findAll(
    scope: ScopeFilter,
    user: AuthenticatedUser,
    filters?: {
      portId?: number;
      terminalId?: number;
      berthId?: number;
      assigneeId?: number;
      taskType?: TaskType;
      executionStatus?: TaskExecutionStatus;
      reviewStatus?: TaskReviewStatus;
      isOverdue?: boolean;
      unsubmittedOnly?: boolean;
      obligationDate?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const effectivePortId = scope.portId ?? filters?.portId;
    await this.syncOverdueTasks(effectivePortId);

    const where: Prisma.TaskWhereInput = {
      ...(effectivePortId ? { portId: effectivePortId } : {}),
      ...(scope.allowedPortIds && !effectivePortId
        ? { portId: { in: scope.allowedPortIds } }
        : {}),
      ...(filters?.terminalId ? { terminalId: filters.terminalId } : {}),
      ...(filters?.berthId ? { berthId: filters.berthId } : {}),
      ...(filters?.assigneeId ? { assigneeId: filters.assigneeId } : {}),
      ...(filters?.taskType ? { taskType: filters.taskType } : {}),
      ...(filters?.executionStatus ? { executionStatus: filters.executionStatus } : {}),
      ...(filters?.reviewStatus ? { reviewStatus: filters.reviewStatus } : {}),
      ...(filters?.isOverdue !== undefined ? { isOverdue: filters.isOverdue } : {}),
      ...(filters?.unsubmittedOnly
        ? {
          executionStatus: {
            in: [
              TaskExecutionStatus.NOT_STARTED,
              TaskExecutionStatus.IN_PROGRESS,
              TaskExecutionStatus.OVERDUE,
            ],
          },
        }
        : {}),
      ...(filters?.obligationDate
        ? { obligationDate: new Date(filters.obligationDate) }
        : {}),
      ...(filters?.search
        ? {
          OR: [
            { title: { contains: filters.search, mode: 'insensitive' } },
            { taskNumber: { contains: filters.search, mode: 'insensitive' } },
            { description: { contains: filters.search, mode: 'insensitive' } },
          ],
        }
        : {}),
    };

    // Enforce Berth-level isolation for PETUGAS_PELABUHAN
    if (isPetugasRole(user.role) && scope.allowedBerthIds && scope.allowedBerthIds.length > 0) {
      where.AND = [
        {
          OR: [
            { berthId: { in: scope.allowedBerthIds } },
            { assigneeId: user.id },
          ],
        },
      ];
    }

    if (filters?.page && filters?.limit) {
      const page = Math.max(1, filters.page);
      const limit = Math.min(100, Math.max(1, filters.limit));
      const [total, data] = await Promise.all([
        this.prisma.task.count({ where }),
        this.prisma.task.findMany({
          where,
          include: TASK_DETAIL_INCLUDE,
          orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
        }),
      ]);
      return { page, limit, total, totalPages: Math.ceil(total / limit), data };
    }

    return this.prisma.task.findMany({
      where,
      include: TASK_DETAIL_INCLUDE,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findById(taskId: number, user: AuthenticatedUser, scope: ScopeFilter) {
    await this.syncOverdueTasks(scope.portId);
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: TASK_DETAIL_INCLUDE,
    });
    if (!task) {
      throw new NotFoundException(`Task #${taskId} not found`);
    }

    if (scope.portId && task.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port task access is forbidden');
    }
    if (
      scope.allowedPortIds &&
      scope.allowedPortIds.length > 0 &&
      !scope.allowedPortIds.includes(task.portId)
    ) {
      throw new ForbiddenException('Task port is outside your division scope');
    }

    if (isPetugasRole(user.role)) {
      await this.assignmentsService.assertOfficerAssignmentScope(user, {
        portId: task.portId,
        berthId: task.berthId,
        terminalId: task.terminalId,
      });
    }

    return task;
  }

  /**
   * Determines the prioritized specialized officer roles for a given task type and context.
   */
  private getPreferredRolesForTask(params: {
    taskType: TaskType;
    vesselCategory?: VesselCategory | null;
    sourceType?: TaskSourceType | null;
  }): UserRole[] {
    switch (params.taskType) {
      case TaskType.COMPANY_REGISTRATION_CHECK:
      case TaskType.DOCUMENT_VERIFICATION:
        return [
          UserRole.PETUGAS_REGISTRASI_KONTRAK,
          UserRole.PETUGAS_PELABUHAN,
          UserRole.ADMIN_PELABUHAN,
        ];
      case TaskType.CARGO_HANDLING_CHECK:
        return [
          UserRole.PETUGAS_DERMAGA_BARANG,
          UserRole.PETUGAS_DERMAGA,
          UserRole.PETUGAS_PELABUHAN,
        ];
      case TaskType.PASSENGER_SERVICE:
        return [
          UserRole.PETUGAS_DERMAGA_PENUMPANG,
          UserRole.PETUGAS_DERMAGA,
          UserRole.PETUGAS_PELABUHAN,
        ];
      case TaskType.VESSEL_ARRIVAL_CHECK:
      case TaskType.BERTHING_INSPECTION:
      case TaskType.MANIFEST_CHECK:
      case TaskType.VESSEL_DEPARTURE_CLEARANCE:
      case TaskType.SAFETY_INSPECTION:
        if (params.vesselCategory === VesselCategory.BARANG) {
          return [
            UserRole.PETUGAS_DERMAGA_BARANG,
            UserRole.PETUGAS_DERMAGA,
            UserRole.PETUGAS_PELABUHAN,
          ];
        }
        if (params.vesselCategory === VesselCategory.PENUMPANG) {
          return [
            UserRole.PETUGAS_DERMAGA_PENUMPANG,
            UserRole.PETUGAS_DERMAGA,
            UserRole.PETUGAS_PELABUHAN,
          ];
        }
        return [
          UserRole.PETUGAS_DERMAGA_PENUMPANG,
          UserRole.PETUGAS_DERMAGA_BARANG,
          UserRole.PETUGAS_DERMAGA,
          UserRole.PETUGAS_PELABUHAN,
        ];
      case TaskType.ASSET_MANAGEMENT_CHECK:
      case TaskType.FACILITY_INSPECTION:
      case TaskType.MAINTENANCE_HANDLING:
        return [
          UserRole.PETUGAS_RUANGAN,
          UserRole.PETUGAS_PELABUHAN,
          UserRole.ADMIN_PELABUHAN,
        ];
      case TaskType.RETRIBUTION_COLLECTION:
        if (params.sourceType === TaskSourceType.GATE_HANDOVER) {
          return [
            UserRole.BENDAHARA,
            UserRole.PETUGAS_TAGIHAN,
            UserRole.PETUGAS_PELABUHAN,
          ];
        }
        return [
          UserRole.PETUGAS_TAGIHAN,
          UserRole.BENDAHARA,
          UserRole.PETUGAS_PELABUHAN,
        ];
      default:
        return [
          UserRole.PETUGAS_DERMAGA,
          UserRole.PETUGAS_PELABUHAN,
          UserRole.ADMIN_PELABUHAN,
        ];
    }
  }

  /**
   * Resolves the best matching active officer assignment for auto-assigning a task.
   */
  private async resolveMatchingAssignment(params: {
    portId: number;
    berthId?: number | null;
    terminalId?: number | null;
    taskType: TaskType;
    vesselCategory?: VesselCategory | null;
    sourceType?: TaskSourceType | null;
    preferredAssigneeId?: number | null;
  }) {
    const now = new Date();
    const candidates = await this.prisma.userAssignment.findMany({
      where: {
        portId: params.portId,
        status: AssignmentStatus.ACTIVE,
        startDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
        ...(params.preferredAssigneeId ? { userId: params.preferredAssigneeId } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });

    const filtered = candidates.filter((a) => {
      const berthOk = !params.berthId || a.berthId === null || a.berthId === params.berthId;
      const typeOk = a.taskTypes.length === 0 || a.taskTypes.includes(params.taskType);
      return berthOk && typeOk;
    });

    if (params.preferredAssigneeId && filtered.length > 0) {
      const exactBerth = filtered.find((a) => params.berthId && a.berthId === params.berthId);
      return exactBerth ?? filtered[0];
    }

    const preferredRoles = this.getPreferredRolesForTask({
      taskType: params.taskType,
      vesselCategory: params.vesselCategory,
      sourceType: params.sourceType,
    });

    for (const targetRole of preferredRoles) {
      const roleMatched = filtered.filter((a) => a.role === targetRole);
      if (roleMatched.length > 0) {
        const exactBerth = roleMatched.find((a) => params.berthId && a.berthId === params.berthId);
        return exactBerth ?? roleMatched[0];
      }
    }

    // Prefer exact berth match over generic port-wide assignment
    const exactBerth = filtered.find((a) => params.berthId && a.berthId === params.berthId);
    return exactBerth ?? filtered[0] ?? null;
  }

  /**
   * Builds checklist items for a task from its TaskTemplate (or DEFAULT_SOP_CHECKLISTS)
   * and evaluates applicability against the vessel's category.
   */
  private async buildChecklistItemsForTask(
    taskType: TaskType,
    vesselCategory?: VesselCategory | null,
  ) {
    const template = await this.prisma.taskTemplate.findUnique({
      where: { taskType },
      include: { checklistItems: { orderBy: { itemOrder: 'asc' } } },
    });

    const rawItems =
      template && template.checklistItems.length > 0
        ? template.checklistItems
        : DEFAULT_SOP_CHECKLISTS[taskType] ?? DEFAULT_SOP_CHECKLISTS[TaskType.GENERAL_OPERATION];

    const checklistItems = rawItems.map((item) => {
      const isApplicable =
        !vesselCategory ||
        item.applicableVesselCategories.length === 0 ||
        item.applicableVesselCategories.includes(vesselCategory);
      return {
        itemOrder: item.itemOrder,
        code: item.code,
        label: item.label,
        isRequired: isApplicable ? item.isRequired : false,
        isApplicable,
        requiresAttachment: isApplicable ? item.requiresAttachment : false,
      };
    });

    return { templateId: template?.id ?? null, checklistItems };
  }

  async createTask(
    dto: CreateTaskDto,
    actor?: AuthenticatedUser,
    scope?: ScopeFilter,
  ) {
    if (actor?.role === UserRole.SUPERADMIN) {
      throw new ForbiddenException(
        'SUPERADMIN tidak berwenang membuat atau mengeksekusi pekerjaan operasional.',
      );
    }
    if (scope?.portId && dto.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port task creation is forbidden');
    }

    const port = await this.prisma.port.findUnique({ where: { id: dto.portId } });
    if (!port) throw new NotFoundException(`Port #${dto.portId} not found`);

    let vesselCategory: VesselCategory | null = null;
    if (dto.visitId) {
      const visit = await this.prisma.shipVisit.findUnique({
        where: { id: dto.visitId },
        include: { vessel: { select: { vesselCategory: true } } },
      });
      if (!visit || visit.portId !== dto.portId) {
        throw new BadRequestException(
          `Visit #${dto.visitId} does not belong to Port #${dto.portId}`,
        );
      }
      vesselCategory = visit.vessel.vesselCategory;
    }

    if (dto.berthId) {
      const berth = await this.prisma.berth.findUnique({ where: { id: dto.berthId } });
      if (!berth || berth.portId !== dto.portId) {
        throw new BadRequestException(
          `Berth #${dto.berthId} does not belong to Port #${dto.portId}`,
        );
      }
      if (actor && isPetugasRole(actor.role)) {
        await this.assignmentsService.assertOfficerAssignmentScope(actor, {
          portId: dto.portId,
          berthId: dto.berthId,
          taskType: dto.taskType,
        });
      }
    }

    // Deduplicate automatic trigger tasks with identical (sourceType, sourceId, taskType)
    if (dto.sourceType && dto.sourceType !== TaskSourceType.MANUAL_ASSIGNMENT && dto.sourceId) {
      const existingAuto = await this.prisma.task.findFirst({
        where: {
          portId: dto.portId,
          taskType: dto.taskType,
          sourceType: dto.sourceType,
          sourceId: String(dto.sourceId),
          executionStatus: { not: TaskExecutionStatus.CANCELLED },
        },
        include: TASK_DETAIL_INCLUDE,
      });
      if (existingAuto) return existingAuto;
    }

    const matchedAssignment = await this.resolveMatchingAssignment({
      portId: dto.portId,
      berthId: dto.berthId,
      terminalId: dto.terminalId,
      taskType: dto.taskType,
      vesselCategory,
      sourceType: dto.sourceType ?? null,
      preferredAssigneeId:
        dto.assigneeId ?? (actor && isPetugasRole(actor.role) ? actor.id : undefined),
    });

    let assigneeId =
      dto.assigneeId ??
      matchedAssignment?.userId ??
      (actor && isPetugasRole(actor.role) ? actor.id : null);

    // Fallback: if no UserAssignment row exists yet, find an active user in the port matching preferred specialized roles
    if (!assigneeId && this.prisma.user?.findFirst) {
      const preferredRoles = this.getPreferredRolesForTask({
        taskType: dto.taskType,
        vesselCategory,
        sourceType: dto.sourceType ?? null,
      });
      for (const role of preferredRoles) {
        const directUser = await this.prisma.user.findFirst({
          where: { portId: dto.portId, role, isActive: true },
          select: { id: true },
          orderBy: { id: 'asc' },
        });
        if (directUser) {
          assigneeId = directUser.id;
          break;
        }
      }
    }

    const { templateId, checklistItems } = await this.buildChecklistItemsForTask(
      dto.taskType,
      vesselCategory,
    );

    const dueDate = new Date(dto.dueDate);
    const obligationDate = dto.obligationDate
      ? new Date(dto.obligationDate)
      : new Date(dueDate.toISOString().slice(0, 10));
    const isOverdue = dueDate < new Date();
    const taskNumber = DocNumberUtil.generate('TSK', dto.portId);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          taskNumber,
          taskType: dto.taskType,
          templateId,
          title: dto.title,
          description: dto.description,
          sourceType: dto.sourceType ?? TaskSourceType.MANUAL_ASSIGNMENT,
          sourceId: dto.sourceId ? String(dto.sourceId) : null,
          portId: dto.portId,
          terminalId: dto.terminalId ?? matchedAssignment?.terminalId ?? null,
          berthId: dto.berthId ?? matchedAssignment?.berthId ?? null,
          zoneId: dto.zoneId ?? matchedAssignment?.zoneId ?? null,
          visitId: dto.visitId ?? null,
          assigneeId,
          assignmentId: matchedAssignment?.id ?? null,
          createdById: actor?.id ?? null,
          priority: dto.priority ?? TaskPriority.MEDIUM,
          obligationDate,
          dueDate,
          executionStatus: isOverdue
            ? TaskExecutionStatus.OVERDUE
            : TaskExecutionStatus.NOT_STARTED,
          reviewStatus: TaskReviewStatus.NOT_SUBMITTED,
          isOverdue,
          checklistItems: {
            create: checklistItems,
          },
          histories: {
            create: {
              actorId: actor?.id ?? null,
              actorRole: actor?.role ?? null,
              action: 'TASK_CREATED',
              toExecutionStatus: isOverdue
                ? TaskExecutionStatus.OVERDUE
                : TaskExecutionStatus.NOT_STARTED,
              toReviewStatus: TaskReviewStatus.NOT_SUBMITTED,
              notes: `Task diterbitkan dari sumber ${dto.sourceType ?? TaskSourceType.MANUAL_ASSIGNMENT}`,
            },
          },
        },
        include: TASK_DETAIL_INCLUDE,
      });

      await this.auditLog.record({
        actorId: actor?.id,
        actorRole: actor?.role,
        portId: created.portId,
        action: 'TASK_CREATED',
        entityName: 'tasks',
        entityId: created.id,
        afterData: {
          taskNumber: created.taskNumber,
          taskType: created.taskType,
          portId: created.portId,
          berthId: created.berthId,
          assigneeId: created.assigneeId,
        },
        tx,
      });

      return created;
    });
  }

  async startTask(taskId: number, actor: AuthenticatedUser, scope: ScopeFilter) {
    const task = await this.findById(taskId, actor, scope);

    await this.assignmentsService.assertOfficerAssignmentScope(actor, {
      portId: task.portId,
      berthId: task.berthId,
      terminalId: task.terminalId,
      taskType: task.taskType,
      requiredPermission: 'task.execute',
    });

    const transition = evaluateTaskStateTransition({
      action: 'START_EXECUTION',
      actorRole: actor.role,
      actorId: actor.id,
      assigneeId: task.assigneeId,
      currentExecutionStatus: task.executionStatus,
      currentReviewStatus: task.reviewStatus,
    });

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id: taskId },
        data: {
          executionStatus: transition.nextExecutionStatus,
          assigneeId: task.assigneeId ?? actor.id,
          startedAt: task.startedAt ?? new Date(),
        },
        include: TASK_DETAIL_INCLUDE,
      });

      await tx.taskHistory.create({
        data: {
          taskId,
          actorId: actor.id,
          actorRole: actor.role,
          action: 'START_EXECUTION',
          fromExecutionStatus: task.executionStatus,
          toExecutionStatus: transition.nextExecutionStatus,
          fromReviewStatus: task.reviewStatus,
          toReviewStatus: transition.nextReviewStatus,
          notes: 'Petugas memulai pengerjaan task',
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: task.portId,
        action: 'TASK_STARTED',
        entityName: 'tasks',
        entityId: taskId,
        beforeData: { executionStatus: task.executionStatus },
        afterData: { executionStatus: updated.executionStatus },
        tx,
      });

      return updated;
    });
  }

  async updateOfficerChecklist(
    taskId: number,
    dto: UpdateOfficerTaskChecklistDto,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    if (!isPetugasRole(actor.role) && actor.role !== UserRole.BENDAHARA) {
      throw new ForbiddenException(
        'Hanya Petugas Pelabuhan / Bendahara yang dapat mengisi checklist pelaksanaan pekerjaan.',
      );
    }

    const task = await this.findById(taskId, actor, scope);
    await this.assignmentsService.assertOfficerAssignmentScope(actor, {
      portId: task.portId,
      berthId: task.berthId,
      terminalId: task.terminalId,
      taskType: task.taskType,
      requiredPermission: 'task.execute',
    });

    if (
      task.executionStatus === TaskExecutionStatus.SUBMITTED ||
      task.executionStatus === TaskExecutionStatus.COMPLETED ||
      task.executionStatus === TaskExecutionStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Checklist tidak dapat diubah saat status pelaksanaan ${task.executionStatus}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      for (const item of dto.items) {
        await tx.taskChecklistItem.updateMany({
          where: { taskId, code: item.code },
          data: {
            checkedByOfficer: item.checkedByOfficer,
            ...(item.officerNotes !== undefined ? { officerNotes: item.officerNotes } : {}),
            ...(item.attachmentPath !== undefined ? { attachmentPath: item.attachmentPath } : {}),
          },
        });
      }

      const nextExecStatus =
        task.executionStatus === TaskExecutionStatus.NOT_STARTED ||
          task.executionStatus === TaskExecutionStatus.OVERDUE
          ? TaskExecutionStatus.IN_PROGRESS
          : task.executionStatus;

      const updated = await tx.task.update({
        where: { id: taskId },
        data: {
          executionStatus: nextExecStatus,
          startedAt: task.startedAt ?? new Date(),
          assigneeId: task.assigneeId ?? actor.id,
          ...(dto.hasIssue !== undefined ? { hasIssue: dto.hasIssue } : {}),
          ...(dto.issueNotes !== undefined ? { issueNotes: dto.issueNotes } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        },
        include: TASK_DETAIL_INCLUDE,
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: task.portId,
        action: 'TASK_CHECKLIST_UPDATED_BY_OFFICER',
        entityName: 'tasks',
        entityId: taskId,
        afterData: { itemsUpdated: dto.items.length, hasIssue: updated.hasIssue },
        tx,
      });

      return updated;
    });
  }

  async uploadTaskAttachment(
    taskId: number,
    file: UploadedFilePayload,
    notes: string | undefined,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    if (!file) throw new BadRequestException('File lampiran wajib diunggah');
    const task = await this.findById(taskId, actor, scope);

    if (isPetugasRole(actor.role)) {
      await this.assignmentsService.assertOfficerAssignmentScope(actor, {
        portId: task.portId,
        berthId: task.berthId,
        terminalId: task.terminalId,
        taskType: task.taskType,
      });
    }

    const filePath = await this.storage.saveFile(`tasks/${taskId}`, file);

    return this.prisma.$transaction(async (tx) => {
      const attachment = await tx.taskAttachment.create({
        data: {
          taskId,
          fileName: file.originalname,
          filePath,
          mimeType: file.mimetype,
          uploadedById: actor.id,
          notes,
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: task.portId,
        action: 'TASK_ATTACHMENT_UPLOADED',
        entityName: 'task_attachments',
        entityId: attachment.id,
        afterData: attachment,
        tx,
      });

      return attachment;
    });
  }

  async submitTask(
    taskId: number,
    dto: SubmitTaskDto,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    const task = await this.findById(taskId, actor, scope);

    await this.assignmentsService.assertOfficerAssignmentScope(actor, {
      portId: task.portId,
      berthId: task.berthId,
      terminalId: task.terminalId,
      taskType: task.taskType,
      requiredPermission: 'task.submit',
    });

    const transition = evaluateTaskStateTransition({
      action: 'SUBMIT_TASK',
      actorRole: actor.role,
      actorId: actor.id,
      assigneeId: task.assigneeId,
      currentExecutionStatus: task.executionStatus,
      currentReviewStatus: task.reviewStatus,
    });

    const updatedTask = await this.prisma.$transaction(async (tx) => {
      // Apply optional inline checklist updates before validating completeness
      if (dto.checklistItems && dto.checklistItems.length > 0) {
        for (const item of dto.checklistItems) {
          await tx.taskChecklistItem.updateMany({
            where: { taskId, code: item.code },
            data: {
              checkedByOfficer: item.checkedByOfficer,
              ...(item.officerNotes !== undefined ? { officerNotes: item.officerNotes } : {}),
              ...(item.attachmentPath !== undefined ? { attachmentPath: item.attachmentPath } : {}),
            },
          });
        }
      }

      const currentChecklists = await tx.taskChecklistItem.findMany({
        where: { taskId },
        orderBy: { itemOrder: 'asc' },
      });
      const currentAttachmentsCount = await tx.taskAttachment.count({
        where: { taskId },
      });

      const incompleteMandatory = currentChecklists.filter(
        (c) => c.isApplicable && c.isRequired && !c.checkedByOfficer,
      );
      if (incompleteMandatory.length > 0) {
        throw new BadRequestException(
          `Pekerjaan belum dapat dikirim: terdapat ${incompleteMandatory.length} item checklist wajib yang belum diselesaikan (${incompleteMandatory.map((i) => i.code).join(', ')})`,
        );
      }

      const missingAttachmentItems = currentChecklists.filter(
        (c) =>
          c.isApplicable &&
          c.requiresAttachment &&
          !c.attachmentPath &&
          currentAttachmentsCount === 0,
      );
      if (missingAttachmentItems.length > 0) {
        throw new BadRequestException(
          `Pekerjaan wajib menyertakan bukti/lampiran untuk item: ${missingAttachmentItems.map((i) => i.code).join(', ')}`,
        );
      }

      // Reset checkedByAdmin when resubmitting after return so Admin re-verifies cleanly
      if (
        task.reviewStatus === TaskReviewStatus.ADMIN_RETURNED ||
        task.reviewStatus === TaskReviewStatus.HEAD_RETURNED
      ) {
        await tx.taskChecklistItem.updateMany({
          where: { taskId },
          data: { checkedByAdmin: false },
        });
      }

      // Optimistic concurrency check on submission
      const now = new Date();
      const locked = await tx.task.updateMany({
        where: {
          id: taskId,
          executionStatus: task.executionStatus,
          reviewStatus: task.reviewStatus,
        },
        data: {
          executionStatus: transition.nextExecutionStatus,
          reviewStatus: transition.nextReviewStatus,
          assigneeId: task.assigneeId ?? actor.id,
          startedAt: task.startedAt ?? now,
          submittedAt: now,
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        },
      });
      if (locked.count === 0) {
        throw new ConflictException('Status pekerjaan berubah secara bersamaan (concurrent update)');
      }

      const lastSub = await tx.taskSubmission.findFirst({
        where: { taskId },
        orderBy: { submissionNumber: 'desc' },
      });
      const submissionNumber = (lastSub?.submissionNumber ?? 0) + 1;

      await tx.taskSubmission.create({
        data: {
          taskId,
          submissionNumber,
          submittedById: actor.id,
          notes: dto.notes,
          checklistSnapshot: currentChecklists as unknown as Prisma.InputJsonValue,
        },
      });

      await tx.taskHistory.create({
        data: {
          taskId,
          actorId: actor.id,
          actorRole: actor.role,
          action: submissionNumber > 1 ? 'RESUBMIT_TASK' : 'SUBMIT_TASK',
          fromExecutionStatus: task.executionStatus,
          toExecutionStatus: transition.nextExecutionStatus,
          fromReviewStatus: task.reviewStatus,
          toReviewStatus: transition.nextReviewStatus,
          notes: dto.notes ?? `Submission #${submissionNumber}`,
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: task.portId,
        action: submissionNumber > 1 ? 'TASK_RESUBMITTED' : 'TASK_SUBMITTED',
        entityName: 'tasks',
        entityId: taskId,
        beforeData: {
          executionStatus: task.executionStatus,
          reviewStatus: task.reviewStatus,
        },
        afterData: {
          executionStatus: transition.nextExecutionStatus,
          reviewStatus: transition.nextReviewStatus,
          submissionNumber,
        },
        tx,
      });

      return tx.task.findUniqueOrThrow({
        where: { id: taskId },
        include: TASK_DETAIL_INCLUDE,
      });
    });

    this.eventEmitter.emit(TASK_WORKFLOW_EVENT, {
      taskId: updatedTask.id,
      taskNumber: updatedTask.taskNumber,
      taskType: updatedTask.taskType,
      title: updatedTask.title,
      portId: updatedTask.portId,
      berthId: updatedTask.berthId,
      assigneeId: updatedTask.assigneeId,
      actorId: actor.id,
      actorRole: actor.role,
      action: 'SUBMIT_TASK',
      executionStatus: updatedTask.executionStatus,
      reviewStatus: updatedTask.reviewStatus,
    } satisfies TaskWorkflowEvent);

    return updatedTask;
  }

  // ============================================================================
  // BAGIAN 9 — BACKEND ADMIN CHECKER
  // ============================================================================

  async getAdminCheckerDashboard(scope: ScopeFilter, dateStr?: string) {
    const portId = scope.portId;
    await this.syncOverdueTasks(portId);

    const portWhere = portId ? { portId } : {};
    const dateFilter = dateStr ? { obligationDate: new Date(dateStr) } : {};

    const [
      officers,
      activeAssignments,
      allTasks,
      dailyReports,
    ] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          ...portWhere,
          isActive: true,
          role: { in: ROLE_GROUPS.ALL_FIELD_OFFICERS },
        },
        select: { id: true, fullName: true, email: true, role: true, portId: true },
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.userAssignment.findMany({
        where: {
          ...portWhere,
          status: AssignmentStatus.ACTIVE,
        },
        include: {
          user: { select: { id: true, fullName: true, email: true } },
          berth: { select: { id: true, code: true, name: true } },
          terminal: { select: { id: true, code: true, name: true } },
        },
      }),
      this.prisma.task.findMany({
        where: {
          ...portWhere,
          ...dateFilter,
        },
        include: TASK_DETAIL_INCLUDE,
        orderBy: [{ dueDate: 'asc' }, { id: 'desc' }],
      }),
      this.prisma.dailyPortReport.findMany({
        where: {
          ...portWhere,
          ...(dateStr ? { reportDate: new Date(dateStr) } : {}),
        },
        include: {
          officer: { select: { id: true, fullName: true } },
          items: true,
        },
        orderBy: { reportDate: 'desc' },
        take: 20,
      }),
    ]);

    const notStartedTasks = allTasks.filter(
      (t) => t.executionStatus === TaskExecutionStatus.NOT_STARTED,
    );
    const unsubmittedTasks = allTasks.filter(
      (t) =>
        t.executionStatus === TaskExecutionStatus.NOT_STARTED ||
        t.executionStatus === TaskExecutionStatus.IN_PROGRESS ||
        t.executionStatus === TaskExecutionStatus.OVERDUE,
    );
    const waitingAdminReviewTasks = allTasks.filter(
      (t) =>
        t.reviewStatus === TaskReviewStatus.WAITING_ADMIN ||
        t.reviewStatus === TaskReviewStatus.ADMIN_REVIEW,
    );
    const incompleteReturnedTasks = allTasks.filter(
      (t) =>
        t.reviewStatus === TaskReviewStatus.ADMIN_RETURNED ||
        t.reviewStatus === TaskReviewStatus.HEAD_RETURNED,
    );
    const overdueTasks = allTasks.filter(
      (t) =>
        t.isOverdue &&
        t.executionStatus !== TaskExecutionStatus.COMPLETED &&
        t.executionStatus !== TaskExecutionStatus.CANCELLED,
    );

    return {
      portId: portId ?? 'ALL',
      summary: {
        totalOfficers: officers.length,
        activeAssignmentsCount: activeAssignments.length,
        totalObligatedTasks: allTasks.length,
        notStartedCount: notStartedTasks.length,
        unsubmittedCount: unsubmittedTasks.length,
        waitingAdminReviewCount: waitingAdminReviewTasks.length,
        incompleteReturnedCount: incompleteReturnedTasks.length,
        overdueCount: overdueTasks.length,
        completedCount: allTasks.filter((t) => t.executionStatus === TaskExecutionStatus.COMPLETED)
          .length,
      },
      officers,
      activeAssignments,
      queues: {
        notStartedTasks,
        unsubmittedTasks,
        waitingAdminReviewTasks,
        incompleteReturnedTasks,
        overdueTasks,
      },
      dailyReports,
    };
  }

  async startAdminReview(taskId: number, actor: AuthenticatedUser, scope: ScopeFilter) {
    const task = await this.findById(taskId, actor, scope);
    const transition = evaluateTaskStateTransition({
      action: 'ADMIN_START_REVIEW',
      actorRole: actor.role,
      actorId: actor.id,
      assigneeId: task.assigneeId,
      currentExecutionStatus: task.executionStatus,
      currentReviewStatus: task.reviewStatus,
    });

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id: taskId },
        data: {
          reviewStatus: transition.nextReviewStatus,
          adminReviewedById: actor.id,
        },
        include: TASK_DETAIL_INCLUDE,
      });

      await tx.taskHistory.create({
        data: {
          taskId,
          actorId: actor.id,
          actorRole: actor.role,
          action: 'ADMIN_START_REVIEW',
          fromExecutionStatus: task.executionStatus,
          toExecutionStatus: transition.nextExecutionStatus,
          fromReviewStatus: task.reviewStatus,
          toReviewStatus: transition.nextReviewStatus,
          notes: 'Admin Pelabuhan memulai pemeriksaan kelengkapan',
        },
      });

      return updated;
    });
  }

  async updateAdminChecklist(
    taskId: number,
    dto: UpdateAdminTaskChecklistDto,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    if (actor.role !== UserRole.ADMIN_PELABUHAN) {
      throw new ForbiddenException('Hanya ADMIN_PELABUHAN yang dapat mengisi checklist pemeriksaan Admin.');
    }
    const task = await this.findById(taskId, actor, scope);
    if (
      task.reviewStatus !== TaskReviewStatus.WAITING_ADMIN &&
      task.reviewStatus !== TaskReviewStatus.ADMIN_REVIEW
    ) {
      throw new BadRequestException(
        `Checklist pemeriksaan Admin hanya dapat diisi saat status WAITING_ADMIN / ADMIN_REVIEW (saat ini: ${task.reviewStatus})`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      for (const item of dto.items) {
        await tx.taskChecklistItem.updateMany({
          where: { taskId, code: item.code },
          data: {
            checkedByAdmin: item.checkedByAdmin,
            ...(item.adminNotes !== undefined ? { adminNotes: item.adminNotes } : {}),
          },
        });
      }

      const updated = await tx.task.update({
        where: { id: taskId },
        data: {
          reviewStatus: TaskReviewStatus.ADMIN_REVIEW,
          adminReviewedById: actor.id,
        },
        include: TASK_DETAIL_INCLUDE,
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: task.portId,
        action: 'TASK_CHECKLIST_VERIFIED_BY_ADMIN',
        entityName: 'tasks',
        entityId: taskId,
        afterData: { itemsVerified: dto.items.length },
        tx,
      });

      return updated;
    });
  }

  async adminApproveAndForward(
    taskId: number,
    dto: AdminApproveTaskDto,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    const task = await this.findById(taskId, actor, scope);
    const transition = evaluateTaskStateTransition({
      action: 'ADMIN_APPROVE',
      actorRole: actor.role,
      actorId: actor.id,
      assigneeId: task.assigneeId,
      currentExecutionStatus: task.executionStatus,
      currentReviewStatus: task.reviewStatus,
    });

    const updatedTask = await this.prisma.$transaction(async (tx) => {
      if (dto.checklistItems && dto.checklistItems.length > 0) {
        for (const item of dto.checklistItems) {
          await tx.taskChecklistItem.updateMany({
            where: { taskId, code: item.code },
            data: {
              checkedByAdmin: item.checkedByAdmin,
              ...(item.adminNotes !== undefined ? { adminNotes: item.adminNotes } : {}),
            },
          });
        }
      }

      const checklistItems = await tx.taskChecklistItem.findMany({
        where: { taskId },
        orderBy: { itemOrder: 'asc' },
      });

      const unverifiedMandatory = checklistItems.filter(
        (c) => c.isApplicable && c.isRequired && (!c.checkedByOfficer || !c.checkedByAdmin),
      );

      if (unverifiedMandatory.length > 0) {
        throw new BadRequestException(
          `Admin tidak dapat meloloskan pekerjaan: terdapat ${unverifiedMandatory.length} item checklist wajib yang belum tervalidasi lengkap (${unverifiedMandatory.map((i) => i.code).join(', ')})`,
        );
      }

      const now = new Date();
      const locked = await tx.task.updateMany({
        where: {
          id: taskId,
          executionStatus: task.executionStatus,
          reviewStatus: task.reviewStatus,
        },
        data: {
          executionStatus: transition.nextExecutionStatus,
          reviewStatus: transition.nextReviewStatus,
          adminReviewedById: actor.id,
          adminReviewedAt: now,
          adminReviewNotes: dto.notes ?? 'Kelengkapan administratif disetujui, diteruskan ke Kepala Pelabuhan.',
        },
      });
      if (locked.count === 0) {
        throw new ConflictException('Status pemeriksaan berubah secara bersamaan (concurrent request)');
      }

      const latestSub = await tx.taskSubmission.findFirst({
        where: { taskId },
        orderBy: { submissionNumber: 'desc' },
      });

      await tx.taskReview.create({
        data: {
          taskId,
          submissionId: latestSub?.id ?? null,
          reviewStage: TaskReviewStage.ADMIN_CHECK,
          reviewerId: actor.id,
          reviewerRole: actor.role,
          decision: 'ADMIN_APPROVED',
          notes: dto.notes,
        },
      });

      await tx.taskHistory.create({
        data: {
          taskId,
          actorId: actor.id,
          actorRole: actor.role,
          action: 'ADMIN_APPROVE_AND_FORWARD',
          fromExecutionStatus: task.executionStatus,
          toExecutionStatus: transition.nextExecutionStatus,
          fromReviewStatus: task.reviewStatus,
          toReviewStatus: transition.nextReviewStatus,
          notes: dto.notes ?? 'Lolos pemeriksaan Admin, diteruskan ke Kepala Pelabuhan',
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: task.portId,
        action: 'TASK_ADMIN_APPROVED',
        entityName: 'tasks',
        entityId: taskId,
        beforeData: { reviewStatus: task.reviewStatus },
        afterData: { reviewStatus: transition.nextReviewStatus },
        tx,
      });

      return tx.task.findUniqueOrThrow({
        where: { id: taskId },
        include: TASK_DETAIL_INCLUDE,
      });
    });

    this.eventEmitter.emit(TASK_WORKFLOW_EVENT, {
      taskId: updatedTask.id,
      taskNumber: updatedTask.taskNumber,
      taskType: updatedTask.taskType,
      title: updatedTask.title,
      portId: updatedTask.portId,
      berthId: updatedTask.berthId,
      assigneeId: updatedTask.assigneeId,
      actorId: actor.id,
      actorRole: actor.role,
      action: 'ADMIN_APPROVE',
      executionStatus: updatedTask.executionStatus,
      reviewStatus: updatedTask.reviewStatus,
    } satisfies TaskWorkflowEvent);

    return updatedTask;
  }

  async adminReturnTask(
    taskId: number,
    dto: ReturnOrRejectTaskDto,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    const task = await this.findById(taskId, actor, scope);
    const transition = evaluateTaskStateTransition({
      action: 'ADMIN_RETURN',
      actorRole: actor.role,
      actorId: actor.id,
      assigneeId: task.assigneeId,
      currentExecutionStatus: task.executionStatus,
      currentReviewStatus: task.reviewStatus,
    });

    const updatedTask = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const locked = await tx.task.updateMany({
        where: {
          id: taskId,
          executionStatus: task.executionStatus,
          reviewStatus: task.reviewStatus,
        },
        data: {
          executionStatus: transition.nextExecutionStatus,
          reviewStatus: transition.nextReviewStatus,
          adminReviewedById: actor.id,
          adminReviewedAt: now,
          adminReviewNotes: dto.notes ?? dto.reason,
          rejectionReason: dto.reason,
        },
      });
      if (locked.count === 0) {
        throw new ConflictException('Status pemeriksaan berubah secara bersamaan (concurrent request)');
      }

      const latestSub = await tx.taskSubmission.findFirst({
        where: { taskId },
        orderBy: { submissionNumber: 'desc' },
      });

      await tx.taskReview.create({
        data: {
          taskId,
          submissionId: latestSub?.id ?? null,
          reviewStage: TaskReviewStage.ADMIN_CHECK,
          reviewerId: actor.id,
          reviewerRole: actor.role,
          decision: 'ADMIN_RETURNED',
          notes: dto.notes,
          reason: dto.reason,
        },
      });

      await tx.taskHistory.create({
        data: {
          taskId,
          actorId: actor.id,
          actorRole: actor.role,
          action: 'ADMIN_RETURN',
          fromExecutionStatus: task.executionStatus,
          toExecutionStatus: transition.nextExecutionStatus,
          fromReviewStatus: task.reviewStatus,
          toReviewStatus: transition.nextReviewStatus,
          notes: dto.notes,
          reason: dto.reason,
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: task.portId,
        action: 'TASK_ADMIN_RETURNED',
        entityName: 'tasks',
        entityId: taskId,
        beforeData: {
          executionStatus: task.executionStatus,
          reviewStatus: task.reviewStatus,
        },
        afterData: {
          executionStatus: transition.nextExecutionStatus,
          reviewStatus: transition.nextReviewStatus,
        },
        reason: dto.reason,
        tx,
      });

      return tx.task.findUniqueOrThrow({
        where: { id: taskId },
        include: TASK_DETAIL_INCLUDE,
      });
    });

    this.eventEmitter.emit(TASK_WORKFLOW_EVENT, {
      taskId: updatedTask.id,
      taskNumber: updatedTask.taskNumber,
      taskType: updatedTask.taskType,
      title: updatedTask.title,
      portId: updatedTask.portId,
      berthId: updatedTask.berthId,
      assigneeId: updatedTask.assigneeId,
      actorId: actor.id,
      actorRole: actor.role,
      action: 'ADMIN_RETURN',
      executionStatus: updatedTask.executionStatus,
      reviewStatus: updatedTask.reviewStatus,
      reason: dto.reason,
    } satisfies TaskWorkflowEvent);

    return updatedTask;
  }

  // ============================================================================
  // BAGIAN 10 — BACKEND KEPALA PELABUHAN
  // ============================================================================

  async getHeadVerificationQueue(scope: ScopeFilter) {
    if (!scope.portId) {
      throw new ForbiddenException('Kepala Pelabuhan wajib terikat pada satu ekosistem pelabuhan');
    }
    await this.syncOverdueTasks(scope.portId);

    return this.prisma.task.findMany({
      where: {
        portId: scope.portId,
        reviewStatus: {
          in: [TaskReviewStatus.WAITING_HEAD_VERIFICATION, TaskReviewStatus.ADMIN_APPROVED],
        },
      },
      include: TASK_DETAIL_INCLUDE,
      orderBy: [{ priority: 'desc' }, { adminReviewedAt: 'asc' }],
    });
  }

  async getHeadPortOperationalStatus(scope: ScopeFilter) {
    if (!scope.portId) {
      throw new ForbiddenException('Kepala Pelabuhan wajib terikat pada satu ekosistem pelabuhan');
    }
    const portId = scope.portId;
    await this.syncOverdueTasks(portId);

    const [
      port,
      visits,
      tasks,
      dailyReports,
      maintenanceTickets,
    ] = await Promise.all([
      this.prisma.port.findUnique({
        where: { id: portId },
        include: {
          terminals: { where: { isActive: true } },
          berths: { where: { isActive: true } },
        },
      }),
      this.prisma.shipVisit.findMany({
        where: { portId },
        include: {
          vessel: { select: { id: true, name: true, vesselCategory: true } },
          operator: { select: { id: true, name: true } },
          berthingRecords: { include: { berth: { select: { id: true, code: true, name: true } } } },
        },
        orderBy: { eta: 'desc' },
        take: 30,
      }),
      this.prisma.task.findMany({
        where: { portId },
        select: {
          id: true,
          executionStatus: true,
          reviewStatus: true,
          isOverdue: true,
          hasIssue: true,
        },
      }),
      this.prisma.dailyPortReport.findMany({
        where: { portId },
        include: { officer: { select: { id: true, fullName: true } } },
        orderBy: { reportDate: 'desc' },
        take: 10,
      }),
      this.prisma.maintenanceTicket.findMany({
        where: { portId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    return {
      port,
      taskSummary: {
        totalTasks: tasks.length,
        waitingHeadVerification: tasks.filter(
          (t) => t.reviewStatus === TaskReviewStatus.WAITING_HEAD_VERIFICATION,
        ).length,
        waitingAdminReview: tasks.filter(
          (t) =>
            t.reviewStatus === TaskReviewStatus.WAITING_ADMIN ||
            t.reviewStatus === TaskReviewStatus.ADMIN_REVIEW,
        ).length,
        verifiedCompleted: tasks.filter(
          (t) => t.reviewStatus === TaskReviewStatus.HEAD_VERIFIED,
        ).length,
        returnedOrRejected: tasks.filter(
          (t) =>
            t.reviewStatus === TaskReviewStatus.ADMIN_RETURNED ||
            t.reviewStatus === TaskReviewStatus.HEAD_RETURNED ||
            t.reviewStatus === TaskReviewStatus.HEAD_REJECTED,
        ).length,
        overdueCount: tasks.filter(
          (t) =>
            t.isOverdue &&
            t.executionStatus !== TaskExecutionStatus.COMPLETED &&
            t.executionStatus !== TaskExecutionStatus.CANCELLED,
        ).length,
      },
      recentVisits: visits,
      dailyReports,
      maintenanceTickets,
    };
  }

  async headVerifyTask(
    taskId: number,
    dto: HeadVerifyTaskDto,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    const task = await this.findById(taskId, actor, scope);
    const transition = evaluateTaskStateTransition({
      action: 'HEAD_VERIFY',
      actorRole: actor.role,
      actorId: actor.id,
      assigneeId: task.assigneeId,
      currentExecutionStatus: task.executionStatus,
      currentReviewStatus: task.reviewStatus,
    });

    const updatedTask = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      // Atomic Optimistic Locking: prevents concurrent approval race condition (Scenario 17)
      const locked = await tx.task.updateMany({
        where: {
          id: taskId,
          executionStatus: task.executionStatus,
          reviewStatus: task.reviewStatus,
        },
        data: {
          executionStatus: transition.nextExecutionStatus,
          reviewStatus: transition.nextReviewStatus,
          headVerifiedById: actor.id,
          headVerifiedAt: now,
          headVerifyNotes: dto.notes ?? 'Diverifikasi oleh Kepala Pelabuhan',
          completedAt: now,
        },
      });

      if (locked.count === 0) {
        throw new ConflictException(
          'Verifikasi gagal karena status pekerjaan telah diubah oleh proses lain secara bersamaan (Concurrent Modification)',
        );
      }

      const latestSub = await tx.taskSubmission.findFirst({
        where: { taskId },
        orderBy: { submissionNumber: 'desc' },
      });

      await tx.taskReview.create({
        data: {
          taskId,
          submissionId: latestSub?.id ?? null,
          reviewStage: TaskReviewStage.HEAD_VERIFICATION,
          reviewerId: actor.id,
          reviewerRole: actor.role,
          decision: 'HEAD_VERIFIED',
          notes: dto.notes,
        },
      });

      await tx.taskHistory.create({
        data: {
          taskId,
          actorId: actor.id,
          actorRole: actor.role,
          action: 'HEAD_VERIFY',
          fromExecutionStatus: task.executionStatus,
          toExecutionStatus: transition.nextExecutionStatus,
          fromReviewStatus: task.reviewStatus,
          toReviewStatus: transition.nextReviewStatus,
          notes: dto.notes ?? 'Pekerjaan diverifikasi final oleh Kepala Pelabuhan',
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: task.portId,
        action: 'TASK_HEAD_VERIFIED',
        entityName: 'tasks',
        entityId: taskId,
        beforeData: {
          executionStatus: task.executionStatus,
          reviewStatus: task.reviewStatus,
        },
        afterData: {
          executionStatus: transition.nextExecutionStatus,
          reviewStatus: transition.nextReviewStatus,
        },
        tx,
      });

      return tx.task.findUniqueOrThrow({
        where: { id: taskId },
        include: TASK_DETAIL_INCLUDE,
      });
    });

    this.eventEmitter.emit(TASK_WORKFLOW_EVENT, {
      taskId: updatedTask.id,
      taskNumber: updatedTask.taskNumber,
      taskType: updatedTask.taskType,
      title: updatedTask.title,
      portId: updatedTask.portId,
      berthId: updatedTask.berthId,
      assigneeId: updatedTask.assigneeId,
      actorId: actor.id,
      actorRole: actor.role,
      action: 'HEAD_VERIFY',
      executionStatus: updatedTask.executionStatus,
      reviewStatus: updatedTask.reviewStatus,
    } satisfies TaskWorkflowEvent);

    return updatedTask;
  }

  async headReturnTask(
    taskId: number,
    dto: ReturnOrRejectTaskDto,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    const task = await this.findById(taskId, actor, scope);
    const transition = evaluateTaskStateTransition({
      action: 'HEAD_RETURN',
      actorRole: actor.role,
      actorId: actor.id,
      assigneeId: task.assigneeId,
      currentExecutionStatus: task.executionStatus,
      currentReviewStatus: task.reviewStatus,
    });

    const updatedTask = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const locked = await tx.task.updateMany({
        where: {
          id: taskId,
          executionStatus: task.executionStatus,
          reviewStatus: task.reviewStatus,
        },
        data: {
          executionStatus: transition.nextExecutionStatus,
          reviewStatus: transition.nextReviewStatus,
          headVerifiedById: actor.id,
          headVerifiedAt: now,
          headVerifyNotes: dto.notes ?? dto.reason,
          rejectionReason: dto.reason,
        },
      });
      if (locked.count === 0) {
        throw new ConflictException('Status pekerjaan telah berubah secara bersamaan');
      }

      const latestSub = await tx.taskSubmission.findFirst({
        where: { taskId },
        orderBy: { submissionNumber: 'desc' },
      });

      await tx.taskReview.create({
        data: {
          taskId,
          submissionId: latestSub?.id ?? null,
          reviewStage: TaskReviewStage.HEAD_VERIFICATION,
          reviewerId: actor.id,
          reviewerRole: actor.role,
          decision: 'HEAD_RETURNED',
          notes: dto.notes,
          reason: dto.reason,
        },
      });

      await tx.taskHistory.create({
        data: {
          taskId,
          actorId: actor.id,
          actorRole: actor.role,
          action: 'HEAD_RETURN',
          fromExecutionStatus: task.executionStatus,
          toExecutionStatus: transition.nextExecutionStatus,
          fromReviewStatus: task.reviewStatus,
          toReviewStatus: transition.nextReviewStatus,
          notes: dto.notes,
          reason: dto.reason,
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: task.portId,
        action: 'TASK_HEAD_RETURNED',
        entityName: 'tasks',
        entityId: taskId,
        beforeData: {
          executionStatus: task.executionStatus,
          reviewStatus: task.reviewStatus,
        },
        afterData: {
          executionStatus: transition.nextExecutionStatus,
          reviewStatus: transition.nextReviewStatus,
        },
        reason: dto.reason,
        tx,
      });

      return tx.task.findUniqueOrThrow({
        where: { id: taskId },
        include: TASK_DETAIL_INCLUDE,
      });
    });

    this.eventEmitter.emit(TASK_WORKFLOW_EVENT, {
      taskId: updatedTask.id,
      taskNumber: updatedTask.taskNumber,
      taskType: updatedTask.taskType,
      title: updatedTask.title,
      portId: updatedTask.portId,
      berthId: updatedTask.berthId,
      assigneeId: updatedTask.assigneeId,
      actorId: actor.id,
      actorRole: actor.role,
      action: 'HEAD_RETURN',
      executionStatus: updatedTask.executionStatus,
      reviewStatus: updatedTask.reviewStatus,
      reason: dto.reason,
    } satisfies TaskWorkflowEvent);

    return updatedTask;
  }

  async headRejectTask(
    taskId: number,
    dto: ReturnOrRejectTaskDto,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    const task = await this.findById(taskId, actor, scope);
    const transition = evaluateTaskStateTransition({
      action: 'HEAD_REJECT',
      actorRole: actor.role,
      actorId: actor.id,
      assigneeId: task.assigneeId,
      currentExecutionStatus: task.executionStatus,
      currentReviewStatus: task.reviewStatus,
    });

    const updatedTask = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const locked = await tx.task.updateMany({
        where: {
          id: taskId,
          executionStatus: task.executionStatus,
          reviewStatus: task.reviewStatus,
        },
        data: {
          executionStatus: transition.nextExecutionStatus,
          reviewStatus: transition.nextReviewStatus,
          headVerifiedById: actor.id,
          headVerifiedAt: now,
          headVerifyNotes: dto.notes ?? dto.reason,
          rejectionReason: dto.reason,
        },
      });
      if (locked.count === 0) {
        throw new ConflictException('Status pekerjaan telah berubah secara bersamaan');
      }

      const latestSub = await tx.taskSubmission.findFirst({
        where: { taskId },
        orderBy: { submissionNumber: 'desc' },
      });

      await tx.taskReview.create({
        data: {
          taskId,
          submissionId: latestSub?.id ?? null,
          reviewStage: TaskReviewStage.HEAD_VERIFICATION,
          reviewerId: actor.id,
          reviewerRole: actor.role,
          decision: 'HEAD_REJECTED',
          notes: dto.notes,
          reason: dto.reason,
        },
      });

      await tx.taskHistory.create({
        data: {
          taskId,
          actorId: actor.id,
          actorRole: actor.role,
          action: 'HEAD_REJECT',
          fromExecutionStatus: task.executionStatus,
          toExecutionStatus: transition.nextExecutionStatus,
          fromReviewStatus: task.reviewStatus,
          toReviewStatus: transition.nextReviewStatus,
          notes: dto.notes,
          reason: dto.reason,
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: task.portId,
        action: 'TASK_HEAD_REJECTED',
        entityName: 'tasks',
        entityId: taskId,
        beforeData: {
          executionStatus: task.executionStatus,
          reviewStatus: task.reviewStatus,
        },
        afterData: {
          executionStatus: transition.nextExecutionStatus,
          reviewStatus: transition.nextReviewStatus,
        },
        reason: dto.reason,
        tx,
      });

      return tx.task.findUniqueOrThrow({
        where: { id: taskId },
        include: TASK_DETAIL_INCLUDE,
      });
    });

    this.eventEmitter.emit(TASK_WORKFLOW_EVENT, {
      taskId: updatedTask.id,
      taskNumber: updatedTask.taskNumber,
      taskType: updatedTask.taskType,
      title: updatedTask.title,
      portId: updatedTask.portId,
      berthId: updatedTask.berthId,
      assigneeId: updatedTask.assigneeId,
      actorId: actor.id,
      actorRole: actor.role,
      action: 'HEAD_REJECT',
      executionStatus: updatedTask.executionStatus,
      reviewStatus: updatedTask.reviewStatus,
      reason: dto.reason,
    } satisfies TaskWorkflowEvent);

    return updatedTask;
  }
}
