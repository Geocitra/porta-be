import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignmentStatus,
  DailyReportReviewStatus,
  DailyReportStatus,
  Prisma,
  TaskExecutionStatus,
  TaskPriority,
  TaskReviewStatus,
  TaskSourceType,
  TaskType,
  UserRole,
} from '@prisma/client';
import { ROLE_GROUPS } from '../../common/authz/role-taxonomy';
import {
  AuthenticatedUser,
  isPetugasRole,
} from '../../common/decorators/current-user.decorator';
import { ScopeFilter } from '../../common/guards/port-scope.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/utils/audit-log.service';
import { TasksService } from '../tasks/tasks.service';
import {
  CreateDailyPortReportDto,
  ReviewDailyReportDto,
} from './dto/daily-reports.dto';

export type DailyObligationCategory =
  | 'NO_OBLIGATION'
  | 'OBLIGATION_NOT_STARTED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'INCOMPLETE_RETURNED'
  | 'ADMIN_CHECKED'
  | 'HEAD_VERIFIED';

@Injectable()
export class DailyReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly tasksService: TasksService,
  ) {}

  /**
   * Ensures that any active ship visits or open maintenance tickets on the target date
   * have materialized their corresponding obligation Tasks so uncreated/unsubmitted obligations
   * are always visible to Admin and Kepala Pelabuhan.
   */
  private async materializeMissingObligationsForDate(
    portId: number | undefined,
    dateStr?: string,
  ) {
    const targetDate = dateStr ? new Date(dateStr) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const activeVisits = await this.prisma.shipVisit.findMany({
      where: {
        ...(portId ? { portId } : {}),
        status: { not: 'CANCELLED' },
        eta: { lte: endOfDay },
        etd: { gte: startOfDay },
      },
      include: { vessel: { select: { name: true, vesselCategory: true } } },
    });

    for (const visit of activeVisits) {
      await this.tasksService.createTask({
        taskType: TaskType.MANIFEST_CHECK,
        title: `Pemeriksaan Manifest Kapal ${visit.vessel.name} (${visit.visitNumber})`,
        description: `Kewajiban pemeriksaan manifest untuk kunjungan ${visit.visitNumber}.`,
        sourceType: TaskSourceType.SHIP_VISIT,
        sourceId: String(visit.id),
        portId: visit.portId,
        visitId: visit.id,
        priority: TaskPriority.HIGH,
        obligationDate: visit.eta.toISOString().slice(0, 10),
        dueDate: visit.etd.toISOString(),
      });
    }
  }

  public classifyTaskObligationState(task: {
    executionStatus: TaskExecutionStatus;
    reviewStatus: TaskReviewStatus;
  }): DailyObligationCategory {
    if (task.reviewStatus === TaskReviewStatus.HEAD_VERIFIED) {
      return 'HEAD_VERIFIED';
    }
    if (
      task.reviewStatus === TaskReviewStatus.WAITING_HEAD_VERIFICATION ||
      task.reviewStatus === TaskReviewStatus.ADMIN_APPROVED
    ) {
      return 'ADMIN_CHECKED';
    }
    if (
      task.reviewStatus === TaskReviewStatus.ADMIN_RETURNED ||
      task.reviewStatus === TaskReviewStatus.HEAD_RETURNED ||
      task.reviewStatus === TaskReviewStatus.HEAD_REJECTED
    ) {
      return 'INCOMPLETE_RETURNED';
    }
    if (
      task.executionStatus === TaskExecutionStatus.SUBMITTED ||
      task.reviewStatus === TaskReviewStatus.WAITING_ADMIN ||
      task.reviewStatus === TaskReviewStatus.ADMIN_REVIEW
    ) {
      return 'SUBMITTED';
    }
    if (task.executionStatus === TaskExecutionStatus.IN_PROGRESS) {
      return 'IN_PROGRESS';
    }
    return 'OBLIGATION_NOT_STARTED';
  }

  async getDailyObligationRecap(
    scope: ScopeFilter,
    user: AuthenticatedUser,
    query?: { portId?: number; date?: string; officerId?: number },
  ) {
    const effectivePortId = scope.portId ?? query?.portId;
    await this.materializeMissingObligationsForDate(effectivePortId, query?.date);
    await this.tasksService.syncOverdueTasks(effectivePortId);

    const effectiveOfficerId = isPetugasRole(user.role) ? user.id : query?.officerId;

    const officers = await this.prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: ROLE_GROUPS.ALL_FIELD_OFFICERS },
        ...(effectivePortId ? { portId: effectivePortId } : {}),
        ...(scope.allowedPortIds && !effectivePortId
          ? { portId: { in: scope.allowedPortIds } }
          : {}),
        ...(effectiveOfficerId ? { id: effectiveOfficerId } : {}),
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        portId: true,
        port: { select: { id: true, code: true, name: true } },
        assignments: {
          where: { status: AssignmentStatus.ACTIVE },
          include: {
            berth: { select: { id: true, code: true, name: true } },
            terminal: { select: { id: true, code: true, name: true } },
          },
        },
      },
      orderBy: { fullName: 'asc' },
    });

    const tasks = await this.prisma.task.findMany({
      where: {
        ...(effectivePortId ? { portId: effectivePortId } : {}),
        ...(scope.allowedPortIds && !effectivePortId
          ? { portId: { in: scope.allowedPortIds } }
          : {}),
        ...(effectiveOfficerId ? { assigneeId: effectiveOfficerId } : {}),
        ...(query?.date ? { obligationDate: new Date(query.date) } : {}),
        executionStatus: { not: TaskExecutionStatus.CANCELLED },
      },
      include: {
        berth: { select: { id: true, code: true, name: true } },
        visit: { select: { id: true, visitNumber: true, vessel: { select: { name: true } } } },
        assignee: { select: { id: true, fullName: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    const officerRecaps = officers.map((officer) => {
      const officerTasks = tasks.filter((t) => t.assigneeId === officer.id);

      const totalObligated = officerTasks.length;
      const completed = officerTasks.filter(
        (t) => t.executionStatus === TaskExecutionStatus.COMPLETED,
      ).length;
      const inProgress = officerTasks.filter(
        (t) => t.executionStatus === TaskExecutionStatus.IN_PROGRESS,
      ).length;
      const submitted = officerTasks.filter(
        (t) =>
          t.executionStatus === TaskExecutionStatus.SUBMITTED ||
          t.executionStatus === TaskExecutionStatus.COMPLETED,
      ).length;
      const unsubmitted = officerTasks.filter(
        (t) =>
          t.executionStatus === TaskExecutionStatus.NOT_STARTED ||
          t.executionStatus === TaskExecutionStatus.IN_PROGRESS ||
          t.executionStatus === TaskExecutionStatus.OVERDUE,
      ).length;
      const notStarted = officerTasks.filter(
        (t) =>
          t.executionStatus === TaskExecutionStatus.NOT_STARTED ||
          (t.executionStatus === TaskExecutionStatus.OVERDUE && !t.startedAt),
      ).length;
      const returned = officerTasks.filter(
        (t) =>
          t.reviewStatus === TaskReviewStatus.ADMIN_RETURNED ||
          t.reviewStatus === TaskReviewStatus.HEAD_RETURNED,
      ).length;
      const overdue = officerTasks.filter(
        (t) => t.isOverdue && t.executionStatus !== TaskExecutionStatus.COMPLETED,
      ).length;
      const withIssues = officerTasks.filter((t) => t.hasIssue).length;
      const adminChecked = officerTasks.filter(
        (t) =>
          t.reviewStatus === TaskReviewStatus.WAITING_HEAD_VERIFICATION ||
          t.reviewStatus === TaskReviewStatus.ADMIN_APPROVED ||
          t.reviewStatus === TaskReviewStatus.HEAD_VERIFIED,
      ).length;
      const headVerified = officerTasks.filter(
        (t) => t.reviewStatus === TaskReviewStatus.HEAD_VERIFIED,
      ).length;

      let overallObligationStatus: DailyObligationCategory = 'NO_OBLIGATION';
      if (totalObligated > 0) {
        if (headVerified === totalObligated) {
          overallObligationStatus = 'HEAD_VERIFIED';
        } else if (returned > 0) {
          overallObligationStatus = 'INCOMPLETE_RETURNED';
        } else if (notStarted > 0 && inProgress === 0 && submitted === 0) {
          overallObligationStatus = 'OBLIGATION_NOT_STARTED';
        } else if (unsubmitted > 0) {
          overallObligationStatus = 'IN_PROGRESS';
        } else if (adminChecked === totalObligated) {
          overallObligationStatus = 'ADMIN_CHECKED';
        } else {
          overallObligationStatus = 'SUBMITTED';
        }
      }

      return {
        officer: {
          id: officer.id,
          fullName: officer.fullName,
          email: officer.email,
          role: officer.role,
          portId: officer.portId,
          port: officer.port,
          activeAssignments: officer.assignments,
        },
        overallObligationStatus,
        metrics: {
          totalObligated,
          notStarted,
          inProgress,
          submitted,
          unsubmitted,
          returned,
          adminChecked,
          headVerified,
          completed,
          overdue,
          withIssues,
        },
        tasks: officerTasks.map((t) => ({
          id: t.id,
          taskNumber: t.taskNumber,
          taskType: t.taskType,
          title: t.title,
          berth: t.berth,
          visit: t.visit,
          dueDate: t.dueDate,
          executionStatus: t.executionStatus,
          reviewStatus: t.reviewStatus,
          obligationState: this.classifyTaskObligationState(t),
          isOverdue: t.isOverdue,
          hasIssue: t.hasIssue,
          issueNotes: t.issueNotes,
        })),
      };
    });

    const unassignedTasks = tasks.filter((t) => !t.assigneeId);

    const portTotals = {
      totalObligated: tasks.length,
      notStarted: tasks.filter((t) => t.executionStatus === TaskExecutionStatus.NOT_STARTED).length,
      inProgress: tasks.filter((t) => t.executionStatus === TaskExecutionStatus.IN_PROGRESS).length,
      submitted: tasks.filter(
        (t) =>
          t.executionStatus === TaskExecutionStatus.SUBMITTED ||
          t.executionStatus === TaskExecutionStatus.COMPLETED,
      ).length,
      unsubmitted: tasks.filter(
        (t) =>
          t.executionStatus === TaskExecutionStatus.NOT_STARTED ||
          t.executionStatus === TaskExecutionStatus.IN_PROGRESS ||
          t.executionStatus === TaskExecutionStatus.OVERDUE,
      ).length,
      returned: tasks.filter(
        (t) =>
          t.reviewStatus === TaskReviewStatus.ADMIN_RETURNED ||
          t.reviewStatus === TaskReviewStatus.HEAD_RETURNED,
      ).length,
      adminChecked: tasks.filter(
        (t) =>
          t.reviewStatus === TaskReviewStatus.WAITING_HEAD_VERIFICATION ||
          t.reviewStatus === TaskReviewStatus.ADMIN_APPROVED ||
          t.reviewStatus === TaskReviewStatus.HEAD_VERIFIED,
      ).length,
      headVerified: tasks.filter((t) => t.reviewStatus === TaskReviewStatus.HEAD_VERIFIED).length,
      completed: tasks.filter((t) => t.executionStatus === TaskExecutionStatus.COMPLETED).length,
      overdue: tasks.filter(
        (t) => t.isOverdue && t.executionStatus !== TaskExecutionStatus.COMPLETED,
      ).length,
      withIssues: tasks.filter((t) => t.hasIssue).length,
      unassignedCount: unassignedTasks.length,
    };

    const domainBreakdown = this.buildDomainBreakdown(tasks);

    return {
      portId: effectivePortId ?? 'ALL',
      date: query?.date ?? 'ALL_DATES',
      portTotals,
      domainBreakdown,
      officerRecaps,
      unassignedTasks,
    };
  }

  private buildDomainBreakdown(
    tasks: Array<{
      taskType: TaskType;
      executionStatus: TaskExecutionStatus;
      reviewStatus: TaskReviewStatus;
      isOverdue: boolean;
      hasIssue: boolean;
    }>,
  ) {
    const domains: Array<{
      domainCode: string;
      domainLabel: string;
      taskTypes: TaskType[];
    }> = [
      {
        domainCode: 'REGISTRATION_CONTRACT',
        domainLabel: 'Registrasi, Legalitas & Kontrak',
        taskTypes: [
          TaskType.COMPANY_REGISTRATION_CHECK,
          TaskType.DOCUMENT_VERIFICATION,
        ],
      },
      {
        domainCode: 'CARGO_BERTH',
        domainLabel: 'Operasional Dermaga & Barang',
        taskTypes: [
          TaskType.CARGO_HANDLING_CHECK,
          TaskType.BERTHING_INSPECTION,
          TaskType.VESSEL_ARRIVAL_CHECK,
          TaskType.VESSEL_DEPARTURE_CLEARANCE,
        ],
      },
      {
        domainCode: 'PASSENGER_BERTH',
        domainLabel: 'Dermaga Penumpang & Manifes',
        taskTypes: [TaskType.PASSENGER_SERVICE, TaskType.MANIFEST_CHECK],
      },
      {
        domainCode: 'ASSET_MAINTENANCE',
        domainLabel: 'Ruangan, Aset & Pemeliharaan',
        taskTypes: [
          TaskType.ASSET_MANAGEMENT_CHECK,
          TaskType.FACILITY_INSPECTION,
          TaskType.MAINTENANCE_HANDLING,
          TaskType.SAFETY_INSPECTION,
        ],
      },
      {
        domainCode: 'BILLING_TREASURY',
        domainLabel: 'Tagihan, Retribusi & Bendahara',
        taskTypes: [TaskType.RETRIBUTION_COLLECTION],
      },
      {
        domainCode: 'GENERAL',
        domainLabel: 'Operasional Umum',
        taskTypes: [TaskType.GENERAL_OPERATION],
      },
    ];

    return domains.map((d) => {
      const domainTasks = tasks.filter((t) => d.taskTypes.includes(t.taskType));
      return {
        domainCode: d.domainCode,
        domainLabel: d.domainLabel,
        total: domainTasks.length,
        notStarted: domainTasks.filter(
          (t) => t.executionStatus === TaskExecutionStatus.NOT_STARTED,
        ).length,
        inProgress: domainTasks.filter(
          (t) => t.executionStatus === TaskExecutionStatus.IN_PROGRESS,
        ).length,
        submitted: domainTasks.filter(
          (t) =>
            t.executionStatus === TaskExecutionStatus.SUBMITTED ||
            t.executionStatus === TaskExecutionStatus.COMPLETED,
        ).length,
        returned: domainTasks.filter(
          (t) =>
            t.reviewStatus === TaskReviewStatus.ADMIN_RETURNED ||
            t.reviewStatus === TaskReviewStatus.HEAD_RETURNED,
        ).length,
        headVerified: domainTasks.filter(
          (t) => t.reviewStatus === TaskReviewStatus.HEAD_VERIFIED,
        ).length,
        overdue: domainTasks.filter(
          (t) => t.isOverdue && t.executionStatus !== TaskExecutionStatus.COMPLETED,
        ).length,
        withIssues: domainTasks.filter((t) => t.hasIssue).length,
      };
    });
  }

  findAll(scope: ScopeFilter) {
    return this.prisma.dailyPortReport.findMany({
      where: {
        ...(scope.portId ? { portId: scope.portId } : {}),
        ...(scope.allowedPortIds && !scope.portId
          ? { portId: { in: scope.allowedPortIds } }
          : {}),
      },
      include: {
        port: { select: { id: true, code: true, name: true } },
        terminal: { select: { id: true, code: true, name: true } },
        officer: { select: { id: true, fullName: true } },
        checkedByAdmin: { select: { id: true, fullName: true } },
        verifiedByHead: { select: { id: true, fullName: true } },
        items: { include: { berth: true } },
      },
      orderBy: [{ reportDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(
    dto: CreateDailyPortReportDto,
    actor: AuthenticatedUser,
    scope?: ScopeFilter,
  ) {
    if (actor.role === UserRole.SUPERADMIN) {
      throw new ForbiddenException(
        'SUPERADMIN tidak berwenang mengirim laporan harian operasional pelabuhan.',
      );
    }
    if (scope?.portId && dto.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }

    const items = dto.items ?? [];

    for (const item of items) {
      if (item.visitId) {
        const visit = await this.prisma.shipVisit.findUnique({ where: { id: item.visitId } });
        if (!visit || visit.portId !== dto.portId) {
          throw new BadRequestException(
            `Visit #${item.visitId} not found or does not belong to port #${dto.portId}`,
          );
        }
      }
      if (item.berthId) {
        const berth = await this.prisma.berth.findUnique({ where: { id: item.berthId } });
        if (!berth || berth.portId !== dto.portId) {
          throw new BadRequestException(
            `Berth #${item.berthId} not found or does not belong to port #${dto.portId}`,
          );
        }
      }
    }

    // Automatically attach the actual obligation recap snapshot from Tasks
    const obligationRecap = await this.getDailyObligationRecap(
      { portId: dto.portId },
      actor,
      { portId: dto.portId, date: dto.reportDate },
    );

    return this.prisma.$transaction(async (tx) => {
      const report = await tx.dailyPortReport.create({
        data: {
          portId: dto.portId,
          terminalId: dto.terminalId ?? null,
          reportDate: new Date(dto.reportDate),
          officerId: actor.id,
          totalVesselsStaying: items.length,
          generalNotes: dto.generalNotes,
          status: DailyReportStatus.SUBMITTED,
          reviewStatus: DailyReportReviewStatus.WAITING_ADMIN,
          summarySnapshot: obligationRecap.portTotals as unknown as Prisma.InputJsonValue,
          domainSummaryJson: obligationRecap.domainBreakdown as unknown as Prisma.InputJsonValue,
          items: {
            create: items.map((item) => ({
              portId: dto.portId,
              visitId: item.visitId ?? null,
              berthId: item.berthId ?? null,
              vesselNameSnapshot: item.vesselNameSnapshot,
              registrationNumberSnapshot: item.registrationNumberSnapshot,
              isAdhoc: item.isAdhoc ?? false,
              notes: item.notes,
            })),
          },
        },
        include: { items: true },
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: dto.portId,
        action: 'DAILY_PORT_REPORT_SUBMITTED',
        entityName: 'daily_port_reports',
        entityId: report.id,
        afterData: {
          reportDate: dto.reportDate,
          totalVesselsStaying: report.totalVesselsStaying,
          obligationSummary: obligationRecap.portTotals,
        },
        tx,
      });

      return report;
    });
  }

  async adminCheckReport(
    reportId: number,
    dto: ReviewDailyReportDto,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    if (actor.role !== UserRole.ADMIN_PELABUHAN) {
      throw new ForbiddenException('Hanya ADMIN_PELABUHAN yang dapat memeriksa laporan harian.');
    }

    const report = await this.prisma.dailyPortReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException(`DailyPortReport #${reportId} not found`);
    if (scope.portId && report.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }

    const nextReviewStatus =
      dto.decision === 'APPROVE'
        ? DailyReportReviewStatus.WAITING_HEAD_VERIFICATION
        : DailyReportReviewStatus.ADMIN_RETURNED;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.dailyPortReport.update({
        where: { id: reportId },
        data: {
          reviewStatus: nextReviewStatus,
          checkedByAdminId: actor.id,
          checkedAt: new Date(),
          adminNotes: dto.notes,
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: report.portId,
        action:
          dto.decision === 'APPROVE'
            ? 'DAILY_REPORT_ADMIN_APPROVED'
            : 'DAILY_REPORT_ADMIN_RETURNED',
        entityName: 'daily_port_reports',
        entityId: reportId,
        beforeData: { reviewStatus: report.reviewStatus },
        afterData: { reviewStatus: nextReviewStatus },
        reason: dto.notes,
        tx,
      });

      return updated;
    });
  }

  async headVerifyReport(
    reportId: number,
    dto: ReviewDailyReportDto,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    if (actor.role !== UserRole.KEPALA_PELABUHAN) {
      throw new ForbiddenException(
        'Hanya KEPALA_PELABUHAN yang dapat memverifikasi akhir laporan harian.',
      );
    }

    const report = await this.prisma.dailyPortReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException(`DailyPortReport #${reportId} not found`);
    if (scope.portId && report.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }
    if (report.reviewStatus !== DailyReportReviewStatus.WAITING_HEAD_VERIFICATION) {
      throw new BadRequestException(
        `Laporan harian harus lolos pemeriksaan Admin terlebih dahulu (status saat ini: ${report.reviewStatus})`,
      );
    }

    const isApproved = dto.decision === 'APPROVE';
    const nextReviewStatus = isApproved
      ? DailyReportReviewStatus.HEAD_VERIFIED
      : DailyReportReviewStatus.HEAD_RETURNED;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.dailyPortReport.update({
        where: { id: reportId },
        data: {
          status: isApproved ? DailyReportStatus.ACKNOWLEDGED : report.status,
          reviewStatus: nextReviewStatus,
          verifiedByHeadId: actor.id,
          verifiedAt: new Date(),
          headNotes: dto.notes,
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: report.portId,
        action: isApproved
          ? 'DAILY_REPORT_HEAD_VERIFIED'
          : 'DAILY_REPORT_HEAD_RETURNED',
        entityName: 'daily_port_reports',
        entityId: reportId,
        beforeData: { reviewStatus: report.reviewStatus },
        afterData: { reviewStatus: nextReviewStatus },
        reason: dto.notes,
        tx,
      });

      return updated;
    });
  }

  async acknowledge(reportId: number, actor: AuthenticatedUser, scope: ScopeFilter) {
    const report = await this.prisma.dailyPortReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException(`DailyPortReport #${reportId} not found`);
    if (scope.portId && report.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }

    return this.prisma.dailyPortReport.update({
      where: { id: reportId },
      data: {
        status: DailyReportStatus.ACKNOWLEDGED,
        checkedByAdminId: actor.id,
        checkedAt: new Date(),
      },
    });
  }
}
