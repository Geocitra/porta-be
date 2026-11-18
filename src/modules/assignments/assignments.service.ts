import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AssignmentStatus, TaskType, UserRole } from '@prisma/client';
import {
  AuthenticatedUser,
  isPetugasRole,
} from '../../common/decorators/current-user.decorator';
import { ScopeFilter } from '../../common/guards/port-scope.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/utils/audit-log.service';
import { DocNumberUtil } from '../../common/utils/doc-number.util';
import {
  CreateAssignmentDto,
  RevokeAssignmentDto,
  UpdateAssignmentDto,
} from './dto/assignments.dto';

export const DEFAULT_PERMISSION_CATALOG = [
  { code: 'manifest.view', name: 'Lihat Manifest Kapal', module: 'MANIFEST' },
  { code: 'manifest.create', name: 'Buat Manifest Kapal', module: 'MANIFEST' },
  { code: 'manifest.update', name: 'Ubah Manifest Kapal', module: 'MANIFEST' },
  { code: 'manifest.submit', name: 'Kirim Manifest Kapal', module: 'MANIFEST' },
  { code: 'vessel.visit.view', name: 'Lihat Kunjungan Kapal', module: 'VESSEL' },
  { code: 'vessel.arrival.create', name: 'Catat Kedatangan Kapal', module: 'VESSEL' },
  { code: 'vessel.berthing.create', name: 'Catat Sandar Kapal', module: 'VESSEL' },
  { code: 'vessel.berthing.update', name: 'Akhiri Sandar Kapal', module: 'VESSEL' },
  { code: 'vessel.departure.update', name: 'Catat Keberangkatan Kapal', module: 'VESSEL' },
  { code: 'passenger.service.create', name: 'Catat Pelayanan Penumpang', module: 'PASSENGER' },
  { code: 'passenger.service.update', name: 'Ubah Pelayanan Penumpang', module: 'PASSENGER' },
  { code: 'gate.ticketing.manage', name: 'Kelola Karcis Pas Masuk', module: 'GATE_TICKETING' },
  { code: 'cargo.create', name: 'Catat Bongkar Muat Barang', module: 'CARGO' },
  { code: 'cargo.update', name: 'Ubah Bongkar Muat Barang', module: 'CARGO' },
  { code: 'equipment.create', name: 'Catat Sewa Alat Berat', module: 'EQUIPMENT' },
  { code: 'utility.create', name: 'Catat Meteran Utilitas', module: 'UTILITY' },
  { code: 'company.register', name: 'Pendaftaran Perusahaan', module: 'ONBOARDING' },
  { code: 'document.upload', name: 'Unggah Dokumen', module: 'DOCUMENT' },
  { code: 'document.verify.initial', name: 'Pemeriksaan Awal Dokumen', module: 'DOCUMENT' },
  { code: 'asset.manage', name: 'Pengelolaan Aset Pelabuhan', module: 'ASSET' },
  { code: 'facility.inspect', name: 'Inspeksi Fasilitas Pelabuhan', module: 'FACILITY' },
  { code: 'maintenance.create', name: 'Lapor Tiket Pemeliharaan', module: 'MAINTENANCE' },
  { code: 'maintenance.update', name: 'Update Tiket Pemeliharaan', module: 'MAINTENANCE' },
  { code: 'safety.inspect', name: 'Pemeriksaan Keselamatan', module: 'SAFETY' },
  { code: 'retribution.record', name: 'Pencatatan Retribusi', module: 'BILLING' },
  { code: 'task.execute', name: 'Kerjakan Task Operasional', module: 'TASK' },
  { code: 'task.submit', name: 'Submit Task Operasional', module: 'TASK' },
  { code: 'task.review.admin', name: 'Pemeriksaan Administratif Task (Admin)', module: 'TASK' },
  { code: 'task.verify.head', name: 'Verifikasi Substantif Task (Kepala Pelabuhan)', module: 'TASK' },
  { code: 'daily_report.submit', name: 'Kirim Laporan Harian', module: 'DAILY_REPORT' },
  { code: 'daily_report.review', name: 'Periksa Laporan Harian (Admin)', module: 'DAILY_REPORT' },
  { code: 'daily_report.verify', name: 'Verifikasi Laporan Harian (Kepala Pelabuhan)', module: 'DAILY_REPORT' },
];

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async findAll(
    scope: ScopeFilter,
    filters?: {
      portId?: number;
      userId?: number;
      berthId?: number;
      status?: AssignmentStatus;
      activeOnly?: boolean;
    },
  ) {
    const effectivePortId = scope.portId ?? filters?.portId;
    const now = new Date();

    return this.prisma.userAssignment.findMany({
      where: {
        ...(effectivePortId ? { portId: effectivePortId } : {}),
        ...(scope.allowedPortIds && !effectivePortId
          ? { portId: { in: scope.allowedPortIds } }
          : {}),
        ...(filters?.userId ? { userId: filters.userId } : {}),
        ...(filters?.berthId ? { berthId: filters.berthId } : {}),
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.activeOnly
          ? {
              status: AssignmentStatus.ACTIVE,
              startDate: { lte: now },
              OR: [{ endDate: null }, { endDate: { gte: now } }],
            }
          : {}),
      },
      include: {
        user: { select: { id: true, fullName: true, email: true, role: true } },
        port: { select: { id: true, code: true, name: true } },
        terminal: { select: { id: true, code: true, name: true, terminalType: true } },
        berth: { select: { id: true, code: true, name: true, berthServiceCategory: true } },
        zone: { select: { id: true, code: true, name: true, zoneType: true } },
        assignedBy: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findMyAssignments(user: AuthenticatedUser) {
    const now = new Date();
    return this.prisma.userAssignment.findMany({
      where: {
        userId: user.id,
        status: AssignmentStatus.ACTIVE,
        startDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
      },
      include: {
        port: { select: { id: true, code: true, name: true } },
        terminal: { select: { id: true, code: true, name: true, terminalType: true } },
        berth: { select: { id: true, code: true, name: true, berthServiceCategory: true } },
        zone: { select: { id: true, code: true, name: true, zoneType: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPermissionsCatalog() {
    const dbPerms = await this.prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { code: 'asc' }],
    });
    return {
      permissions: dbPerms.length > 0 ? dbPerms : DEFAULT_PERMISSION_CATALOG,
      taskTypes: Object.values(TaskType),
    };
  }

  private async validateLocationHierarchy(params: {
    portId: number;
    terminalId?: number | null;
    berthId?: number | null;
    zoneId?: number | null;
  }) {
    const port = await this.prisma.port.findUnique({ where: { id: params.portId } });
    if (!port || !port.isActive) {
      throw new NotFoundException(`Port #${params.portId} not found or inactive`);
    }

    if (params.terminalId) {
      const terminal = await this.prisma.terminal.findUnique({
        where: { id: params.terminalId },
      });
      if (!terminal || terminal.portId !== params.portId) {
        throw new BadRequestException(
          `Terminal #${params.terminalId} does not belong to Port #${params.portId}`,
        );
      }
    }

    if (params.berthId) {
      const berth = await this.prisma.berth.findUnique({ where: { id: params.berthId } });
      if (!berth || berth.portId !== params.portId) {
        throw new BadRequestException(
          `Berth #${params.berthId} does not belong to Port #${params.portId}`,
        );
      }
      if (params.terminalId && berth.terminalId && berth.terminalId !== params.terminalId) {
        throw new BadRequestException(
          `Berth #${params.berthId} does not belong to Terminal #${params.terminalId}`,
        );
      }
    }

    if (params.zoneId) {
      const zone = await this.prisma.portZone.findUnique({ where: { id: params.zoneId } });
      if (!zone || zone.portId !== params.portId) {
        throw new BadRequestException(
          `Zone #${params.zoneId} does not belong to Port #${params.portId}`,
        );
      }
    }
  }

  async create(dto: CreateAssignmentDto, actor: AuthenticatedUser, scope: ScopeFilter) {
    if (scope.portId && dto.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port assignment creation is forbidden');
    }

    const targetUser = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!targetUser || !targetUser.isActive) {
      throw new NotFoundException(`User #${dto.userId} not found or inactive`);
    }

    const startDate = new Date(dto.startDate);
    const endDate = dto.endDate ? new Date(dto.endDate) : null;
    if (endDate && endDate <= startDate) {
      throw new BadRequestException('endDate must be strictly after startDate');
    }

    await this.validateLocationHierarchy({
      portId: dto.portId,
      terminalId: dto.terminalId,
      berthId: dto.berthId,
      zoneId: dto.zoneId,
    });

    const assignmentCode = DocNumberUtil.generate('ASG', dto.portId);
    const effectiveRole = dto.role ?? targetUser.role;

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.userAssignment.create({
        data: {
          assignmentCode,
          userId: dto.userId,
          role: effectiveRole,
          portId: dto.portId,
          terminalId: dto.terminalId ?? null,
          berthId: dto.berthId ?? null,
          zoneId: dto.zoneId ?? null,
          taskTypes: dto.taskTypes,
          permissionCodes: dto.permissionCodes,
          startDate,
          endDate,
          status: AssignmentStatus.ACTIVE,
          assignedById: actor.id,
          notes: dto.notes,
        },
        include: {
          user: { select: { id: true, fullName: true, email: true, role: true } },
          port: { select: { id: true, code: true, name: true } },
          terminal: { select: { id: true, code: true, name: true } },
          berth: { select: { id: true, code: true, name: true } },
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: dto.portId,
        action: 'ASSIGNMENT_CREATED',
        entityName: 'user_assignments',
        entityId: created.id,
        afterData: created,
        tx,
      });

      return created;
    });
  }

  async update(
    id: number,
    dto: UpdateAssignmentDto,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    const existing = await this.prisma.userAssignment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Assignment #${id} not found`);
    if (scope.portId && existing.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }

    const nextStartDate = dto.startDate ? new Date(dto.startDate) : existing.startDate;
    const nextEndDate =
      dto.endDate !== undefined
        ? dto.endDate
          ? new Date(dto.endDate)
          : null
        : existing.endDate;

    if (nextEndDate && nextEndDate <= nextStartDate) {
      throw new BadRequestException('endDate must be strictly after startDate');
    }

    await this.validateLocationHierarchy({
      portId: existing.portId,
      terminalId: dto.terminalId !== undefined ? dto.terminalId : existing.terminalId,
      berthId: dto.berthId !== undefined ? dto.berthId : existing.berthId,
      zoneId: dto.zoneId !== undefined ? dto.zoneId : existing.zoneId,
    });

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.userAssignment.update({
        where: { id },
        data: {
          ...(dto.terminalId !== undefined ? { terminalId: dto.terminalId } : {}),
          ...(dto.berthId !== undefined ? { berthId: dto.berthId } : {}),
          ...(dto.zoneId !== undefined ? { zoneId: dto.zoneId } : {}),
          ...(dto.taskTypes !== undefined ? { taskTypes: dto.taskTypes } : {}),
          ...(dto.permissionCodes !== undefined ? { permissionCodes: dto.permissionCodes } : {}),
          ...(dto.startDate !== undefined ? { startDate: nextStartDate } : {}),
          ...(dto.endDate !== undefined ? { endDate: nextEndDate } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        },
        include: {
          user: { select: { id: true, fullName: true, email: true, role: true } },
          port: { select: { id: true, code: true, name: true } },
          terminal: { select: { id: true, code: true, name: true } },
          berth: { select: { id: true, code: true, name: true } },
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: existing.portId,
        action: 'ASSIGNMENT_UPDATED',
        entityName: 'user_assignments',
        entityId: id,
        beforeData: existing,
        afterData: updated,
        tx,
      });

      return updated;
    });
  }

  async revoke(
    id: number,
    dto: RevokeAssignmentDto,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    const existing = await this.prisma.userAssignment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Assignment #${id} not found`);
    if (scope.portId && existing.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.userAssignment.update({
        where: { id },
        data: {
          status: AssignmentStatus.REVOKED,
          endDate: new Date(),
          notes: existing.notes
            ? `${existing.notes} | Dicabut: ${dto.reason}`
            : `Dicabut: ${dto.reason}`,
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: existing.portId,
        action: 'ASSIGNMENT_REVOKED',
        entityName: 'user_assignments',
        entityId: id,
        beforeData: existing,
        afterData: updated,
        reason: dto.reason,
        tx,
      });

      return updated;
    });
  }

  /**
   * Validates that a PETUGAS_PELABUHAN has an active assignment matching the resource's port, berth, taskType, and permission.
   */
  async assertOfficerAssignmentScope(
    user: AuthenticatedUser,
    resource: {
      portId: number;
      berthId?: number | null;
      terminalId?: number | null;
      taskType?: TaskType;
      requiredPermission?: string;
    },
  ): Promise<void> {
    if (!isPetugasRole(user.role)) return;

    const now = new Date();
    const activeAssignments = await this.prisma.userAssignment.findMany({
      where: {
        userId: user.id,
        portId: resource.portId,
        status: AssignmentStatus.ACTIVE,
        startDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
      },
    });

    if (activeAssignments.length === 0) {
      if (user.portId !== resource.portId) {
        throw new ForbiddenException(
          `Petugas tidak memiliki penugasan aktif pada Pelabuhan #${resource.portId}`,
        );
      }
      return;
    }

    const matchingBerth = activeAssignments.filter(
      (a) => a.berthId === null || !resource.berthId || a.berthId === resource.berthId,
    );
    if (matchingBerth.length === 0) {
      throw new ForbiddenException(
        `Akses ditolak: Anda tidak memiliki penugasan (Assignment) pada Dermaga #${resource.berthId}`,
      );
    }

    if (resource.taskType) {
      const matchingTaskType = matchingBerth.filter(
        (a) => a.taskTypes.length === 0 || a.taskTypes.includes(resource.taskType!),
      );
      if (matchingTaskType.length === 0) {
        throw new ForbiddenException(
          `Akses ditolak: Penugasan Anda tidak mencakup jenis pekerjaan ${resource.taskType}`,
        );
      }
    }

    if (resource.requiredPermission) {
      const matchingPerm = matchingBerth.filter(
        (a) =>
          a.permissionCodes.length === 0 ||
          a.permissionCodes.includes(resource.requiredPermission!),
      );
      if (matchingPerm.length === 0) {
        throw new ForbiddenException(
          `Akses ditolak: Penugasan Anda tidak memiliki izin (${resource.requiredPermission})`,
        );
      }
    }
  }
}
